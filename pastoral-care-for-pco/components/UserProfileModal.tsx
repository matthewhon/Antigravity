
import React, { useState } from 'react';
import { auth } from '../services/firebase';
import { updateEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider, updateProfile } from 'firebase/auth';
import { firestore } from '../services/firestoreService';
import { User, Church } from '../types';

interface UserProfileModalProps {
  user: User;
  church: Church;
  onClose: () => void;
  onUpdate: () => void;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({ user, church, onClose, onUpdate }) => {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [newPassword, setNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("No authenticated user session.");

      const cleanEmail = email.trim();
      const isEmailChanged = cleanEmail.toLowerCase() !== user.email.toLowerCase();
      const isPasswordChanged = newPassword.length > 0;

      // If sensitive changes, require re-auth
      if (isEmailChanged || isPasswordChanged) {
        if (!currentPassword) {
          throw new Error("Current password is required to change email or password.");
        }
        const credential = EmailAuthProvider.credential(currentUser.email!, currentPassword);
        await reauthenticateWithCredential(currentUser, credential);
      }

      const updates: Promise<any>[] = [];

      // 1. Auth Updates
      if (isEmailChanged) {
        updates.push(updateEmail(currentUser, cleanEmail));
      }
      if (isPasswordChanged) {
        updates.push(updatePassword(currentUser, newPassword));
      }
      if (name !== user.name) {
        updates.push(updateProfile(currentUser, { displayName: name }));
      }

      await Promise.all(updates);

      // 2. Firestore Update
      if (name !== user.name || isEmailChanged) {
        await firestore.createUserProfile({ 
            ...user, 
            name, 
            email: cleanEmail.toLowerCase() 
        });
      }

      onUpdate();
      onClose();
      alert("Profile updated successfully.");

    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/wrong-password') {
        setError("Incorrect current password.");
      } else if (err.code === 'auth/email-already-in-use') {
        setError("This email is already in use.");
      } else if (err.code === 'auth/weak-password') {
        setError("Password should be at least 6 characters.");
      } else if (err.code === 'auth/requires-recent-login') {
         setError("Please sign out and sign in again to perform this action.");
      } else {
        setError(err.message || "Failed to update profile.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-[2rem] w-full max-w-md p-8 shadow-2xl border border-slate-100 relative">
        <button 
            onClick={onClose}
            className="absolute top-6 right-6 text-slate-300 hover:text-slate-500 transition-colors"
        >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>

        <div className="mb-6">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Edit Profile</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Update your account details</p>
        </div>

        <div className="mb-6 p-4 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between">
            <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Organization</p>
                <p className="text-sm font-bold text-slate-900">{church.name}</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-xs">
                {church.name.charAt(0)}
            </div>
        </div>

        {error && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-bold flex items-start gap-2">
                <span>⚠️</span>
                <span>{error}</span>
            </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
            <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Full Name</label>
                <input 
                    type="text" 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    required
                />
            </div>

            <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Email Address</label>
                <input 
                    type="email" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    required
                />
            </div>

            <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">New Password (Optional)</label>
                <input 
                    type="password" 
                    value={newPassword} 
                    onChange={e => setNewPassword(e.target.value)} 
                    placeholder="Leave blank to keep current"
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-300"
                />
            </div>

            {(email.toLowerCase().trim() !== user.email.toLowerCase().trim() || newPassword.length > 0) && (
                <div className="pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-top-2">
                    <label className="block text-[10px] font-black uppercase text-slate-500 tracking-widest mb-2">Current Password (Required)</label>
                    <input 
                        type="password" 
                        value={currentPassword} 
                        onChange={e => setCurrentPassword(e.target.value)} 
                        className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        required
                    />
                </div>
            )}

            <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 mt-4 disabled:opacity-50">
                {loading ? 'Saving...' : 'Save Changes'}
            </button>
        </form>
      </div>
    </div>
  );
};

export default UserProfileModal;
