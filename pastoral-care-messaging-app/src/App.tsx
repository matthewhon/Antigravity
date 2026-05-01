import React, { useState, useEffect } from 'react';
<<<<<<< HEAD
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
=======
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
>>>>>>> 02fed810c9ad65f3b654e5673377302410d6cc61
import { auth } from './services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { firestore } from './services/firestoreService';
import { User, Church } from './types';
import { Loader2 } from 'lucide-react';

import { LoginView } from './components/LoginView';

import { Dashboard } from './components/Dashboard';

<<<<<<< HEAD
import { usePushNotifications } from './hooks/usePushNotifications';

=======
>>>>>>> 02fed810c9ad65f3b654e5673377302410d6cc61
const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [church, setChurch] = useState<Church | null>(null);
  const [loading, setLoading] = useState(true);

<<<<<<< HEAD
  // Initialize Push Notifications if logged in and on a native device
  usePushNotifications(user);

=======
>>>>>>> 02fed810c9ad65f3b654e5673377302410d6cc61
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        try {
          const userProfile = await firestore.getUserProfile(authUser.uid);
          if (userProfile && (userProfile.roles.includes('Messaging') || userProfile.roles.includes('Church Admin') || userProfile.roles.includes('System Administration'))) {
            setUser(userProfile);
            if (userProfile.churchId) {
              const churchProfile = await firestore.getChurch(userProfile.churchId);
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
        setUser(null);
        setChurch(null);
      }
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
<<<<<<< HEAD
    <HashRouter>
=======
    <BrowserRouter>
>>>>>>> 02fed810c9ad65f3b654e5673377302410d6cc61
      <Routes>
        <Route path="/" element={user && church ? <Dashboard user={user} church={church} /> : <Navigate to="/login" replace />} />
        <Route path="/login" element={!user ? <LoginView /> : <Navigate to="/" replace />} />
      </Routes>
<<<<<<< HEAD
    </HashRouter>
=======
    </BrowserRouter>
>>>>>>> 02fed810c9ad65f3b654e5673377302410d6cc61
  );
};

export default App;
