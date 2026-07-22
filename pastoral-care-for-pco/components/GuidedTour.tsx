import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';

export interface TourStep {
    /** `data-tour` attribute value of the element to spotlight. Omit for a centered step. */
    target?: string;
    title: string;
    body: string;
}

interface GuidedTourProps {
    steps: TourStep[];
    /** Called when the tour finishes or is skipped. */
    onClose: () => void;
}

interface Rect {
    top: number;
    left: number;
    width: number;
    height: number;
}

const PADDING = 8;       // spotlight breathing room around the target
const CARD_WIDTH = 340;  // tooltip width
const GAP = 14;          // gap between spotlight and tooltip

const findTarget = (target?: string): HTMLElement | null =>
    target ? document.querySelector<HTMLElement>(`[data-tour="${target}"]`) : null;

const GuidedTour: React.FC<GuidedTourProps> = ({ steps, onClose }) => {
    const [index, setIndex] = useState(0);
    const [rect, setRect] = useState<Rect | null>(null);

    const step = steps[index];
    const isFirst = index === 0;
    const isLast = index === steps.length - 1;

    const measure = useCallback(() => {
        const el = findTarget(step?.target);
        if (!el) {
            setRect(null);
            return;
        }
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }, [step?.target]);

    // Scroll the target into view, then measure once it settles.
    useLayoutEffect(() => {
        const el = findTarget(step?.target);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        // Measure immediately and again after the smooth scroll finishes.
        measure();
        const t = window.setTimeout(measure, 350);
        return () => window.clearTimeout(t);
    }, [index, measure, step?.target]);

    // Keep the spotlight aligned while the page scrolls or resizes.
    useEffect(() => {
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        return () => {
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
        };
    }, [measure]);

    // Keyboard navigation.
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowRight' || e.key === 'Enter') {
                isLast ? onClose() : setIndex(i => Math.min(i + 1, steps.length - 1));
            } else if (e.key === 'ArrowLeft') {
                setIndex(i => Math.max(i - 1, 0));
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isLast, onClose, steps.length]);

    if (!step) return null;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // --- Spotlight cutout ---
    const spotlight: React.CSSProperties | null = rect
        ? {
              position: 'fixed',
              top: rect.top - PADDING,
              left: rect.left - PADDING,
              width: rect.width + PADDING * 2,
              height: rect.height + PADDING * 2,
              borderRadius: 20,
              boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.6)',
              transition: 'all 0.3s ease',
              pointerEvents: 'none',
              zIndex: 1,
          }
        : null;

    // --- Tooltip card position ---
    let cardStyle: React.CSSProperties;
    if (!rect) {
        cardStyle = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: CARD_WIDTH };
    } else {
        const spaceBelow = vh - (rect.top + rect.height);
        const placeBelow = spaceBelow > 220 || spaceBelow > rect.top;
        const top = placeBelow ? rect.top + rect.height + PADDING + GAP : Math.max(GAP, rect.top - PADDING - GAP - 200);
        let left = rect.left + rect.width / 2 - CARD_WIDTH / 2;
        left = Math.max(GAP, Math.min(left, vw - CARD_WIDTH - GAP));
        cardStyle = { position: 'fixed', top, left, width: CARD_WIDTH };
    }

    return (
        <div className="fixed inset-0 z-[300]" role="dialog" aria-modal="true">
            {/* Backdrop — dims everything when there is no spotlight target */}
            {!rect && <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]" />}

            {/* Spotlight ring */}
            {spotlight && (
                <>
                    <div style={spotlight} />
                    <div
                        style={{
                            position: 'fixed',
                            top: rect!.top - PADDING,
                            left: rect!.left - PADDING,
                            width: rect!.width + PADDING * 2,
                            height: rect!.height + PADDING * 2,
                            borderRadius: 20,
                            border: '2px solid rgb(129, 140, 248)',
                            transition: 'all 0.3s ease',
                            pointerEvents: 'none',
                            zIndex: 2,
                        }}
                    />
                </>
            )}

            {/* Tooltip card */}
            <div
                style={{ ...cardStyle, zIndex: 3 }}
                className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            >
                <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
                <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                        <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">{step.title}</h3>
                        <button
                            onClick={onClose}
                            className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex-shrink-0 mt-1"
                        >
                            Skip
                        </button>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">{step.body}</p>

                    <div className="flex items-center justify-between mt-5">
                        {/* Progress dots */}
                        <div className="flex items-center gap-1.5">
                            {steps.map((_, i) => (
                                <div
                                    key={i}
                                    className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-indigo-500' : 'w-1.5 bg-slate-200 dark:bg-slate-700'}`}
                                />
                            ))}
                        </div>

                        <div className="flex items-center gap-2">
                            {!isFirst && (
                                <button
                                    onClick={() => setIndex(i => Math.max(i - 1, 0))}
                                    className="px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                >
                                    Back
                                </button>
                            )}
                            <button
                                onClick={() => (isLast ? onClose() : setIndex(i => Math.min(i + 1, steps.length - 1)))}
                                className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-black uppercase tracking-wide shadow-lg hover:shadow-indigo-500/30 transition-all"
                            >
                                {isLast ? 'Finish' : 'Next'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GuidedTour;
