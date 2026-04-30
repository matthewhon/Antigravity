
import React, { useState, useEffect } from 'react';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../services/firebase';
import { firestore } from '../services/firestoreService';
import { AppLogo } from './AppLogo';

interface RegisterViewProps {
  onCancel: () => void;
}

export const RegisterView: React.FC<RegisterViewProps> = ({ onCancel }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [churchName, setChurchName] = useState('');
  
  // Organization Profile Fields
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    let timer: any;
    if (success && countdown > 0) {
      timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    } else if (success && countdown === 0) {
      onCancel();
    }
    return () => clearTimeout(timer);
  }, [success, countdown, onCancel]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const cleanEmail = email.trim();
      
      // 1. Create Authentication User
      const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      const uid = userCredential.user.uid;

      // 2. Generate Church ID and Create Tenant with Profile Data
      const churchId = 'c_' + Math.random().toString(36).substr(2, 9);
      const subdomain = churchName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      
      // No trial period - start as Free Tier (unsubscribed)
      
      await firestore.createChurch(churchId, churchName, subdomain, {
          address,
          city,
          state,
          zip,
          phone,
          website,
          primaryContact: name
      });

      // 3. Create User Profile linked to this Tenant
      await firestore.createUserProfile({
        id: uid,
        name: name,
        email: cleanEmail.toLowerCase(),
        churchId: churchId,
        roles: ['Church Admin'], // Grant full access to the creator
        theme: 'traditional'
      });

      // 4. Sign out immediately to require explicit login
      await signOut(auth);

      // 5. Show success screen
      setSuccess(true);
      setLoading(false);

    } catch (err: any) {
      console.error("Registration Error", err);
      if (err.code === 'auth/email-already-in-use') {
        setError("An account with this email already exists.");
      } else if (err.code === 'auth/weak-password') {
        setError("Password should be at least 6 characters.");
      } else {
        setError(err.message || "Failed to create account. Please try again.");
      }
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-950 p-4 animate-in fade-in zoom-in duration-300">
        <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-xl p-10 border border-slate-100 dark:border-slate-800 text-center">
            <div className="flex justify-center mb-6">
                <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center text-4xl shadow-sm border-4 border-white dark:border-slate-800 ring-4 ring-emerald-50 dark:ring-emerald-900/10">
                    ✓
                </div>
            </div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">Organization Created!</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-8 font-medium">
                Your workspace is ready. You are currently on the Free Tier. Upgrade anytime in settings. Redirecting to login in <span className="font-black text-emerald-600 dark:text-emerald-400">{countdown}</span> seconds...
            </p>
            
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 mb-8 overflow-hidden">
                <div 
                    className="bg-emerald-500 h-full transition-all duration-1000 ease-linear" 
                    style={{ width: `${((10 - countdown) / 10) * 100}%` }}
                ></div>
            </div>

            <button 
                onClick={onCancel}
                className="w-full bg-slate-900 dark:bg-indigo-600 text-white px-6 py-4 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 dark:hover:bg-indigo-700 transition-all shadow-lg"
            >
                Go to Login Now
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-950 p-4 animate-in fade-in zoom-in duration-300">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-xl p-10 border border-slate-100 dark:border-slate-800 max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="flex justify-center mb-8">
            <AppLogo size={64} />
        </div>
        
        <div className="text-center mb-8">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Create Organization</h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">Start your new tenant workspace</p>
        </div>

        {error && (
            <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-xl flex items-center gap-3 border border-rose-100 dark:border-rose-900/30">
                <span className="text-lg">⚠️</span>
                {error}
            </div>
        )}

        <form onSubmit={handleRegister} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* User Info */}
                <div className="col-span-1 md:col-span-2">
                    <h3 className="text-sm font-black text-indigo-900 dark:text-indigo-400 mb-4 border-b border-indigo-50 dark:border-indigo-900/30 pb-2">Administrator Details</h3>
                </div>
                
                <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Your Name</label>
                    <input 
                        type="text" 
                        value={name} 
                        onChange={e => setName(e.target.value)} 
                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-900 dark:text-white transition-all" 
                        required 
                        placeholder="Full Name"
                    />
                </div>

                <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Email Address</label>
                    <input 
                        type="email" 
                        value={email} 
                        onChange={e => setEmail(e.target.value)} 
                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-900 dark:text-white transition-all" 
                        required 
                        placeholder="name@church.com"
                    />
                </div>

                <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Password</label>
                    <input 
                        type="password" 
                        value={password} 
                        onChange={e => setPassword(e.target.value)} 
                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-900 dark:text-white transition-all" 
                        required 
                        placeholder="Min 6 characters"
                    />
                </div>

                {/* Organization Info */}
                <div className="col-span-1 md:col-span-2 mt-2">
                    <h3 className="text-sm font-black text-indigo-900 dark:text-indigo-400 mb-4 border-b border-indigo-50 dark:border-indigo-900/30 pb-2">Organization Profile</h3>
                </div>

                <div className="col-span-1 md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Church / Organization Name</label>
                    <input 
                        type="text" 
                        value={churchName} 
                        onChange={e => setChurchName(e.target.value)} 
                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-900 dark:text-white transition-all" 
                        required 
                        placeholder="e.g. Grace Community"
                    />
                </div>

                <div className="col-span-1 md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Street Address</label>
                    <input 
                        type="text" 
                        value={address} 
                        onChange={e => setAddress(e.target.value)} 
                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-900 dark:text-white transition-all" 
                        placeholder="123 Main St"
                    />
                </div>

                <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">City</label>
                    <input 
                        type="text" 
                        value={city} 
                        onChange={e => setCity(e.target.value)} 
                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-900 dark:text-white transition-all" 
                        placeholder="City"
                        required
                    />
                </div>

                <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">State</label>
                    <input 
                        type="text" 
                        value={state} 
                        onChange={e => setState(e.target.value)} 
                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-900 dark:text-white transition-all" 
                        placeholder="State"
                        required
                    />
                </div>

                <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Zip Code</label>
                    <input 
                        type="text" 
                        value={zip} 
                        onChange={e => setZip(e.target.value)} 
                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-900 dark:text-white transition-all" 
                        placeholder="Zip"
                    />
                </div>

                <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Phone</label>
                    <input 
                        type="tel" 
                        value={phone} 
                        onChange={e => setPhone(e.target.value)} 
                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-900 dark:text-white transition-all" 
                        placeholder="(555) 555-5555"
                    />
                </div>

                <div className="col-span-1 md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Website</label>
                    <input 
                        type="url" 
                        value={website} 
                        onChange={e => setWebsite(e.target.value)} 
                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-900 dark:text-white transition-all" 
                        placeholder="https://yourchurch.com"
                    />
                </div>
            </div>

            <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed mt-2">
                By providing your phone number and submitting this form, you consent to receive SMS messages from Barnabas Software regarding updates, downtime and announcements. Message frequency varies. Message and data rates may apply. Reply STOP to opt-out or HELP for help. For more information, please read our{' '}
                <a href="https://www.barnabassoftware.com/privacy.html" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-600 underline underline-offset-2 transition-colors">Privacy Policy</a>
                {' '}and{' '}
                <a href="https://www.barnabassoftware.com/terms.html" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-600 underline underline-offset-2 transition-colors">TOS</a>.
            </p>

            <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-indigo-600 text-white py-4 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-none disabled:opacity-50 mt-4"
            >
                {loading ? 'Creating Tenant...' : 'Create Account'}
            </button>
        </form>

        <div className="mt-8 text-center border-t border-slate-100 dark:border-slate-800 pt-6">
            <button 
                onClick={onCancel}
                className="text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors"
            >
                Already have an account? Sign In
            </button>
        </div>
      </div>
    </div>
  );
};
