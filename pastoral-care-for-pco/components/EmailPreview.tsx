import React, { useEffect } from 'react';
import { EmailBlock } from './EmailBuilder';
import { TemplateSettings } from '../types';
import { AnalyticsWidgetBlock, AnalyticsWidgetId } from './DataChartSelector';
import { CalendarDays, Users, ClipboardList } from 'lucide-react';

interface Props {
  blocks: EmailBlock[];
  settings: TemplateSettings;
  /** Church-wide logo URL fallback (from Firestore Church doc). Used when settings.logoUrl is not set. */
  churchLogoUrl?: string;
}

// Resolve @merge-tags in HTML strings for visual preview
const resolveMergeTags = (html: string) =>
  html
    .replace(/@first-name/g, '<span style="background:#e0e7ff;color:#4338ca;border-radius:4px;padding:0 4px;font-family:monospace;font-size:0.9em">John</span>')
    .replace(/@last-name/g, '<span style="background:#e0e7ff;color:#4338ca;border-radius:4px;padding:0 4px;font-family:monospace;font-size:0.9em">Smith</span>')
    .replace(/@email/g, '<span style="background:#e0e7ff;color:#4338ca;border-radius:4px;padding:0 4px;font-family:monospace;font-size:0.9em">john@example.com</span>')
    .replace(/@current-date/g, new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))
    .replace(/@current-month/g, new Date().toLocaleDateString('en-US', { month: 'long' }))
    .replace(/@current-year/g, String(new Date().getFullYear()))
    .replace(/@view-in-browser/g, '<a href="#" style="color:#4338ca">View in browser</a>');

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
          style={{ width: '100%', maxHeight: 240, objectFit: 'cover', objectPosition: 'center top', display: 'block' }}
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
        <h1 className="text-2xl font-bold" style={{ textAlign: showLogo ? 'center' : 'left' }}>
          {settings.header}
        </h1>
      </header>

      <div className="space-y-4">
        {blocks.map((block) => (
          <div key={block.id}>
            {block.type === 'text' && (
              <div dangerouslySetInnerHTML={{ __html: resolveMergeTags(block.content.text || '') }} />
            )}
            {block.type === 'header' && (
              <h2 className="text-xl font-semibold" dangerouslySetInnerHTML={{ __html: resolveMergeTags(block.content.text || '') }} />
            )}
            {block.type === 'image' && (
              <img src={block.content.src} alt="Block" className="max-w-full rounded-lg" />
            )}
            {block.type === 'video' && (
              <div className="max-w-full rounded-lg overflow-hidden">
                {block.content.src?.includes('youtube.com') || block.content.src?.includes('youtu.be') ? (
                  <iframe className="w-full aspect-video" src={block.content.src.replace('watch?v=', 'embed/')} title="Video" allowFullScreen />
                ) : (
                  <video src={block.content.src} controls className="w-full" />
                )}
              </div>
            )}

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
            {block.type === 'button' && (
              <button className="px-4 py-2 rounded-lg" style={{ backgroundColor: settings.primaryColor, color: '#fff' }}>
                {block.content.text}
              </button>
            )}
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
