import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Drawer } from './Drawer';
import { EmailBlock } from './EmailBuilder';
import { UploadCloud, Link2, Image as ImageIcon, Video, X, CheckCircle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  block: EmailBlock | null;
  onUpdate: (id: string, content: any) => void;
}

const isImage = (block: EmailBlock | null) => block?.type === 'image';

export const MediaEditorDrawer: React.FC<Props> = ({ isOpen, onClose, block, onUpdate }) => {
  const [src, setSrc] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [tab, setTab] = useState<'upload' | 'url'>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (block) {
      const s = block.content.src || '';
      setSrc(s);
      setUrlInput(s.startsWith('data:') ? '' : s);
      setFileName('');
    }
  }, [block?.id]);

  const applyFile = useCallback((file: File) => {
    if (!block) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const b64 = reader.result as string;
      setSrc(b64);
      setFileName(file.name);
      onUpdate(block.id, { ...block.content, src: b64, alt: file.name });
    };
    reader.readAsDataURL(file);
  }, [block, onUpdate]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) applyFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) applyFile(file);
  };

  const handleUrlApply = () => {
    if (!block || !urlInput.trim()) return;
    setSrc(urlInput.trim());
    onUpdate(block.id, { ...block.content, src: urlInput.trim() });
  };

  const clearImage = () => {
    setSrc('');
    setUrlInput('');
    setFileName('');
    if (block) onUpdate(block.id, { ...block.content, src: '' });
  };

  const type = isImage(block) ? 'Image' : 'Video';

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={`Edit ${type}`}>
      <div className="space-y-5">

        {/* Tabs — only for images */}
        {isImage(block) && (
          <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            {(['upload', 'url'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                  tab === t ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {t === 'upload' ? <UploadCloud size={13} /> : <Link2 size={13} />}
                {t === 'upload' ? 'Upload' : 'URL'}
              </button>
            ))}
          </div>
        )}

        {/* Upload zone */}
        {isImage(block) && tab === 'upload' && (
          <div>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-2xl cursor-pointer transition ${
                isDragging
                  ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                  : 'border-slate-200 dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <div className={`p-3 rounded-2xl ${isDragging ? 'bg-indigo-100 dark:bg-indigo-900/40' : 'bg-slate-100 dark:bg-slate-800'}`}>
                <UploadCloud size={24} className={isDragging ? 'text-indigo-500' : 'text-slate-400'} />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {isDragging ? 'Drop to upload' : 'Click or drag & drop'}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">PNG, JPG, GIF, WebP supported</p>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            {fileName && (
              <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mt-2">
                <CheckCircle size={12} /> {fileName}
              </p>
            )}
          </div>
        )}

        {/* Video URL input (always) or Image URL tab */}
        {(!isImage(block) || tab === 'url') && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
              {isImage(block) ? 'Image URL' : 'Video URL'}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleUrlApply()}
                placeholder={isImage(block) ? 'https://example.com/photo.jpg' : 'https://youtube.com/watch?v=…'}
                className="flex-1 text-sm px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleUrlApply}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition"
              >
                Apply
              </button>
            </div>
          </div>
        )}

        {/* Preview */}
        {src && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Preview</label>
              <button onClick={clearImage} className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 transition">
                <X size={11} /> Clear
              </button>
            </div>
            <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800">
              {isImage(block) ? (
                <img src={src} alt="Preview" className="w-full object-contain max-h-64" />
              ) : (
                <div className="flex items-center gap-2 p-3 text-sm text-slate-600 dark:text-slate-400">
                  <Video size={16} className="text-indigo-400" />
                  <span className="truncate text-xs">{src}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!src && (
          <div className="flex flex-col items-center justify-center py-8 text-slate-300 dark:text-slate-600">
            <ImageIcon size={36} />
            <p className="text-xs mt-2">No image selected</p>
          </div>
        )}
      </div>
    </Drawer>
  );
};
