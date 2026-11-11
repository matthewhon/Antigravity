import React, { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { TeamChannel, TeamChatArea } from '../../types';
import { useTeamChat } from '../../contexts/TeamChatContext';
import { canReadArea } from '../../services/chatPermissions';
import { BottomSheet } from '../../ui/BottomSheet';
import { Avatar } from './chatUtils';

const ICONS = ['💬', '🙏', '🕊️', '🎵', '📂', '💰', '📣', '⛪', '🎉', '🧒', '🍽️', '🛠️'];

const AREAS: { id: TeamChatArea; label: string }[] = [
    { id: 'care', label: 'Pastoral Care' },
    { id: 'giving', label: 'Giving & Finance' },
    { id: 'services', label: 'Services' },
    { id: 'groups', label: 'Groups' },
    { id: 'people', label: 'People' },
];

type Mode = 'dm' | 'channel';
type Audience = 'all' | 'invite' | TeamChatArea;

export const NewConversationSheet: React.FC<{
    open: boolean;
    onClose: () => void;
    onCreated: (channel: TeamChannel) => void;
}> = ({ open, onClose, onCreated }) => {
    const { churchUsers, currentUser, startDirectMessage, createCustomChannel } = useTeamChat();
    const [mode, setMode] = useState<Mode>('dm');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [icon, setIcon] = useState('💬');
    const [audience, setAudience] = useState<Audience>('all');
    const [busy, setBusy] = useState(false);

    const teammates = useMemo(() => {
        const q = search.trim().toLowerCase();
        return churchUsers
            .filter(u => u.id !== currentUser.id)
            .filter(u => !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [churchUsers, currentUser.id, search]);

    const allowedAreas = AREAS.filter(a => canReadArea(currentUser, a.id));

    const reset = () => {
        setSearch(''); setSelected([]); setName(''); setDescription(''); setIcon('💬'); setAudience('all'); setMode('dm');
    };
    const close = () => { reset(); onClose(); };
    const dirty = selected.length > 0 || name.trim().length > 0;

    const toggle = (id: string) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    const canSubmit = !busy && (mode === 'dm' ? selected.length > 0 : name.trim().length > 1 && (audience !== 'invite' || selected.length > 0));

    const submit = async () => {
        if (!canSubmit) return;
        setBusy(true);
        try {
            let channel: TeamChannel | null;
            if (mode === 'dm') {
                channel = await startDirectMessage(churchUsers.filter(u => selected.includes(u.id)));
            } else {
                const area = audience !== 'all' && audience !== 'invite' ? audience : undefined;
                channel = await createCustomChannel({
                    name: name.trim(),
                    description: description.trim() || undefined,
                    icon,
                    requiredArea: area,
                    participantIds: audience === 'invite' ? selected : [],
                    isAutoJoinedByRole: audience !== 'invite',
                });
            }
            if (channel) { reset(); onCreated(channel); }
        } catch {
            alert('Could not create the conversation. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    const peoplePicker = (
        <>
            <div className="relative px-4 pt-3">
                <Search size={16} className="absolute left-7 top-1/2 translate-y-[-25%] text-slate-400" />
                <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search staff"
                    aria-label="Search staff"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-[16px] text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
            <ul className="mt-2">
                {teammates.map(u => {
                    const on = selected.includes(u.id);
                    return (
                        <li key={u.id}>
                            <button type="button" onClick={() => toggle(u.id)} aria-pressed={on}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-slate-100 dark:active:bg-slate-800">
                                <Avatar name={u.name} id={u.id} size={38} />
                                <span className="flex-1 min-w-0">
                                    <span className="block text-[15px] font-semibold text-slate-900 dark:text-white truncate">{u.name}</span>
                                    <span className="block text-[12px] text-slate-500 truncate">{(u.roles || []).slice(0, 3).join(' · ')}</span>
                                </span>
                                <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${on ? 'bg-violet-600 border-violet-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                                    {on && <Check size={14} strokeWidth={3} />}
                                </span>
                            </button>
                        </li>
                    );
                })}
                {teammates.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-slate-400">No staff found</li>}
            </ul>
        </>
    );

    return (
        <BottomSheet
            open={open}
            onClose={close}
            canClose={() => !dirty || window.confirm('Discard this new conversation?')}
            title={mode === 'dm' ? 'New Message' : 'New Channel'}
            headerAction={
                <button type="button" onClick={submit} disabled={!canSubmit}
                    className="text-[15px] font-bold text-violet-600 dark:text-violet-400 disabled:opacity-40">
                    {mode === 'dm' ? 'Start' : 'Create'}
                </button>
            }
        >
            <div className="px-4 pt-3">
                <div role="tablist" className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                    {(['dm', 'channel'] as Mode[]).map(m => (
                        <button key={m} role="tab" aria-selected={mode === m} type="button" onClick={() => setMode(m)}
                            className={`py-1.5 rounded-lg text-[13px] font-bold transition ${mode === m ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}>
                            {m === 'dm' ? 'Direct Message' : 'Channel'}
                        </button>
                    ))}
                </div>
            </div>

            {mode === 'dm' ? (
                <div className="pb-4">
                    {selected.length > 1 && <p className="px-4 pt-2 text-[12px] text-slate-500">Group message with {selected.length} people</p>}
                    {peoplePicker}
                </div>
            ) : (
                <div className="pb-6">
                    <div className="px-4 pt-4 space-y-3">
                        <label className="block">
                            <span className="text-[12px] font-bold uppercase tracking-wider text-slate-500">Name</span>
                            <div className="mt-1 flex items-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 px-3">
                                <span className="text-slate-400">#</span>
                                <input value={name} onChange={e => setName(e.target.value)} placeholder="youth-ministry" maxLength={40}
                                    className="flex-1 py-2.5 bg-transparent outline-none text-[16px] text-slate-900 dark:text-white" />
                            </div>
                        </label>
                        <label className="block">
                            <span className="text-[12px] font-bold uppercase tracking-wider text-slate-500">Description (optional)</span>
                            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this channel for?"
                                className="mt-1 w-full rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2.5 outline-none text-[16px] text-slate-900 dark:text-white" />
                        </label>
                        <div>
                            <span className="text-[12px] font-bold uppercase tracking-wider text-slate-500">Icon</span>
                            <div className="mt-1 flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                                {ICONS.map(i => (
                                    <button key={i} type="button" onClick={() => setIcon(i)} aria-pressed={icon === i}
                                        className={`shrink-0 w-10 h-10 rounded-xl text-[20px] ${icon === i ? 'bg-violet-100 ring-2 ring-violet-500 dark:bg-violet-900/40' : 'bg-slate-100 dark:bg-slate-800'}`}>
                                        {i}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <span className="text-[12px] font-bold uppercase tracking-wider text-slate-500">Who can see it</span>
                            <div className="mt-1 rounded-xl bg-slate-100 dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700 overflow-hidden">
                                {([
                                    { id: 'all', label: 'All staff' },
                                    { id: 'invite', label: 'Only people I add' },
                                    ...allowedAreas.map(a => ({ id: a.id, label: `${a.label} staff only` })),
                                ] as { id: Audience; label: string }[]).map(opt => (
                                    <button key={opt.id} type="button" onClick={() => setAudience(opt.id)} aria-pressed={audience === opt.id}
                                        className="w-full flex items-center justify-between px-3 py-2.5 text-left text-[15px] text-slate-800 dark:text-slate-100">
                                        {opt.label}
                                        {audience === opt.id && <Check size={17} className="text-violet-600" strokeWidth={3} />}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    {audience === 'invite' && peoplePicker}
                </div>
            )}
        </BottomSheet>
    );
};

