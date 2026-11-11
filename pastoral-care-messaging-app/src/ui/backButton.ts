/**
 * backButton.ts — Android hardware/gesture back button routing.
 *
 * Open layers (sheets, photo viewer, drill-down screens, modals) register a
 * handler while they are open. On back, handlers run newest-first; the first
 * one that returns true "consumes" the press. If nothing handles it, the app
 * falls back to route navigation, then minimizes (like a native Android app).
 *
 *   useBackHandler(isOpen, () => { close(); return true; });
 *
 * iOS has no back button, so registration is harmless there.
 */
import { useEffect, useRef } from 'react';

type BackHandler = () => boolean;

let nextId = 1;
const handlers: { id: number; fn: BackHandler }[] = [];

export function pushBackHandler(fn: BackHandler): () => void {
    const id = nextId++;
    handlers.push({ id, fn });
    return () => {
        const i = handlers.findIndex(h => h.id === id);
        if (i >= 0) handlers.splice(i, 1);
    };
}

/** Run handlers newest-first. Returns true if one consumed the back press. */
export function runBackHandlers(): boolean {
    for (let i = handlers.length - 1; i >= 0; i--) {
        try {
            if (handlers[i].fn()) return true;
        } catch (e) {
            console.warn('[BackButton] handler failed', e);
        }
    }
    return false;
}

/**
 * Register `onBack` while `active` is true. Return false from `onBack` to let
 * the press fall through (e.g. when the component is currently hidden).
 * Registration order is stable across re-renders, so the most recently
 * opened layer always wins.
 */
export function useBackHandler(active: boolean, onBack: () => boolean | void): void {
    const ref = useRef(onBack);
    ref.current = onBack;
    useEffect(() => {
        if (!active) return;
        return pushBackHandler(() => ref.current() !== false);
    }, [active]);
}

/** True if the element is actually rendered (not inside a display:none tab). */
export const isRendered = (el: HTMLElement | null | undefined): boolean =>
    !!el && el.getClientRects().length > 0;

