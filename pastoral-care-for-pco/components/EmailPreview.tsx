import React, { useEffect } from 'react';
import { EmailBlock } from './EmailBuilder';
import { TemplateSettings } from '../types';
import { ChartRenderer } from './ChartRenderer';

interface Props {
  blocks: EmailBlock[];
  settings: TemplateSettings;
}

export const EmailPreview: React.FC<Props> = ({ blocks, settings }) => {
  useEffect(() => {
    if (blocks.some(b => b.type === 'pco_groups_widget' || b.type === 'pco_registrations_widget')) {
      const script = document.createElement('script');
      script.src = '//pcochef-static.s3.us-east-1.amazonaws.com/plusapi/js/pcochef-plus.js';
      script.type = 'text/javascript';
      script.async = true;
      document.body.appendChild(script);
      return () => {
        document.body.removeChild(script);
      };
    }
  }, [blocks]);

  return (
    <div 
      className="p-6 rounded-2xl shadow-lg min-h-[600px]" 
      style={{ 
        backgroundColor: settings.backgroundColor, 
        color: settings.textColor, 
        fontFamily: settings.fontFamily 
      }}
    >
      <header className="mb-6 border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold">{settings.header}</h1>
      </header>
      <div className="space-y-4">
        {blocks.map((block) => (
          <div key={block.id}>
            {block.type === 'text' && <div dangerouslySetInnerHTML={{ __html: block.content.text }} />}
            {block.type === 'header' && <h2 className="text-xl font-semibold" dangerouslySetInnerHTML={{ __html: block.content.text }} />}
            {block.type === 'image' && <img src={block.content.src} alt="Block" className="max-w-full rounded-lg" />}
            {block.type === 'video' && (
              <div className="max-w-full rounded-lg overflow-hidden">
                {block.content.src?.includes('youtube.com') || block.content.src?.includes('youtu.be') ? (
                  <iframe
                    className="w-full aspect-video"
                    src={block.content.src.replace('watch?v=', 'embed/')}
                    title="Video"
                    allowFullScreen
                  />
                ) : (
                  <video src={block.content.src} controls className="w-full" />
                )}
              </div>
            )}
            {block.type === 'pco_groups_widget' && (
              <div className="p-4 bg-white border rounded-lg">
                <div 
                    data-pcoplus-widget="groups"
                    data-church-center-url="vbcrowlett"
                    data-caption-join="Request to join"
                    data-caption-more-information="Learn more"
                    data-caption-close="Close"
                    data-pcoplus-key="oVRle6Z"
                    data-show-filters="true"
                    data-hide-location="true"
                    data-use-modals="true"
                    data-corner-radius="4"
                    data-image-shape="cinematic"
                    data-brand-color="#FF7461"
                    data-button-color="#4EA0CF"
                    data-modal-color="#FFFFFF"
                    data-text-color="#333333"
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
            {block.type === 'button' && <button className="px-4 py-2 rounded-lg" style={{ backgroundColor: settings.primaryColor, color: '#fff' }}>{block.content.text}</button>}
            {block.type === 'pastoral_care_chart' && <div className="p-4 bg-slate-100 rounded-lg text-sm">Pastoral Care Chart: {block.content.area}</div>}
            {block.type === 'data_chart' && <ChartRenderer module={block.content.module} chartType={block.content.chartType} filters={block.content.filters} />}
          </div>
        ))}
      </div>
      <footer className="mt-8 border-t border-slate-200 pt-4 text-sm text-slate-500">
        {settings.footer}
      </footer>
    </div>
  );
};
