import React, { useState, useEffect } from 'react';
import { Drawer } from './Drawer';
import { EmailBlock } from './EmailBuilder';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  block: EmailBlock | null;
  onUpdate: (id: string, content: any) => void;
}

export const MediaEditorDrawer: React.FC<Props> = ({ isOpen, onClose, block, onUpdate }) => {
  const [src, setSrc] = useState('');

  useEffect(() => {
    if (block) {
      setSrc(block.content.src || '');
    }
  }, [block]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setSrc(base64String);
        if (block) {
          onUpdate(block.id, { ...block.content, src: base64String });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setSrc(url);
    if (block) {
      onUpdate(block.id, { ...block.content, src: url });
    }
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={`Edit ${block?.type === 'image' ? 'Image' : 'Video'}`}>
      <div className="p-4 space-y-4">
        {block?.type === 'image' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Upload Image</label>
            <input type="file" accept="image/*" onChange={handleFileChange} className="w-full p-2 border rounded-lg" />
          </div>
        )}
        {block?.type === 'video' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Video Link</label>
            <input type="text" value={src} onChange={handleUrlChange} placeholder="https://youtube.com/..." className="w-full p-2 border rounded-lg" />
          </div>
        )}
        {src && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Preview</label>
            {block.type === 'image' ? (
              <img src={src} alt="Preview" className="max-w-full rounded-lg" />
            ) : (
              <div className="p-4 bg-slate-100 rounded-lg text-sm text-slate-700">Video URL: {src}</div>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
};
