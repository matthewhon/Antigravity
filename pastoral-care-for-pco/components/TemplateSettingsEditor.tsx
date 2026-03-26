import React from 'react';
import { TemplateSettings } from '../types';

interface Props {
  settings: TemplateSettings;
  onChange: (settings: TemplateSettings) => void;
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

export const TemplateSettingsEditor: React.FC<Props> = ({ settings, onChange }) => {
  const set = (key: keyof TemplateSettings, value: any) => onChange({ ...settings, [key]: value });

  return (
    <div className="space-y-6">
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
