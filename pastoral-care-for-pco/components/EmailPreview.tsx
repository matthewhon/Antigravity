import React, { useEffect } from 'react';
import { EmailBlock, ColumnLayout } from './EmailBuilder';
import { TemplateSettings } from '../types';
import { AnalyticsWidgetBlock, AnalyticsWidgetId } from './DataChartSelector';
import { CalendarDays, Users, ClipboardList, Image as ImageIcon } from 'lucide-react';

// ─── YouTube helper ───────────────────────────────────────────────────────────

/** Extract YouTube video ID from any standard YouTube URL format. */
function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/** Render a YouTube video as a thumbnail with play button overlay (email-safe style). */
const YouTubeThumbnail: React.FC<{ url: string; videoId: string }> = ({ url, videoId }) => {
  const thumb = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', position: 'relative', textDecoration: 'none' }}>
      <img
        src={thumb}
        alt="YouTube video"
        style={{ width: '100%', display: 'block', borderRadius: 10 }}
        onError={e => { (e.target as HTMLImageElement).style.background = '#000'; }}
      />
      {/* Play button overlay */}
      <span style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 64, height: 64,
        background: 'rgba(0,0,0,0.72)',
        borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <svg width={28} height={28} viewBox="0 0 24 24" fill="#fff">
          <polygon points="9.5,7 9.5,17 18,12" />
        </svg>
      </span>
      {/* YouTube badge */}
      <span style={{
        position: 'absolute', bottom: 10, right: 12,
        background: '#ff0000', color: '#fff',
        fontSize: 10, fontWeight: 800, letterSpacing: '0.5px',
        padding: '2px 7px', borderRadius: 4,
        fontFamily: 'sans-serif',
        pointerEvents: 'none',
      }}>▶ YouTube</span>
    </a>
  );
};

// ─── Scoped prose styles injected once into the page head ─────────────────────
// These mirror what a mail client / browser would render for common HTML tags
// produced by the Tiptap editor (p, h1–h4, ul, ol, strong, em, a).
const PROSE_STYLE_ID = 'email-preview-prose-styles';
const PROSE_CSS = `
.ep-prose p   { margin: 0 0 0.75em; line-height: 1.65; }
.ep-prose p:last-child { margin-bottom: 0; }
.ep-prose h1  { font-size: 2em;   font-weight: 700; margin: 0 0 0.5em; line-height: 1.2; }
.ep-prose h2  { font-size: 1.5em; font-weight: 700; margin: 0 0 0.5em; line-height: 1.3; }
.ep-prose h3  { font-size: 1.25em;font-weight: 600; margin: 0 0 0.4em; line-height: 1.4; }
.ep-prose h4  { font-size: 1em;   font-weight: 600; margin: 0 0 0.4em; }
.ep-prose ul  { list-style-type: disc;    padding-left: 1.5em; margin: 0 0 0.75em; }
.ep-prose ol  { list-style-type: decimal; padding-left: 1.5em; margin: 0 0 0.75em; }
.ep-prose li  { margin: 0.2em 0; line-height: 1.6; }
.ep-prose strong { font-weight: 700; }
.ep-prose em     { font-style: italic; }
.ep-prose a      { color: #4f46e5; text-decoration: underline; }
.ep-prose blockquote { border-left: 3px solid #e2e8f0; padding-left: 1em; color: #64748b; margin: 0 0 0.75em; }
.ep-prose code   { background: #f1f5f9; border-radius: 4px; padding: 0 4px; font-family: monospace; font-size: 0.9em; }
`;

function ensureProseStyles() {
  if (typeof document !== 'undefined' && !document.getElementById(PROSE_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = PROSE_STYLE_ID;
    style.textContent = PROSE_CSS;
    document.head.appendChild(style);
  }
}

interface Props {
  blocks: EmailBlock[];
  settings: TemplateSettings;
  /** Church-wide logo URL fallback (from Firestore Church doc). Used when settings.logoUrl is not set. */
  churchLogoUrl?: string;
}

const resolveMergeTags = (html: string) =>
  html
    .replace(/@first-name/g, '<span style="background:#e0e7ff;color:#4338ca;border-radius:4px;padding:0 4px;font-family:monospace;font-size:0.9em">John</span>')
    .replace(/@last-name/g, '<span style="background:#e0e7ff;color:#4338ca;border-radius:4px;padding:0 4px;font-family:monospace;font-size:0.9em">Smith</span>')
    .replace(/@email/g, '<span style="background:#e0e7ff;color:#4338ca;border-radius:4px;padding:0 4px;font-family:monospace;font-size:0.9em">john@example.com</span>')
    .replace(/@current-date/g, new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))
    .replace(/@current-month/g, new Date().toLocaleDateString('en-US', { month: 'long' }))
    .replace(/@current-year/g, String(new Date().getFullYear()))
    .replace(/@view-in-browser/g, '<a href="#" style="color:#4338ca">View in browser</a>');

// Convert ColumnLayout string into per-column flex-basis percentages.
function columnWidths(layout: ColumnLayout): string[] {
  switch (layout) {
    case '1':   return ['100%'];
    case '2':   return ['50%', '50%'];
    case '3':   return ['33.33%', '33.33%', '33.33%'];
    case '2:1': return ['66.66%', '33.33%'];
    case '1:2': return ['33.33%', '66.66%'];
    default:    return ['50%', '50%'];
  }
}

// Renders a single mini-block (text / image / button) inside a column cell.
const MiniBlockPreview: React.FC<{ b: { id: string; type: string; content: any }; primaryColor: string }> = ({ b, primaryColor }) => {
  const c = b.content || {};
  if (b.type === 'text') {
    return <div style={{ fontSize: 14, lineHeight: 1.6, color: '#1f2937' }} dangerouslySetInnerHTML={{ __html: resolveMergeTags(c.text || '') }} />;
  }
  if (b.type === 'image') {
    return c.src
      ? <img src={c.src} alt={c.alt || ''} style={{ width: '100%', borderRadius: 8, display: 'block' }} />
      : <div style={{ background: '#f1f5f9', borderRadius: 8, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ImageIcon size={24} color="#94a3b8" /></div>;
  }
  if (b.type === 'button') {
    const bg = c.color || primaryColor || '#6366f1';
    const tc = c.textColor || '#ffffff';
    const rad = c.borderRadius === 'pill' ? 999 : c.borderRadius === 'square' ? 4 : 8;
    const pad = c.size === 'small' ? '6px 14px' : c.size === 'large' ? '12px 28px' : '8px 20px';
    const fs = c.size === 'small' ? 12 : c.size === 'large' ? 16 : 14;
    const justifyContent = c.align === 'left' ? 'flex-start' : c.align === 'right' ? 'flex-end' : 'center';
    return (
      <div style={{ display: 'flex', justifyContent, marginTop: 4 }}>
        <a href={c.url || '#'} style={{ background: bg, color: tc, borderRadius: rad, padding: pad, fontSize: fs, fontWeight: 700, display: 'inline-block', textDecoration: 'none' }}>
          {c.text || 'Click Here'}
        </a>
      </div>
    );
  }
  return null;
};

// Rich card for PCO Registration / Group / Calendar event blocks
const PcoContentCard = ({ block, primaryColor }: { block: EmailBlock; primaryColor: string }) => {
  const c = block.content || {};
  const Icon = block.type === 'pco_group' ? Users : block.type === 'pco_registration' ? ClipboardList : CalendarDays;
  // Strip tags helper for plain-text contexts
  const stripTags = (html: string) => html.replace(/<[^>]*>/g, '').trim();
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', background: '#fff', marginBottom: 4 }}>
      {c.imageUrl ? (
        <img
          src={c.imageUrl}
          alt={c.name}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <div style={{ background: 'linear-gradient(135deg,#e0e7ff,#c7d2fe)', height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={32} color="#818cf8" />
        </div>
      )}
      <div style={{ padding: '12px 16px' }}>
        {c.date && <div style={{ fontSize: 12, color: primaryColor, fontWeight: 600, marginBottom: 4 }}>{c.date}</div>}
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{c.name}</div>
        {c.description && (
          <div
            style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5, marginBottom: 8 }}
            dangerouslySetInnerHTML={{ __html: c.description }}
          />
        )}
        {c.meta && <div style={{ fontSize: 11, color: '#94a3b8' }}>{stripTags(c.meta)}</div>}
        <a href={c.url || '#'} style={{ display: 'inline-block', marginTop: 10, padding: '6px 16px', background: primaryColor, color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>Learn More</a>
      </div>
    </div>
  );
};


// ─── Social icon SVG paths ────────────────────────────────────────────────────

const SOCIAL_LINKS: { key: keyof TemplateSettings; label: string; color: string; path: string }[] = [
  {
    key: 'facebookUrl', label: 'Facebook', color: '#1877F2',
    path: 'M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z',
  },
  {
    key: 'youtubeUrl', label: 'YouTube', color: '#FF0000',
    path: 'M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.96-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z',
  },
  {
    key: 'instagramUrl', label: 'Instagram', color: '#E1306C',
    path: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z',
  },
  {
    key: 'twitterUrl', label: 'X / Twitter', color: '#000000',
    path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  },
];

// ─── Main Preview Component ───────────────────────────────────────────────────

export const EmailPreview: React.FC<Props> = ({ blocks, settings, churchLogoUrl }) => {
  useEffect(() => {
    ensureProseStyles();
    if (blocks.some(b => b.type === 'pco_groups_widget' || b.type === 'pco_registrations_widget')) {
      const script = document.createElement('script');
      script.src = '//pcochef-static.s3.us-east-1.amazonaws.com/plusapi/js/pcochef-plus.js';
      script.type = 'text/javascript';
      script.async = true;
      document.body.appendChild(script);
      return () => { document.body.removeChild(script); };
    }
  }, [blocks]);

  const activeSocial = settings.showSocialLinks
    ? SOCIAL_LINKS.filter(s => (settings as any)[s.key]?.trim())
    : [];

  // Effective logo: per-campaign override → church-wide default
  const effectiveLogo = settings.logoUrl || churchLogoUrl;
  const showLogo = settings.showLogo !== false && !!effectiveLogo;

  return (
    <div
      className="p-6 rounded-2xl shadow-lg min-h-[600px]"
      style={{ backgroundColor: settings.backgroundColor, color: settings.textColor, fontFamily: settings.fontFamily }}
    >
      {(showLogo || settings.header?.trim()) && (
        <header className="mb-6 border-b border-slate-200 pb-4 text-center">
          {showLogo && (
            <div className="flex justify-center mb-3">
              <img
                src={effectiveLogo}
                alt="Church logo"
                style={{ maxHeight: 60, maxWidth: 240, objectFit: 'contain', display: 'block' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}
          {settings.header?.trim() && (
            <h1 className="text-2xl font-bold" style={{ textAlign: showLogo ? 'center' : 'left' }}>
              {settings.header}
            </h1>
          )}
        </header>
      )}

      <div className="space-y-4">
        {blocks.map((block) => (
          <div key={block.id}>
            {block.type === 'text' && (
              <div
                className="ep-prose"
                style={{ fontSize: 15, lineHeight: 1.65, color: settings.textColor || '#1f2937' }}
                dangerouslySetInnerHTML={{ __html: resolveMergeTags(block.content.text || '') }}
              />
            )}
            {block.type === 'header' && (
              <div
                className="ep-prose"
                style={{ color: settings.primaryColor || '#4f46e5' }}
                dangerouslySetInnerHTML={{ __html: resolveMergeTags(block.content.text || '') }}
              />
            )}
            {block.type === 'image' && (
              block.content.link
                ? <a href={block.content.link} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                    <img src={block.content.src} alt={block.content.alt || ''} className="max-w-full rounded-lg" style={{ display: 'block' }} />
                  </a>
                : <img src={block.content.src} alt={block.content.alt || ''} className="max-w-full rounded-lg" />
            )}
            {block.type === 'video' && (() => {
              const src: string = block.content.src || '';
              const ytId = extractYouTubeId(src);
              if (ytId) {
                return (
                  <div className="rounded-xl overflow-hidden" style={{ position: 'relative' }}>
                    <YouTubeThumbnail url={src} videoId={ytId} />
                    <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 6, fontFamily: 'sans-serif' }}>
                      ℹ️ Email recipients will see this thumbnail — clicking opens YouTube.
                    </p>
                  </div>
                );
              }
              // Non-YouTube: native video player (browser preview only)
              return (
                <div className="rounded-xl overflow-hidden">
                  <video src={src} controls className="w-full" />
                </div>
              );
            })()}

            {(block.type === 'pco_registration' || block.type === 'pco_group' || block.type === 'pco_event') && (
              <PcoContentCard block={block} primaryColor={settings.primaryColor} />
            )}

            {block.type === 'pco_groups_widget' && (
              <div className="p-4 bg-white border rounded-lg">
                <div
                  data-pcoplus-widget="groups" data-church-center-url="vbcrowlett"
                  data-caption-join="Request to join" data-caption-more-information="Learn more"
                  data-caption-close="Close" data-pcoplus-key="oVRle6Z"
                  data-show-filters="true" data-hide-location="true" data-use-modals="true"
                  data-corner-radius="4" data-image-shape="cinematic"
                  data-brand-color="#FF7461" data-button-color="#4EA0CF"
                  data-modal-color="#FFFFFF" data-text-color="#333333"
                  style={{ textAlign: 'center', color: 'rgba(90, 90, 90, 0.5)' }}>
                  Events Loading
                </div>
              </div>
            )}
            {block.type === 'pco_registrations_widget' && (
              <div className="p-4 bg-white border rounded-lg">
                <link rel="stylesheet" href="https://pcochef-static.s3.amazonaws.com/plusapi/css/t-events.css" media="print" onLoad={(e: any) => e.target.media='all'} />
                <link rel="stylesheet" href="https://pcochef-static.s3.amazonaws.com/plusapi/css/s-events.css" media="print" onLoad={(e: any) => e.target.media='all'} />
                <script src="https://pcochef-static.s3.amazonaws.com/plusapi/js/htmx.min.js" defer></script>
                <div hx-get="https://pcochef.com/plusapi/oVRle6Z/hxregistrations/?style=ts&filter=this_month&tags=" hx-trigger="load" hx-params="*" hx-swap="innerHTML">
                  <img alt="Result loading..." className="htmx-indicator" width="150" src="https://htmx.org/img/bars.svg"/>
                </div>
                <script type="text/javascript" src="https://pcochef-static.s3.amazonaws.com/plusapi/js/css-events.js"></script>
              </div>
            )}

            {block.type === 'html' && <div dangerouslySetInnerHTML={{ __html: block.content.html }} />}

            {block.type === 'columns' && (() => {
              const layout: ColumnLayout = block.content?.layout || '2';
              const cells: { id: string; blocks: { id: string; type: string; content: any }[] }[] = block.content?.cells || [];
              const widths = columnWidths(layout);
              return (
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  {cells.map((cell, idx) => (
                    <div key={cell.id} style={{ flex: `0 0 calc(${widths[idx] ?? '50%'} - 6px)`, minWidth: 0 }}>
                      {cell.blocks.length === 0 ? (
                        <div style={{ border: '1px dashed #e2e8f0', borderRadius: 8, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12 }}>
                          Empty column
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {cell.blocks.map(b => (
                            <MiniBlockPreview key={b.id} b={b} primaryColor={settings.primaryColor} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            {block.type === 'button' && (() => {
              const bc = block.content || {};
              const bg = bc.color || settings.primaryColor || '#6366f1';
              const tc = bc.textColor || '#ffffff';
              const rad = bc.borderRadius === 'pill' ? 999 : bc.borderRadius === 'square' ? 4 : 8;
              const pad = bc.size === 'small' ? '6px 16px' : bc.size === 'large' ? '14px 36px' : '10px 24px';
              const fs = bc.size === 'small' ? 13 : bc.size === 'large' ? 17 : 15;
              const alignStyle: React.CSSProperties = { display: 'flex', justifyContent: bc.align === 'left' ? 'flex-start' : bc.align === 'right' ? 'flex-end' : 'center', margin: '4px 0' };
              return (
                <div style={alignStyle}>
                  <a href={bc.url || '#'} style={{ background: bg, color: tc, borderRadius: rad, padding: pad, fontSize: fs, fontWeight: 700, display: 'inline-block', textDecoration: 'none' }}>
                    {bc.text || 'Click Here'}
                  </a>
                </div>
              );
            })()}
            {block.type === 'pastoral_care_chart' && (
              <div className="p-4 bg-slate-100 rounded-lg text-sm">📊 Pastoral Care Chart: {block.content.area}</div>
            )}
            {block.type === 'data_chart' && (
              <AnalyticsWidgetBlock
                widgetId={block.content.widgetId as AnalyticsWidgetId}
                label={block.content.label || 'Analytics'}
                data={block.content.data || {}}
              />
            )}
          </div>
        ))}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="mt-8 border-t border-slate-200 pt-5 text-sm text-slate-500 text-center space-y-4">
        {activeSocial.length > 0 && (
          <div className="flex justify-center items-center gap-3">
            {activeSocial.map(({ key, label, color, path }) => (
              <a
                key={key}
                href={(settings as any)[key]}
                target="_blank"
                rel="noopener noreferrer"
                title={label}
                style={{
                  color: '#fff',
                  backgroundColor: color,
                  borderRadius: 8,
                  width: 36,
                  height: 36,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textDecoration: 'none',
                  flexShrink: 0,
                }}
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
                  <path d={path} />
                </svg>
              </a>
            ))}
          </div>
        )}
        <p>{settings.footer}</p>
      </footer>
    </div>
  );
};
