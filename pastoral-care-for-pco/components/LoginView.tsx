
import React, { useState } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../services/firebase';
import { AppLogo } from './AppLogo';
import { Eye, EyeOff } from 'lucide-react';

interface LoginViewProps {
  onRegister: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    try {
      // Trim email to remove accidental whitespace
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // Auth listener in App.tsx will handle redirection
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError("Invalid email or password.");
      } else if (err.code === 'auth/too-many-requests') {
        setError("Too many failed attempts. Please reset your password or try again later.");
      } else {
        setError("Failed to sign in. Please try again.");
      }
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
        setError("Please enter your email address first.");
        return;
    }
    try {
        await sendPasswordResetEmail(auth, email.trim());
        setInfo("Password reset email sent! Check your inbox.");
        setError('');
    } catch (e: any) {
        setError("Failed to send reset email. " + e.message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-950 p-4 animate-in fade-in zoom-in duration-300">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-[2rem] shadow-xl p-10 border border-slate-100 dark:border-slate-800">
        <div className="flex justify-center mb-8">
            <AppLogo size={64} />
        </div>
        
        <div className="text-center mb-8">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Welcome Back</h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mt-2">Sign in to your dashboard</p>
        </div>

        {error && (
            <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-xl flex items-center gap-3 border border-rose-100 dark:border-rose-900/30">
                <span className="text-lg">⚠️</span>
                {error}
            </div>
        )}

        {info && (
            <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-xl flex items-center gap-3 border border-emerald-100 dark:border-emerald-900/30">
                <span className="text-lg">✓</span>
                {info}
            </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
            <div>
                <label htmlFor="login-email" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Email</label>
                <input 
                    id="login-email"
                    type="email" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-900 dark:text-white transition-all" 
                    required 
                    placeholder="name@church.com"
                    autoComplete="username"
                    inputMode="email"
                />
            </div>

            <div>
                <div className="flex justify-between items-center mb-2">
                    <label htmlFor="login-password" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Password</label>
                    <button 
                        type="button"
                        onClick={handleForgotPassword}
                        className="text-[10px] font-bold text-indigo-500 hover:text-indigo-600 transition-colors"
                    >
                        Forgot Password?
                    </button>
                </div>
                <div className="relative">
                    <input 
                        id="login-password"
                        type={showPassword ? "text" : "password"} 
                        value={password} 
                        onChange={e => setPassword(e.target.value)} 
                        className="w-full p-3 pr-10 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-900 dark:text-white transition-all" 
                        required 
                        placeholder="••••••••"
                        autoComplete="current-password"
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                </div>
            </div>

            <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold uppercase tracking-wide text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-none disabled:opacity-50 disabled:cursor-not-allowed mt-4"
            >
                {loading ? 'Signing In...' : 'Sign In'}
            </button>
        </form>

        <div className="mt-8 text-center border-t border-slate-100 dark:border-slate-800 pt-6">
            <p className="text-xs font-medium text-slate-400">Don't have an account?</p>
            <a 
                href="/register"
                onClick={(e) => {
                    e.preventDefault();
                    onRegister();
                }}
                className="mt-2 inline-block text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors uppercase tracking-wide"
            >
                Create Organization
            </a>
        </div>
      </div>
    </div>
  );
};
