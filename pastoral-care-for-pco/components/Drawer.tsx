import React from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}

export const Drawer: React.FC<DrawerProps> = ({ isOpen, onClose, title, children, width }) => {
  const widthClasses = width || 'w-full max-w-[440px] sm:max-w-[520px] md:max-w-[560px]';

  return (
    <div className={`fixed inset-0 z-50 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />
      <div className={`absolute top-0 left-0 h-full ${widthClasses} bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xl transform transition-transform duration-300 ease-out flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 className="text-lg font-bold truncate pr-2">{title}</h2>
          <button 
            onClick={onClose} 
            aria-label="Close drawer"
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer shrink-0"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto overflow-x-hidden flex-1 space-y-6">
          {children}
        </div>
      </div>
    </div>
  );
};

