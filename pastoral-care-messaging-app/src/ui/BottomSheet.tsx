/**
 * BottomSheet — iOS-style sheet on top of the native <dialog> element.
 *
 * showModal() gives us the top layer, an inert page behind, focus handling,
 * Esc / Android back dismissal, and focus return for free. The slide-up uses
 * @starting-style (motion.css). Dragging the grab handle down dismisses.
 * Falls back to a fixed overlay on WebViews without <dialog> (iOS 15.0–15.3).
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { useBackHandler } from './backButton';

interface BottomSheetProps {
    open: boolean;
    onClose: () => void;
    title?: string;
    /** Shown on the right of the header (e.g. a Create button) */
    headerAction?: React.ReactNode;
    children: React.ReactNode;
    /** Return false to keep the sheet open (e.g. unsaved changes) */
    canClose?: () => boolean;
}

const supportsDialog = () =>
    typeof HTMLDialogElement === 'function' && 'showModal' in HTMLDialogElement.prototype;

export const BottomSheet: React.FC<BottomSheetProps> = ({ open, onClose, title, headerAction, children, canClose }) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const titleId = useId();
    const [dragY, setDragY] = useState(0);
    const drag = useRef<{ startY: number; startT: number } | null>(null);
    const nativeDialog = supportsDialog();

    useEffect(() => {
        const d = dialogRef.current;
        if (!d || !nativeDialog) return;
        if (open && !d.open) d.showModal();
        if (!open && d.open) d.close();
    }, [open, nativeDialog]);

    const requestClose = () => {
        if (canClose && !canClose()) return;
        onClose();
    };

    // Android back button closes the sheet (honours canClose)
    useBackHandler(open, () => { requestClose(); return true; });

    // Drag-to-dismiss on the grab handle / header only (keeps content scrollable)
    const onPointerDown = (e: React.PointerEvent) => {
        drag.current = { startY: e.clientY, startT: performance.now() };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: React.PointerEvent) => {
        if (!drag.current) return;
        setDragY(Math.max(0, e.clientY - drag.current.startY));
    };
    const onPointerUp = (e: React.PointerEvent) => {
        if (!drag.current) return;
        const dy = Math.max(0, e.clientY - drag.current.startY);
        const velocity = dy / Math.max(1, performance.now() - drag.current.startT);
        drag.current = null;
        setDragY(0);
        if (dy > 120 || velocity > 0.6) requestClose();
    };

    const panel = (
        <div
            ref={panelRef}
            className="bg-white dark:bg-slate-900 rounded-t-[20px] sm:rounded-[20px] shadow-2xl flex flex-col max-h-[inherit] w-full text-left"
            style={{
                transform: dragY ? `translateY(${dragY}px)` : undefined,
                transition: dragY ? 'none' : 'transform 0.25s var(--ease-ios)',
                paddingBottom: 'env(safe-area-inset-bottom)',
                maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 24px)',
            }}
        >
            <div
                className="shrink-0 touch-none cursor-grab select-none"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
            >
                <div className="mx-auto mt-2 mb-1 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
                {(title || headerAction) && (
                    <div className="flex items-center justify-between gap-2 px-4 pt-1 pb-3 border-b border-slate-100 dark:border-slate-800">
                        <button
                            type="button"
                            onClick={requestClose}
                            className="text-[15px] text-violet-600 dark:text-violet-400 font-medium min-w-[64px] text-left"
                        >
                            Cancel
                        </button>
                        <h2 id={titleId} className="!m-0 !text-[16px] !font-bold text-slate-900 dark:text-white truncate">{title}</h2>
                        <div className="min-w-[64px] flex justify-end">{headerAction}</div>
                    </div>
                )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</div>
        </div>
    );

    if (!nativeDialog) {
        if (!open) return null;
        return (
            <div className="BottomSheet-fallback" role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined}
                onClick={e => { if (e.target === e.currentTarget) requestClose(); }}>
                <div className="w-full sm:max-w-[520px]">{panel}</div>
            </div>
        );
    }

    return (
        <dialog
            ref={dialogRef}
            className="BottomSheet"
            aria-labelledby={title ? titleId : undefined}
            onCancel={e => { e.preventDefault(); requestClose(); }}
            onClose={() => { if (open) onClose(); }}
            onClick={e => {
                // Light dismiss: tap on the backdrop (outside the panel)
                const r = panelRef.current?.getBoundingClientRect();
                if (r && (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right)) requestClose();
            }}
        >
            {open && panel}
        </dialog>
    );
};

