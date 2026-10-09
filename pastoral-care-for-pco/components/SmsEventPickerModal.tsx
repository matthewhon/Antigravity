import React, { useEffect, useState } from 'react';
import { Sparkles, Calendar, X, Loader2, ExternalLink, Check, ArrowRight } from 'lucide-react';
import {
    fetchContentRecommendations,
    generateCampaignContent,
    RecommendedContentItem,
} from '../services/geminiService';
import { smsSegmentInfo } from '../services/readability';

interface Props {
    churchId: string;
    isOpen: boolean;
    onClose: () => void;
    onSelectMessage: (body: string) => void;
}

export const SmsEventPickerModal: React.FC<Props> = ({
    churchId,
    isOpen,
    onClose,
    onSelectMessage,
}) => {
    const [loadingRecs, setLoadingRecs] = useState(false);
    const [recommendations, setRecommendations] = useState<RecommendedContentItem[]>([]);
    const [selectedItem, setSelectedItem] = useState<RecommendedContentItem | null>(null);
    const [drafting, setDrafting] = useState(false);
    const [draftedBody, setDraftedBody] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || !churchId) return;
        setLoadingRecs(true);
        setError(null);
        setDraftedBody('');
        setSelectedItem(null);

        fetchContentRecommendations(churchId, 14)
            .then(res => {
                const list = res.recommendations || [];
                setRecommendations(list);
                if (list.length > 0) setSelectedItem(list[0]);
            })
            .catch(e => setError(e?.message || 'Failed to load upcoming events'))
            .finally(() => setLoadingRecs(false));
    }, [isOpen, churchId]);

    const handleDraftForEvent = async (item: RecommendedContentItem) => {
        setSelectedItem(item);
        setDrafting(true);
        setError(null);
        try {
            const result = await generateCampaignContent({
                channel: 'sms',
                churchId,
                length: 'short',
                items: [{
                    label: item.label,
                    description: item.description,
                    url: item.url,
                    date: item.date,
                }],
                topic: `Write a short, engaging church SMS invitation for ${item.label}. Include the date and link. Aim for under 160 characters (one SMS segment). Warm and inviting tone.`,
            });
            setDraftedBody(result.body.trim());
        } catch (e: any) {
            setError(e?.message || 'Failed to generate SMS');
        } finally {
            setDrafting(false);
        }
    };

    if (!isOpen) return null;

    const segmentInfo = draftedBody ? smsSegmentInfo(draftedBody) : null;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs" role="dialog" aria-modal="true">
            <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-violet-600 to-indigo-600 shrink-0">
                    <div className="flex items-center gap-2 text-white">
                        <Sparkles size={16} />
                        <span className="text-sm font-bold">Suggest SMS from Upcoming Events</span>
                    </div>
                    <button
                        onClick={onClose}
                        title="Close"
                        className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Pick an upcoming registration, service, or event to automatically draft a concise, warm text message with dates and links.
                    </p>

                    {loadingRecs && (
                        <div className="py-12 flex flex-col items-center justify-center text-center">
                            <Loader2 size={24} className="animate-spin text-violet-500 mb-2" />
                            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Scanning calendar, registrations, and groups…</p>
                        </div>
                    )}

                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 text-xs rounded-xl border border-red-200 dark:border-red-800">
                            {error}
                        </div>
                    )}

                    {!loadingRecs && recommendations.length === 0 && (
                        <div className="py-8 text-center text-xs text-slate-400">
                            No upcoming events or open groups found in the next 14 days.
                        </div>
                    )}

                    {/* Events list */}
                    {!loadingRecs && recommendations.length > 0 && !draftedBody && (
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {recommendations.map(r => {
                                const isSelected = selectedItem?.id === r.id;
                                return (
                                    <div
                                        key={r.id}
                                        onClick={() => setSelectedItem(r)}
                                        className={`p-3 rounded-xl border transition cursor-pointer text-left ${
                                            isSelected
                                                ? 'bg-violet-50 dark:bg-violet-950/40 border-violet-400 dark:border-violet-600'
                                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-violet-200'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md uppercase tracking-wider bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                                                        {r.type}
                                                    </span>
                                                    <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 px-1.5 py-0.2 rounded-md">
                                                        {r.urgencyReason}
                                                    </span>
                                                </div>
                                                <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{r.label}</p>
                                                {r.date && (
                                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                                                        <Calendar size={11} className="text-slate-400 shrink-0" />
                                                        {r.date}
                                                    </p>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleDraftForEvent(r); }}
                                                disabled={drafting}
                                                className="shrink-0 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-violet-600 hover:bg-violet-700 text-white flex items-center gap-1 shadow-xs transition"
                                            >
                                                Draft SMS <ArrowRight size={11} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {drafting && (
                        <div className="py-8 flex flex-col items-center justify-center text-center">
                            <Loader2 size={24} className="animate-spin text-violet-500 mb-2" />
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Writing SMS in church voice…</p>
                            <p className="text-[10px] text-slate-400">Formatting link and dates</p>
                        </div>
                    )}

                    {/* Draft Preview */}
                    {draftedBody && !drafting && (
                        <div className="space-y-3 pt-1">
                            <div className="p-3 bg-violet-50/70 dark:bg-violet-950/30 rounded-xl border border-violet-200 dark:border-violet-800/60">
                                <p className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wide mb-1">
                                    Generated SMS Draft ({selectedItem?.label})
                                </p>
                                <textarea
                                    rows={3}
                                    value={draftedBody}
                                    onChange={e => setDraftedBody(e.target.value)}
                                    className="w-full text-xs bg-white dark:bg-slate-800 rounded-lg p-2.5 border border-violet-200 dark:border-violet-700 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-violet-400 resize-none leading-relaxed"
                                />
                                {segmentInfo && (
                                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 px-0.5">
                                        <span>{Array.from(draftedBody).length} characters</span>
                                        <span className={`font-semibold ${segmentInfo.segments === 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'}`}>
                                            {segmentInfo.segments} segment{segmentInfo.segments === 1 ? '' : 's'} ({segmentInfo.encoding})
                                        </span>
                                    </div>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={() => selectedItem && handleDraftForEvent(selectedItem)}
                                className="text-[11px] text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
                            >
                                <Sparkles size={11} /> Regenerate another variation
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900 shrink-0">
                    {draftedBody ? (
                        <button
                            type="button"
                            onClick={() => setDraftedBody('')}
                            className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        >
                            ← Back to events
                        </button>
                    ) : (
                        <span />
                    )}

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                        >
                            Cancel
                        </button>
                        {draftedBody ? (
                            <button
                                type="button"
                                onClick={() => {
                                    onSelectMessage(draftedBody);
                                    onClose();
                                }}
                                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-xl shadow-xs transition"
                            >
                                <Check size={13} /> Use this message
                            </button>
                        ) : (
                            <button
                                type="button"
                                disabled={!selectedItem || drafting || loadingRecs}
                                onClick={() => selectedItem && handleDraftForEvent(selectedItem)}
                                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl shadow-xs transition"
                            >
                                <Sparkles size={13} /> Draft SMS for event
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
