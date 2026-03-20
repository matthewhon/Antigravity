
import React, { useState, useEffect } from 'react';
import { firestore } from '../services/firestoreService';
import { User } from '../types';

export const GlobalAdminManager: React.FC = () => {
  const [admins, setAdmins] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadAdmins = async () => {
    setLoading(true);
    try {
      const users = await firestore.getSystemAdmins();
      setAdmins(users);
    } catch (e) {
      console.error("Failed to load admins", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdmins();
  }, []);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    
    setIsProcessing(true);
    setError('');
    setSuccess('');

    try {
      const user = await firestore.findUserByEmail(inviteEmail);
      if (!user) {
        setError('User not found. They must have an existing account.');
        setIsProcessing(false);
        return;
      }

      if (user.roles.includes('System Administration')) {
        setError('User is already a System Administrator.');
        setIsProcessing(false);
        return;
      }

      const newRoles = [...user.roles, 'System Administration'];
      await firestore.updateUserRoles(user.id, newRoles as any[]);
      
      setSuccess(`Successfully granted System Admin access to ${user.name}`);
      setInviteEmail('');
      await loadAdmins();

    } catch (e) {
      console.error(e);
      setError('Failed to update user roles.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveAdmin = async (user: User) => {
    if (!window.confirm(`Are you sure you want to remove System Admin access from ${user.name}?`)) return;

    try {
      const newRoles = user.roles.filter(r => r !== 'System Administration');
      await firestore.updateUserRoles(user.id, newRoles);
      await loadAdmins();
    } catch (e) {
      alert("Failed to remove admin.");
    }
  };

  return (
    <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm mb-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h3 className="text-2xl font-black text-slate-900 tracking-tight">System Administrators</h3>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Manage global application access</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2">
            <div className="space-y-4">
                {loading ? (
                    <div className="p-4 text-center text-slate-400 text-xs font-bold">Loading administrators...</div>
                ) : admins.length === 0 ? (
                    <div className="p-4 text-center text-slate-400 text-xs font-bold">No administrators found (this shouldn't happen!)</div>
                ) : (
                    admins.map(admin => (
                        <div key={admin.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center font-black text-sm">
                                    {admin.name.charAt(0)}
                                </div>
                                <div>
                                    <p className="font-black text-slate-900 text-sm">{admin.name}</p>
                                    <p className="text-xs text-slate-400">{admin.email}</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => handleRemoveAdmin(admin)}
                                className="text-slate-300 hover:text-rose-500 transition-colors p-2 text-xs font-bold uppercase tracking-widest"
                                title="Revoke Access"
                            >
                                Revoke
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>

        <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 h-fit">
            <h4 className="font-black text-slate-900 text-sm mb-4">Add Administrator</h4>
            <p className="text-[10px] text-slate-500 mb-6 leading-relaxed">
                Grant "System Administration" privileges to an existing user. This allows them to manage global settings and all tenants.
            </p>

            <form onSubmit={handleAddAdmin} className="space-y-4">
                <div>
                    <label className="block text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">User Email</label>
                    <input 
                        type="email" 
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        placeholder="email@domain.com"
                        required
                    />
                </div>
                
                {error && <p className="text-[10px] font-bold text-rose-500">{error}</p>}
                {success && <p className="text-[10px] font-bold text-emerald-500">{success}</p>}

                <button 
                    type="submit" 
                    disabled={isProcessing || !inviteEmail}
                    className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all disabled:opacity-50"
                >
                    {isProcessing ? 'Verifying...' : 'Grant Access'}
                </button>
            </form>
        </div>
      </div>
    </div>
  );
};
