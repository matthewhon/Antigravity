import React, { useState, useEffect, useCallback } from 'react';
import { EmailBuilder } from './EmailBuilder';
import { EmailBlock } from './EmailBuilder';
import { TemplateSettingsEditor } from './TemplateSettingsEditor';
import { EmailPreview } from './EmailPreview';
import { Drawer } from './Drawer';
import { pcoService } from '../services/pcoService';
import { firestore } from '../services/firestoreService';
import { storage } from '../services/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { DataChartSelector } from './DataChartSelector';
import { PollsManager } from './PollsManager';

import { PcoImportModal } from './PcoImportModal';
import { EmailCampaign, TemplateSettings, PcoList, Church, EmailUnsubscribe } from '../types';
import {
  Mail, Plus, ChevronDown, ChevronUp, CheckCircle, Circle, Send,
  Clock, Users, AtSign, FileText, AlignLeft, Calendar, ArrowLeft,
  Trash2, Eye, Pencil, Loader2, X, List, UserMinus, Search
} from 'lucide-react';

// ─── Helpers ───────────────────────────────────────────────────────────────

const DEFAULT_TEMPLATE: TemplateSettings = {
  primaryColor: '#4f46e5',
  textColor: '#1f2937',
  backgroundColor: '#ffffff',
  linkColor: '#2563eb',
  fontFamily: 'sans-serif',
  header: 'Church Newsletter',
  footer: '© 2026 Church Name · Unsubscribe',
  showLogo: true,
};

const newCampaign = (churchId: string, name: string): EmailCampaign => ({
  id: `email_${Date.now()}`,
  churchId,
  name,
  status: 'draft',
  subject: name,
  blocks: [],
  templateSettings: DEFAULT_TEMPLATE,
  createdAt: Date.now(),
  updatedAt: Date.now()
});

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft:     { label: 'Draft',     color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  scheduled: { label: 'Scheduled', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  sent:      { label: 'Sent',      color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  failed:    { label: 'Failed',    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

// ─── Sub-components ─────────────────────────────────────────────────────────

interface AccordionSectionProps {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  isComplete: boolean;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const AccordionSection: React.FC<AccordionSectionProps> = ({
  title, subtitle, icon: _icon, isComplete, isOpen, onToggle, children
}) => (
  <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-3">
    <button
      className="w-full flex items-center gap-3 p-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 transition text-left"
      onClick={onToggle}
    >
      {isComplete
        ? <CheckCircle size={20} className="text-emerald-500 shrink-0" />
        : <Circle size={20} className="text-slate-300 dark:text-slate-600 shrink-0" />
      }
      <div className="flex-grow">
        <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{title}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</div>
      </div>
      {isOpen
        ? <ChevronUp size={16} className="text-slate-400 shrink-0" />
        : <ChevronDown size={16} className="text-slate-400 shrink-0" />
      }
    </button>
    {isOpen && (
      <div className="border-t border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-800">
        {children}
      </div>
    )}
  </div>
);

// ─── Campaign Preview Modal ──────────────────────────────────────────────────

const CampaignPreviewModal: React.FC<{ campaign: EmailCampaign; onClose: () => void; churchLogoUrl?: string }> = ({ campaign, onClose, churchLogoUrl }) => {
  const blocks = (campaign.blocks || []) as EmailBlock[];
  const settings: TemplateSettings = campaign.templateSettings || DEFAULT_TEMPLATE;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative flex flex-col w-full max-w-2xl mx-auto my-8 flex-1 max-h-[calc(100vh-4rem)] rounded-2xl shadow-2xl overflow-hidden bg-white dark:bg-slate-900"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
          <div className="min-w-0">
            <p className="font-bold text-slate-900 dark:text-white text-sm truncate">{campaign.subject || campaign.name}</p>
            {campaign.fromName && (
              <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                From: {campaign.fromName} &lt;{campaign.fromEmail}&gt;
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
          >
            <X size={18} />
          </button>
        </div>
        {/* Scrollable preview body */}
        <div className="flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-950 p-4">
          {blocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400">
              <Mail size={32} className="mb-2 opacity-40" />
              <p className="text-sm">No content blocks yet</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden shadow-lg">
              <EmailPreview blocks={blocks} settings={settings} churchLogoUrl={churchLogoUrl} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Schedule Modal ───────────────────────────────────────────────────────────

const ScheduleModal: React.FC<{
  onConfirm: (scheduledAt: number) => void;
  onCancel: () => void;
  isScheduling: boolean;
}> = ({ onConfirm, onCancel, isScheduling }) => {
  // Default to tomorrow at 9am local time
  const defaultDt = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [dateTime, setDateTime] = useState(defaultDt);

  const handleConfirm = () => {
    const ts = new Date(dateTime).getTime();
    if (isNaN(ts) || ts <= Date.now()) {
      alert('Please choose a time in the future.');
      return;
    }
    onConfirm(ts);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
          <Clock size={16} className="text-amber-500" /> Schedule Email
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Analytics widgets will automatically refresh with live data before sending.
        </p>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Send Date &amp; Time</label>
        <input
          type="datetime-local"
          value={dateTime}
          onChange={e => setDateTime(e.target.value)}
          min={new Date().toISOString().slice(0, 16)}
          className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 mb-4"
        />
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2 text-sm text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isScheduling}
            className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-xl transition"
          >
            {isScheduling ? <><Loader2 size={13} className="animate-spin" /> Scheduling…</> : <><Calendar size={13} /> Schedule</>}
          </button>
        </div>
      </div>
    </div>
  );
};


interface CampaignListViewProps {
  churchId: string;
  campaigns: EmailCampaign[];
  isLoading: boolean;
  onOpen: (c: EmailCampaign) => void;
  onPreview: (c: EmailCampaign) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}

const CampaignListView: React.FC<CampaignListViewProps> = ({
  campaigns, isLoading, onOpen, onPreview, onDelete, onCreate
}) => {
  const [tab, setTab] = React.useState<'all' | 'draft' | 'sent'>('all');
  const filtered = tab === 'all' ? campaigns : campaigns.filter(c => c.status === tab);
  const counts = {
    all: campaigns.length,
    draft: campaigns.filter(c => c.status === 'draft' || c.status === 'scheduled').length,
    sent: campaigns.filter(c => c.status === 'sent').length,
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <Mail size={26} className="text-indigo-500" /> Emails
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Create and send emails to your Planning Center audience
          </p>
        </div>
        <button
          onClick={onCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition shadow-sm"
        >
          <Plus size={16} /> Create New
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-5 w-fit">
        {(['all', 'draft', 'sent'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              tab === t
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t === 'all' ? 'All' : t === 'draft' ? 'Drafts' : 'Sent'}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              tab === t ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
            }`}>{counts[t]}</span>
          </button>
        ))}
      </div>

      {/* Campaign list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-slate-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Loading campaigns…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
          <Mail size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-slate-600 dark:text-slate-400 font-medium">
            {tab === 'sent' ? 'No sent emails yet' : tab === 'draft' ? 'No drafts' : 'No email campaigns yet'}
          </p>
          {tab !== 'sent' && (
            <>
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-1 mb-4">Create your first email to get started</p>
              <button onClick={onCreate} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition">
                <span className="flex items-center gap-1.5"><Plus size={14} /> Create New</span>
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => {
            const statusInfo = STATUS_LABELS[c.status] || STATUS_LABELS.draft;
            return (
              <div
                key={c.id}
                className="flex items-center gap-4 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-indigo-300 dark:hover:border-indigo-600 transition cursor-pointer group"
                onClick={() => onOpen(c)}
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                  <Mail size={18} className="text-indigo-500" />
                </div>
                <div className="flex-grow min-w-0">
                  <div className="font-semibold text-slate-900 dark:text-white truncate">{c.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap gap-x-2">
                    <span>{c.subject ? `"${c.subject}"` : 'No subject'}</span>
                    {c.toListName && <span>· To: {c.toListName}</span>}
                    <span>· {(c.blocks?.length || 0)} block{(c.blocks?.length || 0) !== 1 ? 's' : ''}</span>
                    {c.status === 'sent' && c.sentAt && (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        · Sent {new Date(c.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                    {c.status === 'scheduled' && c.scheduledAt && (
                      <span className="text-amber-600 dark:text-amber-400">
                        · Scheduled for {new Date(c.scheduledAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    )}
                    {c.status === 'failed' && c.lastError && (
                      <span className="text-red-500" title={c.lastError}>· Failed</span>
                    )}
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${statusInfo.color}`}>
                  {statusInfo.label}
                </span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); onPreview(c); }}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                    title="Preview"
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); onOpen(c); }}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); onDelete(c.id); }}
                    className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Email Editor View ───────────────────────────────────────────────────────

type EditorPanel = 'config' | 'builder' | 'preview';

interface EmailEditorProps {
  campaign: EmailCampaign;
  churchId: string;
  church?: Church;
  onBack: () => void;
  onSave: (updates: Partial<EmailCampaign>) => void;
  onSend: () => void;
  onSendTest: () => void;
  onSchedule: () => void;
  isSending: boolean;
  isScheduled: boolean;
  onLogoUploaded?: (logoUrl: string) => void;
  onLogoRemoved?: () => void;
}

const EmailEditor: React.FC<EmailEditorProps> = ({
  campaign, churchId, church, onBack, onSave, onSend, onSendTest, onSchedule, isSending, isScheduled,
  onLogoUploaded, onLogoRemoved,
}) => {
  const [logoUploading, setLogoUploading] = useState(false);

  // Upload a new church logo to Firebase Storage, then persist the URL to Firestore
  const handleLogoUpload = useCallback(async (file: File) => {
    setLogoUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `church_logos/${churchId}/logo_${Date.now()}.${ext}`;
      const sRef = storageRef(storage, path);
      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(sRef, file);
        task.on('state_changed', () => {}, reject, () => resolve());
      });
      const logoUrl = await getDownloadURL(sRef);
      await firestore.updateChurch(churchId, { logoUrl });
      onLogoUploaded?.(logoUrl);
    } catch (e) {
      console.error('[CommunicationModule] Logo upload failed:', e);
      alert('Logo upload failed. Please try again.');
    } finally {
      setLogoUploading(false);
    }
  }, [churchId, onLogoUploaded]);

  // Remove church logo from Firestore (does not delete from Storage to preserve old emails)
  const handleLogoRemove = useCallback(async () => {
    try {
      await firestore.updateChurch(churchId, { logoUrl: undefined });
      onLogoRemoved?.();
    } catch (e) {
      console.error('[CommunicationModule] Logo remove failed:', e);
    }
  }, [churchId, onLogoRemoved]);

  // Determine if the church has a configured From address (shared OR custom domain)
  // In both cases the From email is locked to what's set in Mail Settings.
  const isLockedMode = !!church?.emailSettings?.fromEmail;
  const isCustomMode = church?.emailSettings?.mode === 'custom';
  // Keep isSharedMode for the badge label
  const isSharedMode = church?.emailSettings?.mode === 'shared' && isLockedMode;
  const lockedFromEmail = church?.emailSettings?.fromEmail || '';

  // If a configured From email exists and the campaign doesn't have it set yet, pre-apply it
  const initialCampaign: EmailCampaign = React.useMemo(() => {
    if (isLockedMode) {
      return {
        ...campaign,
        fromEmail: lockedFromEmail,
        fromName: campaign.fromName || church?.emailSettings?.fromName || church?.name || '',
      };
    }
    return campaign;
  }, [campaign.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [localCampaign, setLocalCampaign] = useState<EmailCampaign>(initialCampaign);
  const [panel, setPanel] = useState<EditorPanel>('config');
  const [openSection, setOpenSection] = useState<string | null>('to');
  const [pcoLists, setPcoLists] = useState<PcoList[]>([]);
  const [pcoGroups, setPcoGroups] = useState<{ id: string; name: string; memberCount: number }[]>([]);
  const [toTab, setToTab] = useState<'lists' | 'groups'>('lists');
  const [loadingLists, setLoadingLists] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);

  // Drawers (for block builder internals)
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const [isPcoDrawerOpen, setIsPcoDrawerOpen] = useState(false);
  const [isDataChartDrawerOpen, setIsDataChartDrawerOpen] = useState(false);
  const [isPastoralCareDrawerOpen, setIsPastoralCareDrawerOpen] = useState(false);

  // Keep onSave ref up to date to avoid stale closure in update callback
  const onSaveRef = React.useRef(onSave);
  React.useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  // Auto-save on change — uses ref so setBlocks never captures stale onSave
  const update = useCallback((patch: Partial<EmailCampaign>) => {
    setLocalCampaign(prev => ({ ...prev, ...patch, updatedAt: Date.now() }));
    onSaveRef.current(patch);
    setLastSaved(Date.now());
  }, []); // stable — never re-created

  // Load PCO Lists when "To" section is opened on the Lists tab
  useEffect(() => {
    if (openSection === 'to' && toTab === 'lists' && pcoLists.length === 0) {
      setLoadingLists(true);
      pcoService.getPeopleLists(churchId).then(raw => {
        const mapped: PcoList[] = (raw || []).map((item: any) => ({
          id: item.id,
          name: item.attributes?.name || 'Unnamed List',
          totalPeople: item.attributes?.total_people || 0,
          status: item.attributes?.status || 'active'
        }));
        setPcoLists(mapped);
        setLoadingLists(false);
      }).catch(() => setLoadingLists(false));
    }
  }, [openSection, toTab, churchId, pcoLists.length]);

  // Load PCO Groups when the Groups tab is selected
  useEffect(() => {
    if (openSection === 'to' && toTab === 'groups' && pcoGroups.length === 0) {
      setLoadingGroups(true);
      pcoService.getGroups(churchId).then(raw => {
        const mapped = (raw || []).map((item: any) => ({
          id: item.id,
          name: item.attributes?.name || 'Unnamed Group',
          memberCount: item.attributes?.memberships_count ?? item.attributes?.member_count ?? 0,
        }));
        setPcoGroups(mapped);
        setLoadingGroups(false);
      }).catch(() => setLoadingGroups(false));
    }
  }, [openSection, toTab, churchId, pcoGroups.length]);

  const toggleSection = (id: string) => setOpenSection(prev => prev === id ? null : id);

  const isToComplete = !!(localCampaign.toListId || localCampaign.toGroupId);
  const toRecipientLabel = localCampaign.toGroupName
    ? `Group: ${localCampaign.toGroupName}`
    : localCampaign.toListName || localCampaign.toListId || '';
  const isFromComplete = !!(localCampaign.fromName && localCampaign.fromEmail);
  const isSubjectComplete = !!(localCampaign.subject?.trim());
  const isSendTimeComplete = !!(localCampaign.sendAt !== undefined);
  const isContentComplete = (localCampaign.blocks?.length || 0) > 0;
  const canSend = isFromComplete && isSubjectComplete;

  const scheduleMode = localCampaign.sendAt === null ? 'now' : 'schedule';

  const handlePcoInsert = (newBlocks: EmailBlock[]) => {
    const mergedBlocks = [...(localCampaign.blocks || []) as EmailBlock[], ...newBlocks];
    update({ blocks: mergedBlocks });
    setIsPcoDrawerOpen(false);
  };

  const blocks = (localCampaign.blocks || []) as EmailBlock[];
  const setBlocks = (fn: React.SetStateAction<EmailBlock[]>) => {
    const newBlocks = typeof fn === 'function' ? fn(blocks) : fn;
    update({ blocks: newBlocks });
  };

  const settings: TemplateSettings = localCampaign.templateSettings || DEFAULT_TEMPLATE;

  return (
    <div className="flex flex-col h-full">
      {/* ─── Header Bar ─── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <span className="font-medium cursor-pointer hover:text-indigo-600" onClick={onBack}>Emails</span>
            <ChevronDown size={14} className="-rotate-90" />
            <span className="font-semibold text-slate-900 dark:text-white">{localCampaign.name}</span>
          </div>
          {lastSaved && (
            <span className="text-[10px] font-medium text-emerald-500 flex items-center gap-1">
              <CheckCircle size={11} /> Saved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Panel tabs */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 mr-2">
            {(['config', 'builder', 'preview'] as EditorPanel[]).map(p => (
              <button
                key={p}
                onClick={() => setPanel(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition flex items-center gap-1.5 ${
                  panel === p
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {p === 'config' && <AlignLeft size={12} />}
                {p === 'builder' && <Pencil size={12} />}
                {p === 'preview' && <Eye size={12} />}
                {p}
              </button>
            ))}
          </div>
          <button
            className="px-3 py-2 text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition font-medium"
            onClick={onSendTest}
          >
            Send Test
          </button>
          {/* Schedule button */}
          {!isScheduled && (
            <button
              onClick={onSchedule}
              disabled={!canSend || isSending}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl transition border ${
                canSend && !isSending
                  ? 'border-amber-400 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                  : 'border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Clock size={14} /> Schedule
            </button>
          )}
          {/* Send Now button */}
          <button
            onClick={onSend}
            disabled={!canSend || isSending}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition ${
              canSend && !isSending
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
            }`}
          >
            {isSending ? (
              <><Loader2 size={14} className="animate-spin" /> Sending…</>
            ) : isScheduled ? (
              <><Send size={14} /> Send Now Instead</>
            ) : (
              <><Send size={14} /> Send Now</>
            )}
          </button>
        </div>
      </div>

      {/* ─── Body ─── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Config Panel */}
        {panel === 'config' && (
          <div className="flex flex-1 overflow-hidden">
            {/* Config accordion */}
            <div className="w-[460px] shrink-0 overflow-y-auto p-6 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">

              {/* To */}
              <AccordionSection
                id="to" title="To" icon={<Users size={16} />}
                subtitle={isToComplete ? toRecipientLabel : 'No recipients selected'}
                isComplete={isToComplete} isOpen={openSection === 'to'} onToggle={() => toggleSection('to')}
              >
                {/* Lists / Groups tabs */}
                <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 mb-3">
                  {(['lists', 'groups'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setToTab(tab)}
                      className={`flex-1 py-1.5 text-xs font-semibold capitalize transition ${
                        toTab === tab
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-600'
                      }`}
                    >
                      PCO {tab === 'lists' ? 'Lists' : 'Groups'}
                    </button>
                  ))}
                </div>

                {toTab === 'lists' && (
                  <>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                      Select a Planning Center <strong>List</strong> as your audience. Unsubscribed individuals are automatically excluded.
                    </p>
                    {loadingLists ? (
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Loader2 size={14} className="animate-spin" /> Loading PCO Lists…
                      </div>
                    ) : (
                      <select
                        className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
                        value={localCampaign.toListId || ''}
                        onChange={e => {
                          const selected = pcoLists.find(l => l.id === e.target.value);
                          update({
                            toListId: selected?.id,
                            toListName: selected?.name,
                            toGroupId: undefined,
                            toGroupName: undefined,
                          });
                        }}
                      >
                        <option value="">— Select a PCO List —</option>
                        {pcoLists.length === 0 && <option disabled>No lists found (connect PCO first)</option>}
                        {pcoLists.map(l => (
                          <option key={l.id} value={l.id}>{l.name} ({l.totalPeople} people)</option>
                        ))}
                      </select>
                    )}
                  </>
                )}

                {toTab === 'groups' && (
                  <>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                      Send to all members of a Planning Center <strong>Group</strong>. Member emails are fetched at send time.
                    </p>
                    {loadingGroups ? (
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Loader2 size={14} className="animate-spin" /> Loading PCO Groups…
                      </div>
                    ) : (
                      <select
                        className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
                        value={localCampaign.toGroupId || ''}
                        onChange={e => {
                          const selected = pcoGroups.find(g => g.id === e.target.value);
                          update({
                            toGroupId: selected?.id,
                            toGroupName: selected?.name,
                            toListId: undefined,
                            toListName: undefined,
                          });
                        }}
                      >
                        <option value="">— Select a PCO Group —</option>
                        {pcoGroups.length === 0 && <option disabled>No groups found (connect PCO first)</option>}
                        {pcoGroups.map(g => (
                          <option key={g.id} value={g.id}>{g.name}{g.memberCount > 0 ? ` (${g.memberCount} members)` : ''}</option>
                        ))}
                      </select>
                    )}
                  </>
                )}

                {isToComplete && (
                  <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle size={13} /> {toRecipientLabel}
                  </div>
                )}
              </AccordionSection>

              {/* From */}
              <AccordionSection
                id="from" title="From" icon={<AtSign size={16} />}
                subtitle={isFromComplete
                  ? `${localCampaign.fromName} <${localCampaign.fromEmail}>`
                  : 'No sender information'}
                isComplete={isFromComplete} isOpen={openSection === 'from'} onToggle={() => toggleSection('from')}
              >
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">From Name</label>
                    <input
                      type="text"
                      className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Pastor John Smith"
                      value={localCampaign.fromName || ''}
                      onChange={e => update({ fromName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1.5">
                      From Email
                      {isLockedMode && (
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full tracking-wide ${
                          isCustomMode
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                            : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                        }`}>
                          {isCustomMode ? 'Custom Domain' : 'Shared Domain'}
                        </span>
                      )}
                    </label>
                    {isLockedMode ? (
                      <>
                        <div className={`w-full text-sm border rounded-lg px-3 py-2 font-mono select-all ${
                          isCustomMode
                            ? 'border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 text-slate-700 dark:text-emerald-300'
                            : 'border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 text-slate-700 dark:text-indigo-300'
                        }`}>
                          {lockedFromEmail}
                        </div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">
                          Set in <strong>Settings &amp; Administration &rarr; Mail Settings</strong>. Change it there to update this address.
                        </p>
                      </>
                    ) : (
                      <input
                        type="email"
                        className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="pastor@mychurch.org"
                        value={localCampaign.fromEmail || ''}
                        onChange={e => update({ fromEmail: e.target.value })}
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Reply-To (optional)</label>
                    <input
                      type="email"
                      className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="replies@mychurch.org"
                      value={localCampaign.replyTo || ''}
                      onChange={e => update({ replyTo: e.target.value })}
                    />
                  </div>
                </div>
              </AccordionSection>

              {/* Subject */}
              <AccordionSection
                id="subject" title="Subject" icon={<FileText size={16} />}
                subtitle={isSubjectComplete ? localCampaign.subject! : 'No subject line'}
                isComplete={isSubjectComplete} isOpen={openSection === 'subject'} onToggle={() => toggleSection('subject')}
              >
                <input
                  type="text"
                  className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter email subject…"
                  value={localCampaign.subject || ''}
                  onChange={e => update({ subject: e.target.value })}
                />
              </AccordionSection>

              {/* Send Time */}
              <AccordionSection
                id="sendTime" title="Send Time" icon={<Clock size={16} />}
                subtitle={
                  scheduleMode === 'now'
                    ? 'Send immediately'
                    : localCampaign.sendAt
                      ? new Date(localCampaign.sendAt).toLocaleString()
                      : 'Choose when to send'
                }
                isComplete={isSendTimeComplete} isOpen={openSection === 'sendTime'} onToggle={() => toggleSection('sendTime')}
              >
                <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600 mb-4">
                  {(['now', 'schedule'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => update({ sendAt: mode === 'now' ? null : new Date(Date.now() + 3600000).toISOString() })}
                      className={`flex-1 py-2 text-sm font-semibold capitalize transition ${
                        scheduleMode === mode
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      {mode === 'now' ? 'Send Now' : 'Schedule'}
                    </button>
                  ))}
                </div>
                {scheduleMode === 'schedule' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Date & Time</label>
                    <input
                      type="datetime-local"
                      className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={localCampaign.sendAt ? localCampaign.sendAt.slice(0, 16) : ''}
                      onChange={e => update({ sendAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                    />
                  </div>
                )}
                {scheduleMode === 'now' && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Clicking "Send Now" will mark this campaign as sent immediately.
                  </p>
                )}
              </AccordionSection>

              {/* Content */}
              <AccordionSection
                id="content" title="Content" icon={<Pencil size={16} />}
                subtitle={`${blocks.length} block${blocks.length !== 1 ? 's' : ''}`}
                isComplete={isContentComplete} isOpen={openSection === 'content'} onToggle={() => toggleSection('content')}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400">{blocks.length} content block{blocks.length !== 1 ? 's' : ''}</span>
                  <button
                    onClick={() => setPanel('builder')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition"
                  >
                    <Pencil size={12} /> Edit Content
                  </button>
                </div>
              </AccordionSection>
            </div>

            {/* Live preview on the right */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-100 dark:bg-slate-950">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Preview</h2>
                <button onClick={() => setPanel('preview')} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
                  <Eye size={12} /> Expand
                </button>
              </div>
              <div className="max-w-xl mx-auto">
                <EmailPreview blocks={blocks} settings={settings} />
              </div>
            </div>
          </div>
        )}

        {/* Block Builder Panel */}
        {panel === 'builder' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center gap-3 shrink-0">
              <button
                onClick={() => setPanel('config')}
                className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
              >
                <ArrowLeft size={14} /> Back to Config
              </button>
              <span className="text-slate-300 dark:text-slate-600">|</span>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Content Editor</span>
            </div>
            <div className="flex-1 overflow-hidden">
              <EmailBuilder
                blocks={blocks}
                setBlocks={setBlocks}
                churchId={churchId}
                onImportPco={() => setIsPcoDrawerOpen(true)}
                onOpenPastoralCare={() => setIsPastoralCareDrawerOpen(true)}
                onOpenDataChart={() => setIsDataChartDrawerOpen(true)}
                onOpenSettings={() => setIsSettingsDrawerOpen(true)}
              />
            </div>
          </div>
        )}

        {/* Full Preview Panel */}
        {panel === 'preview' && (
          <div className="flex-1 overflow-y-auto p-8 bg-slate-100 dark:bg-slate-950">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{localCampaign.subject || 'No Subject'}</h2>
                {localCampaign.fromName && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    From: {localCampaign.fromName} &lt;{localCampaign.fromEmail}&gt;
                  </p>
                )}
              </div>
              <button
                onClick={() => setPanel('config')}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                <AlignLeft size={12} /> Back to Config
              </button>
            </div>
            <div className="max-w-2xl mx-auto shadow-xl rounded-2xl overflow-hidden">
              <EmailPreview blocks={blocks} settings={settings} churchLogoUrl={church?.logoUrl} />
            </div>
          </div>
        )}
      </div>

      {/* ─── Drawers ─── */}
      <Drawer isOpen={isSettingsDrawerOpen} onClose={() => setIsSettingsDrawerOpen(false)} title="Template Settings">
        <TemplateSettingsEditor
          settings={settings}
          onChange={s => update({ templateSettings: s })}
          churchLogoUrl={church?.logoUrl}
          onUploadLogo={handleLogoUpload}
          onRemoveLogo={handleLogoRemove}
          logoUploading={logoUploading}
        />
      </Drawer>

      {isPcoDrawerOpen && (
        <PcoImportModal
          churchId={churchId}
          onInsert={handlePcoInsert}
          onClose={() => setIsPcoDrawerOpen(false)}
        />
      )}

      <Drawer isOpen={isPastoralCareDrawerOpen} onClose={() => setIsPastoralCareDrawerOpen(false)} title="Pastoral Care Charts">
        <div className="space-y-2">
          <button onClick={() => { const b = [...blocks, { id: Date.now().toString(), type: 'pastoral_care_chart' as const, content: { area: 'Visits' } }]; update({ blocks: b }); setIsPastoralCareDrawerOpen(false); }} className="w-full p-3 bg-indigo-50 hover:bg-indigo-100 rounded-xl text-sm text-indigo-700 transition">Insert Visits Chart</button>
          <button onClick={() => { const b = [...blocks, { id: Date.now().toString(), type: 'pastoral_care_chart' as const, content: { area: 'Prayer Requests' } }]; update({ blocks: b }); setIsPastoralCareDrawerOpen(false); }} className="w-full p-3 bg-indigo-50 hover:bg-indigo-100 rounded-xl text-sm text-indigo-700 transition">Insert Prayer Requests Chart</button>
        </div>
      </Drawer>

      <Drawer isOpen={isDataChartDrawerOpen} onClose={() => setIsDataChartDrawerOpen(false)} title="Analytics Widgets">
        <DataChartSelector
          churchId={churchId}
          onInsert={(widgetId, label, data) => {
            const b = [...blocks, { id: Date.now().toString(), type: 'data_chart' as const, content: { widgetId, label, data } }];
            update({ blocks: b });
            setIsDataChartDrawerOpen(false);
          }}
        />
      </Drawer>


    </div>
  );
};

// ─── Main Module ─────────────────────────────────────────────────────────────

interface NewCampaignModalProps {
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

const NewCampaignModal: React.FC<NewCampaignModalProps> = ({ onConfirm, onCancel }) => {
  const [name, setName] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">New Email Campaign</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Give your email a name to get started.</p>
        <input
          type="text"
          className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
          placeholder="e.g. Weekly Update, Easter Invite…"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onConfirm(name.trim()); }}
          autoFocus
        />
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 text-sm text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition font-medium">
            Cancel
          </button>
          <button
            onClick={() => name.trim() && onConfirm(name.trim())}
            disabled={!name.trim()}
            className="flex-1 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 rounded-xl transition font-semibold"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Send Test Modal ────────────────────────────────────────────────────────

interface SendTestModalProps {
  onConfirm: (email: string) => void;
  onCancel: () => void;
  isSending: boolean;
}

const SendTestModal: React.FC<SendTestModalProps> = ({ onConfirm, onCancel, isSending }) => {
  const [email, setEmail] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Send Test Email</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Enter an email address to receive a test copy of this email.</p>
        <input
          type="email"
          className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
          placeholder="you@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && email.trim()) onConfirm(email.trim()); }}
          autoFocus
        />
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 text-sm text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition font-medium">
            Cancel
          </button>
          <button
            onClick={() => email.trim() && onConfirm(email.trim())}
            disabled={!email.trim() || isSending}
            className="flex-1 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 rounded-xl transition font-semibold flex items-center justify-center gap-2"
          >
            {isSending ? <><Loader2 size={14} className="animate-spin" /> Sending…</> : 'Send Test'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const CommunicationModule: React.FC<{ churchId: string; church?: Church; currentUserId?: string; onUpdateChurch?: (updates: Partial<Church>) => void }> = ({ churchId, church, currentUserId, onUpdateChurch }) => {
  const [activeTab, setActiveTab] = useState<'emails' | 'polls' | 'unsubscribers'>('emails');
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<EmailCampaign | null>(null);
  const [previewCampaign, setPreviewCampaign] = useState<EmailCampaign | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // ── Unsubscribers state ──────────────────────────────────────────────────────
  const [unsubscribers, setUnsubscribers] = useState<EmailUnsubscribe[]>([]);
  const [unsubLoading, setUnsubLoading] = useState(false);
  const [unsubSearch, setUnsubSearch] = useState('');
  const [unsubLoaded, setUnsubLoaded] = useState(false);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Load campaigns
  useEffect(() => {
    setIsLoading(true);
    firestore.getEmailCampaigns(churchId).then(c => {
      setCampaigns(c);
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  }, [churchId]);

  // Load unsubscribers lazily when the tab is first opened
  useEffect(() => {
    if (activeTab === 'unsubscribers' && !unsubLoaded) {
      setUnsubLoading(true);
      firestore.getEmailUnsubscribes(churchId)
        .then(list => { setUnsubscribers(list); setUnsubLoaded(true); })
        .catch(() => {})
        .finally(() => setUnsubLoading(false));
    }
  }, [activeTab, churchId, unsubLoaded]);

  const handleRemoveUnsubscribe = async (unsub: EmailUnsubscribe) => {
    if (!confirm(`Re-subscribe ${unsub.email}? They will be able to receive emails from this list again.`)) return;
    await firestore.removeEmailUnsubscribe(unsub.id);
    setUnsubscribers(prev => prev.filter(u => u.id !== unsub.id));
    showToast(`${unsub.email} has been re-subscribed.`);
  };

  const filteredUnsubs = unsubSearch.trim()
    ? unsubscribers.filter(u => u.email.toLowerCase().includes(unsubSearch.toLowerCase()))
    : unsubscribers;

  const handleCreate = async (name: string) => {
    setShowNewModal(false);
    const c = newCampaign(churchId, name);
    // Prefill From fields from tenant email settings if configured
    if (church?.emailSettings?.fromEmail) {
      c.fromEmail = church.emailSettings.fromEmail;
      c.fromName = church.emailSettings.fromName || church.name || '';
    }
    try {
      await firestore.saveEmailCampaign(c);
      setCampaigns(prev => [c, ...prev]);
      setActiveCampaign(c);
    } catch (e: any) {
      console.error('[CommunicationModule] Failed to create campaign:', e);
      showToast(`Failed to create campaign: ${e?.message || 'Unknown error'}`, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this campaign?')) return;
    await firestore.deleteEmailCampaign(id);
    setCampaigns(prev => prev.filter(c => c.id !== id));
  };

  // Use a ref so handleSave always reads the latest activeCampaign
  const activeCampaignRef = React.useRef<EmailCampaign | null>(null);
  React.useEffect(() => { activeCampaignRef.current = activeCampaign; }, [activeCampaign]);

  const handleSave = useCallback((updates: Partial<EmailCampaign>) => {
    const current = activeCampaignRef.current;
    if (!current) return;
    const merged = { ...current, ...updates, updatedAt: Date.now() };
    setActiveCampaign(merged);
    activeCampaignRef.current = merged;
    setCampaigns(prev => prev.map(c => c.id === merged.id ? merged : c));
    firestore.updateEmailCampaign(merged.id, updates).catch(async (e) => {
      // If the document doesn't exist yet (e.g. create race), fall back to a full save
      try {
        await firestore.saveEmailCampaign(merged);
      } catch (e2: any) {
        console.error('Failed to save campaign:', e2);
        showToast('Auto-save failed. Please check your connection.', 'error');
      }
    });
  }, []); // stable — reads latest via ref

  /** Call backend /email/send. testEmail = undefined → real send, string → test send */
  const callSendApi = async (campaignId: string, testEmail?: string) => {
    const sysSettings = await firestore.getSystemSettings();
    const apiBaseUrl = sysSettings.apiBaseUrl || 'https://pastoralcare.barnabassoftware.com';
    const endpoint = testEmail ? `${apiBaseUrl}/email/test` : `${apiBaseUrl}/email/send`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, churchId, ...(testEmail ? { testEmail } : {}) })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  };

  const handleSend = async () => {
    if (!activeCampaign) return;
    setIsSending(true);
    try {
      const result = await callSendApi(activeCampaign.id);
      // Backend already updated Firestore; sync local state
      const updates: Partial<EmailCampaign> = { status: 'sent', sentAt: Date.now() };
      handleSave(updates);
      showToast(result.message || 'Campaign sent successfully!');
    } catch (e: any) {
      showToast(e.message || 'Failed to send campaign.', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleSendTest = async (testEmail: string) => {
    if (!activeCampaign) return;
    setIsSendingTest(true);
    try {
      await callSendApi(activeCampaign.id, testEmail);
      setShowTestModal(false);
      showToast(`Test email sent to ${testEmail}!`);
    } catch (e: any) {
      showToast(e.message || 'Failed to send test email.', 'error');
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleSchedule = async (scheduledAt: number) => {
    if (!activeCampaign) return;
    setIsScheduling(true);
    try {
      const sysSettings = await firestore.getSystemSettings();
      const apiBaseUrl = sysSettings.apiBaseUrl || 'https://pastoralcare.barnabassoftware.com';
      const res = await fetch(`${apiBaseUrl}/email/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: activeCampaign.id, churchId, scheduledAt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to schedule');
      const sendAt = new Date(scheduledAt).toISOString();
      handleSave({ status: 'scheduled', scheduledAt, sendAt, retryCount: 0, lastError: null });
      setShowScheduleModal(false);
      showToast(`Email scheduled for ${new Date(scheduledAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`);
    } catch (e: any) {
      showToast(e.message || 'Failed to schedule email.', 'error');
    } finally {
      setIsScheduling(false);
    }
  };

  const handleCancelSchedule = async () => {
    if (!activeCampaign || activeCampaign.status !== 'scheduled') return;
    try {
      const sysSettings = await firestore.getSystemSettings();
      const apiBaseUrl = sysSettings.apiBaseUrl || 'https://pastoralcare.barnabassoftware.com';
      const res = await fetch(`${apiBaseUrl}/email/cancel-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: activeCampaign.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel');
      handleSave({ status: 'draft', scheduledAt: null, sendAt: null });
      showToast('Schedule cancelled. Campaign reverted to draft.');
    } catch (e: any) {
      showToast(e.message || 'Failed to cancel schedule.', 'error');
    }
  };

  return (
    <div className="flex flex-col h-full relative">
      {/* ─── Tab Switcher ─────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-1 px-5 pt-4 pb-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab('emails')}
          className={`flex items-center gap-2 px-4 py-2 -mb-px text-sm font-semibold border-b-2 transition ${
            activeTab === 'emails'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Mail size={14} /> Emails
        </button>
        <button
          onClick={() => setActiveTab('polls')}
          className={`flex items-center gap-2 px-4 py-2 -mb-px text-sm font-semibold border-b-2 transition ${
            activeTab === 'polls'
              ? 'border-violet-600 text-violet-600 dark:text-violet-400 dark:border-violet-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <List size={14} /> Polls
        </button>
        <button
          onClick={() => setActiveTab('unsubscribers')}
          className={`flex items-center gap-2 px-4 py-2 -mb-px text-sm font-semibold border-b-2 transition ${
            activeTab === 'unsubscribers'
              ? 'border-red-500 text-red-600 dark:text-red-400 dark:border-red-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <UserMinus size={14} /> Unsubscribers
          {unsubscribers.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
              {unsubscribers.length}
            </span>
          )}
        </button>
      </div>

      {/* ─── Unsubscribers Tab ─────────────────────────────────────────── */}
      {activeTab === 'unsubscribers' && (
        <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <UserMinus size={20} className="text-red-500" /> Unsubscribers
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                People who have opted out of your emails. They are automatically excluded from future sends.
              </p>
            </div>
            {unsubscribers.length > 0 && (
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                {unsubscribers.length} total
              </span>
            )}
          </div>

          {/* Search */}
          {unsubscribers.length > 0 && (
            <div className="relative mb-4">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by email…"
                value={unsubSearch}
                onChange={e => setUnsubSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>
          )}

          {/* Table */}
          {unsubLoading ? (
            <div className="flex items-center justify-center h-40 text-slate-400">
              <Loader2 size={22} className="animate-spin mr-2" /> Loading…
            </div>
          ) : filteredUnsubs.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
              <UserMinus size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-slate-500 dark:text-slate-400 font-medium">
                {unsubSearch ? 'No results match your search' : 'No unsubscribers yet'}
              </p>
              {!unsubSearch && (
                <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
                  When someone clicks "Unsubscribe" in an email, they'll appear here.
                </p>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Unsubscribed</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Campaign</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {filteredUnsubs.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition">
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{u.email}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {u.unsubscribedAt
                          ? new Date(u.unsubscribedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                        {u.campaignName || <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleRemoveUnsubscribe(u)}
                          title="Re-subscribe (remove from list)"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition"
                        >
                          <CheckCircle size={12} /> Re-subscribe
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

      {/* ─── Polls Tab ────────────────────────────────────────────────── */}
      {activeTab === 'polls' && (
        <div className="flex-1 overflow-y-auto">
          <PollsManager churchId={churchId} currentUserId={currentUserId || ''} />
        </div>
      )}

      {/* ─── Emails Tab ───────────────────────────────────────────────── */}
      {activeTab === 'emails' && (
        <>
      {!activeCampaign && church?.emailSettings && (
        <div className={`shrink-0 flex items-center gap-3 px-5 py-2 border-b text-xs font-medium ${
          church.emailSettings.mode === 'custom' && church.emailSettings.domainVerified
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
            : church.emailSettings.mode === 'custom'
            ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
            : 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400'
        }`}>
          <Mail size={13} className="shrink-0" />
          <span>
            {church.emailSettings.mode === 'custom' && church.emailSettings.domainVerified
              ? `Sending from ${church.emailSettings.fromEmail} (custom domain ✓ verified)`
              : church.emailSettings.mode === 'custom'
              ? `Custom domain pending DNS verification — currently using ${church.emailSettings.fromEmail}`
              : `Sending via ${church.emailSettings.fromEmail || 'shared subdomain'}`
            }
          </span>
        </div>
      )}
      {!activeCampaign && !church?.emailSettings && (
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-2.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
            <Mail size={13} className="shrink-0" />
            <span className="font-semibold">Email not configured.</span>
            <span>Go to Settings &amp; Administration → Mail Settings to set up your From address before sending.</span>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold text-white transition-all ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Campaign Preview Modal */}
      {previewCampaign && (
        <CampaignPreviewModal
          campaign={previewCampaign}
          onClose={() => setPreviewCampaign(null)}
          churchLogoUrl={church?.logoUrl}
        />
      )}

      {/* Send Test Modal */}
      {showTestModal && activeCampaign && (
        <SendTestModal
          onConfirm={handleSendTest}
          onCancel={() => setShowTestModal(false)}
          isSending={isSendingTest}
        />
      )}

      {/* Schedule Modal */}
      {showScheduleModal && activeCampaign && (
        <ScheduleModal
          onConfirm={handleSchedule}
          onCancel={() => setShowScheduleModal(false)}
          isScheduling={isScheduling}
        />
      )}

      {/* Scheduled Banner */}
      {activeCampaign?.status === 'scheduled' && activeCampaign.scheduledAt && (
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
            <Clock size={13} />
            <span className="font-semibold">Scheduled:</span>
            {new Date(activeCampaign.scheduledAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
            {activeCampaign.retryCount ? <span className="ml-2 text-red-500">· Retry {activeCampaign.retryCount}/5{activeCampaign.lastError ? ` (${activeCampaign.lastError})` : ''}</span> : null}
          </div>
          <button
            onClick={handleCancelSchedule}
            className="text-xs font-semibold text-amber-700 dark:text-amber-400 hover:text-red-600 dark:hover:text-red-400 transition"
          >
            Cancel Schedule
          </button>
        </div>
      )}

      {/* New campaign modal */}
      {showNewModal && (
        <NewCampaignModal onConfirm={handleCreate} onCancel={() => setShowNewModal(false)} />
      )}

      {/* Main Content */}
      {activeCampaign ? (
        <EmailEditor
          key={activeCampaign.id}
          campaign={activeCampaign}
          churchId={churchId}
          church={church}
          onBack={() => setActiveCampaign(null)}
          onSave={handleSave}
          onSend={handleSend}
          onSendTest={() => setShowTestModal(true)}
          onSchedule={() => setShowScheduleModal(true)}
          isSending={isSending}
          isScheduled={activeCampaign.status === 'scheduled'}
          onLogoUploaded={logoUrl => onUpdateChurch?.({ logoUrl })}
          onLogoRemoved={() => onUpdateChurch?.({ logoUrl: undefined })}
        />
      ) : (
        <CampaignListView
          churchId={churchId}
          campaigns={campaigns}
          isLoading={isLoading}
          onOpen={c => setActiveCampaign(c)}
          onPreview={c => setPreviewCampaign(c)}
          onDelete={handleDelete}
          onCreate={() => setShowNewModal(true)}
        />
      )}
        </>
      )}
    </div>
  );
};
