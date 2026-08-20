import React, { useState, useEffect } from 'react';
import { Church, User, PcoPerson, PastoralNote } from '../types';
import { auth } from '../services/firebase';
import { firestore } from '../services/firestoreService';
import { 
  Users, Map, PhoneCall, FileText, 
  Settings2, LogOut, RefreshCw, X, 
  Sun, Moon, Monitor 
} from 'lucide-react';
import { PeopleDirectoryView } from './PeopleDirectoryView';
import { PeopleMapView } from './PeopleMapView';
import { OutreachView } from './OutreachView';
import { MobileFormsView } from './MobileFormsView';
import { PersonProfileView } from './PersonProfileView';
import logoIconTransparent from '../assets/logo-icon-transparent.png';

interface MobileLayoutProps {
  church: Church;
  currentUser: User;
  onUpdateTheme: (pref: 'light' | 'dark' | 'system') => void;
}

type CompanionTab = 'directory' | 'map' | 'outreach' | 'forms';

export const MobileLayout: React.FC<MobileLayoutProps> = ({ church, currentUser, onUpdateTheme }) => {
  const [activeTab, setActiveTab] = useState<CompanionTab>('directory');
  const [showSettings, setShowSettings] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Shared Cached States
  const [people, setPeople] = useState<PcoPerson[]>([]);
  const [notes, setNotes] = useState<PastoralNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPerson, setSelectedPerson] = useState<PcoPerson | null>(null);

  const [themePref, setThemePref] = useState<'light' | 'dark' | 'system'>(() => {
    return (localStorage.getItem('mobileAppearance') || 'system') as 'light' | 'dark' | 'system';
  });

  // Local Storage Stale-While-Revalidate Cache Effect
  useEffect(() => {
    const peopleCacheKey = `pc_people_cache_${church.id}`;
    const notesCacheKey = `pc_notes_cache_${church.id}`;

    // 1. Instantly bootstrap states from cache if available
    const cachedPeople = localStorage.getItem(peopleCacheKey);
    const cachedNotes = localStorage.getItem(notesCacheKey);
    
    let hasLoadedFromCache = false;
    if (cachedPeople) {
      try {
        setPeople(JSON.parse(cachedPeople));
        hasLoadedFromCache = true;
      } catch (e) {
        console.warn("Error parsing cached people:", e);
      }
    }
    if (cachedNotes) {
      try {
        setNotes(JSON.parse(cachedNotes));
      } catch (e) {
        console.warn("Error parsing cached notes:", e);
      }
    }

    if (hasLoadedFromCache) {
      setLoading(false); // Stop loading indicator immediately if cache loaded
    }

    // 2. Fetch fresh dataset from Firestore in the background
    const fetchFreshData = async () => {
      try {
        const freshPeople = await firestore.getPeople(church.id);
        const freshNotes = await firestore.getPastoralNotes(church.id);

        setPeople(freshPeople);
        setNotes(freshNotes);

        // Update local caches
        localStorage.setItem(peopleCacheKey, JSON.stringify(freshPeople));
        localStorage.setItem(notesCacheKey, JSON.stringify(freshNotes));
      } catch (e) {
        console.error("Failed to load fresh data from Firestore:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchFreshData();
  }, [church.id]);

  const handleSyncPeople = async () => {
    setIsSyncing(true);
    try {
      const sysSettings = await firestore.getSystemSettings();
      const apiBaseUrl = sysSettings.apiBaseUrl || 'https://pastoralcare.barnabassoftware.com';
      const res = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/pco/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ churchId: church.id }),
      });
      if (res.ok) {
        // Trigger background data reload immediately
        const freshPeople = await firestore.getPeople(church.id);
        setPeople(freshPeople);
        localStorage.setItem(`pc_people_cache_${church.id}`, JSON.stringify(freshPeople));
        alert("Planning Center database sync completed successfully!");
      } else {
        alert("Sync request failed. Please check connection.");
      }
    } catch (e) {
      console.error('PCO sync failed:', e);
      alert("Sync failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsSyncing(false);
    }
  };

  const changeTheme = (pref: 'light' | 'dark' | 'system') => {
    setThemePref(pref);
    onUpdateTheme(pref);
  };

  // Callback to insert a new care note locally & sync with share cache
  const handleAddNewNote = (newNote: PastoralNote) => {
    setNotes(prev => {
      const updated = [newNote, ...prev];
      localStorage.setItem(`pc_notes_cache_${church.id}`, JSON.stringify(updated));
      return updated;
    });
  };

  // Callback to update note target (e.g. marking follow-ups complete)
  const handleUpdateNotesList = (updatedNotes: PastoralNote[]) => {
    setNotes(updatedNotes);
    localStorage.setItem(`pc_notes_cache_${church.id}`, JSON.stringify(updatedNotes));
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-50 dark:bg-zinc-950 overflow-hidden text-slate-900 dark:text-zinc-100">
      {/* --- Top iOS-style Header --- */}
      <header 
        className="shrink-0 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border-b border-slate-200/80 dark:border-zinc-800"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex items-center justify-between px-4 py-3 gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src={logoIconTransparent} alt="Logo" className="w-8 h-8 object-contain shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm min-[375px]:text-base font-black tracking-tight truncate">
                Pastoral Care
              </h1>
              <p className="text-[10px] text-slate-400 dark:text-zinc-500 font-bold truncate uppercase tracking-widest leading-none mt-0.5">
                {church.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Sync Button */}
            <button
              onClick={handleSyncPeople}
              disabled={isSyncing}
              title="Sync directory with Planning Center"
              className={`w-8 h-8 flex items-center justify-center rounded-full text-slate-400 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors active:scale-95 ${isSyncing ? 'animate-spin text-indigo-500 dark:text-indigo-400' : ''}`}
            >
              <RefreshCw size={16} />
            </button>

            {/* Settings Gear Button */}
            <button
              onClick={() => setShowSettings(true)}
              className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors active:scale-95"
            >
              <Settings2 size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* --- Main Viewport --- */}
      <main className="flex-1 min-h-0 overflow-hidden relative bg-slate-50 dark:bg-zinc-950">
        {activeTab === 'directory' && (
          <PeopleDirectoryView 
            churchId={church.id}
            currentUser={currentUser}
            people={people} 
            loading={loading} 
            onSelectPerson={setSelectedPerson} 
          />
        )}
        {activeTab === 'map' && (
          <PeopleMapView 
            churchId={church.id}
            people={people} 
            loading={loading} 
            onSelectPerson={setSelectedPerson} 
          />
        )}
        {activeTab === 'outreach' && (
          <OutreachView 
            churchId={church.id} 
            churchName={church.name} 
            currentUser={currentUser} 
            people={people}
            notes={notes}
            loading={loading}
            onSelectPerson={setSelectedPerson} 
            onUpdateNotes={handleUpdateNotesList}
          />
        )}
        {activeTab === 'forms' && (
          <MobileFormsView churchId={church.id} currentUser={currentUser} />
        )}
      </main>

      {/* --- Bottom iOS Tab Bar --- */}
      <nav 
        className="shrink-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border-t border-slate-200/80 dark:border-zinc-800"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-stretch h-[49px]">
          {/* Tab 1: Directory */}
          <button
            onClick={() => setActiveTab('directory')}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 select-none"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <span 
              className="flex items-center justify-center rounded-2xl transition-all duration-150"
              style={{
                width: 44,
                height: 28,
                background: activeTab === 'directory' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                color: activeTab === 'directory' ? 'rgb(99, 102, 241)' : 'rgb(148 163 184)',
              }}
            >
              <Users size={20} strokeWidth={activeTab === 'directory' ? 2.5 : 1.8} />
            </span>
            <span className="text-[9px] font-bold tracking-wide uppercase leading-none" style={{ color: activeTab === 'directory' ? 'rgb(99, 102, 241)' : 'rgb(148 163 184)' }}>
              Directory
            </span>
          </button>

          {/* Tab 2: Map */}
          <button
            onClick={() => setActiveTab('map')}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 select-none"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <span 
              className="flex items-center justify-center rounded-2xl transition-all duration-150"
              style={{
                width: 44,
                height: 28,
                background: activeTab === 'map' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                color: activeTab === 'map' ? 'rgb(99, 102, 241)' : 'rgb(148 163 184)',
              }}
            >
              <Map size={20} strokeWidth={activeTab === 'map' ? 2.5 : 1.8} />
            </span>
            <span className="text-[9px] font-bold tracking-wide uppercase leading-none" style={{ color: activeTab === 'map' ? 'rgb(99, 102, 241)' : 'rgb(148 163 184)' }}>
              Map
            </span>
          </button>

          {/* Tab 3: Outreach */}
          <button
            onClick={() => setActiveTab('outreach')}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 select-none"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <span 
              className="flex items-center justify-center rounded-2xl transition-all duration-150"
              style={{
                width: 44,
                height: 28,
                background: activeTab === 'outreach' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                color: activeTab === 'outreach' ? 'rgb(99, 102, 241)' : 'rgb(148 163 184)',
              }}
            >
              <PhoneCall size={20} strokeWidth={activeTab === 'outreach' ? 2.5 : 1.8} />
            </span>
            <span className="text-[9px] font-bold tracking-wide uppercase leading-none" style={{ color: activeTab === 'outreach' ? 'rgb(99, 102, 241)' : 'rgb(148 163 184)' }}>
              Outreach
            </span>
          </button>

          {/* Tab 4: Forms */}
          <button
            onClick={() => setActiveTab('forms')}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 select-none"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <span 
              className="flex items-center justify-center rounded-2xl transition-all duration-150"
              style={{
                width: 44,
                height: 28,
                background: activeTab === 'forms' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                color: activeTab === 'forms' ? 'rgb(99, 102, 241)' : 'rgb(148 163 184)',
              }}
            >
              <FileText size={20} strokeWidth={activeTab === 'forms' ? 2.5 : 1.8} />
            </span>
            <span className="text-[9px] font-bold tracking-wide uppercase leading-none" style={{ color: activeTab === 'forms' ? 'rgb(99, 102, 241)' : 'rgb(148 163 184)' }}>
              Forms
            </span>
          </button>
        </div>
      </nav>

      {/* --- Settings Modal --- */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => setShowSettings(false)} />
          <div className="relative w-full max-h-[85vh] bg-white dark:bg-zinc-900 border-t border-slate-200 dark:border-zinc-800 rounded-t-[2.5rem] p-6 shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-250">
            <div className="w-12 h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-full mx-auto mb-5 shrink-0" />

            <div className="flex justify-between items-center mb-6 shrink-0">
              <div>
                <h3 className="text-lg font-black tracking-tight">App Settings</h3>
                <p className="text-[11px] text-slate-400 dark:text-zinc-500 font-bold uppercase mt-0.5">Configuration & Account</p>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-700"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-6 pb-6">
              {/* User Account Info */}
              <div className="bg-slate-50 dark:bg-zinc-800/40 border border-slate-100 dark:border-zinc-800/60 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-sm uppercase">
                  {currentUser.name ? currentUser.name.substring(0, 2) : 'US'}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{currentUser.name || 'User'}</p>
                  <p className="text-xs text-slate-400 dark:text-zinc-500 truncate leading-none mt-0.5">{currentUser.email}</p>
                </div>
              </div>

              {/* Theme Settings */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-3">Theme Settings</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => changeTheme('light')}
                    className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border font-bold text-xs transition ${themePref === 'light' ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400'}`}
                  >
                    <Sun size={14} /> Light
                  </button>
                  <button
                    onClick={() => changeTheme('dark')}
                    className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border font-bold text-xs transition ${themePref === 'dark' ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400'}`}
                  >
                    <Moon size={14} /> Dark
                  </button>
                  <button
                    onClick={() => changeTheme('system')}
                    className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border font-bold text-xs transition ${themePref === 'system' ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400'}`}
                  >
                    <Monitor size={14} /> System
                  </button>
                </div>
              </div>

              {/* Data Sync Actions */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-2">Sync Controls</label>
                <button
                  onClick={handleSyncPeople}
                  disabled={isSyncing}
                  className="w-full flex items-center justify-center gap-2 p-3 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 disabled:opacity-50 text-slate-700 dark:text-zinc-300 font-black uppercase text-xs tracking-wider rounded-xl transition"
                >
                  <RefreshCw size={14} className={isSyncing ? 'animate-spin text-indigo-500' : ''} />
                  {isSyncing ? 'Syncing...' : 'Sync Planning Center'}
                </button>
              </div>

              {/* Sign Out Button */}
              <div className="pt-2">
                <button
                  onClick={() => {
                    auth.signOut();
                    setShowSettings(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 font-black uppercase text-xs tracking-widest rounded-2xl hover:bg-rose-100 dark:hover:bg-rose-950/30 transition duration-150"
                >
                  <LogOut size={14} />
                  Sign Out Account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shared Global Profile Drawer Overlay */}
      {selectedPerson && (
        <PersonProfileView
          person={selectedPerson}
          onClose={() => setSelectedPerson(null)}
          churchId={church.id}
          currentUser={currentUser}
          onAddNote={handleAddNewNote}
        />
      )}
    </div>
  );
};
