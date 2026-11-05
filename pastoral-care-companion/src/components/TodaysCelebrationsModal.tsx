import React, { useState, useMemo } from 'react';
import { PcoPerson } from '../types';
import { CelebrationItem, getCelebrationsForDate } from '../services/celebrationNotifications';
import { X, Phone, MessageSquare, User as UserIcon, Cake, Heart, Sparkles, Copy, Check } from 'lucide-react';

interface TodaysCelebrationsModalProps {
  people: PcoPerson[];
  churchName: string;
  currentUserName?: string;
  onClose: () => void;
  onSelectPerson: (person: PcoPerson) => void;
}

export const TodaysCelebrationsModal: React.FC<TodaysCelebrationsModalProps> = ({
  people,
  churchName,
  currentUserName,
  onClose,
  onSelectPerson,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const todayCelebrations = useMemo(() => getCelebrationsForDate(people, today), [people, today]);

  // Also compute upcoming celebrations (next 7 days) so the user can see what's coming up
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
    const sender = currentUserName ? `${currentUserName} from ${churchName}` : churchName;
    if (item.type === 'birthday') {
      return `Happy Birthday, ${firstName}! 🎂 Sending warm wishes from ${sender}. We are so grateful for you and are praying for a blessed year ahead!`;
    }
    return `Happy Anniversary, ${firstName}! 💍 Wishing you a joyful day of celebration from ${sender}. Praying continued blessings over your marriage and family!`;
  };

  const handleTextPerson = (item: CelebrationItem) => {
    const msg = buildGreetingMessage(item);
    const rawPhone = item.person.phone || item.person.e164Phone || '';
    const cleaned = rawPhone.replace(/[^\d+]/g, '');
    if (cleaned) {
      const smsUri = `sms:${cleaned}?&body=${encodeURIComponent(msg)}`;
      window.open(smsUri, '_system');
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(msg);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(prev => (prev === item.id ? null : prev)), 2500);
    }
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

    return (
      <div
        key={`${item.id}_${badgeSubtext || 'today'}`}
        className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-2xl p-4 shadow-sm space-y-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {item.person.avatar ? (
              <img
                src={item.person.avatar}
                alt={item.person.name}
                className="w-11 h-11 rounded-full object-cover bg-slate-100 dark:bg-zinc-800 shrink-0"
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
                  <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500">
                    {badgeSubtext}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={() => handleCopyGreeting(item)}
            title="Copy greeting text"
            className="p-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700 transition shrink-0"
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
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-zinc-800/50 text-slate-400 dark:text-zinc-600 font-bold text-xs opacity-60 cursor-not-allowed"
            >
              <Phone size={14} />
              No Phone
            </button>
          )}

          <button
            onClick={() => handleTextPerson(item)}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-800/40 text-indigo-700 dark:text-indigo-300 font-bold text-xs active:scale-95 transition"
          >
            <MessageSquare size={14} />
            {cleanedPhone ? 'Text' : copiedId === item.id ? 'Copied!' : 'Copy Text'}
          </button>

          <button
            onClick={() => {
              onClose();
              onSelectPerson(item.person);
            }}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 font-bold text-xs active:scale-95 transition"
          >
            <UserIcon size={14} />
            Profile
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-h-[88vh] bg-slate-50 dark:bg-zinc-950 border-t border-slate-200 dark:border-zinc-800 rounded-t-[2.5rem] p-6 shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-250">
        <div className="w-12 h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-full mx-auto mb-5 shrink-0" />

        {/* Modal Header */}
        <div className="flex justify-between items-start mb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Sparkles size={17} />
              </span>
              <h3 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
                Today&apos;s Celebrations
              </h3>
            </div>
            <p className="text-xs font-bold text-slate-400 dark:text-zinc-500 mt-1">
              {formattedToday}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200/70 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-700"
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

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-5 pb-6">
          {todayCelebrations.length > 0 ? (
            <div className="space-y-3">
              {todayCelebrations.map(item => renderCelebrationCard(item))}
            </div>
          ) : (
            <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-2xl p-6 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-zinc-800 text-slate-400 flex items-center justify-center mx-auto">
                <Cake size={22} />
              </div>
              <p className="text-sm font-black text-slate-800 dark:text-zinc-200">
                No Birthdays or Anniversaries Today
              </p>
              <p className="text-xs text-slate-400 dark:text-zinc-500">
                Everyone celebrating in the next 7 days is listed below.
              </p>
            </div>
          )}

          {upcomingCelebrations.length > 0 && (
            <div className="space-y-2.5 pt-2">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500 px-1">
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
      </div>
    </div>
  );
};
