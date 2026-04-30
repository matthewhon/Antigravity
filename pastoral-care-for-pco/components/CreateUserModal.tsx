
import React, { useState } from 'react';
import { firestore } from '../services/firestoreService';
import { UserRole } from '../types';

interface CreateUserModalProps {
  churchId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const AVAILABLE_ROLES: UserRole[] = [
  'Church Admin',
  'Pastor',
  'Pastor AI',
  'People',
  'Services',
  'Groups',
  'Giving',
  'Finance',
  'Pastoral Care',
  'Metrics'
];

export const CreateUserModal: React.FC<CreateUserModalProps> = ({ churchId, onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<UserRole[]>(['Pastoral Care']); // Default role
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleToggleRole = (role: UserRole) => {
    if (roles.includes(role)) {
      setRoles(roles.filter(r => r !== role));
    } else {
      setRoles([...roles, role]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        setLoading(false);
        return;
    }

    try {
        await firestore.createTenantUser(churchId, {
            name,
            email,
            password,
            roles
        });
        onSuccess();
    } catch (e: any) {
        console.error(e);
        if (e.code === 'auth/email-already-in-use') {
            setError("This email is already associated with an account.");
        } else {
            setError(e.message || "Failed to create user.");
        }
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-[2rem] w-full max-w-lg p-8 shadow-2xl border border-slate-100 dark:border-slate-800 relative transition-colors">
        <button 
            onClick={onClose}
            className="absolute top-6 right-6 text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 transition-colors"
        >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>

        <div className="mb-8">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Add Team Member</h3>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Create a new account for your organization</p>
        </div>

        {error && (
            <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/30 rounded-xl text-rose-600 dark:text-rose-400 text-xs font-bold flex items-start gap-2">
                <span>⚠️</span>
                <span>{error}</span>
            </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-2">Full Name</label>
                    <input 
                        type="text" 
                        value={name} 
                        onChange={e => setName(e.target.value)} 
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        required
                    />
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-2">Email Address</label>
                    <input 
                        type="email" 
                        value={email} 
                        onChange={e => setEmail(e.target.value)} 
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        required
                    />
                </div>
            </div>

            <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-2">Initial Password</label>
                <input 
                    type="password" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    placeholder="Min 6 chars"
                    required
                />
            </div>

            <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-3">Assign Roles</label>
                <div className="flex flex-wrap gap-2">
                    {AVAILABLE_ROLES.map(role => {
                        const isSelected = roles.includes(role);
                        return (
                            <button
                                key={role}
                                type="button"
                                onClick={() => handleToggleRole(role)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all border ${
                                    isSelected 
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200 dark:shadow-indigo-900/50' 
                                    : 'bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500 hover:text-indigo-500 dark:hover:text-indigo-400'
                                }`}
                            >
                                {role}
                            </button>
                        );
                    })}
                </div>
            </div>

            <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-indigo-900/50 mt-4 disabled:opacity-50">
                {loading ? 'Creating Account...' : 'Create Account'}
            </button>
        </form>
      </div>
    </div>
  );
};
