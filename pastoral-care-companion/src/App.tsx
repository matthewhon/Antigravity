import React, { useState, useEffect } from 'react';
import { auth } from './services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { firestore } from './services/firestoreService';
import { User, Church } from './types';
import { Loader2 } from 'lucide-react';
import { LoginView } from './components/LoginView';
import { MobileLayout } from './components/MobileLayout';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [church, setChurch] = useState<Church | null>(null);
  const [loading, setLoading] = useState(true);

  // Apply dark mode theme configurations
  const applyTheme = (pref: 'light' | 'dark' | 'system') => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const useDark = pref === 'dark' || (pref === 'system' && prefersDark);
    document.documentElement.classList.toggle('dark', useDark);
    document.documentElement.style.colorScheme = useDark ? 'dark' : 'light';
  };

  useEffect(() => {
    const stored = (localStorage.getItem('mobileAppearance') || 'system') as 'light' | 'dark' | 'system';
    applyTheme(stored);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleOsChange = () => {
      const current = (localStorage.getItem('mobileAppearance') || 'system') as 'light' | 'dark' | 'system';
      if (current === 'system') applyTheme('system');
    };
    mq.addEventListener('change', handleOsChange);
    return () => mq.removeEventListener('change', handleOsChange);
  }, []);

  const handleUpdateTheme = (pref: 'light' | 'dark' | 'system') => {
    localStorage.setItem('mobileAppearance', pref);
    applyTheme(pref);
  };

  useEffect(() => {
    console.log("Companion App: Registering onAuthStateChanged");
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        try {
          console.log("Fetching user profile for:", authUser.uid);
          const userProfile = await firestore.getUserProfile(authUser.uid);
          if (userProfile) {
            setUser(userProfile);
            if (userProfile.churchId) {
              console.log("Fetching church profile for:", userProfile.churchId);
              const churchProfile = await firestore.getChurch(userProfile.churchId);
              setChurch(churchProfile);
            }
          } else {
            console.warn("User profile not found in database.");
            setUser(null);
          }
        } catch (e) {
          console.error("Error loading profile", e);
        }
      } else {
        setUser(null);
        setChurch(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50 dark:bg-zinc-950">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-slate-50 dark:bg-zinc-950">
      {user && church ? (
        <MobileLayout 
          church={church} 
          currentUser={user} 
          onUpdateTheme={handleUpdateTheme} 
        />
      ) : (
        <LoginView />
      )}
    </div>
  );
};

export default App;
