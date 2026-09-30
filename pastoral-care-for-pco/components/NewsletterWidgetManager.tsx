import React, { useState, useEffect, useMemo } from 'react';
import { 
  Mail, Plus, Trash2, Eye, Copy, CheckCircle, RefreshCw, Settings, Code, 
  Users, ExternalLink, ChevronRight, AlertCircle, ArrowLeft, Loader2, 
  Sparkles, Sliders, Check, X, ShieldCheck, UserCheck, Search, Download,
  Layers, MessageSquare, Send
} from 'lucide-react';
import { firestore } from '../services/firestoreService';
import { pcoService } from '../services/pcoService';
import { 
  NewsletterWidgetConfig, 
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

  // Widget editing state
  const [editingWidget, setEditingWidget] = useState<NewsletterWidgetConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  // Load email campaigns (for welcome email picker) & PCO workflows/groups
  useEffect(() => {
    loadWidgets();
    loadSubscribers();

    // Fetch campaigns for welcome email selector
    firestore.getEmailCampaigns(churchId)
      .then(c => setCampaigns(c || []))
      .catch(() => {});

    // Fetch PCO workflows
    pcoService.getWorkflows(churchId)
      .then(wf => setPcoWorkflows(wf || []))
      .catch(() => {});

    // Fetch PCO groups
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
        borderRadius: 12,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        headline: `Subscribe to our Newsletter`,
        description: 'Stay updated with announcements, events, and devotionals.',
        buttonText: 'Subscribe',
        successMessage: 'Thank you for subscribing! Check your inbox for updates.',
      },
      bubbleConfig: {
        enabled: true,
        buttonText: '💌 Subscribe',
        buttonIcon: '💌',
        position: 'right',
        triggerMode: 'button_only',
        delaySeconds: 5,
        scrollPercent: 40
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
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 overflow-y-auto">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold text-white transition-all ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Sub-Header & Navigation */}
      <div className="shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
              <Mail className="text-indigo-600 dark:text-indigo-400" size={22} />
              Newsletter & Website Widgets
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Embed newsletter capture widgets on your website and automatically sync subscribers into Planning Center.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setSubTab('widgets')}
                className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                  subTab === 'widgets'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Code size={14} /> Widgets ({widgets.length})
              </button>
              <button
                onClick={() => setSubTab('subscribers')}
                className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                  subTab === 'subscribers'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Users size={14} /> Subscribers ({subscribers.length})
              </button>
            </div>

            {subTab === 'widgets' && (
              <button
                onClick={handleCreateNewWidget}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition shadow-sm shadow-indigo-600/20"
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
                  Create an embeddable widget to capture subscribers directly from your church website into Planning Center.
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
                        onClick={() => setEditingWidget(w)}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition"
                        title="Edit Widget & Fields"
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
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
            {/* Search and Filters */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search subscribers by name, email, phone..."
                  value={subscriberSearch}
                  onChange={e => setSubscriberSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl w-full sm:w-auto">
                  {(['all', 'active', 'unsubscribed'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setSubscriberFilter(mode)}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg capitalize transition flex-1 sm:flex-none ${
                        subscriberFilter === mode
                          ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Table */}
            {loadingSubscribers ? (
              <div className="flex items-center justify-center py-20 text-slate-400 text-xs">
                <Loader2 className="animate-spin mr-2" size={18} /> Loading subscribers...
              </div>
            ) : filteredSubscribers.length === 0 ? (
              <div className="text-center py-20 text-slate-400 text-xs">
                No subscribers match your search.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-5 py-3.5">Subscriber</th>
                      <th className="px-5 py-3.5">Contact</th>
                      <th className="px-5 py-3.5">Planning Center Status</th>
                      <th className="px-5 py-3.5">Subscribed Date</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {filteredSubscribers.map(sub => (
                      <tr key={sub.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-750 transition">
                        <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">
                          <div>{sub.name || `${sub.firstName || ''} ${sub.lastName || ''}`.trim() || 'Anonymous'}</div>
                          <div className="text-[11px] text-slate-400">{sub.widgetName || 'Website Widget'}</div>
                        </td>

                        <td className="px-5 py-3.5">
                          <div className="text-slate-800 dark:text-slate-200">{sub.email}</div>
                          {sub.phone && <div className="text-[11px] text-slate-400">{sub.phone}</div>}
                        </td>

                        <td className="px-5 py-3.5">
                          {sub.pcoPersonId ? (
                            <a
                              href={`https://people.planningcenteronline.com/people/${sub.pcoPersonId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold hover:bg-emerald-100 transition"
                            >
                              <UserCheck size={13} />
                              {sub.isNewPcoPerson ? 'Created #' + sub.pcoPersonId : 'Linked #' + sub.pcoPersonId}
                              <ExternalLink size={10} className="ml-0.5 opacity-60" />
                            </a>
                          ) : (
                            <span className="text-slate-400 italic">No PCO Record</span>
                          )}
                        </td>

                        <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">
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

      {/* ─── MODAL: WIDGET EDITOR (Visual Form Builder & Settings) ──────── */}
      {editingWidget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-4xl w-full my-8 overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="shrink-0 px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sliders size={18} className="text-indigo-600" />
                  Customize Newsletter Widget
                </h2>
                <p className="text-xs text-slate-500">Configure appearance, collected fields, and Planning Center sync actions.</p>
              </div>
              <button 
                onClick={() => setEditingWidget(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* 1. General & Display Type */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">1. Basic Info & Display Mode</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Widget Name</label>
                    <input
                      type="text"
                      value={editingWidget.name}
                      onChange={e => setEditingWidget({ ...editingWidget, name: e.target.value })}
                      placeholder="e.g. Website Footer Newsletter"
                      className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Display Mode</label>
                    <select
                      value={editingWidget.displayType}
                      onChange={e => setEditingWidget({ ...editingWidget, displayType: e.target.value as any })}
                      className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    >
                      <option value="both">Both (Inline Embed + Floating Corner Bubble)</option>
                      <option value="inline">Inline Embed Only</option>
                      <option value="popup_bubble">Floating Corner Bubble / Modal Only</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 2. Theme & Content */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">2. Content & Styling</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Headline</label>
                    <input
                      type="text"
                      value={editingWidget.theme?.headline || ''}
                      onChange={e => setEditingWidget({
                        ...editingWidget,
                        theme: { ...editingWidget.theme, headline: e.target.value }
                      })}
                      className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800"
                    />
                  </div>

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

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Description</label>
                    <input
                      type="text"
                      value={editingWidget.theme?.description || ''}
                      onChange={e => setEditingWidget({
                        ...editingWidget,
                        theme: { ...editingWidget.theme, description: e.target.value }
                      })}
                      className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Success Message</label>
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
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Primary Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editingWidget.theme?.primaryColor || '#4F46E5'}
                        onChange={e => setEditingWidget({
                          ...editingWidget,
                          theme: { ...editingWidget.theme, primaryColor: e.target.value }
                        })}
                        className="w-9 h-9 rounded-lg border-0 cursor-pointer p-0"
                      />
                      <input
                        type="text"
                        value={editingWidget.theme?.primaryColor || '#4F46E5'}
                        onChange={e => setEditingWidget({
                          ...editingWidget,
                          theme: { ...editingWidget.theme, primaryColor: e.target.value }
                        })}
                        className="w-28 text-xs font-mono px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Optional Redirect URL (after submit)</label>
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

              {/* 3. Fields Configuration (Information Gathering) */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    3. Information to Gather (Form Fields)
                  </h3>
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
                    <div key={f.id} className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
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
                            className="w-full text-xs px-2.5 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900"
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
                            className="w-full text-xs px-2.5 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900"
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
                            className="w-full text-xs px-2.5 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 font-medium text-indigo-600 dark:text-indigo-400"
                          >
                            <option value="email">PCO Email (Match & Link)</option>
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

                      <div className="flex items-center gap-3 shrink-0 mt-2 sm:mt-0">
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
                              const updated = editingWidget.fields.filter((_, i) => i !== idx);
                              setEditingWidget({ ...editingWidget, fields: updated });
                            }}
                            className="p-1 text-slate-400 hover:text-red-500 transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4. What to do with new subscribers (Actions) */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  4. What to Do with New Subscribers (Actions & Automation)
                </h3>

                <div className="space-y-4">
                  {/* PCO Sync Toggle */}
                  <label className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingWidget.actions?.syncToPco !== false}
                      onChange={e => setEditingWidget({
                        ...editingWidget,
                        actions: { ...editingWidget.actions, syncToPco: e.target.checked }
                      })}
                      className="rounded text-indigo-600 w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <ShieldCheck size={14} className="text-emerald-500" />
                        Sync to Planning Center People (Intelligent Deduplication)
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Matches existing profiles by email and phone first; enriches empty fields or creates a new person without creating duplicates.
                      </div>
                    </div>
                  </label>

                  {/* PCO Workflow Selection */}
                  <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                    <label className="block text-xs font-bold text-slate-900 dark:text-white">
                      Enroll in Planning Center Workflow (Optional)
                    </label>
                    <select
                      value={editingWidget.actions?.pcoWorkflowId || ''}
                      onChange={e => {
                        const wfId = e.target.value;
                        const matchedWf = pcoWorkflows.find(w => w.id === wfId);
                        setEditingWidget({
                          ...editingWidget,
                          actions: {
                            ...editingWidget.actions,
                            pcoWorkflowId: wfId || undefined,
                            pcoWorkflowName: matchedWf?.attributes?.name || undefined
                          }
                        });
                      }}
                      className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900"
                    >
                      <option value="">None (Don't enroll in a workflow)</option>
                      {pcoWorkflows.map(w => (
                        <option key={w.id} value={w.id}>
                          {w.attributes?.name || 'Workflow #' + w.id}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* PCO Group Selection */}
                  <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                    <label className="block text-xs font-bold text-slate-900 dark:text-white">
                      Add to Planning Center Group (Optional)
                    </label>
                    <select
                      value={editingWidget.actions?.pcoGroupId || ''}
                      onChange={e => {
                        const gId = e.target.value;
                        const matchedGrp = pcoGroups.find(g => g.id === gId);
                        setEditingWidget({
                          ...editingWidget,
                          actions: {
                            ...editingWidget.actions,
                            pcoGroupId: gId || undefined,
                            pcoGroupName: matchedGrp?.name || undefined
                          }
                        });
                      }}
                      className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900"
                    >
                      <option value="">None (Don't add to a group)</option>
                      {pcoGroups.map(g => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Automated Welcome Email */}
                  <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
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
                        Send Automated Welcome Email Immediately
                      </span>
                    </label>

                    {editingWidget.actions?.sendWelcomeEmail && (
                      <div className="pl-6 space-y-2">
                        <label className="block text-[11px] text-slate-500">Select Template from Email Builder (Optional)</label>
                        <select
                          value={editingWidget.actions?.welcomeEmailCampaignId || ''}
                          onChange={e => setEditingWidget({
                            ...editingWidget,
                            actions: { ...editingWidget.actions, welcomeEmailCampaignId: e.target.value || undefined }
                          })}
                          className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900"
                        >
                          <option value="">Default Welcome Message</option>
                          {campaigns.map(c => (
                            <option key={c.id} value={c.id}>
                              Campaign: {c.name} ({c.subject || 'No Subject'})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Staff Notifications */}
                  <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
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
                          className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3 bg-slate-50 dark:bg-slate-900">
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
                className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded-xl transition shadow-sm"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Save Widget Configuration
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
              Paste this snippet into your website (Squarespace, WordPress, Webflow, or custom HTML). It automatically renders the widget with full CSS isolation.
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
                  Alternative: Direct Landing Page Link
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
