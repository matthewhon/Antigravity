import React, { useState, useEffect, useMemo } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { auth } from './services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { firestore } from './services/firestoreService';
import { User, Church, PcoPerson } from './types';
import { Loader2 } from 'lucide-react';

import { LoginView } from './components/LoginView';
import MobileSmsLayout from './components/MobileSmsLayout';
import SettingsPage from './components/SettingsPage';
import { NoChurchAccess } from './components/NoChurchAccess';
import { TodaysCelebrationsModal } from './components/TodaysCelebrationsModal';
import { ForceChangePasswordModal } from './components/ForceChangePasswordModal';
import { usePushNotifications } from './hooks/usePushNotifications';
import { TeamChatProvider } from './contexts/TeamChatContext';
import { hasMessagingAccess, hasTeamChatAccess } from './services/chatPermissions';
import { AndroidBackButton } from './components/AndroidBackButton';
import { useBackHandler } from './ui/backButton';
import {
  CelebrationNotificationsNative,
  getCelebrationsForDate,
  syncScheduledCelebrationNotifications,
  checkAndFireInAppCelebrationToday,
  showCelebrationInAppBanner,
} from './services/celebrationNotifications';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [church, setChurch] = useState<Church | null>(null);
  const [people, setPeople] = useState<PcoPerson[]>([]);
  const [showCelebrationsModal, setShowCelebrationsModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // Initialize Push Notifications if logged in and on a native device
  usePushNotifications(user);

  // Android back button closes the Today's Celebrations popup
  useBackHandler(showCelebrationsModal, () => { setShowCelebrationsModal(false); return true; });

  const todayCelebrationsCount = useMemo(() => {
    return getCelebrationsForDate(people, new Date()).length;
  }, [people]);

  // Load church people directory (cached + fresh) for daily birthday/anniversary notifications
  useEffect(() => {
    if (!church?.id) {
      setPeople([]);
      return;
    }
    const cacheKey = `pc_people_cache_${church.id}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        setPeople(JSON.parse(cached));
      } catch {
        // ignore invalid cache
      }
    }

    firestore.getPeople(church.id).then(fresh => {
      setPeople(fresh);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(fresh));
      } catch {
        // ignore quota errors
      }
    }).catch(err => console.warn('[Celebrations] Could not load people:', err));
  }, [church?.id]);

  // Listen for celebration notification taps/events and settings changes
  useEffect(() => {
    const handleOpenModal = () => setShowCelebrationsModal(true);
    window.addEventListener('openCelebrationsModal', handleOpenModal);

    let tapPromise: Promise<{ remove: () => Promise<void> }> | null = null;
    let recvPromise: Promise<{ remove: () => Promise<void> }> | null = null;

    if (Capacitor.isNativePlatform()) {
      tapPromise = CelebrationNotificationsNative.addListener(
        'celebrationNotificationTapped',
        () => setShowCelebrationsModal(true)
      );
      recvPromise = CelebrationNotificationsNative.addListener(
        'celebrationNotificationReceived',
        (data) => {
          showCelebrationInAppBanner(
            data.title || "🎉 Today's Celebrations",
            data.body || 'Tap to view birthdays & anniversaries today!',
            () => setShowCelebrationsModal(true)
          );
        }
      );
    }

    return () => {
      window.removeEventListener('openCelebrationsModal', handleOpenModal);
      if (tapPromise) tapPromise.then(h => h.remove()).catch(() => {});
      if (recvPromise) recvPromise.then(h => h.remove()).catch(() => {});
    };
  }, []);

  // Schedule upcoming notifications & check today's celebration alert
  useEffect(() => {
    if (!user || !church || people.length === 0) return;

    syncScheduledCelebrationNotifications(people);
    checkAndFireInAppCelebrationToday(people, () => setShowCelebrationsModal(true));

    const handleSettingsChanged = () => {
      syncScheduledCelebrationNotifications(people);
      checkAndFireInAppCelebrationToday(people, () => setShowCelebrationsModal(true));
    };
    window.addEventListener('celebrationSettingsChanged', handleSettingsChanged);

    const interval = setInterval(() => {
      checkAndFireInAppCelebrationToday(people, () => setShowCelebrationsModal(true));
    }, 30000);

    return () => {
      window.removeEventListener('celebrationSettingsChanged', handleSettingsChanged);
      clearInterval(interval);
    };
  }, [user, church, people]);

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
          // Load the church up front: Team Chat access depends on the church plan.
          const churchProfile = userProfile?.churchId ? await firestore.getChurch(userProfile.churchId) : null;
          // Messaging/Admin users get the full app; any other staff can sign in for Team Chat.
          const allowed = !!userProfile && (hasMessagingAccess(userProfile) || hasTeamChatAccess(userProfile, churchProfile));
          if (userProfile && allowed) {
            // Sync Firestore user profile email with Auth user email if changed & verified
            if (authUser.email && authUser.email.toLowerCase() !== userProfile.email.toLowerCase()) {
              const updatedProfile = { ...userProfile, email: authUser.email.toLowerCase() };
              await firestore.createUserProfile(updatedProfile);
              setUser(updatedProfile);
            } else {
              setUser(userProfile);
            }
            if (churchProfile) {
              console.log("Church profile fetched:", churchProfile);
              setChurch(churchProfile);
            }
          } else {
            console.warn("User does not have messaging or team chat access");
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
      const fresh = await firestore.getPeople(church.id);
      setPeople(fresh);
      try {
        localStorage.setItem(`pc_people_cache_${church.id}`, JSON.stringify(fresh));
      } catch {
        // ignore quota errors
      }
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
      <AndroidBackButton />
      <Routes>
        <Route
          path="/"
          element={
            user ? (
              church ? (
                <TeamChatProvider currentUser={user} church={church} people={people}>
                  <MobileSmsLayout
                    churchId={church.id}
                    church={church}
                    currentUser={user}
                    todayCelebrationsCount={todayCelebrationsCount}
                    onOpenCelebrationsModal={() => setShowCelebrationsModal(true)}
                    onUpdateChurch={async (updates) => {
                      const updated = { ...church, ...updates };
                      setChurch(updated);
                      await firestore.updateChurch(church.id, updates);
                    }}
                    onNavigateHome={() => auth.signOut()}
                    onLogout={() => auth.signOut()}
                  />
                </TeamChatProvider>
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
                todayCelebrationsCount={todayCelebrationsCount}
                onOpenCelebrationsModal={() => setShowCelebrationsModal(true)}
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

      {user && user.mustChangePassword && (
        <ForceChangePasswordModal
          user={user}
          onSuccess={() => setUser({ ...user, mustChangePassword: false })}
        />
      )}

      {showCelebrationsModal && user && church && (
        <TodaysCelebrationsModal
          people={people}
          church={church}
          currentUser={user}
          onClose={() => setShowCelebrationsModal(false)}
        />
      )}
    </HashRouter>
  );
};

export default App;
