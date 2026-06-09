import React, { useState, useEffect } from 'react';
import { Church, TwilioPhoneNumber, User, hasBroadcastAccess } from '../types';
import { Users, Send, MessageSquare, Mail, Loader2, List, Users as UsersIcon } from 'lucide-react';
import { pcoService } from '../services/pcoService';

interface BroadcastViewProps {
    church: Church;
    twilioNumber: TwilioPhoneNumber;
    currentUser: User;
}

export const BroadcastView: React.FC<BroadcastViewProps> = ({ church, twilioNumber, currentUser }) => {
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
    
    // Step 1
    const [campaignName, setCampaignName] = useState('');
    const [channelType, setChannelType] = useState<'sms' | 'email'>('sms');
    
    // Step 2
    const [toTab, setToTab] = useState<'lists' | 'groups'>('lists');
    const [pcoId, setPcoId] = useState<string>('');
    const [pcoName, setPcoName] = useState<string>('');
    
    // Step 3
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    
    const [status, setStatus] = useState<'idle' | 'sending' | 'success'>('idle');

    // PCO Data
    const [pcoLists, setPcoLists] = useState<{ id: string; name: string; total_people: number }[]>([]);
    const [pcoGroups, setPcoGroups] = useState<{ id: string; name: string; memberCount: number }[]>([]);
    const [loadingLists, setLoadingLists] = useState(false);
    const [loadingGroups, setLoadingGroups] = useState(false);

    useEffect(() => {
        setLoadingLists(true);
        pcoService.getPeopleLists(church.id).then((raw: any[]) => {
            const mapped = raw.map(r => ({
                id: r.id,
                name: r.attributes?.name || 'Unnamed',
                total_people: r.attributes?.total_people ?? 0,
            }));
            const filtered = mapped.filter(list => hasBroadcastAccess(currentUser, list.id, church));
            setPcoLists(filtered);
            setLoadingLists(false);
        }).catch(() => setLoadingLists(false));
    }, [church.id, church, currentUser]);

    useEffect(() => {
        if (toTab === 'groups' && pcoGroups.length === 0) {
            setLoadingGroups(true);
            pcoService.getGroups(church.id).then((raw: any[]) => {
                setPcoGroups(raw.map(r => ({
                    id: r.id,
                    name: r.attributes?.name || 'Unnamed',
                    memberCount: r.attributes?.memberships_count ?? r.attributes?.member_count ?? 0,
                })).filter(group => hasBroadcastAccess(currentUser, group.id, church)));
                setLoadingGroups(false);
            }).catch(() => setLoadingGroups(false));
        }
    }, [toTab, church.id, pcoGroups.length, church, currentUser]);

    const handleSend = async () => {
        if (!campaignName || !body || !pcoId) return;
        if (channelType === 'email' && !subject) return;
        
        setStatus('sending');

        // Note: Real implementation would POST to /api/messaging/campaigns
        setTimeout(() => {
            setStatus('success');
            setTimeout(() => {
                setStatus('idle');
                setStep(1);
                setCampaignName('');
                setSubject('');
                setBody('');
                setPcoId('');
                setPcoName('');
            }, 3000);
        }, 1500);
    };

    const isNextDisabled = () => {
        if (step === 1) return !campaignName;
        if (step === 2) return !pcoId;
        if (step === 3) return !body || (channelType === 'email' && !subject);
        return false;
    };

    return (
        <div className="p-4 flex flex-col gap-4 animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-5">
                <div className="flex items-center justify-between mb-4 text-violet-600 dark:text-violet-400">
                    <div className="flex items-center gap-3">
                        <Users size={24} />
                        <h2 className="text-lg font-bold">New Broadcast</h2>
                    </div>
                    <div className="text-xs font-bold bg-violet-100 dark:bg-violet-900/40 px-3 py-1.5 rounded-lg">
                        Step {step} of 4
                    </div>
                </div>
                
                <div className="space-y-4 min-h-[240px]">
                    {step === 1 && (
                        <div className="animate-in slide-in-from-right-4 duration-300 space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Campaign Name</label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. Sunday Service Reminder"
                                    value={campaignName}
                                    onChange={(e) => setCampaignName(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-violet-500 transition-shadow dark:text-white"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Broadcast Type</label>
                                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                                    <button
                                        onClick={() => setChannelType('sms')}
                                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition ${channelType === 'sms' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-600' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                    >
                                        <MessageSquare size={16} /> SMS Text
                                    </button>
                                    <button
                                        onClick={() => setChannelType('email')}
                                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition ${channelType === 'email' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-600' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                    >
                                        <Mail size={16} /> Email
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="animate-in slide-in-from-right-4 duration-300 space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Audience Type</label>
                                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                                    <button
                                        onClick={() => { setToTab('lists'); setPcoId(''); setPcoName(''); }}
                                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition ${toTab === 'lists' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-600' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                    >
                                        <List size={16} /> PCO List
                                    </button>
                                    <button
                                        onClick={() => { setToTab('groups'); setPcoId(''); setPcoName(''); }}
                                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition ${toTab === 'groups' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-600' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                    >
                                        <UsersIcon size={16} /> PCO Group
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                                    Select {toTab === 'lists' ? 'List' : 'Group'}
                                </label>
                                {toTab === 'lists' ? (
                                    loadingLists ? (
                                        <div className="flex items-center gap-2 text-sm text-slate-400 py-3"><Loader2 size={16} className="animate-spin" /> Loading lists...</div>
                                    ) : (
                                        <select
                                            className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-violet-500 appearance-none dark:text-white"
                                            value={pcoId}
                                            onChange={e => {
                                                const sel = pcoLists.find(l => l.id === e.target.value);
                                                setPcoId(sel?.id || '');
                                                setPcoName(sel?.name || '');
                                            }}
                                        >
                                            <option value="">— Select a PCO List —</option>
                                            {pcoLists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.total_people})</option>)}
                                        </select>
                                    )
                                ) : (
                                    loadingGroups ? (
                                        <div className="flex items-center gap-2 text-sm text-slate-400 py-3"><Loader2 size={16} className="animate-spin" /> Loading groups...</div>
                                    ) : (
                                        <select
                                            className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-violet-500 appearance-none dark:text-white"
                                            value={pcoId}
                                            onChange={e => {
                                                const sel = pcoGroups.find(g => g.id === e.target.value);
                                                setPcoId(sel?.id || '');
                                                setPcoName(sel?.name || '');
                                            }}
                                        >
                                            <option value="">— Select a PCO Group —</option>
                                            {pcoGroups.map(g => <option key={g.id} value={g.id}>{g.name} {g.memberCount > 0 ? `(${g.memberCount})` : ''}</option>)}
                                        </select>
                                    )
                                )}
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="animate-in slide-in-from-right-4 duration-300 space-y-4">
                            {channelType === 'email' && (
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Email Subject</label>
                                    <input 
                                        type="text" 
                                        placeholder="Enter subject line..."
                                        value={subject}
                                        onChange={(e) => setSubject(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-violet-500 transition-shadow dark:text-white"
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Message Body</label>
                                <textarea 
                                    rows={channelType === 'email' ? 5 : 6}
                                    placeholder="Type your message..."
                                    value={body}
                                    onChange={(e) => setBody(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-violet-500 resize-none dark:text-white"
                                />
                                {channelType === 'sms' && (
                                    <p className="text-[10px] text-slate-400 text-right mt-1 font-medium">
                                        {body.length} / 160 chars ({Math.ceil(Math.max(body.length, 1) / 160)} segment{Math.ceil(Math.max(body.length, 1) / 160) !== 1 ? 's' : ''})
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="animate-in slide-in-from-right-4 duration-300 space-y-4">
                            <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl space-y-3 border border-slate-100 dark:border-slate-700/50">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Campaign</p>
                                    <p className="text-sm font-medium dark:text-white flex items-center gap-2">
                                        {campaignName} 
                                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-widest font-bold ${channelType === 'sms' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'}`}>
                                            {channelType}
                                        </span>
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Audience</p>
                                    <p className="text-sm font-medium dark:text-white">{pcoName} <span className="text-[10px] text-slate-400 uppercase">({toTab === 'lists' ? 'List' : 'Group'})</span></p>
                                </div>
                                {channelType === 'email' && (
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Subject</p>
                                        <p className="text-sm font-medium dark:text-white">{subject}</p>
                                    </div>
                                )}
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Message preview</p>
                                    <p className="text-sm dark:text-slate-300 whitespace-pre-wrap mt-1">{body}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-6 flex gap-3">
                    {step > 1 && (
                        <button 
                            onClick={() => setStep(s => s - 1 as 1|2|3|4)}
                            disabled={status === 'sending'}
                            className="flex-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold py-3.5 rounded-xl shadow-sm transition-all"
                        >
                            Back
                        </button>
                    )}
                    
                    {step < 4 ? (
                        <button 
                            onClick={() => setStep(s => s + 1 as 1|2|3|4)}
                            disabled={isNextDisabled()}
                            className="flex-[2] bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl shadow-sm transition-all"
                        >
                            Next Step
                        </button>
                    ) : (
                        <button 
                            onClick={handleSend}
                            disabled={status === 'sending' || status === 'success'}
                            className="flex-[2] bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl shadow-sm transition-all flex justify-center items-center gap-2"
                        >
                            {status === 'sending' ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : status === 'success' ? (
                                'Scheduled!'
                            ) : (
                                <>
                                    <Send size={18} />
                                    Send Broadcast
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
            
            {channelType === 'sms' && (
                <div className="text-center animate-in fade-in">
                    <p className="text-xs text-slate-400">
                        Sending from <span className="font-semibold text-slate-600 dark:text-slate-300">{twilioNumber.friendlyLabel}</span> ({twilioNumber.phoneNumber})
                    </p>
                </div>
            )}
        </div>
    );
};

