
import React, { useState, useEffect } from 'react';
import { GroupRiskSettings } from '../types';
import { DEFAULT_GROUP_RISK_SETTINGS } from '../services/riskService';

interface GroupRiskSettingsViewProps {
  settings?: GroupRiskSettings;
  onSave: (newSettings: GroupRiskSettings) => void;
}

const GroupRiskSettingsView: React.FC<GroupRiskSettingsViewProps> = ({ settings, onSave }) => {
  const [localSettings, setLocalSettings] = useState<GroupRiskSettings>(settings || DEFAULT_GROUP_RISK_SETTINGS);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
      if (settings) {
          setLocalSettings(settings);
      }
  }, [settings]);

  const handleWeightChange = (key: keyof GroupRiskSettings['weights'], val: string) => {
    const num = parseInt(val, 10);
    setLocalSettings(prev => ({
        ...prev,
        weights: { ...prev.weights, [key]: num }
    }));
    setIsDirty(true);
  };

  const handleThresholdChange = (key: keyof GroupRiskSettings['thresholds'], val: string) => {
    const num = parseInt(val, 10);
    setLocalSettings(prev => ({
        ...prev,
        thresholds: { ...prev.thresholds, [key]: num }
    }));
    setIsDirty(true);
  };

  const handleSave = () => {
      onSave(localSettings);
      setIsDirty(false);
  };

  const totalWeight = Object.values(localSettings.weights).reduce((a: number, b: number) => a + b, 0);

  return (
    <div className="bg-slate-50 dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-200 dark:border-slate-800 mt-8 transition-colors">
      <div className="flex justify-between items-center mb-8">
        <div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Group Risk Configuration</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mt-1">Define Health Metrics for Small Groups</p>
        </div>
        <button 
            onClick={handleSave}
            disabled={!isDirty}
            className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-200"
        >
            Save Group Profile
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Weights Section */}
        <div className="bg-white dark:bg-slate-850 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm transition-colors">
            <div className="flex justify-between items-center mb-6">
                <h4 className="font-black text-indigo-900 dark:text-indigo-300">Scoring Weights</h4>
                <span className={`text-[10px] font-black uppercase px-2 py-1 rounded ${totalWeight === 100 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                    Total Weight: {totalWeight}
                </span>
            </div>
            
            <div className="space-y-6">
                <WeightSlider 
                    label="Attendance Consistency" 
                    description="(Avg Attendance / Enrollment). Impact of weekly consistency."
                    value={localSettings.weights.attendanceConsistency} 
                    onChange={(v) => handleWeightChange('attendanceConsistency', v)} 
                />
                <WeightSlider 
                    label="Retention" 
                    description="Impact of 90-day turnover rate."
                    value={localSettings.weights.retention} 
                    onChange={(v) => handleWeightChange('retention', v)} 
                />
                <WeightSlider 
                    label="Leadership Span" 
                    description="Ratio of leaders to members (Ideal: 1:10-12)."
                    value={localSettings.weights.leadershipSpan} 
                    onChange={(v) => handleWeightChange('leadershipSpan', v)} 
                />
                <WeightSlider 
                    label="Engagement" 
                    description="Volunteer confirmation rates (Status 'C')."
                    value={localSettings.weights.engagement} 
                    onChange={(v) => handleWeightChange('engagement', v)} 
                />
            </div>
        </div>

        {/* Thresholds Section */}
        <div className="bg-white dark:bg-slate-850 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col justify-between transition-colors">
            <div>
                <h4 className="font-black text-indigo-900 dark:text-indigo-300 mb-6">Health Categorization (RAG Status)</h4>
                
                <div className="space-y-8 relative">
                    <div className="absolute left-3 top-4 bottom-4 w-1 bg-gradient-to-b from-emerald-400 via-amber-400 to-rose-400 rounded-full opacity-30"></div>

                    {/* Thriving */}
                    <div className="pl-8 relative">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Thriving Range</span>
                            <span className="text-xl font-black text-slate-900 dark:text-white">{localSettings.thresholds.thrivingMin}% - 100%</span>
                        </div>
                        <input 
                            type="range" 
                            min="60" max="95" 
                            value={localSettings.thresholds.thrivingMin}
                            onChange={(e) => handleThresholdChange('thrivingMin', e.target.value)}
                            className="w-full accent-emerald-500 h-2 bg-slate-100 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                        />
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">Groups scoring above {localSettings.thresholds.thrivingMin}% indicate high trust and consistency.</p>
                    </div>

                    {/* Warning */}
                    <div className="pl-8 relative">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-bold text-amber-500 dark:text-amber-400 uppercase tracking-wide">Warning Range</span>
                            <span className="text-xl font-black text-slate-900 dark:text-white">{localSettings.thresholds.warningMin}% - {localSettings.thresholds.thrivingMin - 1}%</span>
                        </div>
                        <input 
                            type="range" 
                            min="20" max={localSettings.thresholds.thrivingMin - 5}
                            value={localSettings.thresholds.warningMin}
                            onChange={(e) => handleThresholdChange('warningMin', e.target.value)}
                            className="w-full accent-amber-500 h-2 bg-slate-100 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                        />
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">Groups scoring between {localSettings.thresholds.warningMin}% and {localSettings.thresholds.thrivingMin}% may have rising ratios or dips.</p>
                    </div>

                    {/* Critical */}
                    <div className="pl-8 relative">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-bold text-rose-500 dark:text-rose-400 uppercase tracking-wide">Critical Range</span>
                            <span className="text-xl font-black text-slate-900 dark:text-white">0% - {localSettings.thresholds.warningMin - 1}%</span>
                        </div>
                        <div className="w-full h-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg"></div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">Groups scoring below {localSettings.thresholds.warningMin}% have high turnover or critical attendance issues.</p>
                    </div>
                </div>
            </div>

            <div className="mt-8 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
                <p className="text-[10px] font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-widest mb-1">Impact</p>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 leading-relaxed">
                    This configuration drives the individual health score for every Small Group in the Groups Dashboard.
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};

const WeightSlider: React.FC<{ label: string; description: string; value: number; onChange: (val: string) => void }> = ({ label, description, value, onChange }) => (
    <div>
        <div className="flex justify-between items-end mb-2">
            <div>
                <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide block">{label}</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{description}</span>
            </div>
            <span className="text-lg font-black text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-700 px-3 py-1 rounded-lg border border-slate-100 dark:border-slate-600">{value}%</span>
        </div>
        <input 
            type="range" 
            min="0" max="60" step="5"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full accent-indigo-600 h-2 bg-slate-100 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
        />
    </div>
);

export default GroupRiskSettingsView;
