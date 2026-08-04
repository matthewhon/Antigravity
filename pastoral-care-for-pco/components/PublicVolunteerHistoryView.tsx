import React, { useState, useEffect, useMemo } from 'react';
import { OutreachSlot } from '../types';
import { firestore } from '../services/firestoreService';
import {
    Phone, Mail, CheckCircle2,
    Loader2, Heart, Users, ChevronRight,
    Search, Edit3, Send
} from 'lucide-react';

const VOLUNTEER_STORAGE_KEY = (churchId: string) => `volunteer_history_phone_${churchId}`;

const normalizePhone = (raw: string) => raw.replace(/\D/g, '');

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/30 font-sans">
        <header className="bg-white border-b border-slate-100 shadow-sm px-6 py-4">
            <div className="max-w-lg mx-auto flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-[12px] bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-200">
                        <Heart size={18} fill="white" className="text-white" />
                    </div>
                    <div>
                        <p className="text-sm font-black text-slate-900 leading-tight">Volunteer History</p>
                        <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-wide">My Contacts</p>
                    </div>
                </div>
            </div>
        </header>
        <main className="px-6 py-8 pb-32 max-w-lg mx-auto">
            {children}
        </main>
    </div>
);

const PhoneStep: React.FC<{ onSubmit: (phone: string) => void; isLoading: boolean }> = ({ onSubmit, isLoading }) => {
    const [phone, setPhone] = useState('');
    return (
        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-8">
            <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center mx-auto mb-6">
                <Phone size={28} className="text-indigo-600" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 text-center mb-2">Welcome Back!</h2>
            <p className="text-sm text-slate-500 text-center mb-8">
                Enter your phone number to view your past contacts and add new notes.
            </p>
            <form onSubmit={e => { e.preventDefault(); onSubmit(phone); }} className="space-y-6">
                <div>
                    <input
                        type="tel"
                        inputMode="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="(555) 000-0000"
                        className="w-full text-2xl font-black text-slate-900 tracking-wide text-center bg-slate-50 border-2 border-slate-200 focus:border-indigo-500 rounded-2xl px-4 py-4 outline-none transition-colors placeholder:text-slate-300 placeholder:font-normal placeholder:text-xl"
                    />
                </div>
                <button
                    type="submit"
                    disabled={normalizePhone(phone).length < 10 || isLoading}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-4 rounded-2xl font-bold uppercase tracking-wide text-sm shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
                >
                    {isLoading ? <Loader2 size={18} className="animate-spin" /> : <ChevronRight size={18} />}
                    {isLoading ? 'Loading History…' : 'View My Contacts'}
                </button>
            </form>
        </div>
    );
};

export const PublicVolunteerHistoryView: React.FC<{ churchId: string }> = ({ churchId }) => {
    const [viewState, setViewState] = useState<'phone' | 'loading' | 'list'>('phone');
    const [volunteerPhone, setVolunteerPhone] = useState('');
    const [slots, setSlots] = useState<OutreachSlot[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null);
    const [noteText, setNoteText] = useState('');
    const [saving, setSaving] = useState(false);
    const [savedPersonId, setSavedPersonId] = useState<string | null>(null);

    const [filterHasNotes, setFilterHasNotes] = useState(false);
    const [filterStatus, setFilterStatus] = useState<'all' | 'contacted' | 'no-answer'>('all');

    useEffect(() => {
        const stored = sessionStorage.getItem(VOLUNTEER_STORAGE_KEY(churchId));
        if (stored) {
            handlePhoneSubmit(stored);
        }
    }, [churchId]);

    const handlePhoneSubmit = async (phone: string) => {
        setVolunteerPhone(phone);
        sessionStorage.setItem(VOLUNTEER_STORAGE_KEY(churchId), phone);
        setViewState('loading');
        const mySlots = await firestore.getAllVolunteerSlotsForChurch(churchId, phone);
        setSlots(mySlots);
        setViewState('list');
    };

    const handleSaveNote = async (personId: string, personName: string, volunteerName?: string | null) => {
        if (!noteText.trim() || saving) return;
        setSaving(true);
        try {
            const resp = await fetch('/api/outreach/volunteer-note', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    churchId,
                    personId,
                    personName,
                    followUpNote: noteText.trim(),
                    volunteerPhone,
                    volunteerName: volunteerName || ''
                }),
            });
            if (!resp.ok) {
                const data = await resp.json().catch(() => ({ error: 'Failed' }));
                throw new Error(data.error || 'Failed to save note');
            }
            
            // Optimistically update UI
            setSlots(prev => {
                const updated = [...prev];
                const personSlots = updated.filter(s => s.assignedPersonId === personId);
                if (personSlots.length > 0) {
                    const latestSlot = personSlots.reduce((a, b) => (b.completedAt ?? 0) > (a.completedAt ?? 0) ? b : a);
                    const idx = updated.findIndex(s => s.id === latestSlot.id);
                    if (idx !== -1) {
                        const newSlot = { ...updated[idx] };
                        newSlot.followUpNotes = [...(newSlot.followUpNotes || []), { note: noteText.trim(), addedAt: Date.now() }];
                        updated[idx] = newSlot;
                    }
                }
                return updated;
            });
            
            setNoteText('');
            setExpandedPersonId(null);
            setSavedPersonId(personId);
            setTimeout(() => setSavedPersonId(null), 3000);
        } catch (err: any) {
            alert(err.message || 'Failed to save note');
        } finally {
            setSaving(false);
        }
    };

    const groupedContacts = useMemo(() => {
        const map = new Map<string, {
            personId: string;
            personName: string;
            personPhone?: string | null;
            personEmail?: string | null;
            lastContactedAt: number;
            volunteerName?: string | null;
            slots: OutreachSlot[];
        }>();
        for (const slot of slots) {
            const existing = map.get(slot.assignedPersonId);
            if (!existing) {
                map.set(slot.assignedPersonId, {
                    personId: slot.assignedPersonId,
                    personName: slot.assignedPersonName,
                    personPhone: slot.assignedPersonPhone,
                    personEmail: slot.assignedPersonEmail,
                    lastContactedAt: slot.completedAt ?? 0,
                    volunteerName: slot.volunteerName,
                    slots: [slot]
                });
            } else {
                existing.slots.push(slot);
                if ((slot.completedAt ?? 0) > existing.lastContactedAt) {
                    existing.lastContactedAt = slot.completedAt ?? 0;
                }
            }
        }
        return Array.from(map.values()).sort((a, b) => b.lastContactedAt - a.lastContactedAt);
    }, [slots]);

    const filteredContacts = useMemo(() => {
        let result = groupedContacts;
        if (filterHasNotes) {
            result = result.filter(c => c.slots.some(s => (s.followUpNotes && s.followUpNotes.length > 0) || (s.notes && s.notes.trim().length > 0)));
        }
        if (filterStatus !== 'all') {
            result = result.filter(c => c.slots.some(s => s.status === filterStatus));
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const qDigits = q.replace(/\D/g, '');
            result = result.filter(c =>
                c.personName.toLowerCase().includes(q) ||
                (qDigits && c.personPhone?.replace(/\D/g, '').includes(qDigits))
            );
        }
        return result;
    }, [groupedContacts, searchQuery, filterHasNotes, filterStatus]);

    return (
        <Shell>
            {viewState === 'loading' && (
                <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-10 text-center">
                    <Loader2 size={32} className="animate-spin text-indigo-500 mx-auto mb-4" />
                    <h2 className="text-xl font-black text-slate-900 mb-2">Loading your contacts…</h2>
                </div>
            )}
            
            {viewState === 'phone' && (
                <PhoneStep onSubmit={handlePhoneSubmit} isLoading={false} />
            )}
            
            {viewState === 'list' && (
                <div className="space-y-4">
                    <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-200">
                                <Users size={18} className="text-white" />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-slate-900">My Contacts</h2>
                                <p className="text-[11px] text-slate-400 font-medium">
                                    {groupedContacts.length} {groupedContacts.length === 1 ? 'person' : 'people'} you've contacted
                                </p>
                            </div>
                        </div>

                        {groupedContacts.length > 0 && (
                            <div className="flex flex-col gap-3">
                                {groupedContacts.length > 3 && (
                                    <div className="relative">
                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            placeholder="Search by name or phone…"
                                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder:text-slate-300 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-colors"
                                        />
                                    </div>
                                )}
                                <div className="flex flex-wrap items-center gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={filterHasNotes}
                                            onChange={e => setFilterHasNotes(e.target.checked)}
                                            className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-slate-600 font-medium">Show only with notes</span>
                                    </label>
                                    
                                    <select
                                        value={filterStatus}
                                        onChange={e => setFilterStatus(e.target.value as any)}
                                        className="bg-slate-50 border border-slate-200 text-slate-600 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2 outline-none"
                                    >
                                        <option value="all">Any Status</option>
                                        <option value="contacted">Answered</option>
                                        <option value="no-answer">No Answer</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {groupedContacts.length === 0 && (
                        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-10 text-center">
                            <Users size={32} className="mx-auto text-slate-300 mb-3" />
                            <h3 className="text-lg font-black text-slate-700 mb-2">No Contacts Found</h3>
                            <p className="text-sm text-slate-400">You haven't contacted anyone yet.</p>
                        </div>
                    )}

                    {filteredContacts.map(contact => {
                        const isExpanded = expandedPersonId === contact.personId;
                        const justSaved = savedPersonId === contact.personId;
                        return (
                            <div key={contact.personId} className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden">
                                <div className="h-1.5 bg-indigo-400" />

                                <div className="p-5">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-md bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-indigo-200">
                                                {contact.personName.slice(0, 1).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-black text-slate-900 leading-tight">{contact.personName}</p>
                                                <p className="text-[11px] text-slate-400 mt-0.5">
                                                    Last contact: {contact.lastContactedAt ? new Date(contact.lastContactedAt).toLocaleDateString() : 'Unknown'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex gap-2 mb-4">
                                        {contact.personPhone ? (
                                            <>
                                                <a
                                                    href={`tel:${contact.personPhone.replace(/\D/g, '')}`}
                                                    className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-2.5 rounded-xl text-xs font-bold transition-colors"
                                                >
                                                    <Phone size={14} /> Call
                                                </a>
                                                <a
                                                    href={`sms:${contact.personPhone.replace(/\D/g, '')}`}
                                                    className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-2.5 rounded-xl text-xs font-bold transition-colors"
                                                >
                                                    <Mail size={14} /> Text
                                                </a>
                                            </>
                                        ) : (
                                            <div className="text-xs text-slate-400 py-2">No phone number available</div>
                                        )}
                                    </div>

                                    {contact.slots.flatMap(s => s.followUpNotes || []).length > 0 && (
                                        <div className="space-y-2 mb-3">
                                            {contact.slots.flatMap(s => s.followUpNotes || []).sort((a, b) => a.addedAt - b.addedAt).map((fn, i) => (
                                                <div key={i} className="bg-indigo-50 rounded-xl px-4 py-2.5">
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <Edit3 size={10} className="text-indigo-500" />
                                                        <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-500">Follow-Up</p>
                                                        <span className="text-[11px] text-slate-400 ml-auto">
                                                            {new Date(fn.addedAt).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-slate-700">{fn.note}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {justSaved && (
                                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 mb-3">
                                            <CheckCircle2 size={14} className="text-emerald-500" />
                                            <p className="text-xs font-bold text-emerald-700">Note saved successfully!</p>
                                        </div>
                                    )}

                                    {isExpanded ? (
                                        <div className="space-y-2">
                                            <textarea
                                                value={noteText}
                                                onChange={e => setNoteText(e.target.value)}
                                                placeholder="Type a new note…"
                                                rows={3}
                                                autoFocus
                                                className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-400 rounded-xl px-4 py-3 text-sm text-slate-700 placeholder:text-slate-300 outline-none focus:ring-2 focus:ring-indigo-100 resize-none transition-colors"
                                            />
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleSaveNote(contact.personId, contact.personName, contact.volunteerName)}
                                                    disabled={!noteText.trim() || saving}
                                                    className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide shadow-md shadow-indigo-200 transition-all"
                                                >
                                                    {saving
                                                        ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                                                        : <><Send size={14} /> Save Note</>}
                                                </button>
                                                <button
                                                    onClick={() => { setExpandedPersonId(null); setNoteText(''); }}
                                                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl text-xs font-bold transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => { setExpandedPersonId(contact.personId); setNoteText(''); }}
                                            className="w-full flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 py-3 rounded-xl text-xs font-bold uppercase tracking-wide transition-all"
                                        >
                                            <Edit3 size={14} />
                                            Add Note
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Shell>
    );
};
