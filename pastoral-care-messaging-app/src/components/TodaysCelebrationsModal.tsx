import React, { useState, useMemo, useEffect } from 'react';
import { PcoPerson, Church, User, PastoralNote } from '../types';
import { CelebrationItem, getCelebrationsForDate } from '../services/celebrationNotifications';
import { firestore } from '../services/firestoreService';
import {
  X, Phone, MessageSquare, User as UserIcon, Cake, Heart,
  Sparkles, Copy, Check, Send, Loader2, Mail, MapPin, ArrowLeft, Smartphone
} from 'lucide-react';

interface TodaysCelebrationsModalProps {
  people: PcoPerson[];
  church: Church;
  currentUser: User;
  onClose: () => void;
}

export const TodaysCelebrationsModal: React.FC<TodaysCelebrationsModalProps> = ({
  people,
  church,
  currentUser,
  onClose,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [composingItem, setComposingItem] = useState<CelebrationItem | null>(null);
  const [draftMessage, setDraftMessage] = useState('');
  const [sendingSms, setSendingSms] = useState(false);
  const [sentIds, setSentIds] = useState<Record<string, boolean>>({});
  const [sendError, setSendError] = useState<string | null>(null);

  // Selected person for Profile View
  const [viewingPerson, setViewingPerson] = useState<PcoPerson | null>(null);
  const [personNotes, setPersonNotes] = useState<PastoralNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);

  const today = useMemo(() => new Date(), []);
  const todayCelebrations = useMemo(() => getCelebrationsForDate(people, today), [people, today]);

  const upcomingCelebrations = useMemo(() => {
    const list: { item: CelebrationItem; daysAway: number; dayLabel: string }[] = [];
    for (let offset = 1; offset <= 7; offset++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
      const dayItems = getCelebrationsForDate(people, d);
      const dayLabel = offset === 1
        ? 'Tomorrow'
        : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      for (const item of dayItems) {
        list.push({ item, daysAway: offset, dayLabel });
      }
    }
    return list;
  }, [people, today]);

  useEffect(() => {
    if (!viewingPerson) {
      setPersonNotes([]);
      return;
    }
    setLoadingNotes(true);
    firestore
      .getPastoralNotes(church.id, viewingPerson.id)
      .then(notes => setPersonNotes(notes.slice(0, 10)))
      .catch(() => setPersonNotes([]))
      .finally(() => setLoadingNotes(false));
  }, [viewingPerson, church.id]);

  const birthdaysCount = todayCelebrations.filter(c => c.type === 'birthday').length;
  const anniversariesCount = todayCelebrations.filter(c => c.type === 'anniversary').length;

  const formattedToday = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const getInitials = (name: string) =>
    name
      .split(' ')
      .slice(0, 2)
      .map(p => p[0] || '')
      .join('')
      .toUpperCase();

  const buildGreetingMessage = (item: CelebrationItem): string => {
    const firstName = item.person.name.split(' ')[0] || item.person.name;
    const sender = currentUser.name ? `${currentUser.name} at ${church.name}` : church.name;
    if (item.type === 'birthday') {
      return `Happy Birthday, ${firstName}! 🎂 Sending warm wishes from ${sender}. We are so grateful for you and are praying for a blessed year ahead!`;
    }
    return `Happy Anniversary, ${firstName}! 💍 Wishing you a joyful day of celebration from ${sender}. Praying continued blessings over your marriage and family!`;
  };

  const handleOpenTextComposer = (item: CelebrationItem) => {
    setSendError(null);
    setComposingItem(item);
    setDraftMessage(buildGreetingMessage(item));
  };

  const handleSendChurchSms = async () => {
    if (!composingItem || !draftMessage.trim()) return;
    const rawPhone = composingItem.person.phone || composingItem.person.e164Phone || '';
    const digits = rawPhone.replace(/\D/g, '');
    const toPhone = digits.length === 10 ? `+1${digits}` : digits.length === 11 ? `+${digits}` : rawPhone.trim();

    if (!toPhone) {
      setSendError('No valid phone number on file for this person.');
      return;
    }

    setSendingSms(true);
    setSendError(null);
    try {
      const sysSettings = await firestore.getSystemSettings();
      const apiBaseUrl = (sysSettings.apiBaseUrl || 'https://pastoralcare.barnabassoftware.com').replace(/\/$/, '');
      const activeNumberId = sessionStorage.getItem('mobileSms_activeNumberId') || null;

      const payload: Record<string, any> = {
        churchId: church.id,
        toPhone,
        body: draftMessage.trim(),
        sentBy: currentUser.id,
        sentByName: currentUser.name,
      };
      if (activeNumberId) payload.twilioNumberId = activeNumberId;

      const res = await fetch(`${apiBaseUrl}/api/messaging/send-individual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(data.error || `Failed to send SMS (${res.status})`);
      }

      setSentIds(prev => ({ ...prev, [composingItem.id]: true }));
      setComposingItem(null);
    } catch (e: any) {
      setSendError(e?.message || 'Could not send via Church SMS line.');
    } finally {
      setSendingSms(false);
    }
  };

  const handleSendNativeSms = (phoneStr: string, msg: string) => {
    const cleaned = phoneStr.replace(/[^\d+]/g, '');
    if (!cleaned) return;
    const smsUri = `sms:${cleaned}?&body=${encodeURIComponent(msg)}`;
    window.open(smsUri, '_system');
  };

  const handleCopyGreeting = (item: CelebrationItem) => {
    const msg = buildGreetingMessage(item);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(prev => (prev === item.id ? null : prev)), 2500);
    }
  };

  const renderCelebrationCard = (item: CelebrationItem, badgeSubtext?: string) => {
    const phone = item.person.phone || item.person.e164Phone || '';
    const cleanedPhone = phone.replace(/[^\d+]/g, '');
    const isBirthday = item.type === 'birthday';
    const isComposingThis = composingItem?.id === item.id;
    const wasSent = !!sentIds[item.id];

    return (
      <div
        key={`${item.id}_${badgeSubtext || 'today'}`}
        className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {item.person.avatar ? (
              <img
                src={item.person.avatar}
                alt={item.person.name}
                className="w-11 h-11 rounded-full object-cover bg-slate-100 dark:bg-slate-800 shrink-0"
              />
            ) : (
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${
                  isBirthday
                    ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                    : 'bg-pink-100 dark:bg-pink-950/50 text-pink-700 dark:text-pink-300'
                }`}
              >
                {getInitials(item.person.name)}
              </div>
            )}

            <div className="min-w-0">
              <p className="text-sm font-black text-slate-900 dark:text-white truncate">
                {item.person.name}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${
                    isBirthday
                      ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/50'
                      : 'bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 border border-pink-200/60 dark:border-pink-800/50'
                  }`}
                >
                  {isBirthday ? <Cake size={11} /> : <Heart size={11} />}
                  {isBirthday ? 'Birthday' : 'Anniversary'}
                  {item.years ? ` • ${item.years} yrs` : ''}
                </span>
                {badgeSubtext && (
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                    {badgeSubtext}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={() => handleCopyGreeting(item)}
            title="Copy greeting text"
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition shrink-0"
          >
            {copiedId === item.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
          </button>
        </div>

        {/* Quick Actions: Call, Text, View Profile */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          {cleanedPhone ? (
            <a
              href={`tel:${cleanedPhone}`}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300 font-bold text-xs active:scale-95 transition"
            >
              <Phone size={14} />
              Call
            </a>
          ) : (
            <button
              disabled
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800/50 text-slate-400 dark:text-slate-600 font-bold text-xs opacity-60 cursor-not-allowed"
            >
              <Phone size={14} />
              No Phone
            </button>
          )}

          <button
            onClick={() => {
              if (cleanedPhone) {
                handleOpenTextComposer(item);
              } else {
                handleCopyGreeting(item);
              }
            }}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200/70 dark:border-violet-800/40 text-violet-700 dark:text-violet-300 font-bold text-xs active:scale-95 transition"
          >
            <MessageSquare size={14} />
            {wasSent ? 'Sent ✓' : cleanedPhone ? 'Text' : copiedId === item.id ? 'Copied!' : 'Copy'}
          </button>

          <button
            onClick={() => setViewingPerson(item.person)}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs active:scale-95 transition"
          >
            <UserIcon size={14} />
            Profile
          </button>
        </div>

        {/* Inline SMS Composer when "Text" is clicked */}
        {isComposingThis && (
          <div className="pt-3 mt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <textarea
              value={draftMessage}
              onChange={e => setDraftMessage(e.target.value)}
              rows={3}
              className="w-full p-3 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-500"
            />
            {sendError && (
              <p className="text-[11px] font-semibold text-rose-500">{sendError}</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleSendChurchSms}
                disabled={sendingSms || !draftMessage.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-bold transition"
              >
                {sendingSms ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                Send via Church Line
              </button>
              <button
                onClick={() => handleSendNativeSms(cleanedPhone, draftMessage)}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold transition"
              >
                <Smartphone size={13} />
                Device SMS
              </button>
              <button
                onClick={() => setComposingItem(null)}
                className="py-2 px-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-h-[88vh] bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 rounded-t-[2.5rem] p-6 shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-250">
        <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-5 shrink-0" />

        {viewingPerson ? (
          /* ── Person Profile View inside Modal ── */
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <button
                onClick={() => setViewingPerson(null)}
                className="flex items-center gap-1 text-xs font-bold text-violet-600 dark:text-violet-400"
              >
                <ArrowLeft size={16} />
                Back to Celebrations
              </button>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-200/70 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pb-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-3.5">
                {viewingPerson.avatar ? (
                  <img
                    src={viewingPerson.avatar}
                    alt={viewingPerson.name}
                    className="w-14 h-14 rounded-full object-cover bg-slate-100 dark:bg-slate-800 shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-300 flex items-center justify-center font-black text-base shrink-0">
                    {getInitials(viewingPerson.name)}
                  </div>
                )}
                <div className="min-w-0">
                  <h4 className="text-base font-black text-slate-900 dark:text-white truncate">
                    {viewingPerson.name}
                  </h4>
                  <p className="text-xs font-bold text-violet-600 dark:text-violet-400 mt-0.5">
                    {viewingPerson.membership || viewingPerson.status || 'Member'}
                  </p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
                {viewingPerson.phone && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                      <Phone size={13} /> Phone
                    </span>
                    <a
                      href={`tel:${viewingPerson.phone.replace(/[^\d+]/g, '')}`}
                      className="font-bold text-violet-600 dark:text-violet-400"
                    >
                      {viewingPerson.phone}
                    </a>
                  </div>
                )}
                {viewingPerson.email && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                      <Mail size={13} /> Email
                    </span>
                    <a
                      href={`mailto:${viewingPerson.email}`}
                      className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[200px]"
                    >
                      {viewingPerson.email}
                    </a>
                  </div>
                )}
                {viewingPerson.birthdate && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                      <Cake size={13} /> Birthday
                    </span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {viewingPerson.birthdate}
                    </span>
                  </div>
                )}
                {viewingPerson.anniversary && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                      <Heart size={13} /> Anniversary
                    </span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {viewingPerson.anniversary}
                    </span>
                  </div>
                )}
                {viewingPerson.addresses && viewingPerson.addresses[0] && (
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-400 font-semibold flex items-center gap-1.5 shrink-0">
                      <MapPin size={13} /> Address
                    </span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 text-right">
                      {[
                        viewingPerson.addresses[0].street,
                        viewingPerson.addresses[0].city,
                        viewingPerson.addresses[0].state,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </div>
                )}
              </div>

              {/* Recent Care Notes */}
              <div className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 px-1">
                  Recent Care Notes
                </p>
                {loadingNotes ? (
                  <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                    <Loader2 size={14} className="animate-spin" /> Loading care notes...
                  </div>
                ) : personNotes.length === 0 ? (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 text-xs text-slate-400 text-center">
                    No pastoral care notes recorded yet.
                  </div>
                ) : (
                  personNotes.map(note => (
                    <div
                      key={note.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 space-y-1"
                    >
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                        <span>{note.type} • {note.authorName}</span>
                        <span>{new Date(note.date).toLocaleDateString()}</span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-200">{note.content}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ── Main Celebrations List View ── */
          <>
            <div className="flex justify-between items-start mb-4 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                    <Sparkles size={17} />
                  </span>
                  <h3 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
                    Today&apos;s Celebrations
                  </h3>
                </div>
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mt-1">
                  {formattedToday}
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-200/70 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                <X size={16} />
              </button>
            </div>

            {/* Summary Pills */}
            <div className="flex items-center gap-2 mb-4 shrink-0">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 text-amber-700 dark:text-amber-300 text-xs font-extrabold">
                <Cake size={14} />
                <span>{birthdaysCount} {birthdaysCount === 1 ? 'Birthday' : 'Birthdays'} Today</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-pink-50 dark:bg-pink-950/30 border border-pink-200/60 dark:border-pink-800/40 text-pink-700 dark:text-pink-300 text-xs font-extrabold">
                <Heart size={14} />
                <span>{anniversariesCount} {anniversariesCount === 1 ? 'Anniversary' : 'Anniversaries'} Today</span>
              </div>
            </div>

            {/* Scrollable List */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-5 pb-6">
              {todayCelebrations.length > 0 ? (
                <div className="space-y-3">
                  {todayCelebrations.map(item => renderCelebrationCard(item))}
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                    <Cake size={22} />
                  </div>
                  <p className="text-sm font-black text-slate-800 dark:text-slate-200">
                    No Birthdays or Anniversaries Today
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Everyone celebrating in the next 7 days is listed below.
                  </p>
                </div>
              )}

              {upcomingCelebrations.length > 0 && (
                <div className="space-y-2.5 pt-2">
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1">
                    Coming Up Next 7 Days ({upcomingCelebrations.length})
                  </p>
                  <div className="space-y-2.5">
                    {upcomingCelebrations.map(({ item, dayLabel }) =>
                      renderCelebrationCard(item, `${dayLabel} (${item.formattedDate})`)
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
