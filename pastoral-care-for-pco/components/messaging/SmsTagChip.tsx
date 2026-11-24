import React from 'react';
import { X } from 'lucide-react';
import { SmsTag } from '../../types';
import { TAG_COLOR_MAP } from './smsHelpers';

export const SmsTagChip: React.FC<{ tag: SmsTag; onRemove?: () => void; size?: 'sm' | 'xs' }> = ({ tag, onRemove, size = 'xs' }) => {
    const c = TAG_COLOR_MAP[tag.color] || TAG_COLOR_MAP.violet;
    const sizeClass = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-1.5 py-0.5 text-[10px]';
    return (
        <span className={`inline-flex items-center gap-1 rounded-full border font-semibold ${sizeClass} ${c.bg} ${c.text} ${c.border}`}>
            {tag.emoji && <span>{tag.emoji}</span>}
            {tag.name}
            {onRemove && (
                <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onRemove(); }}
                    title={`Remove ${tag.name} tag`}
                    className="ml-0.5 opacity-60 hover:opacity-100 transition"
                >
                    <X size={9} />
                </button>
            )}
        </span>
    );
};
