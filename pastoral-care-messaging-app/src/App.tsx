import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { auth } from './services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { firestore } from './services/firestoreService';
import { User, Church } from './types';
import { Loader2 } from 'lucide-react';

import { LoginView } from './components/LoginView';
import MobileSmsLayout from './components/MobileSmsLayout';
import SettingsPage from './components/SettingsPage';
import { NoChurchAccess } from './components/NoChurchAccess';
import { usePushNotifications } from './hooks/usePushNotifications';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [church, setChurch] = useState<Church | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // Initialize Push Notifications if logged in and on a native device
  usePushNotifications(user);

  useEffect(() => {
    import('@capacitor/text-zoom').then(({ TextZoom }) => {
      import('@capacitor/core').then(({ Capacitor }) => {
        document.documentElement.classList.add(`platform-${Capacitor.getPlatform()}`);
        if (Capacitor.isNativePlatform()) {
          TextZoom.getPreferred().then(({ value }) => {
            TextZoom.set({ value });
          }).catch(e => console.error("TextZoom error:", e));
        }
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    console.log("App useEffect mounted, registering onAuthStateChanged");
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      console.log("onAuthStateChanged triggered, authUser:", authUser ? authUser.uid : "null");
      if (authUser) {
        try {
          console.log("Fetching user profile for:", authUser.uid);
          const userProfile = await firestore.getUserProfile(authUser.uid);
          console.log("User profile fetched:", userProfile);
          if (userProfile && (userProfile.roles.includes('Messaging') || userProfile.roles.includes('Church Admin') || userProfile.roles.includes('System Administration'))) {
            // Sync Firestore user profile email with Auth user email if changed & verified
            if (authUser.email && authUser.email.toLowerCase() !== userProfile.email.toLowerCase()) {
              const updatedProfile = { ...userProfile, email: authUser.email.toLowerCase() };
              await firestore.createUserProfile(updatedProfile);
              setUser(updatedProfile);
            } else {
              setUser(userProfile);
            }
            if (userProfile.churchId) {
              console.log("Fetching church profile for:", userProfile.churchId);
              const churchProfile = await firestore.getChurch(userProfile.churchId);
              console.log("Church profile fetched:", churchProfile);
              setChurch(churchProfile);
            }
          } else {
            console.warn("User does not have messaging access");
            setUser(null);
          }
        } catch (e) {
          console.error("Error fetching user profile", e);
        }
      } else {
        console.log("No authenticated user, clearing state");
        setUser(null);
        setChurch(null);
      }
      console.log("Setting loading to false");
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // ── Appearance management ────────────────────────────────────────────────
  // Source of truth: localStorage key 'mobileAppearance' = 'light' | 'dark' | 'system'
  // We drive the 'dark' class on <html> directly — Tailwind v4 class strategy.

  const applyTheme = (pref: 'light' | 'dark' | 'system') => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const useDark = pref === 'dark' || (pref === 'system' && prefersDark);
    document.documentElement.classList.toggle('dark', useDark);
    document.documentElement.style.colorScheme = useDark ? 'dark' : 'light';
  };

  // Apply on mount from localStorage
  useEffect(() => {
    const stored = (localStorage.getItem('mobileAppearance') || 'system') as 'light' | 'dark' | 'system';
    applyTheme(stored);

    // If system mode, also listen for OS-level changes
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleOsChange = () => {
      const current = (localStorage.getItem('mobileAppearance') || 'system') as 'light' | 'dark' | 'system';
      if (current === 'system') applyTheme('system');
    };
    mq.addEventListener('change', handleOsChange);
    return () => mq.removeEventListener('change', handleOsChange);
  }, []);

  const handleUpdateTheme = (pref: 'light' | 'dark' | 'system') => {
    // Store preference locally on this device only — never writes to Firestore
    // so it doesn't affect the web app's independent theme setting.
    localStorage.setItem('mobileAppearance', pref);
    applyTheme(pref);
  };

  const handleSyncPeople = async () => {
    if (!church) return;
    setIsSyncing(true);
    try {
      const sysSettings = await firestore.getSystemSettings();
      const apiBaseUrl = sysSettings.apiBaseUrl || 'https://pastoralcare.barnabassoftware.com';
      await fetch(`${apiBaseUrl}/pco/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ churchId: church.id }),
      });
    } catch (e: any) {
      console.error('PCO sync failed:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <HashRouter>
      <Routes>
        <Route
          path="/"
          element={
            user ? (
              church ? (
                <MobileSmsLayout
                  churchId={church.id}
                  church={church}
                  currentUser={user}
                  onUpdateChurch={async (updates) => {
                    const updated = { ...church, ...updates };
                    setChurch(updated);
                    await firestore.updateChurch(church.id, updates);
                  }}
                  onNavigateHome={() => auth.signOut()}
                  onLogout={() => auth.signOut()}
                />
              ) : (
                <NoChurchAccess />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/settings"
          element={
            user && church ? (
              <SettingsPage
                currentUser={user}
                church={church}
                isSyncing={isSyncing}
                onLogout={() => auth.signOut()}
                onUpdateTheme={handleUpdateTheme}
                onSyncPeople={handleSyncPeople}
              />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        <Route path="/login" element={!user ? <LoginView /> : <Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
};

export default App;
