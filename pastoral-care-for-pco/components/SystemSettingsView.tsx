
import React, { useState, useEffect, useCallback } from 'react';
import { SystemSettings, Church, User, LogEntry } from '../types';
import { firestore } from '../services/firestoreService';
import { loadStripe } from '@stripe/stripe-js';
import { initializeWebhooks } from '../services/pcoWebhookService';

interface SystemSettingsViewProps {
  settings?: SystemSettings;
  onSave: (settings: SystemSettings) => Promise<void>;
  onRecalculateBenchmarks: () => Promise<void>;
}

// Default based on provided custom domain
const DEFAULT_API_URL = 'https://api.pastoralcare.barnabassoftware.com';

export const SystemSettingsView: React.FC<SystemSettingsViewProps> = ({ settings: initialSettings, onSave, onRecalculateBenchmarks }) => {
  const [activeTab, setActiveTab] = useState<'Configuration' | 'Tenants' | 'Users' | 'Logging' | 'Planning Center'>('Configuration');
  const [settings, setSettings] = useState<SystemSettings>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [churches, setChurches] = useState<Church[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  
  // Backend Status State
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  // Logging State
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<string>(''); // churchId or '' for all

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
      if (activeTab === 'Tenants') {
          loadChurches();
      } else if (activeTab === 'Users') {
          loadAllUsers();
      } else if (activeTab === 'Logging') {
          loadLogs();
          if (churches.length === 0) loadChurches();
      }
  }, [activeTab]);

  useEffect(() => {
      if (activeTab === 'Logging') {
          loadLogs();
      }
  }, [logFilter]);

  // Auto-check health when URL changes or settings load
  useEffect(() => {
      if (!isLoading && activeTab === 'Configuration') {
          checkBackendHealth();
      }
  }, [settings.apiBaseUrl, isLoading, activeTab]);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const data = await firestore.getSystemSettings();
      setSettings(data || {});
    } catch (e) {
      console.error("Failed to load system settings", e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadChurches = async () => {
      try {
          const list = await firestore.getAllChurches();
          setChurches(list);
      } catch (e) {
          console.error("Failed to load churches", e);
      }
  };

  const loadAllUsers = async () => {
      setIsLoading(true);
      try {
          const [uList, cList] = await Promise.all([
              firestore.getAllUsersAcrossTenants(),
              firestore.getAllChurches()
          ]);
          setAllUsers(uList);
          setChurches(cList);
      } catch (e) {
          console.error("Failed to load system users", e);
      } finally {
          setIsLoading(false);
      }
  };

  const loadLogs = async () => {
      setIsLoading(true);
      try {
          const data = await firestore.getLogs(logFilter);
          setLogs(data);
      } catch (e) {
          console.error("Failed to load logs", e);
      } finally {
          setIsLoading(false);
      }
  };

  const checkBackendHealth = async () => {
      setBackendStatus('checking');
      const url = settings.apiBaseUrl || DEFAULT_API_URL;
      try {
          // Simple GET to /health
          const res = await fetch(`${url}/health`);
          if (res.ok) {
              setBackendStatus('online');
          } else {
              setBackendStatus('offline');
              console.warn(`Backend health check failed: ${res.status}`);
          }
      } catch (e) {
          console.error("Backend health check error:", e);
          setBackendStatus('offline');
      }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      await onSave(settings);
      setMessage({ type: 'success', text: 'Settings saved successfully.' });
      checkBackendHealth(); // Re-check after save
    } catch (e: any) {
      setMessage({ type: 'error', text: 'Failed to save settings: ' + e.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (key: keyof SystemSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleModuleToggle = (module: string) => {
    const currentModules = settings.enabledModules || {
        pastoral: true,
        people: true,
        groups: true,
        services: true,
        giving: true,
        metrics: true,
        communication: true
    };
    setSettings(prev => ({
        ...prev,
        enabledModules: {
            ...currentModules,
            [module]: !currentModules[module as keyof typeof currentModules]
        }
    }));
  };

  const handleDeleteTenant = async (id: string, name: string) => {
      if (confirm(`Are you sure you want to PERMANENTLY DELETE "${name}" (${id})?\n\nThis will remove ALL data: people, giving, groups, users, and settings.\n\nThis action cannot be undone.`)) {
          try {
              await firestore.deleteChurchAndData(id);
              setChurches(prev => prev.filter(c => c.id !== id));
              setMessage({ type: 'success', text: `Tenant ${name} deleted successfully.` });
          } catch (e) {
              console.error(e);
              setMessage({ type: 'error', text: "Error deleting tenant." });
          }
      }
  };

  const verifyStripeConfig = async () => {
      setIsVerifying(true);
      setMessage(null);
      
      const pk = settings.stripePublishableKey;
      const sk = settings.stripeSecretKey;
      
      if (!pk || !sk) {
          setMessage({ type: 'error', text: "Missing API Keys." });
          setIsVerifying(false);
          return;
      }

      if (!pk.startsWith('pk_')) {
          setMessage({ type: 'error', text: "Invalid Publishable Key format (must start with pk_)." });
          setIsVerifying(false);
          return;
      }

      if (!sk.startsWith('sk_') && !sk.startsWith('rk_')) {
          setMessage({ type: 'error', text: "Invalid Secret Key format (must start with sk_ or rk_)." });
          setIsVerifying(false);
          return;
      }

      try {
          // Verify PK by attempting to load Stripe
          const stripe = await loadStripe(pk);
          if (!stripe) {
              throw new Error("Failed to initialize Stripe with provided Publishable Key.");
          }
          setMessage({ type: 'success', text: "Stripe configuration appears valid (PK checked)." });
      } catch (e: any) {
          setMessage({ type: 'error', text: "Stripe Verification Failed: " + e.message });
      } finally {
          setIsVerifying(false);
      }
  };

  const testBackendConnection = async () => {
      setIsVerifying(true);
      setMessage(null);
      
      const baseUrl = settings.apiBaseUrl || DEFAULT_API_URL;
      
      try {
          console.log(`Testing connection to: ${baseUrl}/health`);
          const response = await fetch(`${baseUrl}/health`);
          
          if (!response.ok) {
              throw new Error(`Server returned status: ${response.status}`);
          }
          
          const data = await response.json();
          setMessage({ type: 'success', text: `Connection Successful: ${data.message}` });
          setBackendStatus('online');
      } catch (e: any) {
          console.error(e);
          setMessage({ type: 'error', text: `Connection Failed: ${e.message}. Ensure the function is deployed and the URL is correct.` });
          setBackendStatus('offline');
      } finally {
          setIsVerifying(false);
      }
  };

  // Helper to verify Stripe config state for badges
  const isStripeConfigured = settings.stripePublishableKey?.startsWith('pk_') && settings.stripeSecretKey?.startsWith('sk_');
  const arePricesConfigured = settings.stripePriceIds?.starter && settings.stripePriceIds?.growth && settings.stripePriceIds?.kingdom;

  return (
    <div className="space-y-8 animate-in fade-in">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex items-center gap-4">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">System Configuration</h2>
                    <p className="text-slate-400 dark:text-slate-500 font-medium uppercase text-[10px] tracking-widest mt-1">Global App Settings & Integrations</p>
                </div>
                {backendStatus === 'online' && (
                    <span className="hidden md:inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-100 dark:border-emerald-900/30">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        Backend Online
                    </span>
                )}
                {backendStatus === 'offline' && (
                    <span className="hidden md:inline-flex items-center gap-1.5 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-rose-100 dark:border-rose-900/30">
                        <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                        Backend Offline
                    </span>
                )}
            </div>
            
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl gap-1 overflow-x-auto">
                {['Configuration', 'Tenants', 'Users', 'Logging', 'Planning Center'].map(tab => (
                    <button 
                        key={tab}
                        onClick={() => setActiveTab(tab as any)}
                        className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>
        </div>

        {message && (
            <div className={`p-4 rounded-xl text-xs font-bold flex items-center gap-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                <span>{message.type === 'success' ? '✓' : '⚠️'}</span>
                {message.text}
            </div>
        )}

        {activeTab === 'Configuration' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Integration Keys */}
                <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm">
                    <h3 className="text-lg font-black text-slate-900 dark:text-white mb-6">API Integrations</h3>
                    
                    <div className="space-y-6">
                        <div>
                            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Google Maps API Key</label>
                            <input 
                                type="text" 
                                value={settings.googleMapsApiKey || ''}
                                onChange={e => handleChange('googleMapsApiKey', e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                placeholder="AIza..."
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Census.gov API Key</label>
                            <input 
                                type="text" 
                                value={settings.censusApiKey || ''}
                                onChange={e => handleChange('censusApiKey', e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Backend Configuration</h4>
                                <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${backendStatus === 'online' ? 'bg-emerald-500' : backendStatus === 'offline' ? 'bg-rose-500' : 'bg-slate-300'}`}></span>
                                    <span className="text-[9px] uppercase font-bold text-slate-400">
                                        {backendStatus === 'checking' ? 'Checking...' : backendStatus}
                                    </span>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Backend API URL</label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            value={settings.apiBaseUrl || DEFAULT_API_URL}
                                            onChange={e => handleChange('apiBaseUrl', e.target.value)}
                                            className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                            placeholder={DEFAULT_API_URL}
                                        />
                                        <button
                                            onClick={testBackendConnection}
                                            disabled={isVerifying}
                                            className="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 px-4 py-2 rounded-xl font-bold text-xs hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors disabled:opacity-50"
                                        >
                                            {isVerifying ? '...' : 'Test'}
                                        </button>
                                    </div>
                                    <p className="text-[9px] text-slate-400 mt-2">
                                        Default: <code>{DEFAULT_API_URL}</code>
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                            <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-4">Planning Center (Global App)</h4>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Client ID</label>
                                    <input 
                                        type="text" 
                                        value={settings.pcoClientId || ''}
                                        onChange={e => handleChange('pcoClientId', e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Client Secret</label>
                                    <input 
                                        type="password" 
                                        value={settings.pcoClientSecret || ''}
                                        onChange={e => handleChange('pcoClientSecret', e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Stripe & Modules */}
                <div className="space-y-8">
                    <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] border border-slate-800 shadow-xl">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-3">
                                <h3 className="text-lg font-black">Stripe Billing</h3>
                                {isStripeConfigured ? (
                                    <span className="text-[9px] font-black bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">ACTIVE</span>
                                ) : (
                                    <span className="text-[9px] font-black bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full border border-rose-500/30">INCOMPLETE</span>
                                )}
                            </div>
                            <button 
                                onClick={verifyStripeConfig}
                                disabled={isVerifying}
                                className="text-[10px] font-bold text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                            >
                                {isVerifying ? 'Testing...' : 'Test Config'}
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-500 tracking-widest mb-2">Publishable Key</label>
                                <input 
                                    type="text" 
                                    value={settings.stripePublishableKey || ''}
                                    onChange={e => handleChange('stripePublishableKey', e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="pk_live_..."
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-500 tracking-widest mb-2">Secret Key</label>
                                <input 
                                    type="password" 
                                    value={settings.stripeSecretKey || ''}
                                    onChange={e => handleChange('stripeSecretKey', e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="sk_live_..."
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-500 tracking-widest mb-2">Webhook Secret</label>
                                <input 
                                    type="password" 
                                    value={settings.stripeWebhookSecret || ''}
                                    onChange={e => handleChange('stripeWebhookSecret', e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="whsec_..."
                                />
                            </div>

                            <div className="pt-4 border-t border-slate-700 mt-4">
                                <div className="flex justify-between items-center mb-3">
                                    <label className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">Plan Price IDs (Stripe)</label>
                                    {!arePricesConfigured && (
                                        <span className="text-[9px] text-rose-400 font-bold">Missing IDs</span>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 gap-3">
                                    <div>
                                        <label className="block text-[9px] font-bold text-slate-500 mb-1">Starter Plan Price ID</label>
                                        <input 
                                            type="text" 
                                            value={settings.stripePriceIds?.starter || ''}
                                            onChange={e => setSettings(prev => ({ 
                                                ...prev, 
                                                stripePriceIds: { ...prev.stripePriceIds, starter: e.target.value } 
                                            }))}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 font-mono text-xs text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                            placeholder="price_..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-bold text-slate-500 mb-1">Growth Plan Price ID</label>
                                        <input 
                                            type="text" 
                                            value={settings.stripePriceIds?.growth || ''}
                                            onChange={e => setSettings(prev => ({ 
                                                ...prev, 
                                                stripePriceIds: { ...prev.stripePriceIds, growth: e.target.value } 
                                            }))}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 font-mono text-xs text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                            placeholder="price_..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-bold text-slate-500 mb-1">Kingdom Plan Price ID</label>
                                        <input 
                                            type="text" 
                                            value={settings.stripePriceIds?.kingdom || ''}
                                            onChange={e => setSettings(prev => ({ 
                                                ...prev, 
                                                stripePriceIds: { ...prev.stripePriceIds, kingdom: e.target.value } 
                                            }))}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 font-mono text-xs text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                            placeholder="price_..."
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-6 mt-2 flex justify-end">
                                <button 
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="bg-white text-slate-900 px-5 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-50"
                                >
                                    {isSaving ? 'Saving...' : 'Save Billing Config'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-black text-slate-900 dark:text-white">Feature Modules</h3>
                            <button 
                                onClick={handleSave} 
                                disabled={isSaving}
                                className="bg-indigo-600 text-white px-5 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50"
                            >
                                {isSaving ? 'Saving...' : 'Save All'}
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            {['pastoral', 'people', 'groups', 'services', 'giving', 'metrics', 'communication'].map(mod => (
                                <label key={mod} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl cursor-pointer">
                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 capitalize">{mod}</span>
                                    <input 
                                        type="checkbox" 
                                        checked={settings.enabledModules ? settings.enabledModules[mod as keyof typeof settings.enabledModules] : true}
                                        onChange={() => handleModuleToggle(mod)}
                                        className="w-4 h-4 accent-indigo-600 rounded"
                                    />
                                </label>
                            ))}
                        </div>
                        
                        <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900 dark:text-white">Allow Public Signups</span>
                            <button 
                                onClick={() => handleChange('allowSignups', !settings.allowSignups)}
                                className={`w-12 h-6 rounded-full p-1 transition-colors ${settings.allowSignups ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                            >
                                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings.allowSignups ? 'translate-x-6' : ''}`}></div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'Tenants' && (
            <div className="space-y-8">
                {/* Tenant List */}
                <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-sm">
                    <div className="flex justify-between items-center mb-8">
                        <h3 className="text-xl font-black text-slate-900 dark:text-white">Tenant Directory</h3>
                        <span className="text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-3 py-1 rounded-full">
                            {churches.length} Tenants
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="border-b border-slate-100 dark:border-slate-700">
                                <tr>
                                    <th className="p-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest">Name</th>
                                    <th className="p-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest">ID</th>
                                    <th className="p-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest">Subscription</th>
                                    <th className="p-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                {churches.map(church => (
                                    <tr key={church.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="p-4">
                                            <p className="font-bold text-slate-900 dark:text-white text-sm">{church.name}</p>
                                            <p className="text-[10px] text-slate-400">{church.email || 'No email'}</p>
                                        </td>
                                        <td className="p-4">
                                            <code className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-500 dark:text-slate-400">
                                                {church.id}
                                            </code>
                                        </td>
                                        <td className="p-4">
                                            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded ${
                                                church.subscription?.status === 'active' 
                                                ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' 
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                                            }`}>
                                                {church.subscription?.planId || 'Free'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right flex justify-end gap-2">
                                            <button 
                                                onClick={async () => {
                                                    try {
                                                        setMessage({ type: 'success', text: `Initializing webhooks for ${church.name}...` });
                                                        await initializeWebhooks(church.id);
                                                        setMessage({ type: 'success', text: `Webhooks initialized for ${church.name}.` });
                                                    } catch (e: any) {
                                                        console.error(e);
                                                        setMessage({ type: 'error', text: `Failed to init webhooks for ${church.name}: ${e.message}` });
                                                    }
                                                }}
                                                className="text-[10px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 px-3 py-2 rounded-lg transition-colors"
                                            >
                                                Init Webhooks
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteTenant(church.id, church.name)}
                                                className="text-[10px] font-black uppercase tracking-widest text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 px-3 py-2 rounded-lg transition-colors"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {churches.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="p-8 text-center text-slate-400 text-xs italic">
                                            No tenants found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-sm">
                    <div className="flex flex-col lg:flex-row gap-8">
                        <div className="flex-1 space-y-6">
                            <div>
                                <h3 className="text-xl font-black text-slate-900 dark:text-white">Global Data</h3>
                                <p className="text-xs text-slate-400 mt-1">Manage cross-tenant data aggregation.</p>
                            </div>

                            <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-[2rem] border border-slate-200 dark:border-slate-700">
                                <h4 className="font-bold text-slate-900 dark:text-white mb-2">Benchmarks</h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                                    Recalculate global averages for attendance, giving, and engagement. 
                                    This processes data from all tenants who have opted into metrics sharing.
                                </p>
                                <button 
                                    onClick={async () => {
                                        if(confirm("Recalculate benchmarks across all tenants?")) {
                                            try {
                                                await onRecalculateBenchmarks();
                                                alert("Benchmarks updated successfully.");
                                            } catch(e) {
                                                alert("Failed to update benchmarks.");
                                            }
                                        }
                                    }}
                                    className="w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-indigo-600 dark:text-indigo-400 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all"
                                >
                                    Recalculate Benchmarks
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 space-y-6">
                             <div className="p-6 bg-indigo-900/20 rounded-[2rem] border border-indigo-500/20">
                                <h4 className="font-bold text-indigo-400 mb-2">Integration Guide</h4>
                                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                                    1. Create a Stripe account.<br/>
                                    2. Get your API keys from the Stripe Dashboard.<br/>
                                    3. Configure Products and Prices in Stripe that match the plan IDs: 'starter', 'growth', 'kingdom'.<br/>
                                    4. Set up a webhook endpoint pointing to your backend function.
                                </p>
                                <div className="flex items-center gap-2 text-[10px] text-indigo-300 font-mono bg-black/30 p-3 rounded-lg mb-4">
                                    <span>PLAN_IDS:</span>
                                    <span className="text-white">starter, growth, kingdom</span>
                                </div>
                                
                                {/* Webhook Endpoint Display */}
                                <div className="pt-4 border-t border-indigo-500/20">
                                    <label className="block text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-2">Webhook Endpoint</label>
                                    <div className="bg-black/40 p-4 rounded-xl border border-indigo-500/30 flex items-center justify-between gap-4">
                                        <code className="text-xs font-mono text-emerald-400 truncate">https://pastoralcare.barnabassoftare.com/stripe</code>
                                        <button 
                                            onClick={() => navigator.clipboard.writeText("https://pastoralcare.barnabassoftare.com/stripe")}
                                            className="text-slate-400 hover:text-white transition-colors"
                                            title="Copy to Clipboard"
                                        >
                                            📋
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-2">
                                        Add this URL in Stripe Dashboard &gt; Developers &gt; Webhooks.
                                    </p>
                                </div>
                            </div>

                            {/* Emergency Actions */}
                            <div className="p-6 bg-rose-900/10 rounded-[2rem] border border-rose-500/20">
                                <h4 className="font-bold text-rose-400 mb-2">Admin Actions</h4>
                                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                                    Bulk operations for system maintenance.
                                </p>
                                <button 
                                    onClick={async () => {
                                        if(confirm("Are you sure you want to cancel ALL tenant subscriptions? This will revert everyone to the Free tier immediately.")) {
                                            await firestore.resetAllSubscriptions();
                                            alert("All subscriptions have been reset.");
                                        }
                                    }}
                                    className="w-full bg-rose-600 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-700 transition-all shadow-lg"
                                >
                                    Reset All Subscriptions
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'Users' && (
            <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-sm">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="text-xl font-black text-slate-900 dark:text-white">System Users</h3>
                    <span className="text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-3 py-1 rounded-full">
                        {allUsers.length} Users Found
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="border-b border-slate-100 dark:border-slate-700">
                            <tr>
                                <th className="p-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest">Name</th>
                                <th className="p-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest">Email</th>
                                <th className="p-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest">Tenant Context</th>
                                <th className="p-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest">Roles</th>
                                <th className="p-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest text-right">Last Login</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                            {allUsers.map(user => {
                                const userChurch = churches.find(c => c.id === user.churchId);
                                return (
                                    <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="p-4">
                                            <p className="font-bold text-slate-900 dark:text-white text-sm">{user.name}</p>
                                        </td>
                                        <td className="p-4">
                                            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{user.email}</p>
                                        </td>
                                        <td className="p-4">
                                            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded">
                                                {userChurch ? userChurch.name : 'Unknown / System'}
                                            </span>
                                            {userChurch && <span className="text-[9px] text-slate-400 ml-2 font-mono">({userChurch.id})</span>}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-wrap gap-1">
                                                {user.roles.map(r => (
                                                    <span key={r} className="text-[8px] font-black uppercase border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded text-slate-500 dark:text-slate-400">
                                                        {r}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="p-4 text-right">
                                            {user.lastLogin ? (
                                                <div>
                                                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{new Date(user.lastLogin).toLocaleDateString()}</p>
                                                    <p className="text-[9px] text-slate-400">{new Date(user.lastLogin).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                                                </div>
                                            ) : (
                                                <span className="text-[10px] text-slate-400 italic">Never</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {allUsers.length === 0 && !isLoading && (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-slate-400 text-xs italic">
                                        No users found in the database.
                                    </td>
                                </tr>
                            )}
                            {isLoading && (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-slate-400 text-xs font-bold animate-pulse">
                                        Loading users directory...
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {activeTab === 'Planning Center' && (
            <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-sm">
                <h3 className="text-xl font-black text-slate-900 dark:text-white mb-8">Planning Center Integration</h3>
                <div className="flex gap-4">
                    <button 
                        onClick={async () => {
                            // OAuth Flow
                            const response = await fetch('/api/auth/url');
                            const { url } = await response.json();
                            window.open(url, 'oauth_popup', 'width=600,height=700');
                        }}
                        className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all"
                    >
                        Authorize Planning Center
                    </button>
                    <button 
                        onClick={async () => {
                            // Webhook Subscription
                            try {
                                setMessage({ type: 'success', text: 'Subscribing to webhooks...' });
                                // Using the first churchId for now as a placeholder for the user's context
                                if (churches.length > 0) {
                                    await initializeWebhooks(churches[0].id);
                                    setMessage({ type: 'success', text: 'Successfully subscribed to webhooks.' });
                                } else {
                                    setMessage({ type: 'error', text: 'No tenant found to subscribe webhooks.' });
                                }
                            } catch (e: any) {
                                setMessage({ type: 'error', text: 'Failed to subscribe to webhooks: ' + e.message });
                            }
                        }}
                        className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all"
                    >
                        Subscribe to Webhooks
                    </button>
                </div>
            </div>
        )}
        {activeTab === 'Logging' && (
            <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                    <div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white">System Logs</h3>
                        <p className="text-xs text-slate-400 mt-1">Audit trail and application events</p>
                    </div>
                    <div className="flex gap-2 items-center">
                        <select 
                            value={logFilter}
                            onChange={(e) => setLogFilter(e.target.value)}
                            className="bg-slate-100 dark:bg-slate-800 border-none text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 rounded-lg py-2 px-3 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                        >
                            <option value="">All Tenants</option>
                            {churches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <button 
                            onClick={loadLogs}
                            disabled={isLoading}
                            className="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 px-4 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-all disabled:opacity-50"
                        >
                            {isLoading ? 'Loading...' : 'Refresh Logs'}
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 z-10 border-b border-slate-100 dark:border-slate-700">
                            <tr>
                                <th className="p-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest w-48">Timestamp</th>
                                <th className="p-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest w-24">Level</th>
                                <th className="p-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest w-40">Tenant</th>
                                <th className="p-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest">Message</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                            {logs.map((log, idx) => {
                                const tenantName = churches.find(c => c.id === log.churchId)?.name || log.churchId;
                                let lvlColor = 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300';
                                if (log.level === 'error') lvlColor = 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400';
                                if (log.level === 'warn') lvlColor = 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400';
                                if (log.level === 'info') lvlColor = 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400';

                                return (
                                    <tr key={log.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="p-4">
                                            <p className="text-xs font-mono text-slate-600 dark:text-slate-400">{new Date(log.timestamp).toLocaleString()}</p>
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${lvlColor}`}>
                                                {log.level}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                                                {tenantName}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{log.message}</p>
                                            {log.details && <p className="text-xs text-slate-400 mt-1 font-mono">{log.details}</p>}
                                        </td>
                                    </tr>
                                );
                            })}
                            {logs.length === 0 && !isLoading && (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-slate-400 text-xs italic">
                                        No logs found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        )}
    </div>
  );
};
