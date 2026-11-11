/**
 * ImageViewer — full-screen photo viewer rendered in the top layer via
 * <dialog>.showModal(), so it is never clipped or offset by transformed
 * ancestors (e.g. SwipeStack screens during swipe-back).
 */
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useBackHandler } from './backButton';

export const ImageViewer: React.FC<{ url: string | null; onClose: () => void }> = ({ url, onClose }) => {
    const ref = useRef<HTMLDialogElement>(null);
    const native = typeof HTMLDialogElement === 'function' && 'showModal' in HTMLDialogElement.prototype;

    useEffect(() => {
        const d = ref.current;
        if (!d || !native) return;
        if (url && !d.open) d.showModal();
        if (!url && d.open) d.close();
    }, [url, native]);

    // Android back button closes the photo
    useBackHandler(!!url, () => { onClose(); return true; });

    const content = url && (
        <div className="w-full h-full flex items-center justify-center bg-black" onClick={onClose}>
            <img src={url} alt="Shared photo" className="max-w-full max-h-full object-contain" onClick={e => e.stopPropagation()} />
            <button type="button" aria-label="Close photo" onClick={onClose}
                className="absolute right-4 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center backdrop-blur"
                style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
                <X size={22} />
            </button>
            <a href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                className="absolute left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-white/15 text-white text-[13px] font-semibold backdrop-blur"
                style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
                Open original
            </a>
        </div>
    );

    if (!native) {
        return url ? <div className="fixed inset-0 z-[300]">{content}</div> : null;
    }
    return (
        <dialog ref={ref} onClose={onClose} aria-label="Photo"
            className="m-0 p-0 w-screen h-[100dvh] max-w-none max-h-none bg-black border-0 backdrop:bg-black">
            {content}
        </dialog>
    );
};

