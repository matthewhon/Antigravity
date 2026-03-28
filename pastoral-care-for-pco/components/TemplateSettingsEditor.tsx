import React, { useRef, useState, useCallback } from 'react';
import { TemplateSettings } from '../types';
import { Upload, Loader2, Trash2, Image as ImageIcon } from 'lucide-react';

interface Props {
  settings: TemplateSettings;
  onChange: (settings: TemplateSettings) => void;
  /** Church-wide logo URL (from Firestore Church doc). Used as the default preview. */
  churchLogoUrl?: string;
  /** Called when the user selects a new logo file. Parent handles upload + Firestore save. */
  onUploadLogo?: (file: File) => Promise<void>;
  /** Called when the user wants to remove the church-level logo entirely. */
  onRemoveLogo?: () => Promise<void>;
  /** True while the logo is being uploaded. */
  logoUploading?: boolean;
}

const LABEL: Record<string, string> = {
  primaryColor: 'Primary Color',
  textColor: 'Text Color',
  backgroundColor: 'Background Color',
  linkColor: 'Link Color',
  fontFamily: 'Font Family',
  header: 'Header Text',
  footer: 'Footer Text',
};

const SOCIAL_PLATFORMS = [
  { key: 'facebookUrl',  label: 'Facebook',  placeholder: 'https://facebook.com/yourpage',  color: '#1877F2', Icon: FacebookIcon },
  { key: 'youtubeUrl',  label: 'YouTube',   placeholder: 'https://youtube.com/@yourchannel', color: '#FF0000', Icon: YoutubeIcon },
  { key: 'instagramUrl', label: 'Instagram', placeholder: 'https://instagram.com/yourhandle', color: '#E1306C', Icon: InstagramIcon },
  { key: 'twitterUrl',   label: 'X / Twitter', placeholder: 'https://x.com/yourhandle',       color: '#000000', Icon: TwitterIcon },
] as const;

// Minimal inline SVG icons that match the platforms
function FacebookIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}
function YoutubeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.96-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z" />
      <polygon fill="white" points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" />
    </svg>
  );
}
function InstagramIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function TwitterIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export const TemplateSettingsEditor: React.FC<Props> = ({
  settings,
  onChange,
  churchLogoUrl,
  onUploadLogo,
  onRemoveLogo,
  logoUploading = false,
}) => {
  const set = (key: keyof TemplateSettings, value: any) => onChange({ ...settings, [key]: value });
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Effective logo to display — per-campaign override, then church-wide
  const effectiveLogo = settings.logoUrl || churchLogoUrl;
  const showLogoEnabled = settings.showLogo !== false; // default = true

  const handleFileSelected = useCallback(async (file: File) => {
    if (!onUploadLogo) return;
    // Validate type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (PNG, JPG, SVG, etc.).');
      return;
    }
    // Validate size — 2 MB
    if (file.size > 2 * 1024 * 1024) {
      alert('Logo must be smaller than 2 MB. Recommended: 400 × 120 px PNG or SVG.');
      return;
    }
    await onUploadLogo(file);
  }, [onUploadLogo]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelected(file);
  }, [handleFileSelected]);

  return (
    <div className="space-y-6">

      {/* ── Church Logo ─────────────────────────────────────────── */}
      <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-widest">
            Church Logo
          </h3>
          {/* Show/hide toggle */}
          <button
            onClick={() => set('showLogo', !showLogoEnabled)}
            className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
              showLogoEnabled
                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}
          >
            <span className={`w-8 h-4 rounded-full relative transition-colors ${showLogoEnabled ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
              <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${showLogoEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </span>
            Show in header
          </button>
        </div>

        <div className="space-y-3">
          {/* Current logo preview */}
          {effectiveLogo && (
            <div className="relative flex items-center justify-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 min-h-[80px]">
              <img
                src={effectiveLogo}
                alt="Church logo"
                className="max-h-16 max-w-full object-contain"
                onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3'; }}
              />
              {settings.logoUrl && settings.logoUrl !== churchLogoUrl && (
                <span className="absolute top-2 right-2 text-[9px] font-bold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 px-1.5 py-0.5 rounded-full">
                  Campaign override
                </span>
              )}
            </div>
          )}

          {/* Drop zone / upload button */}
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleFileSelected(file);
              // Reset value so re-selecting the same file triggers onChange
              e.target.value = '';
            }}
          />
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !logoUploading && logoInputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-5 cursor-pointer transition ${
              dragOver
                ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-slate-50 dark:hover:bg-slate-800'
            } ${logoUploading ? 'pointer-events-none opacity-60' : ''}`}
          >
            {logoUploading ? (
              <>
                <Loader2 size={22} className="animate-spin text-indigo-400" />
                <span className="text-xs text-slate-500 dark:text-slate-400">Uploading…</span>
              </>
            ) : effectiveLogo ? (
              <>
                <Upload size={18} className="text-slate-400" />
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Replace logo
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  PNG, SVG or JPG · max 2 MB
                </span>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                  <ImageIcon size={20} className="text-indigo-400" />
                </div>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Upload church logo
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  Recommended: 400 × 120 px · PNG or SVG · max 2 MB
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  Drop a file here or click to browse
                </span>
              </>
            )}
          </div>

          {/* Action buttons when logo exists */}
          {effectiveLogo && (
            <div className="flex gap-2">
              {/* Remove church-wide logo */}
              {onRemoveLogo && churchLogoUrl && (
                <button
                  onClick={async () => {
                    if (confirm('Remove the church logo? This will clear it from all future emails.')) {
                      await onRemoveLogo();
                    }
                  }}
                  disabled={logoUploading}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/50 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-50"
                >
                  <Trash2 size={12} />
                  Remove logo
                </button>
              )}
              {/* Clear per-campaign override */}
              {settings.logoUrl && (
                <button
                  onClick={() => set('logoUrl', undefined)}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                >
                  Use church default
                </button>
              )}
            </div>
          )}

          {showLogoEnabled && effectiveLogo && (
            <p className="text-[10px] text-indigo-500 dark:text-indigo-400">
              ✓ Logo will appear centered in the email header above the title text.
            </p>
          )}
          {!effectiveLogo && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              No logo uploaded. The header will show the title text only.
            </p>
          )}
        </div>
      </div>

      {/* ── Design ─────────────────────────────────────────────────── */}
      <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm">
        <h3 className="font-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4">Design</h3>
        <div className="grid grid-cols-2 gap-4">
          {(['primaryColor', 'textColor', 'backgroundColor', 'linkColor'] as const).map(key => (
            <div key={key}>
              <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{LABEL[key]}</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={settings[key] || '#000000'}
                  onChange={e => set(key, e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border border-slate-200 dark:border-slate-600 p-0"
                />
                <input
                  type="text"
                  value={settings[key] || ''}
                  onChange={e => set(key, e.target.value)}
                  className="flex-1 text-xs font-mono border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
          ))}
          <div className="col-span-2">
            <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{LABEL.fontFamily}</label>
            <select
              value={settings.fontFamily || 'sans-serif'}
              onChange={e => set('fontFamily', e.target.value)}
              className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="sans-serif">Sans-Serif (default)</option>
              <option value="Georgia, serif">Georgia (Serif)</option>
              <option value="'Courier New', monospace">Courier New (Monospace)</option>
              <option value="Arial, sans-serif">Arial</option>
              <option value="'Times New Roman', serif">Times New Roman</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Header & Footer ────────────────────────────────────────── */}
      <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm">
        <h3 className="font-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4">Header &amp; Footer</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Header Text</label>
            <input
              type="text"
              value={settings.header || ''}
              onChange={e => set('header', e.target.value)}
              className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Footer Text</label>
            <textarea
              value={settings.footer || ''}
              onChange={e => set('footer', e.target.value)}
              rows={2}
              className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>
        </div>
      </div>

      {/* ── Social Media ───────────────────────────────────────────── */}
      <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-widest">Social Media</h3>
          {/* Master toggle */}
          <button
            onClick={() => set('showSocialLinks', !settings.showSocialLinks)}
            className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
              settings.showSocialLinks
                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}
          >
            <span className={`w-8 h-4 rounded-full relative transition-colors ${settings.showSocialLinks ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
              <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${settings.showSocialLinks ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </span>
            Show in footer
          </button>
        </div>

        <div className="space-y-3">
          {SOCIAL_PLATFORMS.map(({ key, label, placeholder, color, Icon }) => {
            const url = (settings as any)[key] || '';
            const hasUrl = url.trim().length > 0;
            return (
              <div key={key} className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: hasUrl ? color : undefined }}
                  title={label}
                >
                  <Icon size={16} />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">{label}</label>
                  <input
                    type="url"
                    value={url}
                    onChange={e => set(key as any, e.target.value)}
                    placeholder={placeholder}
                    className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            );
          })}
        </div>

        {settings.showSocialLinks && (
          <p className="mt-3 text-[10px] text-indigo-500 dark:text-indigo-400">
            ✓ Social icons will appear in the email footer for every filled-in platform.
          </p>
        )}
      </div>
    </div>
  );
};
