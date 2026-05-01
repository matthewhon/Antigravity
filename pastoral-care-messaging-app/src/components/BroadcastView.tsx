import React, { useState } from 'react';
import { Church, TwilioPhoneNumber } from '../types';
import { Users, Send } from 'lucide-react';

interface BroadcastViewProps {
    church: Church;
    twilioNumber: TwilioPhoneNumber;
}

export const BroadcastView: React.FC<BroadcastViewProps> = ({ twilioNumber }) => {
    const [campaignName, setCampaignName] = useState('');
    const [body, setBody] = useState('');
    const [status, setStatus] = useState<'idle' | 'sending' | 'success'>('idle');

    const handleSend = async () => {
        if (!campaignName || !body) return;
        setStatus('sending');

        // Note: Real implementation would POST to /api/messaging/campaigns
        setTimeout(() => {
            setStatus('success');
            setCampaignName('');
            setBody('');
            setTimeout(() => setStatus('idle'), 3000);
        }, 1500);
    };

    return (
        <div className="p-4 flex flex-col gap-4 animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-5">
                <div className="flex items-center gap-3 mb-4 text-violet-600 dark:text-violet-400">
                    <Users size={24} />
                    <h2 className="text-lg font-bold">New Broadcast</h2>
                </div>
                
                <div className="space-y-4">
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
                        <select className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-violet-500 appearance-none dark:text-white">
                            <option>All Active Members</option>
                            <option>Volunteers List</option>
                            <option>Youth Group</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Message Body</label>
                        <textarea 
                            rows={4}
                            placeholder="Type your message..."
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-violet-500 resize-none dark:text-white"
                        />
                        <p className="text-[10px] text-slate-400 text-right mt-1 font-medium">{body.length} / 160 chars (1 segment)</p>
                    </div>
                </div>

                <button 
                    onClick={handleSend}
                    disabled={status === 'sending' || !campaignName || !body}
                    className="w-full mt-6 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:hover:bg-violet-600 text-white font-bold py-3.5 rounded-xl shadow-sm transition-all flex justify-center items-center gap-2"
                >
                    {status === 'sending' ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : status === 'success' ? (
                        'Broadcast Scheduled!'
                    ) : (
                        <>
                            <Send size={18} />
                            Send Broadcast
                        </>
                    )}
                </button>
            </div>
            
            <div className="text-center">
                <p className="text-xs text-slate-400">
                    Sending from <span className="font-semibold">{twilioNumber.friendlyLabel}</span> ({twilioNumber.phoneNumber})
                </p>
            </div>
        </div>
    );
};
