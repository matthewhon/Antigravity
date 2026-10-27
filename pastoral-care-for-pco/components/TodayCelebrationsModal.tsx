import React, { useState, useMemo } from 'react';
import { TodayCelebration, getOrdinal } from '../services/celebrationService';
import { Church, User } from '../types';
import { 
    X, Phone, Mail, MessageSquare, Copy, Check, ExternalLink, 
    Sparkles, Heart, Cake, Gift, Send, Loader2, User as UserIcon
} from 'lucide-react';

interface TodayCelebrationsModalProps {
    isOpen: boolean;
    onClose: () => void;
    celebrations: TodayCelebration[];
    church?: Church | null;
    currentUser?: User | null;
    dontShowAgainToday?: boolean;
    onToggleDontShowAgainToday?: (dontShow: boolean) => void;
    onOpenProfile?: (personId: string) => void;
}

export const TodayCelebrationsModal: React.FC<TodayCelebrationsModalProps> = ({
    isOpen,
    onClose,
    celebrations,
    church,
    currentUser,
    dontShowAgainToday = true,
    onToggleDontShowAgainToday,
    onOpenProfile
}) => {
    const [activeTab, setActiveTab] = useState<'all' | 'birthday' | 'anniversary'>('all');
    const [expandedSmsId, setExpandedSmsId] = useState<string | null>(null);
    const [smsTexts, setSmsTexts] = useState<Record<string, string>>({});
    const [sendingSmsId, setSendingSmsId] = useState<string | null>(null);
    const [smsSuccessMap, setSmsSuccessMap] = useState<Record<string, boolean>>({});
    const [smsErrorMap, setSmsErrorMap] = useState<Record<string, string>>({});
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const birthdays = useMemo(() => celebrations.filter(c => c.type === 'birthday'), [celebrations]);
    const anniversaries = useMemo(() => celebrations.filter(c => c.type === 'anniversary'), [celebrations]);

    const filteredCelebrations = useMemo(() => {
        if (activeTab === 'birthday') return birthdays;
        if (activeTab === 'anniversary') return anniversaries;
        return celebrations;
    }, [activeTab, birthdays, anniversaries, celebrations]);

    if (!isOpen) return null;

    const churchName = church?.name || 'our church';
    const formattedToday = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
    });

    const getDefaultBlessing = (item: TodayCelebration): string => {
        if (item.type === 'birthday') {
            const agePhrase = item.turningAge ? ` on turning ${item.turningAge}` : '';
            return `Happy Birthday, ${item.firstName}! 🎉 Wishing you God's richest blessings, joy, and peace${agePhrase}! We are so thankful for you. Have a wonderful day celebrating! — from ${churchName}`;
        } else {
            const milestone = item.yearsMarried ? ` on your ${getOrdinal(item.yearsMarried)} anniversary` : '';
            const spousePhrase = item.spouseName ? ` and ${item.spouseName}` : '';
            return `Happy Anniversary, ${item.firstName}${spousePhrase}! 💍 Celebrating God's faithfulness and love in your marriage${milestone}. Praying for many more blessed years together! — from ${churchName}`;
        }
    };

    const handleCopyBlessing = (item: TodayCelebration) => {
        const text = smsTexts[item.id] || getDefaultBlessing(item);
        navigator.clipboard.writeText(text);
        setCopiedId(item.id);
        setTimeout(() => setCopiedId(null), 2500);
    };

    const handleToggleSms = (item: TodayCelebration) => {
        if (expandedSmsId === item.id) {
            setExpandedSmsId(null);
        } else {
            setExpandedSmsId(item.id);
            if (!smsTexts[item.id]) {
                setSmsTexts(prev => ({ ...prev, [item.id]: getDefaultBlessing(item) }));
            }
        }
    };

    const handleSendIndividualSms = async (item: TodayCelebration) => {
        if (!item.phone) return;
        const body = (smsTexts[item.id] || getDefaultBlessing(item)).trim();
        if (!body) return;

        setSendingSmsId(item.id);
        setSmsErrorMap(prev => ({ ...prev, [item.id]: '' }));

        try {
            const cleanPhone = item.phone.replace(/[^\d+]/g, '');
            const res = await fetch('/api/messaging/send-individual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    churchId: church?.id,
                    toPhone: cleanPhone,
                    body,
                    sentBy: currentUser?.id || null,
                    sentByName: currentUser?.name || 'Pastoral Staff',
                    personId: item.personId,
                    personName: item.name
                })
            });

            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson.error || 'Failed to send SMS');
            }

            setSmsSuccessMap(prev => ({ ...prev, [item.id]: true }));
            setTimeout(() => {
                setExpandedSmsId(null);
            }, 2000);
        } catch (err: any) {
            console.error('Failed to send celebration SMS:', err);
            setSmsErrorMap(prev => ({ ...prev, [item.id]: err.message || 'SMS delivery failed' }));
        } finally {
            setSendingSmsId(null);
        }
    };

    const handlePersonClick = (personId: string) => {
        if (onOpenProfile) {
            onOpenProfile(personId);
        } else {
            window.dispatchEvent(new CustomEvent('openPersonProfile', { detail: personId }));
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Modal Dialog */}
            <div 
                className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Festive gradient accent strip */}
                <div className="h-2 w-full bg-gradient-to-r from-pink-500 via-amber-400 to-indigo-500" />

                {/* Header */}
                <div className="px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500 to-amber-400 text-white flex items-center justify-center text-2xl shadow-md shadow-pink-500/20 flex-shrink-0">
                            🎉
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                                    Today's Celebrations
                                </h2>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black bg-pink-100 dark:bg-pink-950/50 text-pink-700 dark:text-pink-300">
                                    {celebrations.length}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                                {formattedToday} • {birthdays.length} Birthday{birthdays.length === 1 ? '' : 's'}, {anniversaries.length} Anniversary{anniversaries.length === 1 ? '' : 'ies'}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Close popup"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs (if there are both birthdays and anniversaries) */}
                {birthdays.length > 0 && anniversaries.length > 0 && (
                    <div className="px-6 pt-3 flex gap-2 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                        <button
                            type="button"
                            onClick={() => setActiveTab('all')}
                            className={`pb-2.5 px-3 text-xs font-bold transition-colors border-b-2 ${
                                activeTab === 'all'
                                    ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                                    : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                            }`}
                        >
                            All ({celebrations.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('birthday')}
                            className={`pb-2.5 px-3 text-xs font-bold transition-colors border-b-2 flex items-center gap-1.5 ${
                                activeTab === 'birthday'
                                    ? 'border-pink-600 text-pink-600 dark:border-pink-400 dark:text-pink-400'
                                    : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                            }`}
                        >
                            🎂 Birthdays ({birthdays.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('anniversary')}
                            className={`pb-2.5 px-3 text-xs font-bold transition-colors border-b-2 flex items-center gap-1.5 ${
                                activeTab === 'anniversary'
                                    ? 'border-amber-600 text-amber-600 dark:border-amber-400 dark:text-amber-400'
                                    : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                            }`}
                        >
                            💍 Anniversaries ({anniversaries.length})
                        </button>
                    </div>
                )}

                {/* Celebrations List */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {filteredCelebrations.length === 0 ? (
                        <div className="py-12 text-center">
                            <p className="text-sm font-semibold text-slate-400">
                                No celebrations match this category today.
                            </p>
                        </div>
                    ) : (
                        filteredCelebrations.map(item => {
                            const isBirthday = item.type === 'birthday';
                            const isExpandedSms = expandedSmsId === item.id;
                            const isSending = sendingSmsId === item.id;
                            const isSent = !!smsSuccessMap[item.id];
                            const errorMessage = smsErrorMap[item.id];
                            const isCopied = copiedId === item.id;

                            return (
                                <div
                                    key={item.id}
                                    className={`rounded-2xl border transition-all ${
                                        isBirthday
                                            ? 'border-pink-100 dark:border-pink-900/30 bg-pink-50/20 dark:bg-pink-950/10'
                                            : 'border-amber-100 dark:border-amber-900/30 bg-amber-50/20 dark:bg-amber-950/10'
                                    }`}
                                >
                                    <div className="p-4 flex items-start gap-3.5">
                                        {/* Avatar */}
                                        <div 
                                            className="cursor-pointer relative flex-shrink-0"
                                            onClick={() => handlePersonClick(item.personId)}
                                            title="View profile"
                                        >
                                            {item.avatar ? (
                                                <img
                                                    src={item.avatar}
                                                    alt={item.name}
                                                    className="w-12 h-12 rounded-full object-cover ring-2 ring-white dark:ring-slate-800 shadow-sm"
                                                />
                                            ) : (
                                                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-sm uppercase text-white shadow-sm ${
                                                    isBirthday 
                                                        ? 'bg-gradient-to-tr from-pink-500 to-rose-400' 
                                                        : 'bg-gradient-to-tr from-amber-500 to-orange-400'
                                                }`}>
                                                    {item.firstName.charAt(0)}{item.lastName ? item.lastName.charAt(0) : ''}
                                                </div>
                                            )}
                                            <span className="absolute -bottom-1 -right-1 text-sm">
                                                {isBirthday ? '🎂' : '💍'}
                                            </span>
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <button
                                                    type="button"
                                                    onClick={() => handlePersonClick(item.personId)}
                                                    className="text-base font-bold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-left truncate"
                                                >
                                                    {item.name}
                                                </button>

                                                {/* Milestone Badge */}
                                                {isBirthday ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wide bg-pink-100 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300">
                                                        <Cake size={11} className="stroke-[2.5]" />
                                                        {item.turningAge ? `Turning ${item.turningAge} Today` : 'Birthday Today'}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wide bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                                                        <Sparkles size={11} className="stroke-[2.5]" />
                                                        {item.yearsMarried ? `${getOrdinal(item.yearsMarried)} Anniversary` : 'Anniversary Today'}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Subtitle / Details */}
                                            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                {item.spouseName && (
                                                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                                                        with {item.spouseName}
                                                    </span>
                                                )}
                                                {item.householdName && !item.spouseName && (
                                                    <span>{item.householdName}</span>
                                                )}
                                                {item.membership && (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                                        <UserIcon size={9} />
                                                        {item.membership}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Action Buttons Bar */}
                                            <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                                                {/* Send SMS Blessing */}
                                                {item.phone && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleSms(item)}
                                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                                            isExpandedSms
                                                                ? 'bg-indigo-600 text-white'
                                                                : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50'
                                                        }`}
                                                    >
                                                        <MessageSquare size={13} />
                                                        {isExpandedSms ? 'Close Message' : 'Send Blessing'}
                                                    </button>
                                                )}

                                                {/* Direct Call */}
                                                {item.phone && (
                                                    <a
                                                        href={`tel:${item.phone}`}
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                                        title={`Call ${item.phone}`}
                                                    >
                                                        <Phone size={12} />
                                                        <span className="hidden sm:inline">Call</span>
                                                    </a>
                                                )}

                                                {/* Email */}
                                                {item.email && (
                                                    <a
                                                        href={`mailto:${item.email}?subject=${encodeURIComponent(isBirthday ? `Happy Birthday from ${churchName}!` : `Happy Anniversary from ${churchName}!`)}&body=${encodeURIComponent(getDefaultBlessing(item))}`}
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                                        title={`Email ${item.email}`}
                                                    >
                                                        <Mail size={12} />
                                                        <span className="hidden sm:inline">Email</span>
                                                    </a>
                                                )}

                                                {/* Copy Blessing */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopyBlessing(item)}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                                    title="Copy greeting message to clipboard"
                                                >
                                                    {isCopied ? (
                                                        <>
                                                            <Check size={12} className="text-emerald-500 stroke-[3]" />
                                                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">Copied!</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Copy size={12} />
                                                            <span className="hidden sm:inline">Copy</span>
                                                        </>
                                                    )}
                                                </button>

                                                {/* View Profile */}
                                                <button
                                                    type="button"
                                                    onClick={() => handlePersonClick(item.personId)}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-auto"
                                                    title="Open full profile"
                                                >
                                                    <span>Profile</span>
                                                    <ExternalLink size={11} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Expanded SMS Message Composer */}
                                    {isExpandedSms && (
                                        <div className="px-4 pb-4 pt-1 animate-in fade-in duration-150">
                                            <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                                                        <Send size={10} /> Send SMS to {item.phone}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setSmsTexts(prev => ({ ...prev, [item.id]: getDefaultBlessing(item) }))}
                                                        className="text-[10px] text-indigo-500 hover:text-indigo-600 font-bold"
                                                    >
                                                        Reset text
                                                    </button>
                                                </div>

                                                <textarea
                                                    rows={3}
                                                    value={smsTexts[item.id] !== undefined ? smsTexts[item.id] : getDefaultBlessing(item)}
                                                    onChange={e => setSmsTexts(prev => ({ ...prev, [item.id]: e.target.value }))}
                                                    disabled={isSending || isSent}
                                                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                                                    placeholder="Write your blessing message..."
                                                />

                                                {errorMessage && (
                                                    <p className="text-xs text-rose-500 font-medium">
                                                        ⚠️ {errorMessage}
                                                    </p>
                                                )}

                                                {isSent && (
                                                    <p className="text-xs text-emerald-500 font-bold flex items-center gap-1">
                                                        <Check size={14} /> Message sent successfully!
                                                    </p>
                                                )}

                                                <div className="flex items-center justify-between pt-1">
                                                    <a
                                                        href={`sms:${item.phone?.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(smsTexts[item.id] || getDefaultBlessing(item))}`}
                                                        className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-medium underline"
                                                        title="Open in your device's native SMS messaging app"
                                                    >
                                                        Open in Messages app
                                                    </a>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleSendIndividualSms(item)}
                                                        disabled={isSending || isSent}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                                                    >
                                                        {isSending ? (
                                                            <>
                                                                <Loader2 size={12} className="animate-spin" />
                                                                <span>Sending...</span>
                                                            </>
                                                        ) : isSent ? (
                                                            <>
                                                                <Check size={12} />
                                                                <span>Sent!</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Send size={12} />
                                                                <span>Send SMS</span>
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
                    {onToggleDontShowAgainToday ? (
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={dontShowAgainToday}
                                onChange={e => onToggleDontShowAgainToday(e.target.checked)}
                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer"
                            />
                            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                Don't show again today
                            </span>
                        </label>
                    ) : (
                        <span className="text-xs text-slate-400">
                            Available anytime from the 🎉 icon in the top bar.
                        </span>
                    )}

                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors shadow-sm"
                    >
                        Got it, thanks!
                    </button>
                </div>
            </div>
        </div>
    );
};
