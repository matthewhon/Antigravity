import React, { useState } from 'react';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider, signOut } from 'firebase/auth';
import { auth } from '../services/firebase';
import { firestore } from '../services/firestoreService';
import { AppLogo } from './AppLogo';
import { Eye, EyeOff, Lock, LogOut, CheckCircle, AlertCircle } from 'lucide-react';
import { User } from '../types';

interface ForceChangePasswordModalProps {
  user: User;
  onSuccess: () => void;
}

export const ForceChangePasswordModal: React.FC<ForceChangePasswordModalProps> = ({ user, onSuccess }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [requiresRecentLogin, setRequiresRecentLogin] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      setError('No active session found. Please refresh and log in again.');
      return;
    }

    setLoading(true);

    try {
      // If reauthentication is needed because of session age
      if (requiresRecentLogin) {
        if (!currentPassword) {
          setError('Please enter your current temporary password.');
          setLoading(false);
          return;
        }
        const credential = EmailAuthProvider.credential(currentUser.email || user.email, currentPassword);
        await reauthenticateWithCredential(currentUser, credential);
      }

      // Update password in Firebase Auth
      await updatePassword(currentUser, newPassword);

      // Clear the mustChangePassword flag in Firestore
      await firestore.completeUserPasswordChange(currentUser.uid);

      onSuccess();
    } catch (err: any) {
      console.error('Password change error:', err);
      if (err.code === 'auth/requires-recent-login') {
        setRequiresRecentLogin(true);
        setError('For security, please enter your current password to verify your account.');
      } else if (err.code === 'auth/wrong-password') {
        setError('The current password entered is incorrect.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password is too weak. Please use a stronger password with letters and numbers.');
      } else {
        setError(err.message || 'Failed to update password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      window.location.reload();
    } catch (err: any) {
      console.error('Sign out error:', err);
    }
  };

  const isLengthValid = newPassword.length >= 8;
  const isMatchValid = newPassword.length > 0 && newPassword === confirmPassword;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl p-8 md:p-10 border border-slate-100 dark:border-slate-800 text-left relative">
        <div className="flex justify-center mb-6">
          <AppLogo size={56} />
        </div>

        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-black uppercase tracking-wider mb-2 border border-amber-200 dark:border-amber-800/40">
            <Lock size={12} /> Security Requirement
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Update Your Password</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            Welcome, <strong className="text-slate-700 dark:text-slate-300">{user.name}</strong>. Please choose a new secure password before accessing your account.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-2xl flex items-start gap-3 border border-rose-100 dark:border-rose-900/30">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {requiresRecentLogin && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
              <label htmlFor="current-password" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
                Current / Temporary Password
              </label>
              <div className="relative">
                <input
                  id="current-password"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full p-3 pr-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-900 dark:text-white text-sm"
                  required
                  placeholder="Enter current password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                >
                  {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="new-password" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
              New Password
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full p-3 pr-10 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-900 dark:text-white text-sm"
                required
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
              >
                {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirm-password" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                id="confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full p-3 pr-10 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-900 dark:text-white text-sm"
                required
                placeholder="Re-type new password"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Validation Checklist */}
          <div className="space-y-1 py-1">
            <div className="flex items-center gap-2 text-[11px] font-medium">
              <span className={isLengthValid ? 'text-emerald-500' : 'text-slate-400 dark:text-slate-600'}>
                {isLengthValid ? <CheckCircle size={13} /> : '○'}
              </span>
              <span className={isLengthValid ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-500 dark:text-slate-400'}>
                At least 8 characters
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-medium">
              <span className={isMatchValid ? 'text-emerald-500' : 'text-slate-400 dark:text-slate-600'}>
                {isMatchValid ? <CheckCircle size={13} /> : '○'}
              </span>
              <span className={isMatchValid ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-500 dark:text-slate-400'}>
                Passwords match
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !isLengthValid || !isMatchValid}
            className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-bold uppercase tracking-wide text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-none disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading ? 'Updating Password...' : 'Save Password & Continue'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <LogOut size={13} /> Sign out instead
          </button>
        </div>
      </div>
    </div>
  );
};
