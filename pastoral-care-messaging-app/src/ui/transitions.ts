/**
 * transitions.ts — directional View Transitions with graceful fallback.
 *
 * - iOS 18.2+ / Chrome 125+: startViewTransition({ update, types })
 * - iOS 18.0–18.1: startViewTransition(callback) (no direction types → cross-fade)
 * - older WebViews: the update runs immediately with no animation
 */
import { flushSync } from 'react-dom';

export type TransitionDirection = 'forward' | 'backward';

const prefersReducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Run a React state update inside a view transition. The update is flushed
 * synchronously so the browser captures the new DOM state.
 */
export function navigateWithTransition(update: () => void, direction: TransitionDirection): void {
    const doc = document as Document & { startViewTransition?: (arg: any) => unknown };
    const run = () => flushSync(update);

    if (!doc.startViewTransition || prefersReducedMotion()) {
        update();
        return;
    }
    try {
        doc.startViewTransition({ update: run, types: [direction] });
    } catch {
        // Older engines only accept a callback argument
        try {
            doc.startViewTransition(run);
        } catch {
            update();
        }
    }
}

