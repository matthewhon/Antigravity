import React, { useState, useEffect } from 'react';
import { Church, SmsServicesReminders, EscalationRule } from '../types';

interface Props {
  church?: Church;
  onUpdateChurch?: (updates: Partial<Church>) => void;
}

const defaultReminders: SmsServicesReminders = {
  enabled: false,
  remindOnlyUnconfirmed: true,
  leaderReminderEnabled: true,
  leaderDaysBefore: 5,
  leaderMessageTemplate: "Hi {name}, you are scheduled to lead {team_name} for {service_name} on {date}. Please confirm in PCO!",
  memberReminderEnabled: true,
  memberDaysBefore: 3,
  memberMessageTemplate: "Hi {name}, you are scheduled for {team_name} for {service_name} on {date}. Please confirm your status in PCO!",
  leaderReminders: [
    { daysBefore: 5, messageTemplate: "Hi {name}, you are scheduled to lead {team_name} for {service_name} on {date}. Please confirm in PCO!" }
  ],
  memberReminders: [
    { daysBefore: 3, messageTemplate: "Hi {name}, you are scheduled for {team_name} for {service_name} on {date}. Please confirm your status in PCO!" }
  ],
  leaderSchedulingReminderEnabled: false,
  leaderSchedulingReminders: [
    { daysBefore: 14, messageTemplate: "Hi {name}, {service_name} is coming up on {date}. Please make sure you have scheduled your {team_name} team in PCO!" }
  ],
  escalationEnabled: false,
  escalationRules: [
    { daysBefore: 3, messageTemplate: "URGENT: {team_name} for {service_name} on {date} still needs {needed_count} more people. Please help coordinate coverage.", contacts: [] }
  ],
  leaderWarningUnderstaffedEnabled: false,
  leaderWarningUnderstaffedTemplate: "Warning: {team_name} for {service_name} on {date} still needs {needed_count} more people. Please check PCO.",
  leaderWarningOverScheduledEnabled: false,
  leaderWarningOverScheduledThreshold: 3,
  leaderWarningOverScheduledTemplate: "Warning: {person_name} is scheduled {count} times in the next 30 days (including {service_name} on {date}). You may want to find a replacement.",
};

const ServicesRemindersTab: React.FC<Props> = ({ church, onUpdateChurch }) => {
  const [settings, setSettings] = useState<SmsServicesReminders>(
    church?.smsSettings?.servicesReminders || defaultReminders
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runStatus, setRunStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (church?.smsSettings?.servicesReminders) {
      setSettings(church.smsSettings.servicesReminders);
    }
  }, [church?.smsSettings?.servicesReminders]);

  const handleSave = async () => {
    if (!onUpdateChurch || !church) return;
    setIsSaving(true);
    
    try {
      const updatedSmsSettings = {
        ...church.smsSettings,
        servicesReminders: settings
      };
      
      onUpdateChurch({ smsSettings: updatedSmsSettings });
    } finally {
      // Provide a tiny visual delay for success feedback
      setTimeout(() => setIsSaving(false), 500);
    }
  };

  const handleRunNow = async () => {
    if (isRunning || !settings.enabled) return;
    setIsRunning(true);
    setRunStatus('idle');
    try {
      const res = await fetch('/api/messaging/run-services-reminders', { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      setRunStatus('success');
    } catch {
      setRunStatus('error');
    } finally {
      setIsRunning(false);
      setTimeout(() => setRunStatus('idle'), 4000);
    }
  };

  const updateSetting = <K extends keyof SmsServicesReminders>(key: K, value: SmsServicesReminders[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const getLeaderReminders = () => {
    if (settings.leaderReminders && settings.leaderReminders.length > 0) return settings.leaderReminders;
    return [{ daysBefore: settings.leaderDaysBefore || 5, messageTemplate: settings.leaderMessageTemplate || "" }];
  };

  const getMemberReminders = () => {
    if (settings.memberReminders && settings.memberReminders.length > 0) return settings.memberReminders;
    return [{ daysBefore: settings.memberDaysBefore || 3, messageTemplate: settings.memberMessageTemplate || "" }];
  };

  const getSchedulingReminders = () => {
    if (settings.leaderSchedulingReminders && settings.leaderSchedulingReminders.length > 0) return settings.leaderSchedulingReminders;
    return [{ daysBefore: 14, messageTemplate: settings.leaderSchedulingReminderTemplate || "Hi {name}, {service_name} is coming up on {date}. Please make sure you have scheduled your {team_name} team in PCO!" }];
  };

  const updateReminder = (role: 'leader' | 'member' | 'scheduling', index: number, field: 'daysBefore' | 'messageTemplate', value: any) => {
    const list = role === 'leader' ? getLeaderReminders() : role === 'member' ? getMemberReminders() : getSchedulingReminders();
    const updated = [...list];
    updated[index] = { ...updated[index], [field]: value };
    const key = role === 'leader' ? 'leaderReminders' : role === 'member' ? 'memberReminders' : 'leaderSchedulingReminders';
    updateSetting(key, updated);
  };

  const addReminder = (role: 'leader' | 'member' | 'scheduling') => {
    const list = role === 'leader' ? getLeaderReminders() : role === 'member' ? getMemberReminders() : getSchedulingReminders();
    const updated = [...list, { daysBefore: role === 'scheduling' ? 14 : 1, messageTemplate: "" }];
    const key = role === 'leader' ? 'leaderReminders' : role === 'member' ? 'memberReminders' : 'leaderSchedulingReminders';
    updateSetting(key, updated);
  };

  const removeReminder = (role: 'leader' | 'member' | 'scheduling', index: number) => {
    const list = role === 'leader' ? getLeaderReminders() : role === 'member' ? getMemberReminders() : getSchedulingReminders();
    const updated = list.filter((_, i) => i !== index);
    const key = role === 'leader' ? 'leaderReminders' : role === 'member' ? 'memberReminders' : 'leaderSchedulingReminders';
    updateSetting(key, updated);
  };

  const renderReminderBlock = (role: 'leader' | 'member' | 'scheduling') => {
    const list = role === 'leader' ? getLeaderReminders() : role === 'member' ? getMemberReminders() : getSchedulingReminders();
    const color = role === 'leader' ? 'indigo' : role === 'member' ? 'violet' : 'teal';
    
    return (
        <div className="space-y-6">
            {list.map((rem, idx) => (
                <div key={idx} className="relative p-5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-2xl shadow-sm group">
                    {list.length > 1 && (
                        <button 
                            onClick={() => removeReminder(role, idx)}
                            className={`absolute top-4 right-4 w-6 h-6 rounded-full bg-slate-100 hover:bg-red-100 dark:bg-slate-800 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-600 flex items-center justify-center transition-colors`}
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                    <div className="mb-4">
                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">Timing</label>
                        <div className="flex items-center gap-3">
                            <input 
                                type="number" 
                                min="1" max="90"
                                className={`w-16 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-${color}-500`}
                                value={rem.daysBefore}
                                onChange={(e) => updateReminder(role, idx, 'daysBefore', parseInt(e.target.value) || 1)}
                            />
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">days before service</span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">Message Template</label>
                        <textarea 
                            className={`w-full h-24 px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-${color}-500 resize-none leading-relaxed`}
                            value={rem.messageTemplate}
                            onChange={(e) => updateReminder(role, idx, 'messageTemplate', e.target.value)}
                        />
                        <p className="text-[10px] font-bold text-slate-400 mt-2">
                            Available tags: 
                            <span className={`text-${color}-500 bg-${color}-50 dark:bg-${color}-900/30 px-1 py-0.5 rounded mx-0.5`}>{'{name}'}</span> 
                            <span className={`text-${color}-500 bg-${color}-50 dark:bg-${color}-900/30 px-1 py-0.5 rounded mx-0.5`}>{'{team_name}'}</span> 
                            <span className={`text-${color}-500 bg-${color}-50 dark:bg-${color}-900/30 px-1 py-0.5 rounded mx-0.5`}>{'{service_name}'}</span> 
                            <span className={`text-${color}-500 bg-${color}-50 dark:bg-${color}-900/30 px-1 py-0.5 rounded mx-0.5`}>{'{date}'}</span>
                        </p>
                    </div>
                </div>
            ))}
            
            {list.length < 5 && (
                <button 
                    onClick={() => addReminder(role)}
                    className={`flex items-center gap-2 text-xs font-black uppercase tracking-wide text-${color}-600 hover:text-${color}-700 dark:text-${color}-400 dark:hover:text-${color}-300 transition-colors`}
                >
                    <span className={`w-6 h-6 rounded-full bg-${color}-100 dark:bg-${color}-900/30 flex items-center justify-center text-lg leading-none`}>+</span>
                    Add another reminder
                </button>
            )}
        </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h3 className="text-3xl font-black tracking-tighter text-slate-900 dark:text-white">SMS Reminders</h3>
          <p className="text-slate-400 dark:text-slate-500 font-medium uppercase text-[10px] tracking-wide mt-1">Automated Team Confirmations</p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {runStatus === 'success' && (
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <span>✓</span> Scan completed
            </span>
          )}
          {runStatus === 'error' && (
            <span className="text-xs font-bold text-red-500 dark:text-red-400 flex items-center gap-1">
              <span>✗</span> Scan failed
            </span>
          )}
          <button
            onClick={handleRunNow}
            disabled={isRunning || !settings.enabled}
            title={!settings.enabled ? 'Enable reminders first' : 'Immediately run the reminder scan'}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border-2 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold text-xs uppercase tracking-wide hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isRunning ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Running...
              </>
            ) : '▶ Run Now'}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs uppercase tracking-wide hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/30 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </header>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] p-8 shadow-sm">
        
        {/* Global Master Toggle */}
        <div className="flex items-start justify-between pb-8 border-b border-slate-100 dark:border-slate-800 mb-8">
            <div>
                <h4 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="text-xl">🤖</span> Enable Automated Reminders
                </h4>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
                    When enabled, the system will automatically send text messages to scheduled personnel prior to their service date.
                </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer mt-2">
                <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={settings.enabled}
                    onChange={(e) => updateSetting('enabled', e.target.checked)}
                />
                <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-500"></div>
            </label>
        </div>

        <div className={`space-y-12 transition-opacity duration-300 ${!settings.enabled ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            
            {/* Global Rules */}
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 p-6 rounded-2xl">
                <h5 className="text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-500 mb-4">Targeting Rules</h5>
                
                <label className="flex items-start gap-3 cursor-pointer group">
                    <div className="relative flex items-center pt-0.5">
                        <input 
                            type="checkbox" 
                            className="w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500" 
                            checked={settings.remindOnlyUnconfirmed}
                            onChange={(e) => updateSetting('remindOnlyUnconfirmed', e.target.checked)}
                        />
                    </div>
                    <div>
                        <span className="text-sm font-bold text-amber-900 dark:text-amber-400 group-hover:text-amber-700 transition-colors">Only message unconfirmed personnel</span>
                        <p className="text-xs text-amber-700/70 dark:text-amber-500/70 mt-1">If unchecked, reminders will be sent to everyone regardless of whether they have accepted, declined, or haven't responded yet in PCO.</p>
                    </div>
                </label>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Team Leaders Panel */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-3xl p-6 bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center justify-between mb-6 pb-6 border-b border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-lg">👑</div>
                            <h5 className="font-bold text-slate-900 dark:text-white">Team Leaders</h5>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={settings.leaderReminderEnabled}
                                onChange={(e) => updateSetting('leaderReminderEnabled', e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-500"></div>
                        </label>
                    </div>

                    <div className={`space-y-6 ${!settings.leaderReminderEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
                        {renderReminderBlock('leader')}
                    </div>

                    {/* Scheduling Reminder */}
                    <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 flex items-center justify-center text-base">📋</div>
                                <div>
                                    <h6 className="text-sm font-bold text-slate-900 dark:text-white">Scheduling Reminder</h6>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400">Remind leaders to schedule their team for upcoming services</p>
                                </div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    className="sr-only peer" 
                                    checked={settings.leaderSchedulingReminderEnabled || false}
                                    onChange={(e) => updateSetting('leaderSchedulingReminderEnabled', e.target.checked)}
                                />
                                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-teal-500"></div>
                            </label>
                        </div>
                        <div className={`${!settings.leaderSchedulingReminderEnabled ? 'opacity-40 pointer-events-none hidden' : ''}`}>
                            <div className="bg-teal-50 dark:bg-teal-900/10 border border-teal-200 dark:border-teal-800/30 p-4 rounded-xl mb-4">
                                <p className="text-xs text-teal-800 dark:text-teal-400">💡 This sends a reminder to team leaders ahead of time so they can schedule people to serve. For example, set it to 14 days before so leaders have enough time to fill their roster.</p>
                            </div>
                            {renderReminderBlock('scheduling')}
                        </div>
                    </div>

                    <div className={`${!settings.leaderReminderEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
                        {/* Leader Warnings */}
                        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700 space-y-8">
                            <h6 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                ⚠️ Advanced Warnings
                            </h6>

                            {/* Understaffed Warning */}
                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-5 rounded-2xl">
                                <div className="flex items-center justify-between mb-4">
                                    <h6 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">Understaffed Warning</h6>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            className="sr-only peer" 
                                            checked={settings.leaderWarningUnderstaffedEnabled || false}
                                            onChange={(e) => updateSetting('leaderWarningUnderstaffedEnabled', e.target.checked)}
                                        />
                                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-500"></div>
                                    </label>
                                </div>
                                <div className={`space-y-4 ${!settings.leaderWarningUnderstaffedEnabled ? 'opacity-40 pointer-events-none hidden' : ''}`}>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Sends a message if the team still has open needed positions when the reminder runs.</p>
                                    <textarea 
                                        className="w-full h-24 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                                        value={settings.leaderWarningUnderstaffedTemplate || defaultReminders.leaderWarningUnderstaffedTemplate}
                                        onChange={(e) => updateSetting('leaderWarningUnderstaffedTemplate', e.target.value)}
                                    />
                                    <p className="text-[10px] font-bold text-slate-400">
                                        Available tags: <span className="text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-1 py-0.5 rounded">{'{needed_count}'}</span> <span className="text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-1 py-0.5 rounded">{'{team_name}'}</span> <span className="text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-1 py-0.5 rounded">{'{service_name}'}</span> <span className="text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-1 py-0.5 rounded">{'{date}'}</span>
                                    </p>
                                </div>
                            </div>

                            {/* Over-scheduled Warning */}
                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-5 rounded-2xl">
                                <div className="flex items-center justify-between mb-4">
                                    <h6 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">Over-scheduled Warning</h6>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            className="sr-only peer" 
                                            checked={settings.leaderWarningOverScheduledEnabled || false}
                                            onChange={(e) => updateSetting('leaderWarningOverScheduledEnabled', e.target.checked)}
                                        />
                                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-500"></div>
                                    </label>
                                </div>
                                <div className={`space-y-4 ${!settings.leaderWarningOverScheduledEnabled ? 'opacity-40 pointer-events-none hidden' : ''}`}>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-500 dark:text-slate-400">Warn if person is scheduled</span>
                                        <input 
                                            type="number" 
                                            min="1" max="20"
                                            className="w-16 px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                                            value={settings.leaderWarningOverScheduledThreshold || 3}
                                            onChange={(e) => updateSetting('leaderWarningOverScheduledThreshold', parseInt(e.target.value) || 3)}
                                        />
                                        <span className="text-xs text-slate-500 dark:text-slate-400">or more times in a 30-day window</span>
                                    </div>
                                    <textarea 
                                        className="w-full h-24 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                                        value={settings.leaderWarningOverScheduledTemplate || defaultReminders.leaderWarningOverScheduledTemplate}
                                        onChange={(e) => updateSetting('leaderWarningOverScheduledTemplate', e.target.value)}
                                    />
                                    <p className="text-[10px] font-bold text-slate-400">
                                        Available tags: <span className="text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-1 py-0.5 rounded">{'{person_name}'}</span> <span className="text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-1 py-0.5 rounded">{'{count}'}</span> <span className="text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-1 py-0.5 rounded">{'{team_name}'}</span> <span className="text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-1 py-0.5 rounded">{'{service_name}'}</span> <span className="text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-1 py-0.5 rounded">{'{date}'}</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Team Members Panel */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-3xl p-6 bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center justify-between mb-6 pb-6 border-b border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 flex items-center justify-center text-lg">👥</div>
                            <h5 className="font-bold text-slate-900 dark:text-white">Team Members</h5>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={settings.memberReminderEnabled}
                                onChange={(e) => updateSetting('memberReminderEnabled', e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-violet-500"></div>
                        </label>
                    </div>

                    <div className={`space-y-6 ${!settings.memberReminderEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
                        {renderReminderBlock('member')}
                    </div>
                </div>

            </div>

            {/* Escalation Contacts Section */}
            <div className="border border-rose-200 dark:border-rose-800/40 bg-rose-50/50 dark:bg-rose-900/10 rounded-3xl p-6">
                <div className="flex items-center justify-between mb-6 pb-6 border-b border-rose-200 dark:border-rose-700">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 flex items-center justify-center text-lg">🚨</div>
                        <div>
                            <h5 className="font-bold text-slate-900 dark:text-white">Escalation Contacts</h5>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 max-w-md">Notify designated contacts when teams are still understaffed close to the service date</p>
                        </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={settings.escalationEnabled || false}
                            onChange={(e) => updateSetting('escalationEnabled', e.target.checked)}
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-rose-500"></div>
                    </label>
                </div>

                <div className={`space-y-6 ${!settings.escalationEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
                    <div className="bg-rose-100/50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/30 p-4 rounded-xl">
                        <p className="text-xs text-rose-800 dark:text-rose-400">💡 When a team still has unfilled positions at the configured time, these contacts will receive an SMS. Use this for pastors, ministry directors, or staff who can help find last-minute volunteers.</p>
                    </div>

                    {(settings.escalationRules || defaultReminders.escalationRules || []).map((rule: EscalationRule, ruleIdx: number) => (
                        <div key={ruleIdx} className="relative p-5 border border-rose-200 dark:border-rose-700 bg-white dark:bg-slate-900 rounded-2xl shadow-sm">
                            {(settings.escalationRules || []).length > 1 && (
                                <button 
                                    onClick={() => {
                                        const rules = [...(settings.escalationRules || [])];
                                        rules.splice(ruleIdx, 1);
                                        updateSetting('escalationRules', rules);
                                    }}
                                    className="absolute top-4 right-4 w-6 h-6 rounded-full bg-slate-100 hover:bg-red-100 dark:bg-slate-800 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-600 flex items-center justify-center transition-colors"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            )}

                            <div className="mb-4">
                                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">Trigger Timing</label>
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Escalate if still understaffed</span>
                                    <input 
                                        type="number" 
                                        min="1" max="30"
                                        className="w-16 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-500"
                                        value={rule.daysBefore}
                                        onChange={(e) => {
                                            const rules = [...(settings.escalationRules || [])];
                                            rules[ruleIdx] = { ...rules[ruleIdx], daysBefore: parseInt(e.target.value) || 1 };
                                            updateSetting('escalationRules', rules);
                                        }}
                                    />
                                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">days before service</span>
                                </div>
                            </div>

                            <div className="mb-4">
                                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">Escalation Message</label>
                                <textarea 
                                    className="w-full h-20 px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-500 resize-none leading-relaxed"
                                    value={rule.messageTemplate}
                                    onChange={(e) => {
                                        const rules = [...(settings.escalationRules || [])];
                                        rules[ruleIdx] = { ...rules[ruleIdx], messageTemplate: e.target.value };
                                        updateSetting('escalationRules', rules);
                                    }}
                                />
                                <p className="text-[10px] font-bold text-slate-400 mt-1">
                                    Tags: 
                                    <span className="text-rose-500 bg-rose-50 dark:bg-rose-900/30 px-1 py-0.5 rounded mx-0.5">{'{team_name}'}</span>
                                    <span className="text-rose-500 bg-rose-50 dark:bg-rose-900/30 px-1 py-0.5 rounded mx-0.5">{'{service_name}'}</span>
                                    <span className="text-rose-500 bg-rose-50 dark:bg-rose-900/30 px-1 py-0.5 rounded mx-0.5">{'{date}'}</span>
                                    <span className="text-rose-500 bg-rose-50 dark:bg-rose-900/30 px-1 py-0.5 rounded mx-0.5">{'{needed_count}'}</span>
                                </p>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Contacts to Notify</label>
                                <div className="space-y-2">
                                    {(rule.contacts || []).map((contact, cIdx) => (
                                        <div key={cIdx} className="flex items-center gap-2">
                                            <input 
                                                type="text" 
                                                placeholder="Name"
                                                className="flex-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-500"
                                                value={contact.name}
                                                onChange={(e) => {
                                                    const rules = [...(settings.escalationRules || [])];
                                                    const contacts = [...(rules[ruleIdx].contacts || [])];
                                                    contacts[cIdx] = { ...contacts[cIdx], name: e.target.value };
                                                    rules[ruleIdx] = { ...rules[ruleIdx], contacts };
                                                    updateSetting('escalationRules', rules);
                                                }}
                                            />
                                            <input 
                                                type="tel" 
                                                placeholder="Phone (e.g. 555-123-4567)"
                                                className="flex-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-500"
                                                value={contact.phone}
                                                onChange={(e) => {
                                                    const rules = [...(settings.escalationRules || [])];
                                                    const contacts = [...(rules[ruleIdx].contacts || [])];
                                                    contacts[cIdx] = { ...contacts[cIdx], phone: e.target.value };
                                                    rules[ruleIdx] = { ...rules[ruleIdx], contacts };
                                                    updateSetting('escalationRules', rules);
                                                }}
                                            />
                                            <button 
                                                onClick={() => {
                                                    const rules = [...(settings.escalationRules || [])];
                                                    const contacts = [...(rules[ruleIdx].contacts || [])];
                                                    contacts.splice(cIdx, 1);
                                                    rules[ruleIdx] = { ...rules[ruleIdx], contacts };
                                                    updateSetting('escalationRules', rules);
                                                }}
                                                className="w-6 h-6 rounded-full bg-slate-100 hover:bg-red-100 dark:bg-slate-800 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-600 flex items-center justify-center transition-colors flex-shrink-0"
                                            >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    ))}
                                    <button 
                                        onClick={() => {
                                            const rules = [...(settings.escalationRules || [])];
                                            const contacts = [...(rules[ruleIdx].contacts || []), { name: '', phone: '' }];
                                            rules[ruleIdx] = { ...rules[ruleIdx], contacts };
                                            updateSetting('escalationRules', rules);
                                        }}
                                        className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 transition-colors pt-1"
                                    >
                                        <span className="w-5 h-5 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center text-sm leading-none">+</span>
                                        Add Contact
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}

                    {(settings.escalationRules || []).length < 3 && (
                        <button 
                            onClick={() => {
                                const rules = [...(settings.escalationRules || []), { daysBefore: 1, messageTemplate: 'URGENT: {team_name} for {service_name} on {date} still needs {needed_count} more people.', contacts: [] }];
                                updateSetting('escalationRules', rules);
                            }}
                            className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 transition-colors"
                        >
                            <span className="w-6 h-6 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center text-lg leading-none">+</span>
                            Add another escalation rule
                        </button>
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ServicesRemindersTab;
