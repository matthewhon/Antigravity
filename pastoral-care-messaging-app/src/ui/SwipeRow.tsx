/**
 * SwipeRow — swipe a list row sideways to reveal action buttons.
 *
 * Pure CSS scroll-snap (see .SwipeRow in motion.css): the browser handles
 * momentum and snapping, actions are real <button>s, and nothing fires during
 * the swipe — the user has to tap an action. Tapping the row while it is open
 * closes it instead of activating it.
 */
import React, { useCallback, useLayoutEffect, useRef } from 'react';

export interface SwipeRowAction {
    key: string;
    label: string;
    icon?: React.ReactNode;
    /** Tailwind background class, e.g. 'bg-violet-600' */
    colorClass: string;
    onClick: () => void;
}

interface SwipeRowProps {
    leading?: SwipeRowAction[];
    trailing?: SwipeRowAction[];
    onTap?: () => void;
    children: React.ReactNode;
    className?: string;
}

export const SwipeRow: React.FC<SwipeRowProps> = ({ leading = [], trailing = [], onTap, children, className }) => {
    const rowRef = useRef<HTMLDivElement>(null);
    const leadingRef = useRef<HTMLDivElement>(null);
    const hasLeading = leading.length > 0;

    /** Scroll offset where only the content is visible */
    const restOffset = useCallback(() => (hasLeading ? leadingRef.current?.offsetWidth || 0 : 0), [hasLeading]);

    // Safari has no `scroll-initial-target`; jump past the leading panel on mount
    useLayoutEffect(() => {
        const row = rowRef.current;
        if (row && hasLeading) row.scrollTo({ left: restOffset(), behavior: 'instant' as ScrollBehavior });
    }, [hasLeading, restOffset, leading.length]);

    const close = () => rowRef.current?.scrollTo({ left: restOffset(), behavior: 'auto' });

    const handleContentClick = () => {
        const row = rowRef.current;
        if (row && Math.abs(row.scrollLeft - restOffset()) > 4) {
            close();
            return;
        }
        onTap?.();
    };

    const renderAction = (a: SwipeRowAction) => (
        <button
            key={a.key}
            type="button"
            className={`SwipeRow-action ${a.colorClass}`}
            onClick={() => { a.onClick(); close(); }}
        >
            {a.icon}
            <span>{a.label}</span>
        </button>
    );

    if (!hasLeading && trailing.length === 0) {
        return (
            <div className={className} onClick={onTap} role={onTap ? 'button' : undefined}>
                {children}
            </div>
        );
    }

    return (
        <div ref={rowRef} className={`SwipeRow ${hasLeading ? 'has-leading' : ''} ${className || ''}`}>
            {hasLeading && (
                <div ref={leadingRef} className="SwipeRow-panel is-leading" role="group" aria-label="Row actions">
                    {leading.map(renderAction)}
                </div>
            )}
            <div
                className="SwipeRow-content"
                onClick={handleContentClick}
                onFocus={e => {
                    // Keyboard focus back on the row closes the panel
                    if ((e.target as HTMLElement).matches(':focus-visible')) close();
                }}
            >
                {children}
            </div>
            {trailing.length > 0 && (
                <div className="SwipeRow-panel" role="group" aria-label="Row actions">
                    {trailing.map(renderAction)}
                </div>
            )}
        </div>
    );
};

