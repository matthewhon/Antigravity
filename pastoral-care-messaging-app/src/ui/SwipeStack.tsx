/**
 * SwipeStack — full-screen drill-down navigation with native swipe-back.
 *
 * Each screen is one CSS scroll-snap stop in a horizontal scroller, so the
 * user's finger drives the swipe-back directly (momentum, interruption and
 * velocity come from the browser's scroll engine — no touch-tracking JS).
 *
 *   <SwipeStack ref={stackRef} views={[listView, threadView]} onPop={n => …} />
 *
 * - Appending a view smooth-scrolls to it ("push").
 * - Swiping back (or stackRef.current.back()) settles on an earlier view and
 *   calls onPop(newLength) so the parent can drop the views it left behind.
 * - Views that are not on screen are `inert` (no focus / screen-reader leaks).
 * - Parallax/dim/shadow: CSS scroll-driven animation where supported
 *   (motion.css), otherwise a lightweight scroll-listener fallback.
 */
import React, {
    forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState,
} from 'react';
import { isRendered, useBackHandler } from './backButton';

export interface SwipeStackView {
    key: string;
    node: React.ReactNode;
}

export interface SwipeStackHandle {
    /** Animate back one screen (same path as a swipe). */
    back: () => void;
}

interface SwipeStackProps {
    views: SwipeStackView[];
    /** Called after the user lands on an earlier view; drop views past newLength. */
    onPop: (newLength: number) => void;
    className?: string;
}

const supportsScrollTimeline = () =>
    typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline: view()');

export const SwipeStack = forwardRef<SwipeStackHandle, SwipeStackProps>(({ views, onPop, className }, ref) => {
    const stackRef = useRef<HTMLDivElement>(null);
    const [activeIndex, setActiveIndex] = useState(views.length - 1);
    const prevLength = useRef(views.length);
    const onPopRef = useRef(onPop);
    onPopRef.current = onPop;
    const viewsLengthRef = useRef(views.length);
    viewsLengthRef.current = views.length;
    const pushingRef = useRef(false);
    const pushTimer = useRef<number | undefined>(undefined);

    const scrollToIndex = useCallback((idx: number, behavior: ScrollBehavior) => {
        const el = stackRef.current;
        if (!el) return;
        el.scrollTo({ left: idx * el.clientWidth, behavior });
    }, []);

    /** Animate back one screen (same path as a swipe). */
    const goBack = useCallback(() => {
        const target = Math.max(0, viewsLengthRef.current - 2);
        scrollToIndex(target, 'auto');
        // Fallback in case the observer misses the settle (e.g. reduced motion jump)
        window.setTimeout(() => {
            const el = stackRef.current;
            if (!el) return;
            const idx = Math.round(el.scrollLeft / (el.clientWidth || 1));
            if (idx < viewsLengthRef.current - 1) onPopRef.current(idx + 1);
        }, 600);
    }, [scrollToIndex]);

    // Initial position (deep link straight into a thread): no animation
    useLayoutEffect(() => {
        scrollToIndex(views.length - 1, 'instant' as ScrollBehavior);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Push / programmatic pop when the parent changes the view list
    useLayoutEffect(() => {
        const prev = prevLength.current;
        prevLength.current = views.length;
        if (views.length > prev) {
            // Ignore "earlier view is visible" signals until the push settles,
            // otherwise the observer would immediately pop the new screen.
            pushingRef.current = true;
            window.clearTimeout(pushTimer.current);
            pushTimer.current = window.setTimeout(() => { pushingRef.current = false; }, 900);
            // 'auto' defers to CSS scroll-behavior (smooth unless reduced motion)
            requestAnimationFrame(() => scrollToIndex(views.length - 1, 'auto'));
        } else if (views.length < prev) {
            // Parent removed views (e.g. after a pop) — make sure we sit on the last one
            const el = stackRef.current;
            if (el && Math.round(el.scrollLeft / el.clientWidth) > views.length - 1) {
                scrollToIndex(views.length - 1, 'instant' as ScrollBehavior);
            }
            setActiveIndex(views.length - 1);
        }
    }, [views.length, scrollToIndex]);

    // Detect the settled view. Safari has no `scrollsnapchange`, so we use an
    // IntersectionObserver for "fully visible view" everywhere.
    useEffect(() => {
        const el = stackRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (entry.intersectionRatio < 0.98) continue;
                const idx = Number((entry.target as HTMLElement).dataset.index);
                const last = viewsLengthRef.current - 1;
                if (pushingRef.current) {
                    if (idx === last) { pushingRef.current = false; setActiveIndex(idx); }
                    continue;
                }
                setActiveIndex(idx);
                if (idx < last) onPopRef.current(idx + 1);
            }
        }, { root: el, threshold: [0.98] });
        Array.from(el.children).forEach(child => observer.observe(child));
        return () => observer.disconnect();
    }, [views.length]);

    // Parallax fallback for WebViews without scroll-driven animations (iOS < 26)
    useEffect(() => {
        const el = stackRef.current;
        if (!el || supportsScrollTimeline()) return;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
        let frame = 0;
        const apply = () => {
            frame = 0;
            const w = el.clientWidth || 1;
            Array.from(el.children).forEach((view, i) => {
                const content = (view as HTMLElement).firstElementChild as HTMLElement | null;
                if (!content) return;
                // 0 when centered, 1 when fully scrolled off to the left
                const progress = Math.min(1, Math.max(0, (el.scrollLeft - i * w) / w));
                content.style.transform = progress > 0 ? `translateX(${progress * 70}%)` : '';
                content.style.filter = progress > 0 ? `brightness(${1 - progress * 0.15})` : '';
                if (i > 0) {
                    const entering = Math.min(1, Math.max(0, 1 - Math.abs(el.scrollLeft - i * w) / w));
                    content.style.boxShadow = entering > 0 && entering < 1 ? '-4px 0 24px rgba(0,0,0,0.18)' : '';
                }
            });
        };
        const onScroll = () => { if (!frame) frame = requestAnimationFrame(apply); };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            el.removeEventListener('scroll', onScroll);
            if (frame) cancelAnimationFrame(frame);
        };
    }, []);

    // Keep the current view aligned when the scroller is resized or re-shown
    // (rotation, keyboard, or a parent toggling display:none for tab switches).
    // ResizeObserver runs before IntersectionObserver in a frame, so suppressing
    // pops here stops a reset scroll offset from being mistaken for a swipe-back.
    useEffect(() => {
        const el = stackRef.current;
        if (!el) return;
        let lastWidth = el.clientWidth;
        const realign = () => {
            const w = el.clientWidth;
            if (w > 0 && w !== lastWidth) {
                pushingRef.current = true;
                window.clearTimeout(pushTimer.current);
                pushTimer.current = window.setTimeout(() => { pushingRef.current = false; }, 400);
                scrollToIndex(viewsLengthRef.current - 1, 'instant' as ScrollBehavior);
            }
            lastWidth = w;
        };
        if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(realign);
            ro.observe(el);
            return () => ro.disconnect();
        }
        window.addEventListener('resize', realign);
        return () => window.removeEventListener('resize', realign);
    }, [scrollToIndex]);

    useImperativeHandle(ref, () => ({
        back: goBack,
    }), [goBack]);

    // Android back button: pop one screen, but only if this stack is on screen
    // (a stack inside a hidden tab must let the press fall through).
    useBackHandler(views.length > 1, () => {
        if (!isRendered(stackRef.current)) return false;
        goBack();
        return true;
    });

    return (
        <div ref={stackRef} className={`SwipeStack ${className || ''}`}>
            {views.map((v, i) => (
                <div
                    key={v.key}
                    data-index={i}
                    className="SwipeStack-view"
                    inert={i !== activeIndex ? true : undefined}
                    aria-hidden={i !== activeIndex ? true : undefined}
                >
                    <div className="SwipeStack-viewContent">{v.node}</div>
                </div>
            ))}
        </div>
    );
});
SwipeStack.displayName = 'SwipeStack';
