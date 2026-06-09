import React, { useState } from 'react';
import { Church, TwilioPhoneNumber } from '../types';
import { Users, Send } from 'lucide-react';

interface BroadcastViewProps {
    church: Church;
    twilioNumber: TwilioPhoneNumber;
}

export const BroadcastView: React.FC<BroadcastViewProps> = ({ twilioNumber }) => {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [campaignName, setCampaignName] = useState('');
    const [audience, setAudience] = useState('All Active Members');
    const [body, setBody] = useState('');
    const [status, setStatus] = useState<'idle' | 'sending' | 'success'>('idle');

    const handleSend = async () => {
        if (!campaignName || !body) return;
        setStatus('sending');

        // Note: Real implementation would POST to /api/messaging/campaigns
        setTimeout(() => {
            setStatus('success');
            setTimeout(() => {
                setStatus('idle');
                setStep(1);
                setCampaignName('');
                setBody('');
            }, 3000);
        }, 1500);
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
                        Step {step} of 3
                    </div>
                </div>
                
                <div className="space-y-4 min-h-[220px]">
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
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Audience</label>
                                <select 
                                    value={audience}
                                    onChange={(e) => setAudience(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-violet-500 appearance-none dark:text-white"
                                >
                                    <option>All Active Members</option>
                                    <option>Volunteers List</option>
                                    <option>Youth Group</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="animate-in slide-in-from-right-4 duration-300">
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Message Body</label>
                            <textarea 
                                rows={6}
                                placeholder="Type your message..."
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-violet-500 resize-none dark:text-white"
                            />
                            <p className="text-[10px] text-slate-400 text-right mt-1 font-medium">
                                {body.length} / 160 chars ({Math.ceil(Math.max(body.length, 1) / 160)} segment{Math.ceil(Math.max(body.length, 1) / 160) !== 1 ? 's' : ''})
                            </p>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="animate-in slide-in-from-right-4 duration-300 space-y-4">
                            <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl space-y-3 border border-slate-100 dark:border-slate-700/50">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Campaign</p>
                                    <p className="text-sm font-medium dark:text-white">{campaignName}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Audience</p>
                                    <p className="text-sm font-medium dark:text-white">{audience}</p>
                                </div>
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
                            onClick={() => setStep(s => s - 1 as 1|2|3)}
                            disabled={status === 'sending'}
                            className="flex-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold py-3.5 rounded-xl shadow-sm transition-all"
                        >
                            Back
                        </button>
                    )}
                    
                    {step < 3 ? (
                        <button 
                            onClick={() => setStep(s => s + 1 as 1|2|3)}
                            disabled={
                                (step === 1 && !campaignName) || 
                                (step === 2 && !body)
                            }
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
            
            <div className="text-center">
                <p className="text-xs text-slate-400">
                    Sending from <span className="font-semibold text-slate-600 dark:text-slate-300">{twilioNumber.friendlyLabel}</span> ({twilioNumber.phoneNumber})
                </p>
            </div>
        </div>
    );
};

