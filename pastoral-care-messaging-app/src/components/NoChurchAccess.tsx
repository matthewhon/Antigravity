import React from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../services/firebase';
import { ShieldAlert, LogOut } from 'lucide-react';

export const NoChurchAccess: React.FC = () => {
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      window.location.reload();
    } catch (e) {
      console.error("Failed to sign out", e);
    }
  };

  return (
    <div className="flex h-full w-full overflow-y-auto items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-[2rem] shadow-xl p-10 border border-slate-100 dark:border-slate-800 text-center">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>
        </div>
        
        <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Access Restricted</h2>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2 mb-6">No Church Profile Found</p>
        
        <div className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-8">
          Your account is currently authenticated, but it is not associated with any active church organization. 
          Please contact your system administrator to assign your account to a church profile.
        </div>

        <button 
          onClick={handleSignOut}
          className="w-full bg-slate-800 dark:bg-slate-700 text-white py-4 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-slate-900 dark:hover:bg-slate-600 transition-all flex items-center justify-center gap-2 shadow-lg"
        >
          <LogOut className="w-4 h-4" />
          Sign Out / Switch Account
        </button>
      </div>
    </div>
  );
};
