
import React, { useState, useEffect } from 'react';
import { DonorLifecycleSettings } from '../types';

interface DonorLifecycleSettingsViewProps {
  settings?: DonorLifecycleSettings;
  onSave: (newSettings: DonorLifecycleSettings) => void;
}

export const DEFAULT_DONOR_LIFECYCLE: DonorLifecycleSettings = {
    newDonorDays: 30,
    activeWindowDays: 90,
    activeMinGifts: 2,
    occasionalWindowDays: 180,
    lapsedWindowDays: 365,
    recoveredGapDays: 180
};

const DonorLifecycleSettingsView: React.FC<DonorLifecycleSettingsViewProps> = ({ settings, onSave }) => {
  const [localSettings, setLocalSettings] = useState<DonorLifecycleSettings>(settings || DEFAULT_DONOR_LIFECYCLE);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
      if (settings) {
          setLocalSettings(settings);
      }
  }, [settings]);

  const handleChange = (key: keyof DonorLifecycleSettings, val: string) => {
    const num = parseInt(val, 10);
    setLocalSettings(prev => ({
        ...prev,
        [key]: isNaN(num) ? 0 : num
    }));
    setIsDirty(true);
  };

  const handleSave = () => {
      onSave(localSettings);
      setIsDirty(false);
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-200 dark:border-slate-800 mt-8 transition-colors">
      <div className="flex justify-between items-center mb-8">
        <div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Donor Lifecycle Definitions</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mt-1">Configure criteria for donor categorization</p>
        </div>
        <button 
            onClick={handleSave}
            disabled={!isDirty}
            className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-200"
        >
            Save Criteria
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
        {/* New Donor */}
        <div className="bg-white dark:bg-slate-850 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm transition-colors">
            <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">🌱</span>
                <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">New Donor</h4>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">First-time gift</p>
                </div>
            </div>
            <label className="block text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-2">Within Last (Days)</label>
            <input 
                type="number" 
                value={localSettings.newDonorDays}
                onChange={(e) => handleChange('newDonorDays', e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
        </div>

        {/* Active Donor */}
        <div className="bg-white dark:bg-slate-850 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm transition-colors">
            <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">❤️</span>
                <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">Active</h4>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">Regular giving</p>
                </div>
            </div>
            <div className="space-y-4">
                <div>
                    <label className="block text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-2">Gift Within (Days)</label>
                    <input 
                        type="number" 
                        value={localSettings.activeWindowDays}
                        onChange={(e) => handleChange('activeWindowDays', e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                </div>
                <div>
                    <label className="block text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-2">Min # Gifts in Period</label>
                    <input 
                        type="number" 
                        min="1"
                        value={localSettings.activeMinGifts || 1}
                        onChange={(e) => handleChange('activeMinGifts', e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                </div>
            </div>
        </div>

        {/* Occasional */}
        <div className="bg-white dark:bg-slate-850 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm transition-colors">
            <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">🌤️</span>
                <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">Occasional</h4>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">Inconsistent</p>
                </div>
            </div>
            <label className="block text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-2">Gift Within (Days)</label>
            <input 
                type="number" 
                value={localSettings.occasionalWindowDays}
                onChange={(e) => handleChange('occasionalWindowDays', e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-2 italic">Givers who don't meet Active frequency but are in this window.</p>
        </div>

        {/* Lapsed / Inactive */}
        <div className="bg-white dark:bg-slate-850 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm transition-colors">
            <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">📉</span>
                <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">Lapsed</h4>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">Before Inactive</p>
                </div>
            </div>
            <label className="block text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-2">Becomes Inactive (Days)</label>
            <input 
                type="number" 
                value={localSettings.lapsedWindowDays || 365}
                onChange={(e) => handleChange('lapsedWindowDays', e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-2 italic">Gifts older than this are considered Inactive.</p>
        </div>

        {/* Recovered */}
        <div className="bg-white dark:bg-slate-850 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm transition-colors">
            <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">🔄</span>
                <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">Recovered</h4>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">Returned after lapse</p>
                </div>
            </div>
            <label className="block text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-2">After Gap of (Days)</label>
            <input 
                type="number" 
                value={localSettings.recoveredGapDays}
                onChange={(e) => handleChange('recoveredGapDays', e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
        </div>
      </div>
      
      <div className="mt-6 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-900/30 text-indigo-800 dark:text-indigo-300 text-[10px] font-medium leading-relaxed">
        <strong>Note:</strong> 
        <ul className="list-disc list-inside mt-1 space-y-1">
            <li><strong>Second Time Donors:</strong> Automatically calculated as anyone with exactly 2 gifts, where the last gift was within the "New Donor" window.</li>
            <li><strong>Lapsed Donors:</strong> Anyone who has not given within the "Occasional" window but is not yet "Inactive".</li>
            <li><strong>Active Donors:</strong> Must meet BOTH recency (within {localSettings.activeWindowDays} days) and frequency ({localSettings.activeMinGifts || 1}+ gifts) criteria.</li>
        </ul>
      </div>
    </div>
  );
};

export default DonorLifecycleSettingsView;
