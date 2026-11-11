import React from 'react';
import { Bot } from 'lucide-react';

/** Day/time helpers shared by the Team Chat screens */
export function formatListTime(ts: number): string {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (ts >= startOfToday) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (ts >= startOfToday - 86_400_000) return 'Yesterday';
    if (ts >= startOfToday - 6 * 86_400_000) return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatDaySeparator(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (ts >= startOfToday) return 'Today';
    if (ts >= startOfToday - 86_400_000) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

export const formatClock = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export const isSameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

const AVATAR_COLORS = [
    'bg-violet-500', 'bg-indigo-500', 'bg-sky-500', 'bg-emerald-500',
    'bg-amber-500', 'bg-rose-500', 'bg-fuchsia-500', 'bg-teal-500',
];

export function colorFor(seed: string): string {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export const initials = (name: string) =>
    name.replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || '?';

export const Avatar: React.FC<{
    name: string;
    id?: string;
    src?: string | null;
    size?: number;
    isAi?: boolean;
    className?: string;
}> = ({ name, id, src, size = 36, isAi, className = '' }) => {
    const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
    if (isAi) {
        return (
            <span style={style} className={`shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center ${className}`}>
                <Bot size={Math.round(size * 0.55)} />
            </span>
        );
    }
    if (src) {
        return <img src={src} alt="" style={style} className={`shrink-0 rounded-full object-cover ${className}`} />;
    }
    return (
        <span style={style} className={`shrink-0 rounded-full text-white font-bold flex items-center justify-center ${colorFor(id || name)} ${className}`}>
            {initials(name)}
        </span>
    );
};

