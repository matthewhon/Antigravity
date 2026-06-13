import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { auth } from './services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { firestore } from './services/firestoreService';
import { User, Church } from './types';
import { Loader2 } from 'lucide-react';

import { LoginView } from './components/LoginView';
import MobileSmsLayout from './components/MobileSmsLayout';
import { NoChurchAccess } from './components/NoChurchAccess';
import { usePushNotifications } from './hooks/usePushNotifications';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [church, setChurch] = useState<Church | null>(null);
  const [loading, setLoading] = useState(true);

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
                  onNavigateHome={() => {
                    auth.signOut();
                  }}
                />
              ) : (
                <NoChurchAccess />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          } 
        />
        <Route path="/login" element={!user ? <LoginView /> : <Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
};

export default App;
