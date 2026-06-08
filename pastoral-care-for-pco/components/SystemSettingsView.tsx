
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
  const [logLevelFilter, setLogLevelFilter] = useState<'' | 'info' | 'warn' | 'error'>('');
  const [logSourceFilter, setLogSourceFilter] = useState<string>('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Grow Integration panel state
  const [selectedGrowChurchId, setSelectedGrowChurchId] = useState<string>('');
  const [growSecret, setGrowSecret] = useState<string>('');
  const [growSecretSaving, setGrowSecretSaving] = useState(false);
  const [growSecretMsg, setGrowSecretMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [growSecretVisible, setGrowSecretVisible] = useState(false);

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
  }, [logFilter, logLevelFilter, logSourceFilter]);

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
          const data = await firestore.getLogs(
              logFilter || undefined,
              200,
              logLevelFilter || undefined,
              logSourceFilter || undefined
          );
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
          setMessage({ type: 'success', text: `Connection Successful: ${data.message ?? data.status ?? 'OK'}` });
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
                <span>{message.type === 'success' ? '\u2713' : '\u26A0\uFE0F'}</span>
                {message.text}
            </div>
        )}

        {activeTab === 'Configuration' && (
            <div className="space-y-6">

                {/* ── Backend Status Banner ───────────────────────────────────── */}
                <div className="bg-white dark:bg-slate-900 px-6 py-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-3 flex-1">
                        <div>
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Backend API URL</p>
                            <p className="font-mono text-xs text-slate-600 dark:text-slate-300 mt-0.5 truncate">{settings.apiBaseUrl || DEFAULT_API_URL}</p>
                        </div>
                        <span className={`ml-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border whitespace-nowrap ${backendStatus === 'online' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30' : backendStatus === 'offline' ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-900/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'}`}>
                            {backendStatus === 'online' && <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>}
                            {backendStatus === 'offline' && <span className="h-2 w-2 rounded-full bg-rose-500"></span>}
                            {backendStatus === 'checking' ? 'Checking…' : backendStatus}
                        </span>
                    </div>
                    <div className="flex gap-2 shrink-0">
                        <input
                            type="text"
                            value={settings.apiBaseUrl || DEFAULT_API_URL}
                            onChange={e => handleChange('apiBaseUrl', e.target.value)}
                            className="w-72 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder={DEFAULT_API_URL}
                        />
                        <button onClick={testBackendConnection} disabled={isVerifying} className="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 px-4 py-2 rounded-xl font-bold text-xs hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors disabled:opacity-50 whitespace-nowrap">
                            {isVerifying ? '…' : 'Test'}
                        </button>
                        <button onClick={handleSave} disabled={isSaving} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50 whitespace-nowrap">
                            {isSaving ? 'Saving…' : 'Save All'}
                        </button>
                    </div>
                </div>

                {/* ── Row 1: Planning Center | Maps & Census | SendGrid ───────── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Planning Center */}
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                        <h3 className="text-sm font-black text-slate-900 dark:text-white mb-1">Planning Center</h3>
                        <p className="text-[10px] text-slate-400 mb-5 leading-relaxed">Global OAuth app credentials shared across all tenants.</p>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Client ID</label>
                                <input type="text" aria-label="Planning Center Client ID" placeholder="Enter PCO Client ID" value={settings.pcoClientId || ''} onChange={e => handleChange('pcoClientId', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Client Secret</label>
                                <input type="password" aria-label="Planning Center Client Secret" placeholder="Enter PCO Client Secret" value={settings.pcoClientSecret || ''} onChange={e => handleChange('pcoClientSecret', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" />
                            </div>
                            <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800">
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Note Category Name</label>
                                <input
                                    type="text"
                                    aria-label="PCO Note Category Name"
                                    placeholder="e.g. Communication Log"
                                    value={settings.pcoNoteCategory || ''}
                                    onChange={e => handleChange('pcoNoteCategory', e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                                <p className="text-[9px] text-slate-400 mt-1.5 leading-relaxed">
                                    When a text or email is sent, a note is automatically logged to each recipient's PCO profile.
                                    This name must exactly match a category in{' '}
                                    <a href="https://people.planningcenteronline.com/note_categories" target="_blank" rel="noopener noreferrer" className="underline text-indigo-400 hover:text-indigo-300">
                                        PCO → People → Note Categories
                                    </a>.
                                    Leave blank to write uncategorized notes.
                                </p>
                            </div>
                        </div>
                    </div>


                    {/* External APIs */}
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                        <h3 className="text-sm font-black text-slate-900 dark:text-white mb-1">External APIs</h3>
                        <p className="text-[10px] text-slate-400 mb-5 leading-relaxed">Geographic, demographic, and AI integrations.</p>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Google Maps API Key</label>
                                <input type="text" value={settings.googleMapsApiKey || ''} onChange={e => handleChange('googleMapsApiKey', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="AIza..." />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Census.gov API Key</label>
                                <input type="text" aria-label="Census.gov API Key" placeholder="Enter Census.gov API key" value={settings.censusApiKey || ''} onChange={e => handleChange('censusApiKey', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" />
                            </div>
                            <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800">
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Gemini API Key (AI Features)</label>
                                <input type="password" aria-label="Gemini API Key" placeholder="AIza..." value={settings.geminiApiKey || ''} onChange={e => handleChange('geminiApiKey', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" />
                            </div>
                            <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800">
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Visual Crossing API Key (Weather)</label>
                                <input type="password" aria-label="Visual Crossing API Key" placeholder="Enter Visual Crossing API key" value={settings.weatherApiKey || ''} onChange={e => handleChange('weatherApiKey', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" />
                                <p className="text-[9px] text-slate-400 mt-1.5">Get a free key at <a href="https://www.visualcrossing.com/account" target="_blank" rel="noopener noreferrer" className="underline text-indigo-400 hover:text-indigo-300">visualcrossing.com/account</a>. Powers attendance prediction and weather overlays.</p>
                            </div>
                        </div>
                    </div>

                    {/* Email Delivery — Provider Switch */}
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                            <h3 className="text-sm font-black text-slate-900 dark:text-white">Email Delivery</h3>
                            {settings.emailProvider === 'postmark' ? (
                                settings.postmarkApiKey ? (
                                    <span className="text-[9px] font-black bg-violet-500/20 text-violet-600 dark:text-violet-400 px-2 py-0.5 rounded-full border border-violet-500/30">POSTMARK ✓</span>
                                ) : (
                                    <span className="text-[9px] font-black bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/30">POSTMARK — INCOMPLETE</span>
                                )
                            ) : (
                                settings.sendGridApiKey?.startsWith('SG.') ? (
                                    <span className="text-[9px] font-black bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">SENDGRID ✓</span>
                                ) : (
                                    <span className="text-[9px] font-black bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/30">SENDGRID — INCOMPLETE</span>
                                )
                            )}
                        </div>

                        {/* Provider Toggle */}
                        <div className="mb-4">
                            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Active Provider</label>
                            <div className="flex gap-2">
                                <button
                                    id="email-provider-sendgrid"
                                    onClick={() => handleChange('emailProvider', 'sendgrid')}
                                    className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${(!settings.emailProvider || settings.emailProvider === 'sendgrid') ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}
                                >
                                    SendGrid
                                </button>
                                <button
                                    id="email-provider-postmark"
                                    onClick={() => handleChange('emailProvider', 'postmark')}
                                    className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${settings.emailProvider === 'postmark' ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 border-violet-300 dark:border-violet-700' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}
                                >
                                    Postmark
                                </button>
                            </div>
                            <p className="text-[9px] text-slate-400 mt-1.5">
                                Switching is instant — both sets of credentials are saved. No code deploy needed.
                            </p>
                        </div>

                        <div className="space-y-3">
                            {/* SendGrid Fields */}
                            {(!settings.emailProvider || settings.emailProvider === 'sendgrid') && (
                                <>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Master API Key</label>
                                        <input type="password" value={settings.sendGridApiKey || ''} onChange={e => handleChange('sendGridApiKey', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="SG.xxxxxxxxxxxxxxxx" />
                                        <p className="text-[9px] text-slate-400 mt-1.5">Find in <a href="https://app.sendgrid.com/settings/api_keys" target="_blank" rel="noopener noreferrer" className="underline text-indigo-400 hover:text-indigo-300">SendGrid → Settings → API Keys</a>. Requires Full Access.</p>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Shared Subdomain</label>
                                        <div className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-600 dark:text-slate-400 select-all">pastoralcare.barnabassoftware.com</div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Fallback From Email</label>
                                        <input type="email" value={settings.sendGridFromEmail || ''} onChange={e => handleChange('sendGridFromEmail', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="noreply@pastoralcare.barnabassoftware.com" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Fallback From Name</label>
                                        <input type="text" value={settings.sendGridFromName || ''} onChange={e => handleChange('sendGridFromName', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Pastoral Care" />
                                    </div>
                                </>
                            )}

                            {/* Postmark Fields */}
                            {settings.emailProvider === 'postmark' && (
                                <>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Account API Token</label>
                                        <input type="password" id="postmark-api-key" value={settings.postmarkApiKey || ''} onChange={e => handleChange('postmarkApiKey', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-500" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                                        <p className="text-[9px] text-slate-400 mt-1.5">Find in <a href="https://account.postmarkapp.com/account/edit" target="_blank" rel="noopener noreferrer" className="underline text-violet-400 hover:text-violet-300">Postmark → Account → API Tokens</a>. This is the Account token, not a Server token.</p>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Shared Subdomain</label>
                                        <div className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-600 dark:text-slate-400 select-all">pastoralcare.barnabassoftware.com</div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Fallback From Email</label>
                                        <input type="email" id="postmark-from-email" value={settings.postmarkFromEmail || ''} onChange={e => handleChange('postmarkFromEmail', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-500" placeholder="noreply@pastoralcare.barnabassoftware.com" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Fallback From Name</label>
                                        <input type="text" id="postmark-from-name" value={settings.postmarkFromName || ''} onChange={e => handleChange('postmarkFromName', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-500" placeholder="Pastoral Care" />
                                    </div>
                                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                                        <p className="text-[9px] text-slate-500 leading-relaxed">
                                            💡 <strong>Plan required:</strong> Use the <strong>Platform plan</strong> ($18/mo) for unlimited custom sending domains — required for multi-tenant use. <a href="https://postmarkapp.com/pricing" target="_blank" rel="noopener noreferrer" className="underline text-violet-400 hover:text-violet-300">See pricing →</a>
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                </div>{/* end Row 1 */}

                {/* ── Row 2: SignalWire (2 cols) + Feature Modules (1 col) ─── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* SignalWire SMS */}
                    <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                            <h3 className="text-sm font-black text-slate-900 dark:text-white">SignalWire SMS</h3>
                            <div className="flex items-center gap-2">
                                {settings.signalwireProjectId && settings.signalwireApiToken && settings.signalwireSpaceUrl ? (
                                    <span className="text-[9px] font-black bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">CONFIGURED</span>
                                ) : (
                                    <span className="text-[9px] font-black bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/30">INCOMPLETE</span>
                                )}
                                <button
                                    onClick={async () => {
                                        if (!settings.signalwireProjectId || !settings.signalwireApiToken || !settings.signalwireSpaceUrl) {
                                            setMessage({ type: 'error', text: 'Project ID, API Token, and Space URL are all required.' });
                                            return;
                                        }
                                        const base = (settings.apiBaseUrl || '').replace(/\/$/, '');
                                        setIsVerifying(true);
                                        setMessage(null);
                                        try {
                                            const res = await fetch(`${base}/api/messaging/available-numbers?churchId=test&areaCode=615`);
                                            if (res.ok || res.status === 400) {
                                                setMessage({ type: 'success', text: 'SignalWire credentials verified successfully.' });
                                            } else {
                                                const data = await res.json().catch(() => ({}));
                                                setMessage({ type: 'error', text: `Verification failed: ${data.error || res.status}` });
                                            }
                                        } catch (e: any) {
                                            setMessage({ type: 'error', text: `Could not reach backend to verify: ${e.message}` });
                                        } finally {
                                            setIsVerifying(false);
                                        }
                                    }}
                                    disabled={isVerifying || !settings.signalwireProjectId || !settings.signalwireApiToken}
                                    className="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {isVerifying ? 'Testing…' : 'Test Connection'}
                                </button>
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-400 mb-5 leading-relaxed">
                            Shared project for all tenants — routing is handled by inbound webhook lookup.{' '}
                            <a href="https://barnabassoftware.signalwire.com" target="_blank" rel="noopener noreferrer" className="underline text-indigo-400 hover:text-indigo-300">barnabassoftware.signalwire.com</a>{' '}→ API → API Tokens.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Project ID</label>
                                <input type="text" value={settings.signalwireProjectId || ''} onChange={e => handleChange('signalwireProjectId', e.target.value.trim())} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                                <p className="text-[9px] text-slate-400 mt-1">UUID — Dashboard → API → API Tokens.</p>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Space URL</label>
                                <input type="text" value={settings.signalwireSpaceUrl || ''} onChange={e => handleChange('signalwireSpaceUrl', e.target.value.trim().replace(/^https?:\/\//, ''))} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="barnabassoftware.signalwire.com" />
                                <p className="text-[9px] text-slate-400 mt-1">Your subdomain — no https://.</p>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">API Token</label>
                                <input type="password" value={settings.signalwireApiToken || ''} onChange={e => handleChange('signalwireApiToken', e.target.value.trim())} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="PTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
                                <p className="text-[9px] text-slate-400 mt-1">Keep secret. Dashboard → API → API Tokens.</p>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Webhook Base URL</label>
                                <input type="text" value={settings.smsWebhookBaseUrl || ''} onChange={e => handleChange('smsWebhookBaseUrl', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder={settings.apiBaseUrl || 'https://api.example.com'} />
                                <p className="text-[9px] text-slate-400 mt-1">Defaults to Backend API URL. SignalWire posts callbacks here.</p>
                            </div>
                            <div className="sm:col-span-2">
                                <div className="flex items-center gap-2 mb-2">
                                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest">Signing Key</label>
                                    <span className="text-[9px] font-black bg-rose-500/10 text-rose-500 px-1.5 py-0.5 rounded-full border border-rose-500/20">REQUIRED for security</span>
                                </div>
                                <input type="password" value={settings.signalwireSigningKey || ''} onChange={e => handleChange('signalwireSigningKey', e.target.value.trim())} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="SK..." />
                                <p className="text-[9px] text-slate-400 mt-1">
                                    Found in <a href="https://barnabassoftware.signalwire.com/credentials" target="_blank" rel="noopener noreferrer" className="underline text-indigo-400 hover:text-indigo-300">Dashboard &rarr; API &rarr; API Credentials &rarr; Signing Key</a>. Used to verify all inbound webhook requests.
                                </p>
                            </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-[11px] font-black uppercase text-slate-500 tracking-widest">10DLC Campaign Registration</span>
                                <span className="text-[9px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-500/20 font-bold">Required for outbound SMS</span>
                            </div>
                            <p className="text-[9px] text-slate-400 mb-3">
                                Register <strong className="text-slate-600 dark:text-slate-300">Barnabas Software</strong> as a Brand and create a Campaign in the{' '}
                                <a href="https://barnabassoftware.signalwire.com/messaging_campaigns" target="_blank" rel="noopener noreferrer" className="underline text-indigo-400 hover:text-indigo-300">SignalWire Dashboard &rarr; Messaging Campaigns</a>.
                                {' '}Paste the resulting Campaign ID here. All newly provisioned church numbers will be auto-assigned to this campaign.
                            </p>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Campaign ID (TCR)</label>
                                <input
                                    type="text"
                                    value={settings.signalwireCampaignId || ''}
                                    onChange={e => handleChange('signalwireCampaignId', e.target.value.trim())}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="e.g. CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                                />
                                <p className="text-[9px] text-slate-400 mt-1">
                                    Found in Dashboard &rarr; Messaging Campaigns &rarr; Campaigns &rarr; click your campaign &rarr; Campaign ID.
                                    Once set, newly provisioned numbers are auto-submitted for carrier approval (takes up to 24h).
                                </p>
                            </div>
                        </div>
                        {(settings.smsWebhookBaseUrl || settings.apiBaseUrl) && (
                            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Webhook URLs</label>
                                <p className="text-[9px] text-slate-400 mb-3">Copy these URLs into your SignalWire space settings and Campaign Registry webhook settings.</p>
                                <div className="space-y-1.5">
                                    {[
                                        { path: '/api/messaging/inbound', label: 'Inbound Message Webhook' },
                                        { path: '/api/messaging/status', label: 'Delivery Status Webhook' },
                                        { path: '/api/messaging/campaign-status', label: '10DLC Campaign Webhook' },
                                        { path: '/api/messaging/assignment-status', label: 'Number Assignment Webhook' }
                                    ].map(({ path, label }) => {
                                        const base = (settings.smsWebhookBaseUrl || settings.apiBaseUrl || '').replace(/\/$/, '');
                                        const url = base + path;
                                        return (
                                            <div key={path} className="flex flex-col gap-1">
                                                <span className="text-[9px] font-bold text-slate-500">{label}</span>
                                                <div className="bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-1.5 flex items-center justify-between gap-2">
                                                    <code className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 truncate">{url}</code>
                                                    <button onClick={() => navigator.clipboard.writeText(url)} className="text-slate-400 hover:text-indigo-500 transition-colors shrink-0 text-xs" title="Copy">📋</button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Usage Estimate Pricing <span className="normal-case font-normal">(USD)</span></label>
                            <p className="text-[9px] text-slate-400 mb-3">For in-app cost estimates only. Actual billing is in your SignalWire Dashboard.</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[9px] font-bold text-slate-500 mb-1">SMS per segment</label>
                                    <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span><input type="number" aria-label="SMS cost per segment in USD" placeholder="0.0079" step="0.0001" min="0" value={settings.smsSegmentCostUsd ?? 0.0079} onChange={e => handleChange('smsSegmentCostUsd', parseFloat(e.target.value) || 0.0079)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-7 pr-3 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" /></div>
                                </div>
                                <div>
                                    <label className="block text-[9px] font-bold text-slate-500 mb-1">MMS per message</label>
                                    <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span><input type="number" aria-label="MMS cost per message in USD" placeholder="0.0200" step="0.001" min="0" value={settings.smsMmsSegmentCostUsd ?? 0.02} onChange={e => handleChange('smsMmsSegmentCostUsd', parseFloat(e.target.value) || 0.02)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-7 pr-3 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" /></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Feature Modules */}
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col">
                        <h3 className="text-sm font-black text-slate-900 dark:text-white mb-1">Feature Modules</h3>
                        <p className="text-[10px] text-slate-400 mb-4 leading-relaxed">Enable or disable top-level feature areas globally.</p>
                        <div className="grid grid-cols-1 gap-2 flex-1">
                            {['pastoral', 'people', 'groups', 'services', 'giving', 'metrics', 'communication'].map(mod => (
                                <label key={mod} className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors">
                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 capitalize">{mod}</span>
                                    <input type="checkbox" checked={settings.enabledModules ? settings.enabledModules[mod as keyof typeof settings.enabledModules] : true} onChange={() => handleModuleToggle(mod)} className="w-4 h-4 accent-indigo-600 rounded" />
                                </label>
                            ))}
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900 dark:text-white">Allow Public Signups</span>
                            <button role="switch" aria-checked={settings.allowSignups ? 'true' : 'false'} aria-label="Allow Public Signups" onClick={() => handleChange('allowSignups', !settings.allowSignups)} className={`w-12 h-6 rounded-full p-1 transition-colors ${settings.allowSignups ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings.allowSignups ? 'translate-x-6' : ''}`}></div>
                            </button>
                        </div>
                    </div>

                </div>{/* end Row 2 */}

                {/* ── Row 3: Stripe Billing ─────────────────────────────────── */}
                <div className="bg-slate-900 text-white p-8 rounded-2xl border border-slate-800 shadow-xl">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <h3 className="text-base font-black">Stripe Billing</h3>
                            {isStripeConfigured ? (
                                <span className="text-[9px] font-black bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">ACTIVE</span>
                            ) : (
                                <span className="text-[9px] font-black bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full border border-rose-500/30">INCOMPLETE</span>
                            )}
                        </div>
                        <button onClick={verifyStripeConfig} disabled={isVerifying} className="text-[10px] font-bold text-slate-400 hover:text-white transition-colors disabled:opacity-50">
                            {isVerifying ? 'Testing...' : 'Test Config'}
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-500 tracking-widest mb-2">Publishable Key</label>
                                <input type="text" value={settings.stripePublishableKey || ''} onChange={e => handleChange('stripePublishableKey', e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="pk_live_..." />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-500 tracking-widest mb-2">Secret Key</label>
                                <input type="password" value={settings.stripeSecretKey || ''} onChange={e => handleChange('stripeSecretKey', e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="sk_live_..." />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-500 tracking-widest mb-2">Webhook Secret</label>
                                <input type="password" value={settings.stripeWebhookSecret || ''} onChange={e => handleChange('stripeWebhookSecret', e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="whsec_..." />
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <label className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">Plan Price IDs</label>
                                {!arePricesConfigured && <span className="text-[9px] text-rose-400 font-bold">Missing IDs</span>}
                            </div>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[9px] font-bold text-slate-500 mb-1">Starter Plan</label>
                                    <input type="text" value={settings.stripePriceIds?.starter || ''} onChange={e => setSettings(prev => ({ ...prev, stripePriceIds: { ...prev.stripePriceIds, starter: e.target.value } }))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 font-mono text-xs text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="price_..." />
                                </div>
                                <div>
                                    <label className="block text-[9px] font-bold text-slate-500 mb-1">Growth Plan</label>
                                    <input type="text" value={settings.stripePriceIds?.growth || ''} onChange={e => setSettings(prev => ({ ...prev, stripePriceIds: { ...prev.stripePriceIds, growth: e.target.value } }))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 font-mono text-xs text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="price_..." />
                                </div>
                                <div>
                                    <label className="block text-[9px] font-bold text-slate-500 mb-1">Kingdom Plan</label>
                                    <input type="text" value={settings.stripePriceIds?.kingdom || ''} onChange={e => setSettings(prev => ({ ...prev, stripePriceIds: { ...prev.stripePriceIds, kingdom: e.target.value } }))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 font-mono text-xs text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="price_..." />
                                </div>
                            </div>
                            <div className="pt-5 flex justify-end">
                                <button onClick={handleSave} disabled={isSaving} className="bg-white text-slate-900 px-5 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-50">
                                    {isSaving ? 'Saving...' : 'Save Billing Config'}
                                </button>
                            </div>
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

                {/* â”€â”€ Grow Integration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-9 h-9 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-lg">ðŸŒ±</div>
                        <div>
                            <h3 className="text-lg font-black text-slate-900 dark:text-white">Grow Integration</h3>
                            <p className="text-[10px] text-slate-400 mt-0.5">Configure the shared secret that authorises the Grow Application to send emails through Pastoral Care.</p>
                        </div>
                    </div>

                    <div className="space-y-5">
                        {/* Tenant selector */}
                        <div>
                            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Select Tenant</label>
                            <select
                                value={selectedGrowChurchId}
                                onChange={e => {
                                    const id = e.target.value;
                                    setSelectedGrowChurchId(id);
                                    setGrowSecretMsg(null);
                                    setGrowSecretVisible(false);
                                    // Pre-fill any existing secret for the selected church
                                    const church = churches.find(c => c.id === id);
                                    setGrowSecret((church as any)?.growSettings?.growIntegrationSecret || '');
                                }}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                                <option value="">â€” choose a tenant â€”</option>
                                {churches.map(c => (
                                    <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
                                ))}
                            </select>
                        </div>

                        {selectedGrowChurchId && (
                            <>
                                {/* Secret field */}
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">
                                        PASTORAL_CARE_API_SECRET
                                        <span className="ml-2 normal-case font-normal text-slate-400">(Grow App integration secret)</span>
                                    </label>
                                    <p className="text-[9px] text-slate-400 mb-2 leading-relaxed">
                                        Set this exact value as <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">PASTORAL_CARE_API_SECRET</code> in your Grow Application's integration settings.
                                        The Grow backend will include it in every request it sends to Pastoral Care.
                                    </p>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <input
                                                type={growSecretVisible ? 'text' : 'password'}
                                                value={growSecret}
                                                onChange={e => setGrowSecret(e.target.value)}
                                                readOnly={!growSecretVisible}
                                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 pr-24"
                                                placeholder="Generate a secret belowâ€¦"
                                            />
                                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                                                <button
                                                    onClick={() => setGrowSecretVisible(v => !v)}
                                                    className="text-slate-400 hover:text-indigo-500 transition-colors p-1 text-xs"
                                                    title={growSecretVisible ? 'Hide' : 'Show'}
                                                >
                                                    {growSecretVisible ? 'ðŸ™ˆ' : 'ðŸ‘'}
                                                </button>
                                                {growSecret && (
                                                    <button
                                                        onClick={() => { navigator.clipboard.writeText(growSecret); setGrowSecretMsg({ type: 'success', text: 'Secret copied to clipboard!' }); }}
                                                        className="text-slate-400 hover:text-indigo-500 transition-colors p-1 text-xs"
                                                        title="Copy"
                                                    >
                                                        ðŸ“‹
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                // Generate a cryptographically random 32-byte hex secret
                                                const array = new Uint8Array(32);
                                                crypto.getRandomValues(array);
                                                const secret = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
                                                setGrowSecret(secret);
                                                setGrowSecretVisible(true);
                                                setGrowSecretMsg(null);
                                            }}
                                            className="shrink-0 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 px-3 py-2 rounded-xl font-bold text-xs hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors whitespace-nowrap border border-emerald-200 dark:border-emerald-800"
                                        >
                                            âœ¨ Generate
                                        </button>
                                    </div>
                                </div>

                                {growSecretMsg && (
                                    <div className={`px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                                        growSecretMsg.type === 'success'
                                            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                            : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                                    }`}>
                                        {growSecretMsg.type === 'success' ? '\u2705' : '\u274C'} {growSecretMsg.text}
                                    </div>
                                )}

                                {/* Save button */}
                                <div className="flex justify-end">
                                    <button
                                        disabled={!growSecret || growSecretSaving}
                                        onClick={async () => {
                                            if (!growSecret.trim()) return;
                                            setGrowSecretSaving(true);
                                            setGrowSecretMsg(null);
                                            try {
                                                await firestore.updateChurch(selectedGrowChurchId, {
                                                    growSettings: {
                                                        ...(churches.find(c => c.id === selectedGrowChurchId) as any)?.growSettings,
                                                        growIntegrationSecret: growSecret.trim(),
                                                    }
                                                });
                                                // Refresh church list so the newly stored secret is reflected
                                                const list = await firestore.getAllChurches();
                                                setChurches(list);
                                                setGrowSecretMsg({ type: 'success', text: 'Secret saved! Configure the same value as PASTORAL_CARE_API_SECRET in the Grow Application.' });
                                            } catch (e: any) {
                                                setGrowSecretMsg({ type: 'error', text: 'Failed to save: ' + e.message });
                                            } finally {
                                                setGrowSecretSaving(false);
                                            }
                                        }}
                                        className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-50 shadow-sm"
                                    >
                                        {growSecretSaving ? 'Savingâ€¦' : 'Save Secret to Tenant'}
                                    </button>
                                </div>

                                {/* Instructions callout */}
                                <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-5 space-y-2">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Setup Instructions for the Grow App</p>
                                    <ol className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed">
                                        <li>In the Grow Application, navigate to <strong>Settings â†’ Integrations</strong>.</li>
                                        <li>Find the <strong>Pastoral Care Integration</strong> section.</li>
                                        <li>Set <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">PASTORAL_CARE_API_SECRET</code> to the secret generated above.</li>
                                        <li>Set the endpoint to <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">{(settings.apiBaseUrl || DEFAULT_API_URL).replace(/\/$/, '')}/api/integrations/grow/daily-email</code></li>
                                        <li>Include the tenant's <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">churchId</code> (<code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">{selectedGrowChurchId}</code>) in every request body.</li>
                                    </ol>
                                </div>
                            </>
                        )}
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
                                        <code className="text-xs font-mono text-emerald-400 truncate">https://pastoralcare.barnabassoftware.com/stripe</code>
                                        <button 
                                            onClick={() => navigator.clipboard.writeText("https://pastoralcare.barnabassoftware.com/stripe")}
                                            className="text-slate-400 hover:text-white transition-colors"
                                            title="Copy to Clipboard"
                                        >
                                            ðŸ“‹
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
                            const clientId = settings.pcoClientId;
                            if (!clientId) {
                                alert("Missing Client ID in Global App Settings.");
                                return;
                            }
                            const redirectUri = window.location.origin;
                            // Adding check_ins with the required underscore per official API documentation
                            const url = `https://api.planningcenteronline.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=people%20services%20giving%20groups%20check_ins%20registrations%20calendar`;
                            window.location.href = url;
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
            <div className="space-y-6">
                {/* Header & Filters */}
                <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                        <div>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white">System Logs</h3>
                            <p className="text-xs text-slate-400 mt-1">Audit trail for sync, webhooks, proxy, and app events</p>
                        </div>
                        <button
                            onClick={loadLogs}
                            disabled={isLoading}
                            className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                            {isLoading ? (
                                <><span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span> Loading...</>
                            ) : 'â†» Refresh'}
                        </button>
                    </div>

                    {/* Filter Bar */}
                    <div className="flex flex-wrap gap-3">
                        <select
                            aria-label="Filter by tenant"
                            value={logFilter}
                            onChange={(e) => setLogFilter(e.target.value)}
                            className="bg-slate-100 dark:bg-slate-800 border-none text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 rounded-lg py-2 px-3 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                        >
                            <option value="">All Tenants</option>
                            {churches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>

                        <select
                            aria-label="Filter by log level"
                            value={logLevelFilter}
                            onChange={(e) => setLogLevelFilter(e.target.value as any)}
                            className="bg-slate-100 dark:bg-slate-800 border-none text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 rounded-lg py-2 px-3 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                        >
                            <option value="">All Levels</option>
                            <option value="info">Info</option>
                            <option value="warn">Warn</option>
                            <option value="error">Error</option>
                        </select>

                        <select
                            aria-label="Filter by log source"
                            value={logSourceFilter}
                            onChange={(e) => setLogSourceFilter(e.target.value)}
                            className="bg-slate-100 dark:bg-slate-800 border-none text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 rounded-lg py-2 px-3 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                        >
                            <option value="">All Sources</option>
                            <option value="sync">Sync</option>
                            <option value="webhook">Webhook</option>
                            <option value="proxy">Proxy</option>
                            <option value="auth">Auth</option>
                            <option value="app">App</option>
                            <option value="system">System</option>
                        </select>

                        {(logFilter || logLevelFilter || logSourceFilter) && (
                            <button
                                onClick={() => { setLogFilter(''); setLogLevelFilter(''); setLogSourceFilter(''); }}
                                className="text-[10px] font-bold text-rose-500 hover:text-rose-700 px-3 py-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                            >
                                âœ• Clear Filters
                            </button>
                        )}
                    </div>

                    {/* Stats Bar */}
                    {logs.length > 0 && (
                        <div className="flex gap-4 mt-5 pt-5 border-t border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                <span className="text-[10px] font-bold text-slate-500">{logs.filter(l => l.level === 'info').length} Info</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                <span className="text-[10px] font-bold text-slate-500">{logs.filter(l => l.level === 'warn').length} Warn</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                                <span className="text-[10px] font-bold text-slate-500">{logs.filter(l => l.level === 'error').length} Error</span>
                            </div>
                            <span className="text-[10px] text-slate-400 ml-auto">{logs.length} entries shown</span>
                        </div>
                    )}
                </div>

                {/* Logs Table */}
                <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 z-10 border-b border-slate-100 dark:border-slate-700">
                                <tr>
                                    <th className="p-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest w-44">Timestamp</th>
                                    <th className="p-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest w-20">Level</th>
                                    <th className="p-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest w-24">Source</th>
                                    <th className="p-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest w-36">Tenant</th>
                                    <th className="p-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest">Message</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                {logs.map((log, idx) => {
                                    const tenantName = churches.find(c => c.id === log.churchId)?.name || log.churchId;
                                    const isExpanded = expandedLogId === log.id;

                                    let lvlBadge = 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400';
                                    let rowBg = '';
                                    if (log.level === 'error') {
                                        lvlBadge = 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400';
                                        rowBg = 'bg-rose-50/40 dark:bg-rose-900/10';
                                    } else if (log.level === 'warn') {
                                        lvlBadge = 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400';
                                        rowBg = 'bg-amber-50/40 dark:bg-amber-900/10';
                                    }

                                    const srcColors: Record<string, string> = {
                                        sync: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
                                        webhook: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400',
                                        proxy: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
                                        auth: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
                                        app: 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300',
                                        system: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
                                    };
                                    const srcColor = srcColors[log.source || 'app'] || srcColors.app;

                                    const hasContext = log.details && log.details !== '{}';

                                    return (
                                        <>
                                            <tr
                                                key={log.id || idx}
                                                onClick={() => hasContext ? setExpandedLogId(isExpanded ? null : log.id) : undefined}
                                                className={`${rowBg} ${hasContext ? 'cursor-pointer' : ''} hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors`}
                                            >
                                                <td className="p-4">
                                                    <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                                        {new Date(log.timestamp).toLocaleString()}
                                                    </p>
                                                </td>
                                                <td className="p-4">
                                                    <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${lvlBadge}`}>
                                                        {log.level}
                                                    </span>
                                                </td>
                                                <td className="p-4">
                                                    {log.source && (
                                                        <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${srcColor}`}>
                                                            {log.source}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-4">
                                                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded truncate max-w-[120px] block">
                                                        {tenantName}
                                                    </span>
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{log.message}</p>
                                                        {hasContext && (
                                                            <span className="text-[9px] text-slate-400 shrink-0 mt-0.5">{isExpanded ? 'â–²' : 'â–¼'} details</span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                            {isExpanded && hasContext && (
                                                <tr key={`${log.id}-detail`} className={rowBg}>
                                                    <td colSpan={5} className="px-4 pb-4">
                                                        <pre className="text-[11px] font-mono bg-slate-900 text-emerald-400 p-4 rounded-xl overflow-x-auto">
                                                            {JSON.stringify(JSON.parse(log.details!), null, 2)}
                                                        </pre>
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    );
                                })}
                                {logs.length === 0 && !isLoading && (
                                    <tr>
                                        <td colSpan={5} className="p-12 text-center">
                                            <div className="text-4xl mb-3">ðŸ“‹</div>
                                            <p className="text-slate-400 text-sm font-bold">No logs found</p>
                                            <p className="text-slate-400 text-xs mt-1">Logs will appear here after sync or webhook events occur.</p>
                                        </td>
                                    </tr>
                                )}
                                {isLoading && (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-slate-400 text-xs font-bold animate-pulse">
                                            Loading logs...
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
