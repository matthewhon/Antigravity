/**
 * Read-only mobile rendering of a dashboard widget shared from the web app.
 * Everything comes from the snapshot stored on the message; claims sync live.
 */
import React, { useState } from 'react';
import { Check, Phone, MessageCircle, Pin } from 'lucide-react';
import { ChatWidgetAttachment, ChatWidgetSnapshotItem, User } from '../../types';
import { Avatar, formatListTime } from './chatUtils';

const TONE: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    indigo: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const RISK: Record<string, string> = {
    Healthy: 'text-emerald-600 dark:text-emerald-400',
    'At Risk': 'text-amber-600 dark:text-amber-400',
    Disconnected: 'text-rose-600 dark:text-rose-400',
    Critical: 'text-rose-700 dark:text-rose-300',
};

export const WidgetSnapshotCard: React.FC<{
    widget: ChatWidgetAttachment;
    currentUser: User;
    /** Absent for pinned widgets (claims are made on the original message) */
    onToggleClaim?: (item: ChatWidgetSnapshotItem) => void;
    compact?: boolean;
    pinned?: boolean;
}> = ({ widget, currentUser, onToggleClaim, compact, pinned }) => {
    const [expanded, setExpanded] = useState(false);
    const items = widget.snapshot.items || [];
    const visible = expanded ? items : items.slice(0, compact ? 3 : 5);
    const claimedCount = Object.keys(widget.claims || {}).length;

    return (
        <div className="mt-1.5 w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden text-left shadow-sm">
            <div className="px-3.5 pt-3 pb-2 flex items-start gap-2">
                <span className="text-lg leading-none mt-0.5">{widget.icon || '📊'}</span>
                <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-slate-900 dark:text-white leading-tight flex items-center gap-1">
                        {pinned && <Pin size={11} className="text-violet-500 shrink-0" />}
                        <span className="truncate">{widget.title}</span>
                    </p>
                    <p className="text-[11px] text-slate-400">
                        Snapshot · {formatListTime(widget.snapshot.capturedAt)}
                        {claimedCount > 0 && ` · ${claimedCount} claimed`}
                    </p>
                </div>
                {widget.snapshot.headlineValue && (
                    <span className="text-[17px] font-black text-violet-600 dark:text-violet-400 shrink-0">{widget.snapshot.headlineValue}</span>
                )}
            </div>

            {widget.snapshot.subtitle && !compact && (
                <p className="px-3.5 pb-2 text-[12px] text-slate-500 dark:text-slate-400">{widget.snapshot.subtitle}</p>
            )}

            {!!widget.snapshot.summaryMetrics?.length && (
                <div className="px-3.5 pb-2.5 flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                    {widget.snapshot.summaryMetrics.map(m => (
                        <span key={m.label} className={`shrink-0 text-[11px] font-semibold px-2 py-1 rounded-lg ${TONE[m.tone || 'slate']}`}>
                            {m.label}: <b>{m.value}</b>
                        </span>
                    ))}
                </div>
            )}

            {visible.length > 0 && (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
                    {visible.map(item => {
                        const claim = widget.claims?.[item.id];
                        const mine = claim?.claimedByUserId === currentUser.id;
                        return (
                            <li key={item.id} className="px-3.5 py-2.5 flex items-center gap-2.5">
                                <Avatar name={item.name} id={item.id} src={item.avatar} size={32} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">{item.name}</p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                        {item.primaryStat}
                                        {item.secondaryStat ? ` · ${item.secondaryStat}` : ''}
                                        {item.riskCategory && <span className={`ml-1 font-semibold ${RISK[item.riskCategory] || ''}`}>· {item.riskCategory}</span>}
                                    </p>
                                    {claim && (
                                        <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                            <Check size={11} /> {mine ? 'You claimed' : `${claim.claimedByUserName} claimed`}
                                        </p>
                                    )}
                                </div>
                                {item.phone && (
                                    <>
                                        <a href={`tel:${item.phone}`} aria-label={`Call ${item.name}`}
                                            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center active:scale-95">
                                            <Phone size={14} />
                                        </a>
                                        <a href={`sms:${item.phone}`} aria-label={`Text ${item.name}`}
                                            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center active:scale-95">
                                            <MessageCircle size={14} />
                                        </a>
                                    </>
                                )}
                                {onToggleClaim && (!claim || mine) && (
                                    <button
                                        type="button"
                                        onClick={() => onToggleClaim(item)}
                                        className={`text-[12px] font-bold px-2.5 py-1.5 rounded-full active:scale-95 transition ${mine
                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                            : 'bg-violet-600 text-white'}`}
                                    >
                                        {mine ? 'Unclaim' : 'Claim'}
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {items.length > visible.length && (
                <button type="button" onClick={() => setExpanded(true)}
                    className="w-full py-2 text-[12px] font-semibold text-violet-600 dark:text-violet-400 border-t border-slate-100 dark:border-slate-800">
                    Show all {items.length}
                </button>
            )}
        </div>
    );
};

