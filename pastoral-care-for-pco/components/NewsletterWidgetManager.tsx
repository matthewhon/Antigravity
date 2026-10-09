import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Mail, Plus, Trash2, Eye, Copy, CheckCircle, RefreshCw, Settings, Code, 
  Users, ExternalLink, ChevronRight, AlertCircle, ArrowLeft, Loader2, 
  Sparkles, Sliders, Check, X, ShieldCheck, UserCheck, Search, Download,
  Layers, MessageSquare, Send, Image as ImageIcon, Upload, Smartphone, Monitor,
  Palette, FileText, Lock, Globe, RotateCcw
} from 'lucide-react';
import { firestore } from '../services/firestoreService';
import { pcoService } from '../services/pcoService';
import { storage } from '../services/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { 
  NewsletterWidgetConfig, 
  NewsletterThemeConfig,
  NewsletterSubscriber, 
  NewsletterFieldConfig, 
  NewsletterFieldType, 
  NewsletterPcoMapping,
  Church, 
  User, 
  EmailCampaign 
} from '../types';

interface NewsletterWidgetManagerProps {
  churchId: string;
  church?: Church;
  currentUser?: User;
}

const PRESET_IMAGES = [
  { name: 'Worship Gathering', url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80', pos: 'top_banner' as const },
  { name: 'Bible & Coffee', url: 'https://images.unsplash.com/photo-1504052434569-70ad5836ab65?auto=format&fit=crop&w=800&q=80', pos: 'top_banner' as const },
  { name: 'Community Group', url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=800&q=80', pos: 'top_banner' as const },
  { name: 'Church Cross Logo', url: 'https://images.unsplash.com/photo-1548625361-195fe5787e14?auto=format&fit=crop&w=300&q=80', pos: 'header_logo' as const },
  { name: 'Envelope Stamp', url: 'https://images.unsplash.com/photo-1579208575657-c595a05383b7?auto=format&fit=crop&w=300&q=80', pos: 'header_logo' as const },
];

export const NewsletterWidgetManager: React.FC<NewsletterWidgetManagerProps> = ({
  churchId,
  church,
  currentUser
}) => {
  const [subTab, setSubTab] = useState<'widgets' | 'subscribers'>('widgets');
  const [widgets, setWidgets] = useState<NewsletterWidgetConfig[]>([]);
  const [subscribers, setSubscribers] = useState<NewsletterSubscriber[]>([]);
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [pcoWorkflows, setPcoWorkflows] = useState<any[]>([]);
  const [pcoGroups, setPcoGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSubscribers, setLoadingSubscribers] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Widget editing studio state
  const [editingWidget, setEditingWidget] = useState<NewsletterWidgetConfig | null>(null);
  const [editorTab, setEditorTab] = useState<'style' | 'content' | 'fields' | 'actions' | 'bubble'>('style');
  const [isSaving, setIsSaving] = useState(false);

  // Interactive Live Preview State
  const [previewMode, setPreviewMode] = useState<'inline' | 'bubble'>('inline');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [previewBg, setPreviewBg] = useState<'light' | 'dark' | 'mockup'>('light');
  const [previewFormData, setPreviewFormData] = useState<Record<string, string>>({});
  const [previewSubmitted, setPreviewSubmitted] = useState(false);
  const [previewBubbleOpen, setPreviewBubbleOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dedicated Quick Preview Modal state (for cards)
  const [quickPreviewWidget, setQuickPreviewWidget] = useState<NewsletterWidgetConfig | null>(null);

  // Embed code modal state
  const [embedModalWidget, setEmbedModalWidget] = useState<NewsletterWidgetConfig | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedIframe, setCopiedIframe] = useState(false);

  // Subscribers search/filter state
  const [subscriberSearch, setSubscriberSearch] = useState('');
  const [subscriberFilter, setSubscriberFilter] = useState<'all' | 'active' | 'unsubscribed'>('all');

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const apiBaseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://pastoralcare.barnabassoftware.com';

  // Load widgets & initial dependencies
  const loadWidgets = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/newsletter-widgets/${churchId}`);
      if (res.ok) {
        const data = await res.json();
        setWidgets(Array.isArray(data) ? data : []);
      } else {
        const direct = await firestore.getNewsletterWidgets(churchId);
        setWidgets(direct);
      }
    } catch (e: any) {
      console.error('Failed to load widgets:', e);
      showToast('Failed to load newsletter widgets', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Load subscribers
  const loadSubscribers = async () => {
    setLoadingSubscribers(true);
    try {
      const res = await fetch(`/api/newsletter-subscribers/${churchId}`);
      if (res.ok) {
        const data = await res.json();
        setSubscribers(Array.isArray(data) ? data : []);
      } else {
        const direct = await firestore.getNewsletterSubscribers(churchId);
        setSubscribers(direct);
      }
    } catch (e: any) {
      console.error('Failed to load subscribers:', e);
    } finally {
      setLoadingSubscribers(false);
    }
  };

  // Load email campaigns & PCO workflows/groups
  useEffect(() => {
    loadWidgets();
    loadSubscribers();

    firestore.getEmailCampaigns(churchId)
      .then(c => setCampaigns(c || []))
      .catch(() => {});

    pcoService.getWorkflows(churchId)
      .then(wf => setPcoWorkflows(wf || []))
      .catch(() => {});

    pcoService.getGroups(churchId)
      .then(grp => {
        const mapped = (grp || []).map((g: any) => ({
          id: g.id,
          name: g.attributes?.name || 'Unnamed Group'
        }));
        setPcoGroups(mapped);
      })
      .catch(() => {});
  }, [churchId]);

  // Handle Image Upload to Firebase Storage
  const handleImageUpload = (file: File) => {
    if (!editingWidget) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (PNG, JPG, WebP, SVG).');
      return;
    }
    setUploadingImage(true);
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const path = `churches/${churchId}/newsletter_widgets/${Date.now()}_${cleanFileName}`;
    const fileRef = storageRef(storage, path);
    const uploadTask = uploadBytesResumable(fileRef, file);

    uploadTask.on(
      'state_changed',
      null,
      (err) => {
        console.error('Image upload failed:', err);
        showToast('Image upload failed. Please try again.', 'error');
        setUploadingImage(false);
      },
      async () => {
        const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
        setEditingWidget({
          ...editingWidget,
          theme: {
            ...editingWidget.theme,
            imageUrl: downloadUrl,
            imagePosition: editingWidget.theme.imagePosition || 'top_banner'
          }
        });
        setUploadingImage(false);
        showToast('Image uploaded successfully!');
      }
    );
  };

  // Handle Save Widget
  const handleSaveWidget = async () => {
    if (!editingWidget) return;
    if (!editingWidget.name.trim()) {
      alert('Please provide a name for this widget.');
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/newsletter-widgets/${churchId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingWidget)
      });
      if (!res.ok) throw new Error('Failed to save widget');
      const data = await res.json();
      const saved = data.widget || editingWidget;

      setWidgets(prev => {
        const idx = prev.findIndex(w => w.id === saved.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = saved;
          return updated;
        }
        return [saved, ...prev];
      });

      setEditingWidget(null);
      showToast('Newsletter widget saved successfully!');
    } catch (e: any) {
      showToast(e.message || 'Failed to save widget', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Delete Widget
  const handleDeleteWidget = async (widgetId: string) => {
    if (!confirm('Are you sure you want to delete this newsletter widget?')) return;
    try {
      await fetch(`/api/newsletter-widgets/${churchId}/${widgetId}`, { method: 'DELETE' });
      setWidgets(prev => prev.filter(w => w.id !== widgetId));
      showToast('Widget deleted.');
    } catch (e: any) {
      showToast('Failed to delete widget', 'error');
    }
  };

  // Handle Subscriber Status Toggle
  const handleToggleSubscriberStatus = async (sub: NewsletterSubscriber) => {
    const newStatus = sub.status === 'active' ? 'unsubscribed' : 'active';
    try {
      await fetch(`/api/newsletter-subscribers/${churchId}/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      setSubscribers(prev => prev.map(s => s.id === sub.id ? { ...s, status: newStatus } : s));
      showToast(`Subscriber marked as ${newStatus}.`);
    } catch (e) {
      showToast('Failed to update status', 'error');
    }
  };

  // Handle Delete Subscriber
  const handleDeleteSubscriber = async (subId: string) => {
    if (!confirm('Remove this subscriber permanently?')) return;
    try {
      await fetch(`/api/newsletter-subscribers/${churchId}/${subId}`, { method: 'DELETE' });
      setSubscribers(prev => prev.filter(s => s.id !== subId));
      showToast('Subscriber removed.');
    } catch (e) {
      showToast('Failed to delete subscriber', 'error');
    }
  };

  // Export subscribers to CSV
  const handleExportCsv = () => {
    if (subscribers.length === 0) return alert('No subscribers to export.');
    const headers = ['Email', 'First Name', 'Last Name', 'Phone', 'Status', 'PCO Person ID', 'New in PCO', 'Subscribed At', 'Source Widget'];
    const rows = filteredSubscribers.map(s => [
      `"${s.email}"`,
      `"${s.firstName || ''}"`,
      `"${s.lastName || ''}"`,
      `"${s.phone || ''}"`,
      `"${s.status}"`,
      `"${s.pcoPersonId || ''}"`,
      `"${s.isNewPcoPerson ? 'Yes' : 'No'}"`,
      `"${new Date(s.subscribedAt).toISOString()}"`,
      `"${s.widgetName || s.widgetId || 'Widget'}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `newsletter_subscribers_${churchId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered subscribers list
  const filteredSubscribers = useMemo(() => {
    return subscribers.filter(s => {
      if (subscriberFilter === 'active' && s.status !== 'active') return false;
      if (subscriberFilter === 'unsubscribed' && s.status !== 'unsubscribed') return false;
      if (subscriberSearch.trim()) {
        const query = subscriberSearch.toLowerCase();
        const matchesEmail = s.email?.toLowerCase().includes(query);
        const matchesName = s.name?.toLowerCase().includes(query);
        const matchesPhone = s.phone?.includes(query);
        if (!matchesEmail && !matchesName && !matchesPhone) return false;
      }
      return true;
    });
  }, [subscribers, subscriberFilter, subscriberSearch]);

  // Create New Widget starter template
  const handleCreateNewWidget = () => {
    const newWidget: NewsletterWidgetConfig = {
      id: `widget_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      churchId,
      name: `Newsletter Widget #${widgets.length + 1}`,
      displayType: 'both',
      theme: {
        primaryColor: '#4F46E5',
        backgroundColor: '#FFFFFF',
        textColor: '#1E293B',
        borderRadius: 14,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        headline: `Subscribe to our Newsletter`,
        description: 'Stay updated with announcements, events, and devotionals.',
        buttonText: 'Subscribe',
        successMessage: 'Thank you for subscribing! Check your inbox for updates.',
        imageUrl: '',
        imagePosition: 'top_banner',
        imageAlt: 'Church Newsletter',
        badgeText: 'Weekly Newsletter',
        textAlign: 'center',
        cardMaxWidth: 480,
        buttonStyle: 'rounded',
        buttonIcon: '💌',
        buttonTextColor: '#FFFFFF',
        footerNote: '🔒 Zero spam. Unsubscribe anytime with 1 click.',
        shadowStyle: 'subtle',
      },
      bubbleConfig: {
        enabled: true,
        buttonText: '💌 Subscribe',
        buttonIcon: '💌',
        position: 'right',
        triggerMode: 'button_only',
        delaySeconds: 5,
        scrollPercent: 40,
        bubbleBgColor: '#4F46E5',
        bubbleTextColor: '#FFFFFF',
        pulseAnimation: true
      },
      fields: [
        { id: 'email', label: 'Email Address', type: 'email', required: true, placeholder: 'you@example.com', mapToPco: 'email' },
        { id: 'firstName', label: 'First Name', type: 'text', required: false, placeholder: 'First Name', mapToPco: 'firstName' },
        { id: 'lastName', label: 'Last Name', type: 'text', required: false, placeholder: 'Last Name', mapToPco: 'lastName' },
        { id: 'phone', label: 'Mobile Phone', type: 'phone', required: false, placeholder: '(555) 000-0000', mapToPco: 'phone' }
      ],
      actions: {
        syncToPco: true,
        sendWelcomeEmail: false,
        notifyStaff: false
      },
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setEditingWidget(newWidget);
    setPreviewSubmitted(false);
    setPreviewFormData({});
    setEditorTab('style');
  };

  // Helper to render the live widget card component
  const renderLiveWidgetCard = (w: NewsletterWidgetConfig) => {
    const theme: Partial<NewsletterThemeConfig> = w.theme || {};
    const primaryColor = theme.primaryColor || '#4F46E5';
    const bgColor = theme.backgroundColor || '#FFFFFF';
    const textColor = theme.textColor || '#1E293B';
    const borderRadius = theme.borderRadius !== undefined ? `${theme.borderRadius}px` : '14px';
    const textAlign = theme.textAlign || 'center';
    const cardMaxWidth = theme.cardMaxWidth ? `${theme.cardMaxWidth}px` : '480px';
    const btnRadius = theme.buttonStyle === 'pill' ? '999px' : theme.buttonStyle === 'square' ? '4px' : '8px';
    const btnTextColor = theme.buttonTextColor || '#FFFFFF';
    const btnIcon = theme.buttonIcon || '';
    const footerNote = theme.footerNote || '';
    const borderColor = theme.borderColor || 'rgba(0,0,0,0.08)';

    const shadowClass = theme.shadowStyle === 'none' 
      ? 'shadow-none' 
      : theme.shadowStyle === 'elevated' 
        ? 'shadow-2xl' 
        : theme.shadowStyle === 'glow' 
          ? 'shadow-lg shadow-indigo-500/20' 
          : 'shadow-md';

    const handlePreviewSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!previewFormData['email'] || !previewFormData['email'].includes('@')) {
        alert('Please enter a valid email address in the preview.');
        return;
      }
      setPreviewSubmitted(true);
    };

    return (
      <div 
        className={`w-full overflow-hidden transition-all ${shadowClass}`}
        style={{
          backgroundColor: bgColor,
          color: textColor,
          borderRadius: borderRadius,
          border: `1px solid ${borderColor}`,
          maxWidth: cardMaxWidth,
          margin: '0 auto',
          position: 'relative'
        }}
      >
        {/* Top Banner Image */}
        {theme.imageUrl && theme.imagePosition === 'top_banner' && (
          <div className="w-full h-44 overflow-hidden bg-slate-200 dark:bg-slate-700">
            <img 
              src={theme.imageUrl} 
              alt={theme.imageAlt || 'Newsletter'} 
              className="w-full h-full object-cover" 
            />
          </div>
        )}

        <div className="p-6 sm:p-7">
          {/* Logo Image */}
          {theme.imageUrl && theme.imagePosition === 'header_logo' && (
            <div className="w-16 h-16 rounded-2xl overflow-hidden mx-auto mb-4 border-2 border-white shadow-md bg-slate-100">
              <img 
                src={theme.imageUrl} 
                alt={theme.imageAlt || 'Logo'} 
                className="w-full h-full object-cover" 
              />
            </div>
          )}

          {/* Header */}
          <div className="mb-5" style={{ textAlign }}>
            {theme.badgeText && (
              <span 
                className="inline-block text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-2.5"
                style={{
                  backgroundColor: `${primaryColor}18`,
                  color: primaryColor
                }}
              >
                {theme.badgeText}
              </span>
            )}
            <h3 className="text-xl font-bold leading-snug" style={{ color: textColor }}>
              {theme.headline || 'Subscribe to our Newsletter'}
            </h3>
            <p className="text-xs sm:text-sm mt-1.5 opacity-80 leading-relaxed">
              {theme.description || 'Get our latest updates and announcements directly to your inbox.'}
            </p>
          </div>

          {/* Form or Success State */}
          {!previewSubmitted ? (
            <form onSubmit={handlePreviewSubmit} className="space-y-3.5">
              {(w.fields || []).map(f => (
                <div key={f.id} className="text-left">
                  <label className="block text-xs font-semibold mb-1 opacity-90">
                    {f.label} {f.required && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type={f.type === 'phone' ? 'tel' : f.type === 'email' ? 'email' : 'text'}
                    placeholder={f.placeholder || f.label}
                    required={f.required}
                    value={previewFormData[f.id] || ''}
                    onChange={e => setPreviewFormData({ ...previewFormData, [f.id]: e.target.value })}
                    className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white text-slate-900 focus:outline-none focus:ring-2 transition"
                    style={{ focusRingColor: primaryColor } as any}
                  />
                </div>
              ))}

              <button
                type="submit"
                className="w-full mt-2 py-3 px-4 font-semibold text-xs sm:text-sm transition flex items-center justify-center gap-2 hover:opacity-95 active:scale-[0.99]"
                style={{
                  backgroundColor: primaryColor,
                  color: btnTextColor,
                  borderRadius: btnRadius
                }}
              >
                {btnIcon && <span>{btnIcon}</span>}
                <span>{theme.buttonText || 'Subscribe'}</span>
              </button>

              {footerNote && (
                <p className="text-[11px] text-center text-slate-400 dark:text-slate-500 mt-2">
                  {footerNote}
                </p>
              )}
            </form>
          ) : (
            <div className="py-6 text-center space-y-3 animate-fade-in">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto text-xl font-bold">
                ✓
              </div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">Subscribed!</h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 max-w-xs mx-auto">
                {theme.successMessage || 'Thank you for subscribing! Check your inbox for updates.'}
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setPreviewSubmitted(false);
                    setPreviewFormData({});
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                >
                  <RotateCcw size={12} /> Test Again (Reset Preview)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 overflow-y-auto">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold text-white transition-all ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Hidden File Input for Image Upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleImageUpload(file);
          e.target.value = '';
        }}
        accept="image/*"
        className="hidden"
      />

      {/* Header & Sub-Navigation */}
      <div className="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={20} className="text-indigo-600 dark:text-indigo-400" />
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                Website Newsletter Widgets & PCO Sync
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Embed subscription forms with live preview, header images, and automatic Planning Center deduplication.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex items-center">
              <button
                onClick={() => setSubTab('widgets')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  subTab === 'widgets'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Embed Widgets ({widgets.length})
              </button>
              <button
                onClick={() => setSubTab('subscribers')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                  subTab === 'subscribers'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Users size={13} />
                Subscribers ({subscribers.length})
              </button>
            </div>

            {subTab === 'widgets' && (
              <button
                onClick={handleCreateNewWidget}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition shadow-sm"
              >
                <Plus size={14} /> New Widget
              </button>
            )}

            {subTab === 'subscribers' && (
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition"
              >
                <Download size={14} /> Export CSV
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {/* ─── TAB 1: WIDGETS LIST ────────────────────────────────────────── */}
        {subTab === 'widgets' && (
          <div>
            {loading ? (
              <div className="flex items-center justify-center h-48 text-slate-400">
                <Loader2 className="animate-spin mr-2" size={20} /> Loading newsletter widgets...
              </div>
            ) : widgets.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 p-8">
                <Mail size={40} className="mx-auto text-indigo-400 mb-3" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">No Newsletter Widgets Yet</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-6">
                  Create an embeddable widget with header images, live preview, and automatic Planning Center sync.
                </p>
                <button
                  onClick={handleCreateNewWidget}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition"
                >
                  <Plus size={14} /> Create First Widget
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {widgets.map(w => (
                  <div 
                    key={w.id} 
                    className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/80 p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between"
                  >
                    <div>
                      {/* Image Thumbnail Header if present */}
                      {w.theme?.imageUrl && (
                        <div className="w-full h-28 rounded-xl overflow-hidden mb-3 bg-slate-100 dark:bg-slate-900 border border-slate-100 dark:border-slate-700">
                          <img src={w.theme.imageUrl} alt={w.name} className="w-full h-full object-cover" />
                        </div>
                      )}

                      <div className="flex items-center justify-between mb-3">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                          w.isActive 
                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/50' 
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                        }`}>
                          {w.isActive ? 'Active' : 'Inactive'}
                        </span>

                        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/50 px-2 py-0.5 rounded-md">
                          {w.displayType === 'both' ? 'Inline + Popup' : w.displayType === 'popup_bubble' ? 'Popup Modal' : 'Inline Embed'}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">{w.name}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-4">
                        {w.theme?.headline || 'Newsletter Subscription'}
                      </p>

                      <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl mb-4">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Fields:</span>
                          <span className="font-semibold">{w.fields?.length || 1} fields</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">PCO Sync:</span>
                          <span className={`font-semibold ${w.actions?.syncToPco ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                            {w.actions?.syncToPco ? '✓ People Deduplication' : 'Disabled'}
                          </span>
                        </div>
                        {w.actions?.sendWelcomeEmail && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Welcome Email:</span>
                            <span className="font-semibold text-indigo-600 dark:text-indigo-400">✓ Automated</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-700/60">
                      <button
                        onClick={() => setEmbedModalWidget(w)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold rounded-xl transition"
                      >
                        <Code size={13} /> Embed Code
                      </button>

                      <button
                        onClick={() => setQuickPreviewWidget(w)}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition"
                        title="Live Preview"
                      >
                        <Eye size={13} />
                      </button>

                      <button
                        onClick={() => {
                          setEditingWidget(w);
                          setPreviewSubmitted(false);
                          setPreviewFormData({});
                          setEditorTab('style');
                        }}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition"
                        title="Customize Widget"
                      >
                        <Sliders size={13} />
                      </button>

                      <button
                        onClick={() => handleDeleteWidget(w.id)}
                        className="px-3 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 text-xs font-semibold rounded-xl transition"
                        title="Delete Widget"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 2: SUBSCRIBERS ROSTER ──────────────────────────────────── */}
        {subTab === 'subscribers' && (
          <div className="space-y-4">
            {/* Filters bar */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name, email, or phone..."
                  value={subscriberSearch}
                  onChange={e => setSubscriberSearch(e.target.value)}
                  className="w-full text-xs pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select
                  value={subscriberFilter}
                  onChange={e => setSubscriberFilter(e.target.value as any)}
                  className="text-xs px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  <option value="all">All Subscribers</option>
                  <option value="active">Active Only</option>
                  <option value="unsubscribed">Unsubscribed Only</option>
                </select>
                <button
                  onClick={loadSubscribers}
                  disabled={loadingSubscribers}
                  className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700"
                  title="Refresh list"
                >
                  <RefreshCw size={15} className={loadingSubscribers ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {/* Subscribers Table */}
            {loadingSubscribers ? (
              <div className="flex items-center justify-center h-48 text-slate-400">
                <Loader2 className="animate-spin mr-2" size={20} /> Loading subscriber records...
              </div>
            ) : filteredSubscribers.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 p-8">
                <Users size={36} className="mx-auto text-slate-400 mb-2" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">No subscribers found</h3>
                <p className="text-xs text-slate-500">Signups through your embedded website widget will appear here.</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-5 py-3">Subscriber</th>
                      <th className="px-5 py-3">Contact</th>
                      <th className="px-5 py-3">Planning Center Match</th>
                      <th className="px-5 py-3">Subscribed On</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    {filteredSubscribers.map(sub => (
                      <tr key={sub.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-750 transition">
                        <td className="px-5 py-3.5">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {sub.firstName || sub.lastName ? `${sub.firstName || ''} ${sub.lastName || ''}`.trim() : 'Anonymous'}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {sub.widgetName || 'Website Widget'}
                          </div>
                        </td>

                        <td className="px-5 py-3.5 space-y-0.5">
                          <div className="font-medium text-slate-700 dark:text-slate-300">{sub.email}</div>
                          {sub.phone && <div className="text-[11px] text-slate-400">{sub.phone}</div>}
                        </td>

                        <td className="px-5 py-3.5">
                          {sub.pcoPersonId ? (
                            <a
                              href={`https://people.planningcenteronline.com/people/${sub.pcoPersonId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                            >
                              <UserCheck size={13} className="text-emerald-500" />
                              PCO #{sub.pcoPersonId}
                              <ExternalLink size={11} />
                            </a>
                          ) : (
                            <span className="text-slate-400 italic">Not Linked</span>
                          )}
                          {sub.isNewPcoPerson && (
                            <span className="ml-2 text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-bold">New Person</span>
                          )}
                        </td>

                        <td className="px-5 py-3.5 text-slate-500">
                          {new Date(sub.subscribedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </td>

                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            sub.status === 'active'
                              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                              : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                          }`}>
                            {sub.status === 'active' ? 'Active' : 'Unsubscribed'}
                          </span>
                        </td>

                        <td className="px-5 py-3.5 text-right space-x-2">
                          <button
                            onClick={() => handleToggleSubscriberStatus(sub)}
                            className="px-2.5 py-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-700 rounded-lg transition"
                          >
                            {sub.status === 'active' ? 'Unsubscribe' : 'Re-activate'}
                          </button>
                          <button
                            onClick={() => handleDeleteSubscriber(sub.id)}
                            className="p-1 text-slate-400 hover:text-red-500 transition"
                            title="Delete record"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── MODAL: DUAL-PANE WIDGET CUSTOMIZATION STUDIO WITH LIVE PREVIEW ─── */}
      {editingWidget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-2 sm:p-4 overflow-hidden">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-7xl w-full h-[94vh] overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col">
            
            {/* Studio Header */}
            <div className="shrink-0 px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Sliders size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editingWidget.name}
                      onChange={e => setEditingWidget({ ...editingWidget, name: e.target.value })}
                      placeholder="Widget Name"
                      className="text-base font-bold text-slate-900 dark:text-white bg-transparent border-b border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 focus:border-indigo-500 focus:outline-none"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-slate-500 font-medium cursor-pointer ml-3">
                      <input
                        type="checkbox"
                        checked={editingWidget.isActive}
                        onChange={e => setEditingWidget({ ...editingWidget, isActive: e.target.checked })}
                        className="rounded text-indigo-600"
                      />
                      Active
                    </label>
                  </div>
                  <p className="text-[11px] text-slate-400">Live customization studio with real-time browser preview</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingWidget(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveWidget}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded-xl transition shadow-md"
                >
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Save Changes
                </button>
              </div>
            </div>

            {/* Studio Navigation Tabs */}
            <div className="shrink-0 px-6 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto">
              {[
                { id: 'style', label: '🎨 Design & Image', desc: 'Colors, photo banner, card radius' },
                { id: 'content', label: '📝 Content & Copy', desc: 'Headline, badge, button, trust notes' },
                { id: 'fields', label: '📋 Form Fields', desc: 'Inputs & PCO mapping' },
                { id: 'actions', label: '⚡ PCO Actions', desc: 'Workflows, groups, emails' },
                { id: 'bubble', label: '💬 Floating Bubble', desc: 'Corner launcher & modal settings' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setEditorTab(tab.id as any)}
                  className={`py-3 px-3.5 text-xs font-bold border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
                    editorTab === tab.id
                      ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Studio Body: Split View (Left: Controls, Right: Live Interactive Preview) */}
            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
              
              {/* ─── LEFT PANE: CONFIGURATION CONTROLS ─── */}
              <div className="w-full lg:w-1/2 overflow-y-auto p-6 space-y-6 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                
                {/* TAB 1: DESIGN & IMAGE */}
                {editorTab === 'style' && (
                  <div className="space-y-6">
                    {/* Header Image & Logo Section */}
                    <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <ImageIcon size={14} className="text-indigo-600" /> Header Image & Visuals
                          </h4>
                          <p className="text-[11px] text-slate-400">Add a header banner, worship photo, or church logo.</p>
                        </div>
                        {editingWidget.theme?.imageUrl && (
                          <button
                            type="button"
                            onClick={() => setEditingWidget({
                              ...editingWidget,
                              theme: { ...editingWidget.theme, imageUrl: '' }
                            })}
                            className="text-xs text-red-500 hover:text-red-700 font-semibold"
                          >
                            Remove Image
                          </button>
                        )}
                      </div>

                      {/* Image Preview & Upload Buttons */}
                      <div className="flex flex-col sm:flex-row items-center gap-4">
                        {editingWidget.theme?.imageUrl ? (
                          <div className="w-full sm:w-36 h-24 rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-700 shrink-0 border border-slate-300 dark:border-slate-600">
                            <img 
                              src={editingWidget.theme.imageUrl} 
                              alt="Thumbnail" 
                              className="w-full h-full object-cover" 
                            />
                          </div>
                        ) : (
                          <div className="w-full sm:w-36 h-24 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 shrink-0">
                            <ImageIcon size={22} className="mb-1" />
                            <span className="text-[10px] font-semibold">No Image Set</span>
                          </div>
                        )}

                        <div className="flex-1 space-y-2 w-full">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={uploadingImage}
                              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
                            >
                              {uploadingImage ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                              Upload Image
                            </button>
                            <span className="text-xs text-slate-400">or paste URL below</span>
                          </div>

                          <input
                            type="url"
                            placeholder="https://example.com/image.jpg"
                            value={editingWidget.theme?.imageUrl || ''}
                            onChange={e => setEditingWidget({
                              ...editingWidget,
                              theme: { ...editingWidget.theme, imageUrl: e.target.value }
                            })}
                            className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>

                      {/* Image Position Selector */}
                      {editingWidget.theme?.imageUrl && (
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                            Image Display Position
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingWidget({
                                ...editingWidget,
                                theme: { ...editingWidget.theme, imagePosition: 'top_banner' }
                              })}
                              className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                                (editingWidget.theme.imagePosition || 'top_banner') === 'top_banner'
                                  ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-600 text-indigo-700 dark:text-indigo-300'
                                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              Top Full-Width Banner
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingWidget({
                                ...editingWidget,
                                theme: { ...editingWidget.theme, imagePosition: 'header_logo' }
                              })}
                              className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                                editingWidget.theme.imagePosition === 'header_logo'
                                  ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-600 text-indigo-700 dark:text-indigo-300'
                                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              Centered Logo / Icon
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Quick Presets Gallery */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                          Quick Presets & Sample Photos
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {PRESET_IMAGES.map((preset, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setEditingWidget({
                                ...editingWidget,
                                theme: {
                                  ...editingWidget.theme,
                                  imageUrl: preset.url,
                                  imagePosition: preset.pos
                                }
                              })}
                              className="px-2.5 py-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-[11px] text-slate-700 dark:text-slate-200 hover:border-indigo-500 transition"
                            >
                              {preset.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Colors & Canvas Styling */}
                    <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Palette size={14} className="text-indigo-600" /> Color Palette & Card Style
                      </h4>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {/* Primary Color */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Primary Color</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={editingWidget.theme?.primaryColor || '#4F46E5'}
                              onChange={e => setEditingWidget({
                                ...editingWidget,
                                theme: { ...editingWidget.theme, primaryColor: e.target.value }
                              })}
                              className="w-8 h-8 rounded-lg border-0 cursor-pointer p-0"
                            />
                            <input
                              type="text"
                              value={editingWidget.theme?.primaryColor || '#4F46E5'}
                              onChange={e => setEditingWidget({
                                ...editingWidget,
                                theme: { ...editingWidget.theme, primaryColor: e.target.value }
                              })}
                              className="w-20 text-[11px] font-mono px-2 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                            />
                          </div>
                        </div>

                        {/* Background Color */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Card Background</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={editingWidget.theme?.backgroundColor || '#FFFFFF'}
                              onChange={e => setEditingWidget({
                                ...editingWidget,
                                theme: { ...editingWidget.theme, backgroundColor: e.target.value }
                              })}
                              className="w-8 h-8 rounded-lg border-0 cursor-pointer p-0"
                            />
                            <input
                              type="text"
                              value={editingWidget.theme?.backgroundColor || '#FFFFFF'}
                              onChange={e => setEditingWidget({
                                ...editingWidget,
                                theme: { ...editingWidget.theme, backgroundColor: e.target.value }
                              })}
                              className="w-20 text-[11px] font-mono px-2 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                            />
                          </div>
                        </div>

                        {/* Text Color */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Text Color</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={editingWidget.theme?.textColor || '#1E293B'}
                              onChange={e => setEditingWidget({
                                ...editingWidget,
                                theme: { ...editingWidget.theme, textColor: e.target.value }
                              })}
                              className="w-8 h-8 rounded-lg border-0 cursor-pointer p-0"
                            />
                            <input
                              type="text"
                              value={editingWidget.theme?.textColor || '#1E293B'}
                              onChange={e => setEditingWidget({
                                ...editingWidget,
                                theme: { ...editingWidget.theme, textColor: e.target.value }
                              })}
                              className="w-20 text-[11px] font-mono px-2 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Sliders: Radius & Max Width */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                        <div>
                          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            <span>Border Radius</span>
                            <span className="font-mono text-indigo-600">{editingWidget.theme?.borderRadius ?? 14}px</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="30"
                            value={editingWidget.theme?.borderRadius ?? 14}
                            onChange={e => setEditingWidget({
                              ...editingWidget,
                              theme: { ...editingWidget.theme, borderRadius: parseInt(e.target.value) }
                            })}
                            className="w-full accent-indigo-600"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            <span>Max Width</span>
                            <span className="font-mono text-indigo-600">{editingWidget.theme?.cardMaxWidth ?? 480}px</span>
                          </div>
                          <input
                            type="range"
                            min="360"
                            max="640"
                            step="10"
                            value={editingWidget.theme?.cardMaxWidth ?? 480}
                            onChange={e => setEditingWidget({
                              ...editingWidget,
                              theme: { ...editingWidget.theme, cardMaxWidth: parseInt(e.target.value) }
                            })}
                            className="w-full accent-indigo-600"
                          />
                        </div>
                      </div>

                      {/* Card Shadow Selector */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">Card Shadow</label>
                        <div className="grid grid-cols-4 gap-2">
                          {(['none', 'subtle', 'elevated', 'glow'] as const).map(s => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setEditingWidget({
                                ...editingWidget,
                                theme: { ...editingWidget.theme, shadowStyle: s }
                              })}
                              className={`py-1.5 text-xs font-semibold rounded-lg capitalize border transition ${
                                (editingWidget.theme?.shadowStyle || 'subtle') === s
                                  ? 'bg-indigo-50 border-indigo-600 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                                  : 'border-slate-200 dark:border-slate-700 text-slate-500'
                              }`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: CONTENT & COPY */}
                {editorTab === 'content' && (
                  <div className="space-y-4">
                    <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <FileText size={14} className="text-indigo-600" /> Header & Text Content
                      </h4>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Badge Pill (Optional category tag)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Weekly Updates, Pastor's Desk"
                          value={editingWidget.theme?.badgeText || ''}
                          onChange={e => setEditingWidget({
                            ...editingWidget,
                            theme: { ...editingWidget.theme, badgeText: e.target.value }
                          })}
                          className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Headline
                        </label>
                        <input
                          type="text"
                          value={editingWidget.theme?.headline || ''}
                          onChange={e => setEditingWidget({
                            ...editingWidget,
                            theme: { ...editingWidget.theme, headline: e.target.value }
                          })}
                          className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Description
                        </label>
                        <textarea
                          rows={2}
                          value={editingWidget.theme?.description || ''}
                          onChange={e => setEditingWidget({
                            ...editingWidget,
                            theme: { ...editingWidget.theme, description: e.target.value }
                          })}
                          className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Text Alignment
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['center', 'left', 'right'] as const).map(align => (
                            <button
                              key={align}
                              type="button"
                              onClick={() => setEditingWidget({
                                ...editingWidget,
                                theme: { ...editingWidget.theme, textAlign: align }
                              })}
                              className={`py-1.5 text-xs font-semibold rounded-lg capitalize border transition ${
                                (editingWidget.theme?.textAlign || 'center') === align
                                  ? 'bg-indigo-50 border-indigo-600 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                                  : 'border-slate-200 dark:border-slate-700 text-slate-500'
                              }`}
                            >
                              {align}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Button Styling */}
                    <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Submit Button Customization
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Button Text</label>
                          <input
                            type="text"
                            value={editingWidget.theme?.buttonText || 'Subscribe'}
                            onChange={e => setEditingWidget({
                              ...editingWidget,
                              theme: { ...editingWidget.theme, buttonText: e.target.value }
                            })}
                            className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Button Icon / Emoji</label>
                          <div className="flex items-center gap-1.5">
                            {['💌', '✉️', '📬', '🚀', '✨'].map(icon => (
                              <button
                                key={icon}
                                type="button"
                                onClick={() => setEditingWidget({
                                  ...editingWidget,
                                  theme: { ...editingWidget.theme, buttonIcon: icon }
                                })}
                                className={`w-8 h-8 rounded-lg border text-sm flex items-center justify-center transition ${
                                  editingWidget.theme?.buttonIcon === icon
                                    ? 'bg-indigo-100 border-indigo-500'
                                    : 'border-slate-200 bg-white hover:bg-slate-50'
                                }`}
                              >
                                {icon}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setEditingWidget({
                                ...editingWidget,
                                theme: { ...editingWidget.theme, buttonIcon: '' }
                              })}
                              className="px-2 py-1 text-[11px] text-slate-400 hover:text-slate-600"
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Button Corner Style</label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['rounded', 'pill', 'square'] as const).map(bStyle => (
                            <button
                              key={bStyle}
                              type="button"
                              onClick={() => setEditingWidget({
                                ...editingWidget,
                                theme: { ...editingWidget.theme, buttonStyle: bStyle }
                              })}
                              className={`py-1.5 text-xs font-semibold rounded-lg capitalize border transition ${
                                (editingWidget.theme?.buttonStyle || 'rounded') === bStyle
                                  ? 'bg-indigo-50 border-indigo-600 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                                  : 'border-slate-200 dark:border-slate-700 text-slate-500'
                              }`}
                            >
                              {bStyle}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Trust & Success */}
                    <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Trust & Privacy Note (Below button)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 🔒 Zero spam. Unsubscribe anytime with 1 click."
                          value={editingWidget.theme?.footerNote || ''}
                          onChange={e => setEditingWidget({
                            ...editingWidget,
                            theme: { ...editingWidget.theme, footerNote: e.target.value }
                          })}
                          className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Success Confirmation Message
                        </label>
                        <input
                          type="text"
                          value={editingWidget.theme?.successMessage || ''}
                          onChange={e => setEditingWidget({
                            ...editingWidget,
                            theme: { ...editingWidget.theme, successMessage: e.target.value }
                          })}
                          className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Optional Redirect URL (after submission)
                        </label>
                        <input
                          type="url"
                          placeholder="https://yourchurch.com/welcome"
                          value={editingWidget.theme?.redirectUrl || ''}
                          onChange={e => setEditingWidget({
                            ...editingWidget,
                            theme: { ...editingWidget.theme, redirectUrl: e.target.value }
                          })}
                          className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: FORM FIELDS */}
                {editorTab === 'fields' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Information to Gather
                        </h4>
                        <p className="text-[11px] text-slate-400">Map form questions directly to Planning Center profile fields.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const newField: NewsletterFieldConfig = {
                            id: `field_${Date.now()}`,
                            label: 'Custom Question',
                            type: 'text',
                            required: false,
                            mapToPco: 'none'
                          };
                          setEditingWidget({
                            ...editingWidget,
                            fields: [...(editingWidget.fields || []), newField]
                          });
                        }}
                        className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                      >
                        <Plus size={14} /> Add Field
                      </button>
                    </div>

                    <div className="space-y-3">
                      {(editingWidget.fields || []).map((f, idx) => (
                        <div key={f.id} className="p-3.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[11px] text-slate-400 mb-0.5">Label</label>
                              <input
                                type="text"
                                value={f.label}
                                onChange={e => {
                                  const updated = [...editingWidget.fields];
                                  updated[idx].label = e.target.value;
                                  setEditingWidget({ ...editingWidget, fields: updated });
                                }}
                                className="w-full text-xs px-2.5 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] text-slate-400 mb-0.5">Input Type</label>
                              <select
                                value={f.type}
                                disabled={f.id === 'email'}
                                onChange={e => {
                                  const updated = [...editingWidget.fields];
                                  updated[idx].type = e.target.value as NewsletterFieldType;
                                  setEditingWidget({ ...editingWidget, fields: updated });
                                }}
                                className="w-full text-xs px-2.5 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900"
                              >
                                <option value="text">Text</option>
                                <option value="email">Email Address</option>
                                <option value="phone">Phone Number</option>
                                <option value="date">Date</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] text-slate-400 mb-0.5">Map to Planning Center</label>
                              <select
                                value={f.mapToPco}
                                onChange={e => {
                                  const updated = [...editingWidget.fields];
                                  updated[idx].mapToPco = e.target.value as NewsletterPcoMapping;
                                  setEditingWidget({ ...editingWidget, fields: updated });
                                }}
                                className="w-full text-xs px-2.5 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 font-medium text-indigo-600 dark:text-indigo-400"
                              >
                                <option value="email">PCO Email (Deduplicate & Link)</option>
                                <option value="firstName">PCO First Name</option>
                                <option value="lastName">PCO Last Name</option>
                                <option value="phone">PCO Mobile Phone</option>
                                <option value="birthday">PCO Birthday</option>
                                <option value="customField">PCO Custom Field</option>
                                <option value="note">Profile Note</option>
                                <option value="none">Database Only (No PCO map)</option>
                              </select>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                              <input
                                type="checkbox"
                                checked={f.required}
                                disabled={f.id === 'email'}
                                onChange={e => {
                                  const updated = [...editingWidget.fields];
                                  updated[idx].required = e.target.checked;
                                  setEditingWidget({ ...editingWidget, fields: updated });
                                }}
                                className="rounded text-indigo-600"
                              />
                              Required
                            </label>

                            {f.id !== 'email' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingWidget({
                                    ...editingWidget,
                                    fields: editingWidget.fields.filter((_, i) => i !== idx)
                                  });
                                }}
                                className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                              >
                                <Trash2 size={12} /> Remove
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TAB 4: PCO ACTIONS & AUTOMATIONS */}
                {editorTab === 'actions' && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      What to do with New Subscribers
                    </h4>

                    {/* Planning Center Sync */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editingWidget.actions?.syncToPco ?? true}
                          onChange={e => setEditingWidget({
                            ...editingWidget,
                            actions: { ...editingWidget.actions, syncToPco: e.target.checked }
                          })}
                          className="rounded text-indigo-600"
                        />
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          Sync & Match in Planning Center Online (PCO)
                        </span>
                      </label>
                      <p className="text-[11px] text-slate-500 pl-6">
                        Checks for an existing person by email and mobile phone. If found, links non-destructively; if new, creates a brand new person profile.
                      </p>

                      {editingWidget.actions?.syncToPco && (
                        <div className="pl-6 space-y-3 pt-2">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                              Enroll into PCO Workflow Step
                            </label>
                            <select
                              value={editingWidget.actions?.pcoWorkflowId || ''}
                              onChange={e => {
                                const selected = pcoWorkflows.find(w => w.id === e.target.value);
                                setEditingWidget({
                                  ...editingWidget,
                                  actions: {
                                    ...editingWidget.actions,
                                    pcoWorkflowId: selected?.id || undefined,
                                    pcoWorkflowName: selected?.name || undefined
                                  }
                                });
                              }}
                              className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900"
                            >
                              <option value="">— No Workflow Enrollment —</option>
                              {pcoWorkflows.map(wf => (
                                <option key={wf.id} value={wf.id}>{wf.name}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                              Add to Planning Center Group
                            </label>
                            <select
                              value={editingWidget.actions?.pcoGroupId || ''}
                              onChange={e => {
                                const selected = pcoGroups.find(g => g.id === e.target.value);
                                setEditingWidget({
                                  ...editingWidget,
                                  actions: {
                                    ...editingWidget.actions,
                                    pcoGroupId: selected?.id || undefined,
                                    pcoGroupName: selected?.name || undefined
                                  }
                                });
                              }}
                              className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900"
                            >
                              <option value="">— No Group Membership —</option>
                              {pcoGroups.map(grp => (
                                <option key={grp.id} value={grp.id}>{grp.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Automated Welcome Email */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editingWidget.actions?.sendWelcomeEmail || false}
                          onChange={e => setEditingWidget({
                            ...editingWidget,
                            actions: { ...editingWidget.actions, sendWelcomeEmail: e.target.checked }
                          })}
                          className="rounded text-indigo-600"
                        />
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          Send Automated Welcome Email
                        </span>
                      </label>

                      {editingWidget.actions?.sendWelcomeEmail && (
                        <div className="pl-6 space-y-2">
                          <label className="block text-[11px] text-slate-500">Select Template Campaign</label>
                          <select
                            value={editingWidget.actions?.welcomeEmailCampaignId || ''}
                            onChange={e => setEditingWidget({
                              ...editingWidget,
                              actions: { ...editingWidget.actions, welcomeEmailCampaignId: e.target.value }
                            })}
                            className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900"
                          >
                            <option value="">Default Welcome Template</option>
                            {campaigns.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.name} ({c.subject || 'No Subject'})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Staff Notifications */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editingWidget.actions?.notifyStaff || false}
                          onChange={e => setEditingWidget({
                            ...editingWidget,
                            actions: { ...editingWidget.actions, notifyStaff: e.target.checked }
                          })}
                          className="rounded text-indigo-600"
                        />
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          Notify Staff on New Subscription
                        </span>
                      </label>

                      {editingWidget.actions?.notifyStaff && (
                        <div className="pl-6 space-y-2">
                          <label className="block text-[11px] text-slate-500">Staff Notification Email(s) (comma-separated)</label>
                          <input
                            type="text"
                            placeholder="pastor@church.org, comms@church.org"
                            value={(editingWidget.actions?.staffNotificationEmails || []).join(', ')}
                            onChange={e => setEditingWidget({
                              ...editingWidget,
                              actions: {
                                ...editingWidget.actions,
                                staffNotificationEmails: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                              }
                            })}
                            className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 5: FLOATING BUBBLE */}
                {editorTab === 'bubble' && (
                  <div className="space-y-4">
                    <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Floating Corner Bubble Settings
                        </h4>
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-indigo-600">
                          <input
                            type="checkbox"
                            checked={editingWidget.bubbleConfig?.enabled ?? true}
                            onChange={e => setEditingWidget({
                              ...editingWidget,
                              bubbleConfig: {
                                ...editingWidget.bubbleConfig,
                                enabled: e.target.checked,
                                buttonText: editingWidget.bubbleConfig?.buttonText || '💌 Subscribe',
                                position: editingWidget.bubbleConfig?.position || 'right',
                                triggerMode: 'button_only'
                              }
                            })}
                            className="rounded text-indigo-600"
                          />
                          Enable Bubble
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Bubble Label Text
                          </label>
                          <input
                            type="text"
                            value={editingWidget.bubbleConfig?.buttonText || '💌 Subscribe'}
                            onChange={e => setEditingWidget({
                              ...editingWidget,
                              bubbleConfig: { ...editingWidget.bubbleConfig, buttonText: e.target.value } as any
                            })}
                            className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Corner Position
                          </label>
                          <select
                            value={editingWidget.bubbleConfig?.position || 'right'}
                            onChange={e => setEditingWidget({
                              ...editingWidget,
                              bubbleConfig: { ...editingWidget.bubbleConfig, position: e.target.value as any } as any
                            })}
                            className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800"
                          >
                            <option value="right">Bottom Right Corner</option>
                            <option value="left">Bottom Left Corner</option>
                          </select>
                        </div>
                      </div>

                      {/* Bubble Colors & Pulse */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Bubble Background</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={editingWidget.bubbleConfig?.bubbleBgColor || editingWidget.theme?.primaryColor || '#4F46E5'}
                              onChange={e => setEditingWidget({
                                ...editingWidget,
                                bubbleConfig: { ...editingWidget.bubbleConfig, bubbleBgColor: e.target.value } as any
                              })}
                              className="w-8 h-8 rounded-lg border-0 cursor-pointer p-0"
                            />
                            <input
                              type="text"
                              value={editingWidget.bubbleConfig?.bubbleBgColor || editingWidget.theme?.primaryColor || '#4F46E5'}
                              onChange={e => setEditingWidget({
                                ...editingWidget,
                                bubbleConfig: { ...editingWidget.bubbleConfig, bubbleBgColor: e.target.value } as any
                              })}
                              className="w-24 text-[11px] font-mono px-2 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Attention Pulse Glow</label>
                          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 mt-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editingWidget.bubbleConfig?.pulseAnimation ?? true}
                              onChange={e => setEditingWidget({
                                ...editingWidget,
                                bubbleConfig: { ...editingWidget.bubbleConfig, pulseAnimation: e.target.checked } as any
                              })}
                              className="rounded text-indigo-600"
                            />
                            Gentle Pulse Animation
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ─── RIGHT PANE: LIVE INTERACTIVE PREVIEW ─── */}
              <div className="w-full lg:w-1/2 bg-slate-100 dark:bg-slate-950 flex flex-col overflow-hidden border-t lg:border-t-0 border-slate-200 dark:border-slate-800">
                
                {/* Preview Viewport Header */}
                <div className="shrink-0 px-5 py-2.5 bg-slate-200/80 dark:bg-slate-900 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                      <Eye size={14} className="text-indigo-600 dark:text-indigo-400" /> Live Preview
                    </span>

                    {/* Mode Toggles */}
                    <div className="bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg flex items-center ml-2 border border-slate-300 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewMode('inline');
                          setPreviewBubbleOpen(false);
                        }}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                          previewMode === 'inline' 
                            ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' 
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Inline Embed
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewMode('bubble')}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                          previewMode === 'bubble' 
                            ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' 
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Floating Bubble
                      </button>
                    </div>
                  </div>

                  {/* Device and Background toggles */}
                  <div className="flex items-center gap-2">
                    {/* Background canvas toggle */}
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-300 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => setPreviewBg('light')}
                        className={`w-5 h-5 rounded-full border ${previewBg === 'light' ? 'ring-2 ring-indigo-500' : ''} bg-white`}
                        title="Light Canvas"
                      />
                      <button
                        type="button"
                        onClick={() => setPreviewBg('dark')}
                        className={`w-5 h-5 rounded-full border ${previewBg === 'dark' ? 'ring-2 ring-indigo-500' : ''} bg-slate-900`}
                        title="Dark Canvas"
                      />
                      <button
                        type="button"
                        onClick={() => setPreviewBg('mockup')}
                        className={`w-5 h-5 rounded-full border ${previewBg === 'mockup' ? 'ring-2 ring-indigo-500' : ''} bg-gradient-to-tr from-indigo-200 to-amber-100`}
                        title="Web Mockup Canvas"
                      />
                    </div>

                    {/* Viewport: Desktop vs Mobile */}
                    <div className="bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg flex items-center border border-slate-300 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => setPreviewDevice('desktop')}
                        className={`p-1 rounded ${previewDevice === 'desktop' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-400'}`}
                        title="Desktop Preview"
                      >
                        <Monitor size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewDevice('mobile')}
                        className={`p-1 rounded ${previewDevice === 'mobile' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-400'}`}
                        title="Mobile Preview (375px)"
                      >
                        <Smartphone size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Canvas Area */}
                <div 
                  className={`flex-1 p-6 overflow-y-auto flex items-center justify-center transition-colors relative ${
                    previewBg === 'light' 
                      ? 'bg-slate-100' 
                      : previewBg === 'dark' 
                        ? 'bg-slate-900' 
                        : 'bg-gradient-to-br from-indigo-50 via-slate-100 to-amber-50'
                  }`}
                >
                  <div className={`transition-all duration-300 w-full ${previewDevice === 'mobile' ? 'max-w-[375px]' : 'max-w-xl'}`}>
                    
                    {/* INLINE PREVIEW MODE */}
                    {previewMode === 'inline' && (
                      <div className="animate-fade-in">
                        {renderLiveWidgetCard(editingWidget)}
                      </div>
                    )}

                    {/* FLOATING BUBBLE PREVIEW MODE */}
                    {previewMode === 'bubble' && (
                      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden h-[480px] flex flex-col">
                        {/* Sample Web Page Mockup */}
                        <div className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 py-2.5 flex items-center justify-between text-xs text-slate-500">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                            <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                          </div>
                          <span className="font-mono text-[11px] text-slate-400">yourchurch.com</span>
                          <Globe size={13} />
                        </div>

                        {/* Page Body Mockup */}
                        <div className="flex-1 p-6 space-y-4 overflow-y-auto">
                          <div className="h-6 w-48 bg-slate-200 dark:bg-slate-700 rounded-md" />
                          <div className="h-4 w-72 bg-slate-100 dark:bg-slate-700/60 rounded-md" />
                          <div className="h-28 w-full bg-slate-100 dark:bg-slate-750 rounded-xl" />
                          <div className="h-4 w-60 bg-slate-100 dark:bg-slate-700/60 rounded-md" />
                        </div>

                        {/* Floating Corner Bubble Button */}
                        <button
                          type="button"
                          onClick={() => setPreviewBubbleOpen(true)}
                          className={`absolute bottom-4 ${
                            editingWidget.bubbleConfig?.position === 'left' ? 'left-4' : 'right-4'
                          } px-4 py-2.5 rounded-full text-xs font-bold shadow-xl flex items-center gap-2 cursor-pointer transition hover:scale-105 active:scale-95 z-20 ${
                            editingWidget.bubbleConfig?.pulseAnimation ? 'animate-pulse' : ''
                          }`}
                          style={{
                            backgroundColor: editingWidget.bubbleConfig?.bubbleBgColor || editingWidget.theme?.primaryColor || '#4F46E5',
                            color: editingWidget.bubbleConfig?.bubbleTextColor || '#FFFFFF'
                          }}
                        >
                          {editingWidget.bubbleConfig?.buttonIcon && <span>{editingWidget.bubbleConfig.buttonIcon}</span>}
                          <span>{editingWidget.bubbleConfig?.buttonText || '💌 Subscribe'}</span>
                        </button>

                        {/* Modal Dialog inside preview when bubble is clicked */}
                        {previewBubbleOpen && (
                          <div className="absolute inset-0 z-30 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 animate-fade-in">
                            <div className="relative w-full max-h-[92%] overflow-y-auto">
                              <button
                                type="button"
                                onClick={() => setPreviewBubbleOpen(false)}
                                className="absolute top-2 right-2 z-40 w-7 h-7 rounded-full bg-slate-800 text-white flex items-center justify-center hover:bg-slate-700 shadow-md text-xs"
                              >
                                ✕
                              </button>
                              {renderLiveWidgetCard(editingWidget)}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: DEDICATED QUICK PREVIEW (Eye icon from card) ─────────── */}
      {quickPreviewWidget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-xl w-full p-6 border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Eye size={18} className="text-indigo-600" />
                  Live Preview: {quickPreviewWidget.name}
                </h3>
                <p className="text-xs text-slate-400">Interactive live widget simulation</p>
              </div>
              <button 
                onClick={() => setQuickPreviewWidget(null)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800"
              >
                <X size={15} />
              </button>
            </div>

            <div className="p-4 bg-slate-100 dark:bg-slate-950 rounded-2xl mb-4 flex justify-center">
              {renderLiveWidgetCard(quickPreviewWidget)}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  const target = quickPreviewWidget;
                  setQuickPreviewWidget(null);
                  setEditingWidget(target);
                  setPreviewSubmitted(false);
                  setPreviewFormData({});
                  setEditorTab('style');
                }}
                className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition"
              >
                Open in Studio
              </button>
              <button
                onClick={() => setQuickPreviewWidget(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: EMBED CODE (Copy & Paste for Squarespace/WordPress) ─── */}
      {embedModalWidget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-xl w-full p-6 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Code size={18} className="text-indigo-600" />
                Embed Code: {embedModalWidget.name}
              </h2>
              <button 
                onClick={() => { setEmbedModalWidget(null); setCopiedScript(false); setCopiedIframe(false); }}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800"
              >
                <X size={15} />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Paste this snippet into your website (Squarespace, WordPress, Webflow, or custom HTML). It automatically renders the widget with full Shadow DOM CSS isolation.
            </p>

            {/* Standard Script Snippet */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Recommended: Script Tag (Shadow DOM Isolated)
                </span>
                <button
                  onClick={() => {
                    const scriptCode = `<!-- Planning Center Newsletter Widget -->\n<script src="${apiBaseUrl}/widget/newsletter.js" data-church-id="${churchId}" data-widget-id="${embedModalWidget.id}" defer></script>\n<div id="pco-newsletter-widget"></div>`;
                    navigator.clipboard.writeText(scriptCode);
                    setCopiedScript(true);
                    setTimeout(() => setCopiedScript(false), 2500);
                  }}
                  className="flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {copiedScript ? <><CheckCircle size={13} className="text-emerald-500" /> Copied!</> : <><Copy size={13} /> Copy Snippet</>}
                </button>
              </div>
              <pre className="p-3 bg-slate-900 text-slate-200 font-mono text-[11px] rounded-xl overflow-x-auto whitespace-pre-wrap select-all">
                {`<!-- Planning Center Newsletter Widget -->\n<script src="${apiBaseUrl}/widget/newsletter.js" data-church-id="${churchId}" data-widget-id="${embedModalWidget.id}" defer></script>\n<div id="pco-newsletter-widget"></div>`}
              </pre>
            </div>

            {/* Iframe Fallback */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Alternative: Direct Link
                </span>
                <button
                  onClick={() => {
                    const linkUrl = `${apiBaseUrl}/subscribe/${churchId}`;
                    navigator.clipboard.writeText(linkUrl);
                    setCopiedIframe(true);
                    setTimeout(() => setCopiedIframe(false), 2500);
                  }}
                  className="flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {copiedIframe ? <><CheckCircle size={13} className="text-emerald-500" /> Copied!</> : <><Copy size={13} /> Copy Link</>}
                </button>
              </div>
              <pre className="p-3 bg-slate-900 text-slate-200 font-mono text-[11px] rounded-xl overflow-x-auto select-all">
                {`${apiBaseUrl}/subscribe/${churchId}`}
              </pre>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setEmbedModalWidget(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
