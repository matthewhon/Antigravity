import React from 'react';
import { X } from 'lucide-react';

export const Toast: React.FC<{ msg: string; type: 'success' | 'error'; onClose: () => void }> = ({ msg, type, onClose }) => (
    <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold text-white transition-all ${type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
        {msg}
        <button onClick={onClose} title="Close notification" className="ml-1 opacity-70 hover:opacity-100"><X size={14} /></button>
    </div>
);
