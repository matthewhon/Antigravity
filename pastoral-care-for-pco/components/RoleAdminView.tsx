
import React, { useState, useEffect } from 'react';
import { User, Church, RiskSettings, ChurchRiskSettings, DonorLifecycleSettings, GroupRiskSettings, CommunityLocation } from '../types';
import { CreateUserModal } from './CreateUserModal';
import { firestore } from '../services/firestoreService';
import { auth } from '../services/firebase';
import RiskSettingsView from './RiskSettingsView';
import ChurchRiskSettingsView from './ChurchRiskSettingsView';
import GroupRiskSettingsView from './GroupRiskSettingsView';
import DonorLifecycleSettingsView from './DonorLifecycleSettingsView';
import { SubscriptionSettingsView } from './SubscriptionSettingsView';
import { ALL_WIDGETS } from '../constants/widgetRegistry';
import { PLANS } from '../services/stripeService';

interface RoleAdminViewProps {
  currentUser: User;
  churchId: string;
  church: Church;
  onUpdateChurch?: (updates: Partial<Church>) => void;
  onSaveRiskSettings?: (settings: RiskSettings) => void;
  initialTab?: string;
  rawPeople?: any[];
  rawGroups?: any[];
  rawDonations?: any[];
  rawTeams?: any[];
  onSync?: () => void;
}

const RoleAdminView: React.FC<RoleAdminViewProps> = ({ 
    currentUser, 
    churchId, 
    church, 
    onUpdateChurch,
    onSaveRiskSettings,
    initialTab,
    onSync
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'Team' | 'Organization' | 'Planning Center' | 'Community' | 'Widget Directory' | 'Risk Profiles' | 'Subscription'>('Team');
  const [formData, setFormData] = useState<Partial<Church>>(church);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    loadUsers();
  }, [churchId]);

  useEffect(() => {
      setFormData(church);
  }, [church]);

  useEffect(() => {
      if (initialTab && ['Team', 'Organization', 'Planning Center', 'Community', 'Widget Directory', 'Risk Profiles', 'Subscription'].includes(initialTab)) {
          setActiveTab(initialTab as any);
      }
  }, [initialTab]);

  // Clear save message automatically
  useEffect(() => {
      let timer: ReturnType<typeof setTimeout>;
      if (saveMessage) {
          timer = setTimeout(() => setSaveMessage(''), 3000);
      }
      return () => clearTimeout(timer);
  }, [saveMessage]);

  const loadUsers = async () => {
    try {
      const churchUsers = await firestore.getUsersByChurch(churchId);
      setUsers(churchUsers);
    } catch (e) {
      console.error("Failed to load users", e);
    }
  };

  const handleRemoveUser = async (uid: string) => {
    if (window.confirm("Are you sure you want to remove this user?")) {
      await firestore.deleteUser(uid);
      loadUsers();
    }
  };

  // Determine Limit Variables
  const now = Date.now();
  const isTrialActive = !church.subscription?.planId && (church.trialEndsAt || 0) > now;
  const activeSubscription = church.subscription?.status === 'active';
  const planId = activeSubscription ? church.subscription?.planId : null;
  
  // Calculate Max Users
  let maxUsers = 1; // Default to Free Tier (1 User)
  let planName = 'Free';

  if (activeSubscription && planId) {
      const plan = PLANS.find(p => p.id === planId);
      if (plan) {
          maxUsers = plan.maxUsers;
          planName = plan.name;
      }
  } else if (isTrialActive) {
      // Trial users get Growth equivalent (Unlimited)
      maxUsers = 99999; 
      planName = 'Free Trial';
  }

  const handleAddMemberClick = () => {
      if (users.length >= maxUsers) {
          alert(`You have reached the user limit (${maxUsers}) for the ${planName} plan. Please upgrade your subscription to add more team members.`);
          setActiveTab('Subscription');
          return;
      }

      setIsCreateModalOpen(true);
  };

  const handleChange = (field: keyof Church, value: any) => {
      if (field === 'metricsSharingEnabled' && value === false) {
          // If turning OFF metrics sharing, automatically disable all benchmark widgets
          let currentEnabled = formData.enabledWidgets;
          
          if (!currentEnabled) {
              // Convert "All Enabled" to explicit list excluding benchmarks
              const allNonBenchmarkIds: string[] = [];
              Object.entries(ALL_WIDGETS).forEach(([category, widgets]) => {
                  widgets.forEach(w => {
                      if (!w.id.startsWith('benchmark_')) {
                          allNonBenchmarkIds.push(`${category}:${w.id}`);
                      }
                  });
              });
              setFormData(prev => ({ ...prev, [field]: value, enabledWidgets: allNonBenchmarkIds }));
          } else {
              // Filter out benchmarks from existing explicit list
              const filteredWidgets = currentEnabled.filter(id => {
                  const [_, widgetId] = id.split(':'); // category:id
                  return !widgetId?.startsWith('benchmark_');
              });
              setFormData(prev => ({ ...prev, [field]: value, enabledWidgets: filteredWidgets }));
          }
      } else {
          setFormData(prev => ({ ...prev, [field]: value }));
      }
  };

  const handleSaveOrgSettings = async () => {
      if (!onUpdateChurch) return;
      setIsSaving(true);
      setSaveMessage('');
      try {
          await onUpdateChurch(formData);
          setSaveMessage('Settings saved successfully.');
      } catch (e) {
          console.error(e);
          setSaveMessage('Failed to save settings.');
      } finally {
          setIsSaving(false);
      }
  };

  const handleFlushData = async () => {
      const confirmMessage = `WARNING: This will delete all cached data pulled from Planning Center (People, Groups, Giving, Services).\n\nIt will NOT delete your organization, user accounts, or manual settings.\n\nThis is useful if you want to force a completely fresh sync.\n\nAre you sure?`;
      
      if (window.confirm(confirmMessage)) {
          try {
              await firestore.flushSyncedData(churchId);
              alert("Data flushed successfully. You can now re-sync from the Planning Center tab.");
              if (onUpdateChurch) onUpdateChurch({ lastSyncTimestamp: null });
          } catch (e: any) {
              console.error(e);
              alert("Error flushing data: " + e.message);
          }
      }
  };

  const handleDeleteOrganization = async () => {
      const confirmMessage = `WARNING: YOU ARE ABOUT TO PERMANENTLY DELETE THIS ORGANIZATION.\n\nTenant: ${church.name}\n\nThis will delete:\n- All People & Households\n- All Donation Records\n- All Groups & Service Plans\n- All User Accounts (including yours)\n\nThis action CANNOT be undone.\n\nType "DELETE" to confirm.`;
      
      if (window.prompt(confirmMessage) === 'DELETE') {
          try {
              await firestore.deleteChurchAndData(churchId);
              // Sign out immediately as user no longer exists
              await auth.signOut();
              window.location.reload();
          } catch (e: any) {
              console.error(e);
              alert("Error deleting organization: " + e.message);
          }
      }
  };

  const handleConnectPco = async () => {
      const sys = await firestore.getSystemSettings();
      const clientId = sys.pcoClientId;
      if (!clientId) {
          alert("No Client ID configured in System Settings. Please contact an administrator.");
          return;
      }
      
      const redirectUri = window.location.origin;
      const url = `https://api.planningcenteronline.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=people%20services%20check-ins%20giving%20groups&state=${churchId}`;
      window.location.href = url;
  };

  const handleDisconnectPco = async () => {
      if (window.confirm("Are you sure you want to disconnect? This will stop all data syncs.")) {
          const updates = { 
              pcoConnected: false, 
              pcoAccessToken: null, 
              pcoRefreshToken: null, 
              pcoTokenExpiry: 0 
          };
          setFormData(prev => ({ ...prev, ...updates }));
          if (onUpdateChurch) await onUpdateChurch(updates);
      }
  };

  // --- Widget Directory Logic ---

  const handleToggleWidget = (fullWidgetId: string) => {
      // Logic: enabledWidgets === null/undefined means ALL are enabled.
      // To disable one, we must first materialize the list of ALL widgets, then remove the target.
      
      let currentEnabled = formData.enabledWidgets;

      if (!currentEnabled) {
          // Currently in "All Enabled" mode. Switch to explicit array mode.
          const allIds: string[] = [];
          Object.entries(ALL_WIDGETS).forEach(([category, widgets]) => {
              widgets.forEach(w => allIds.push(`${category}:${w.id}`));
          });
          // Remove the one we are toggling off
          currentEnabled = allIds.filter(id => id !== fullWidgetId);
      } else {
          // Currently in explicit mode
          if (currentEnabled.includes(fullWidgetId)) {
              currentEnabled = currentEnabled.filter(id => id !== fullWidgetId);
          } else {
              currentEnabled = [...currentEnabled, fullWidgetId];
          }
      }

      setFormData(prev => ({ ...prev, enabledWidgets: currentEnabled }));
  };

  const handleEnableAllWidgets = () => {
      if (!formData.metricsSharingEnabled) {
          // If metrics sharing is disabled, we cannot enable "All" because that includes benchmarks
          // Instead, enable all EXCEPT benchmarks
          const allNonBenchmarkIds: string[] = [];
          Object.entries(ALL_WIDGETS).forEach(([category, widgets]) => {
              widgets.forEach(w => {
                  if (!w.id.startsWith('benchmark_')) {
                      allNonBenchmarkIds.push(`${category}:${w.id}`);
                  }
              });
          });
          setFormData(prev => ({ ...prev, enabledWidgets: allNonBenchmarkIds }));
      } else {
          setFormData(prev => ({ ...prev, enabledWidgets: null }));
      }
  };

  const handleDisableAllWidgets = () => {
      setFormData(prev => ({ ...prev, enabledWidgets: [] }));
  };

  const handleAddLocation = async () => {
      const name = (document.getElementById('new-loc-name') as HTMLInputElement)?.value;
      const city = (document.getElementById('new-loc-city') as HTMLInputElement)?.value;
      const state = (document.getElementById('new-loc-state') as HTMLInputElement)?.value;
      const zip = (document.getElementById('new-loc-zip') as HTMLInputElement)?.value;

      if (!name || !city || !state) {
          alert("Please provide Name, City, and State.");
          return;
      }

      const newLoc: CommunityLocation = {
          id: `loc_${Date.now()}`,
          name,
          city,
          state,
          zip,
          isDefault: (formData.communityLocations || []).length === 0
      };

      const updatedLocations = [...(formData.communityLocations || []), newLoc];
      setFormData(prev => ({ ...prev, communityLocations: updatedLocations }));
      
      if (onUpdateChurch) {
          await onUpdateChurch({ communityLocations: updatedLocations });
          setSaveMessage('Location added successfully');
      }

      // Clear inputs
      (document.getElementById('new-loc-name') as HTMLInputElement).value = '';
      (document.getElementById('new-loc-city') as HTMLInputElement).value = '';
      (document.getElementById('new-loc-state') as HTMLInputElement).value = '';
      (document.getElementById('new-loc-zip') as HTMLInputElement).value = '';
  };

  const handleRemoveLocation = async (id: string) => {
      if (!window.confirm("Are you sure you want to remove this location?")) return;

      const updatedLocations = (formData.communityLocations || []).filter(l => l.id !== id);
      
      // If we removed the default, set the first one as default if any remain
      if (updatedLocations.length > 0 && !updatedLocations.some(l => l.isDefault)) {
          updatedLocations[0].isDefault = true;
      }

      setFormData(prev => ({ ...prev, communityLocations: updatedLocations }));
      if (onUpdateChurch) {
          await onUpdateChurch({ communityLocations: updatedLocations });
          setSaveMessage('Location removed');
      }
  };

  const handleSetDefaultLocation = async (id: string) => {
      const updatedLocations = (formData.communityLocations || []).map(l => ({
          ...l,
          isDefault: l.id === id
      }));

      setFormData(prev => ({ ...prev, communityLocations: updatedLocations }));
      if (onUpdateChurch) {
          await onUpdateChurch({ communityLocations: updatedLocations });
          setSaveMessage('Default location updated');
      }
  };

  return (
    <div className="space-y-8 animate-in fade-in">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
                <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">Settings & Administration</h2>
                <p className="text-slate-400 dark:text-slate-500 font-medium uppercase text-[10px] tracking-widest mt-1">Manage Team & Configuration</p>
            </div>
            
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl gap-1 overflow-x-auto max-w-full">
                {['Team', 'Organization', 'Planning Center', 'Community', 'Widget Directory', 'Risk Profiles', 'Subscription'].map(tab => (
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

        {activeTab === 'Team' && (
            <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-sm">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="text-xl font-black text-slate-900 dark:text-white">Team Members</h3>
                    <div className="flex items-center gap-4">
                        <span className={`text-xs font-bold ${users.length >= maxUsers ? 'text-rose-500' : 'text-slate-400'}`}>
                            {users.length} / {maxUsers > 1000 ? '∞' : maxUsers} Users
                        </span>
                        <button 
                            onClick={handleAddMemberClick}
                            className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg ${
                                users.length >= maxUsers 
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200 dark:shadow-indigo-900/50'
                            }`}
                        >
                            + Add Member
                        </button>
                    </div>
                </div>

                <div className="space-y-4">
                    {users.map(u => (
                        <div key={u.id} className="flex flex-col md:flex-row items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                            <div className="flex items-center gap-4 mb-4 md:mb-0 w-full md:w-auto">
                                <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-sm">
                                    {u.name.charAt(0)}
                                </div>
                                <div>
                                    <p className="font-bold text-slate-900 dark:text-white text-sm">{u.name}</p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500">{u.email}</p>
                                    {u.lastLogin && (
                                        <p className="text-[9px] text-slate-400 dark:text-slate-600 mt-0.5 font-medium">
                                            Last login: {new Date(u.lastLogin).toLocaleDateString()} {new Date(u.lastLogin).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2 mb-4 md:mb-0">
                                {u.roles.map(r => (
                                    <span key={r} className="px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                                        {r}
                                    </span>
                                ))}
                            </div>
                            {currentUser.id !== u.id && (
                                <button 
                                    onClick={() => handleRemoveUser(u.id)}
                                    className="text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 transition-colors px-4 py-2 text-[10px] font-black uppercase tracking-widest"
                                >
                                    Remove
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        )}

        {activeTab === 'Organization' && (
            <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-sm transition-colors">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="text-xl font-black text-slate-900 dark:text-white">Organization Profile</h3>
                    <div className="flex items-center gap-4">
                        {saveMessage && (
                            <span className={`text-xs font-bold animate-in fade-in ${saveMessage.includes('Failed') ? 'text-rose-500' : 'text-emerald-500'}`}>
                                {saveMessage}
                            </span>
                        )}
                        <button 
                            onClick={handleSaveOrgSettings}
                            disabled={isSaving}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg disabled:opacity-50"
                        >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div className="space-y-6">
                        {/* Read-Only Tenant ID */}
                        <div>
                            <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-3">Tenant ID (Read Only)</label>
                            <div className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400 select-all transition-colors">
                                {formData.id}
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-3">Church Name</label>
                            <input 
                                type="text" 
                                value={formData.name || ''}
                                onChange={e => handleChange('name', e.target.value)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-3">Address</label>
                            <input 
                                type="text" 
                                value={formData.address || ''}
                                onChange={e => handleChange('address', e.target.value)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                                placeholder="123 Main St"
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="col-span-1">
                                <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-3">City</label>
                                <input 
                                    type="text" 
                                    value={formData.city || ''}
                                    onChange={e => handleChange('city', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                                />
                            </div>
                            <div className="col-span-1">
                                <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-3">State</label>
                                <input 
                                    type="text" 
                                    value={formData.state || ''}
                                    onChange={e => handleChange('state', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                                />
                            </div>
                            <div className="col-span-1">
                                <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-3">Zip</label>
                                <input 
                                    type="text" 
                                    value={formData.zip || ''}
                                    onChange={e => handleChange('zip', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-3">Phone</label>
                                <input 
                                    type="tel" 
                                    value={formData.phone || ''}
                                    onChange={e => handleChange('phone', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                                    placeholder="(555) 555-5555"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-3">Email</label>
                                <input 
                                    type="email" 
                                    value={formData.email || ''}
                                    onChange={e => handleChange('email', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                                    placeholder="contact@church.com"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-3">Website</label>
                            <input 
                                type="text" 
                                value={formData.website || ''}
                                onChange={e => handleChange('website', e.target.value)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                            />
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 transition-colors">
                            <h4 className="font-bold text-indigo-600 dark:text-indigo-400 mb-4 text-sm">Integrations</h4>
                            
                            <div className="mb-6">
                                <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-2">Google Maps API Key</label>
                                <input 
                                    type="text" 
                                    value={formData.googleMapsApiKey || ''}
                                    onChange={e => handleChange('googleMapsApiKey', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-400 transition-colors"
                                    placeholder="Enter your key for maps"
                                />
                            </div>

                            <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors">
                                <div>
                                    <p className="text-xs font-bold text-slate-900 dark:text-white">Share Aggregated Metrics</p>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400">Contribute anonymized stats to global benchmarks</p>
                                </div>
                                <button 
                                    onClick={() => handleChange('metricsSharingEnabled', !formData.metricsSharingEnabled)}
                                    className={`w-12 h-6 rounded-full p-1 transition-colors ${formData.metricsSharingEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                                >
                                    <div className={`w-4 h-4 bg-white rounded-full transition-transform ${formData.metricsSharingEnabled ? 'translate-x-6' : ''}`}></div>
                                </button>
                            </div>
                        </div>

                        {/* Danger Zone */}
                        <div className="bg-rose-50 dark:bg-rose-950/30 p-6 rounded-2xl border border-rose-100 dark:border-rose-900/50 transition-colors">
                            <h4 className="font-bold text-rose-600 dark:text-rose-500 mb-2 text-sm">Danger Zone</h4>
                            <p className="text-[10px] text-rose-600/70 dark:text-rose-200/60 mb-4 leading-relaxed">
                                Manage destructive actions for this organization.
                            </p>
                            <div className="space-y-3">
                                <button 
                                    onClick={handleFlushData}
                                    className="w-full bg-amber-100 dark:bg-amber-600/10 hover:bg-amber-200 dark:hover:bg-amber-600 text-amber-700 dark:text-amber-500 dark:hover:text-white border border-amber-200 dark:border-amber-600/50 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                                >
                                    Flush Synced Data
                                </button>
                                <button 
                                    onClick={handleDeleteOrganization}
                                    className="w-full bg-rose-100 dark:bg-rose-600/10 hover:bg-rose-200 dark:hover:bg-rose-600 text-rose-700 dark:text-rose-500 dark:hover:text-white border border-rose-200 dark:border-rose-600/50 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                                >
                                    Delete Organization
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'Community' && (
            <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-sm transition-colors">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white">Community Locations</h3>
                        <p className="text-xs text-slate-400 mt-1">Manage locations for census and community data analysis.</p>
                    </div>
                    {saveMessage && (
                        <span className="text-xs font-bold text-emerald-500 animate-in fade-in">
                            {saveMessage}
                        </span>
                    )}
                </div>

                <div className="space-y-6">
                    {/* Location List */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {(formData.communityLocations || []).map((loc) => (
                            <div key={loc.id} className={`p-6 rounded-3xl border transition-all ${loc.isDefault ? 'bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-200 dark:border-indigo-800' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800'}`}>
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h4 className="font-bold text-slate-900 dark:text-white">{loc.name}</h4>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">{loc.city}, {loc.state} {loc.zip}</p>
                                    </div>
                                    {loc.isDefault && (
                                        <span className="text-[8px] font-black uppercase bg-indigo-600 text-white px-2 py-0.5 rounded-full tracking-widest">Default</span>
                                    )}
                                </div>
                                
                                <div className="flex gap-2 mt-4">
                                    {!loc.isDefault && (
                                        <button 
                                            onClick={() => handleSetDefaultLocation(loc.id)}
                                            className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                                        >
                                            Set as Default
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => handleRemoveLocation(loc.id)}
                                        className="text-[10px] font-bold text-rose-500 hover:underline ml-auto"
                                    >
                                        Remove
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Add New Location Form */}
                    <div className="mt-10 pt-10 border-t border-slate-100 dark:border-slate-800">
                        <h4 className="text-sm font-black text-slate-900 dark:text-white mb-6 uppercase tracking-widest">Add New Location</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Location Name</label>
                                <input 
                                    type="text" 
                                    placeholder="Main Campus / North Side"
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                    id="new-loc-name"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">City</label>
                                <input 
                                    type="text" 
                                    placeholder="City"
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                    id="new-loc-city"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">State (2-letter)</label>
                                <input 
                                    type="text" 
                                    placeholder="ST"
                                    maxLength={2}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                    id="new-loc-state"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Zip Code</label>
                                <input 
                                    type="text" 
                                    placeholder="12345"
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                    id="new-loc-zip"
                                />
                            </div>
                        </div>
                        <button 
                            onClick={handleAddLocation}
                            className="mt-6 bg-indigo-600 text-white px-8 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
                        >
                            Add Location
                        </button>
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'Planning Center' && (
            <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-sm animate-in fade-in">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
                    <div>
                        <div className="flex items-center gap-3">
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white">Planning Center Integration</h3>
                            {formData.pcoConnected ? (
                                <span className="bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase px-2 py-1 rounded">Connected</span>
                            ) : (
                                <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase px-2 py-1 rounded">Not Connected</span>
                            )}
                        </div>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 font-medium">Manage data synchronization and API connection.</p>
                    </div>
                    {formData.pcoConnected ? (
                        <div className="flex gap-3">
                            <button 
                                onClick={() => onSync && onSync()}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg"
                            >
                                Sync Data Now
                            </button>
                            <button 
                                onClick={handleDisconnectPco}
                                className="bg-white dark:bg-slate-800 border border-rose-100 dark:border-rose-900 text-rose-500 dark:text-rose-400 px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all hover:bg-rose-50 dark:hover:bg-rose-900/20"
                            >
                                Disconnect
                            </button>
                        </div>
                    ) : (
                        <button 
                            onClick={handleConnectPco}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg flex items-center gap-3"
                        >
                            <span>🔗</span> Connect Planning Center
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-8">
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800">
                            <h4 className="font-bold text-slate-900 dark:text-white mb-6 text-sm">Automated Sync</h4>
                            <div className="flex items-center gap-4">
                                <div className="flex-1">
                                    <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-2">Daily Schedule</label>
                                    <input 
                                        type="time" 
                                        value={formData.scheduledSyncTime || ''}
                                        onChange={e => handleChange('scheduledSyncTime', e.target.value)}
                                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-mono text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                    />
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 leading-relaxed">
                                        The system will automatically attempt to sync new data from Planning Center at this time every day. Leave blank to disable auto-sync.
                                    </p>
                                </div>
                            </div>
                            <div className="mt-6 text-right">
                                <button 
                                    onClick={handleSaveOrgSettings}
                                    disabled={isSaving}
                                    className="text-indigo-600 dark:text-indigo-400 text-xs font-bold hover:underline"
                                >
                                    Save Schedule
                                </button>
                            </div>
                        </div>

                        <div className="bg-slate-50 dark:bg-slate-800/50 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800">
                            <h4 className="font-bold text-slate-900 dark:text-white mb-4 text-sm">Last Synchronization</h4>
                            {formData.lastSyncTimestamp ? (
                                <div>
                                    <p className="text-2xl font-mono font-bold text-slate-700 dark:text-slate-300">
                                        {new Date(formData.lastSyncTimestamp).toLocaleDateString()}
                                    </p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                        {new Date(formData.lastSyncTimestamp).toLocaleTimeString()}
                                    </p>
                                </div>
                            ) : (
                                <p className="text-sm text-slate-400 italic">Never synced</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'Widget Directory' && (
            <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-sm animate-in fade-in">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white">Widget Directory</h3>
                        <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mt-1">
                            Enable or Disable widgets available to your team
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={handleEnableAllWidgets}
                            className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 px-3 py-2 rounded-lg transition-colors"
                        >
                            Enable All
                        </button>
                        <button 
                            onClick={handleDisableAllWidgets}
                            className="text-[10px] font-black uppercase tracking-widest text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 px-3 py-2 rounded-lg transition-colors"
                        >
                            Disable All
                        </button>
                        <button 
                            onClick={handleSaveOrgSettings}
                            disabled={isSaving}
                            className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg ml-2"
                        >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </div>

                <div className="space-y-8">
                    {Object.entries(ALL_WIDGETS).map(([category, widgets]) => {
                        return (
                            <div key={category} className="space-y-4">
                                <div className="flex items-center gap-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                                    <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
                                        {category.replace('_', ' ').replace('pastoral', 'Pastoral')}
                                    </h4>
                                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                                        {widgets.length} Widgets
                                    </span>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {widgets.map(w => {
                                        const fullId = `${category}:${w.id}`;
                                        const isBenchmark = w.id.startsWith('benchmark_');
                                        const sharingEnabled = formData.metricsSharingEnabled;
                                        
                                        const isForceDisabled = isBenchmark && !sharingEnabled;
                                        
                                        const isEnabled = !isForceDisabled && (!formData.enabledWidgets || formData.enabledWidgets.includes(fullId));

                                        return (
                                            <div 
                                                key={fullId}
                                                onClick={() => {
                                                    if (isForceDisabled) return;
                                                    handleToggleWidget(fullId);
                                                }}
                                                className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all duration-200 group ${
                                                    isForceDisabled
                                                    ? 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-50 cursor-not-allowed grayscale'
                                                    : isEnabled 
                                                        ? 'bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-900/30' 
                                                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 opacity-60 grayscale'
                                                }`}
                                                title={isForceDisabled ? "Requires 'Share Aggregated Metrics' enabled in Organization profile" : ""}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm transition-colors ${
                                                        isEnabled && !isForceDisabled ? 'bg-white dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                                                    }`}>
                                                        {w.icon}
                                                    </div>
                                                    <div>
                                                        <p className={`text-xs font-bold ${isEnabled && !isForceDisabled ? 'text-indigo-900 dark:text-indigo-200' : 'text-slate-500 dark:text-slate-400'}`}>
                                                            {w.label}
                                                        </p>
                                                        <p className="text-[9px] text-slate-400 font-mono mt-0.5">{w.id}</p>
                                                    </div>
                                                </div>
                                                
                                                {isForceDisabled ? (
                                                    <div className="text-[8px] font-bold text-slate-400 border border-slate-300 dark:border-slate-700 px-1.5 py-0.5 rounded">
                                                        LOCKED
                                                    </div>
                                                ) : (
                                                    <div className={`w-10 h-6 rounded-full p-1 transition-colors duration-300 ${isEnabled ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                                                        <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 ${isEnabled ? 'translate-x-4' : ''}`}></div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        )}

        {activeTab === 'Risk Profiles' && (
            <div className="space-y-12">
                <RiskSettingsView 
                    settings={church.riskSettings} 
                    onSave={(s) => onUpdateChurch && onUpdateChurch({ riskSettings: s })} 
                />
                
                <GroupRiskSettingsView 
                    settings={church.groupRiskSettings}
                    onSave={(s) => onUpdateChurch && onUpdateChurch({ groupRiskSettings: s })}
                />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <ChurchRiskSettingsView 
                        settings={church.churchRiskSettings} 
                        onSave={(s) => onUpdateChurch && onUpdateChurch({ churchRiskSettings: s })} 
                    />
                    <DonorLifecycleSettingsView 
                        settings={church.donorLifecycleSettings} 
                        onSave={(s) => onUpdateChurch && onUpdateChurch({ donorLifecycleSettings: s })} 
                    />
                </div>
            </div>
        )}

        {activeTab === 'Subscription' && (
            <SubscriptionSettingsView church={church} onUpdateChurch={(u) => onUpdateChurch && onUpdateChurch(u)} />
        )}

        {isCreateModalOpen && (
            <CreateUserModal 
                churchId={churchId} 
                onClose={() => setIsCreateModalOpen(false)} 
                onSuccess={() => { setIsCreateModalOpen(false); loadUsers(); }} 
            />
        )}
    </div>
  );
};

export default RoleAdminView;
