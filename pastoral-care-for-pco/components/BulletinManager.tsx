import React, { useState, useEffect, useCallback } from 'react';
import { DigitalBulletin, BulletinStatus, Church, User, EmailCampaign, TemplateSettings } from '../types';
import { firestore } from '../services/firestoreService';
import { EmailBuilder, EmailBlock } from './EmailBuilder';
import { EmailPreview } from './EmailPreview';
import { TemplateSettingsEditor } from './TemplateSettingsEditor';
import { DataChartSelector } from './DataChartSelector';
import { PcoImportModal } from './PcoImportModal';
import {
  Plus, ArrowLeft, Trash2, Globe, Lock, Clock, Loader2, Link, Copy,
  Eye, Monitor, Smartphone, Pencil, CheckCircle, X, Mail,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newBulletinId(): string {
  return `bulletin_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function bulletinUrl(bulletinId: string): string {
  return `${window.location.origin}/bulletin/${bulletinId}`;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const DEFAULT_TEMPLATE: TemplateSettings = {
  primaryColor: '#4f46e5',
  headerText: '',
  footerText: '',
  showLogo: false,
  font: 'Inter, sans-serif',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface BulletinManagerProps {
  churchId: string;
  currentUser?: User;
  church?: Church;
  campaigns?: EmailCampaign[];
}

// ─── Access guard ─────────────────────────────────────────────────────────────

function canManageBulletins(user?: User): boolean {
  if (!user) return false;
  return (
    user.roles?.includes('Church Admin') ||
    user.roles?.includes('System Administration') ||
    user.roles?.includes('Email')
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastMsg { msg: string; type: 'success' | 'error' }

// ─── New Bulletin Modal ───────────────────────────────────────────────────────

const NewBulletinModal: React.FC<{
  onConfirm: (title: string) => void;
  onCancel: () => void;
}> = ({ onConfirm, onCancel }) => {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const [title, setTitle] = useState(`Sunday Bulletin – ${today}`);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onCancel}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">New Digital Bulletin</h2>
        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Title</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && title.trim()) onConfirm(title.trim()); }}
          autoFocus
          className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-4"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">Cancel</button>
          <button
            onClick={() => title.trim() && onConfirm(title.trim())}
            disabled={!title.trim()}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Import from Email Modal ──────────────────────────────────────────────────

const ImportFromEmailModal: React.FC<{
  campaigns: EmailCampaign[];
  onSelect: (campaign: EmailCampaign) => void;
  onCancel: () => void;
}> = ({ campaigns, onSelect, onCancel }) => {
  const [search, setSearch] = useState('');
  const filtered = campaigns.filter(c =>
    (c.name || c.subject || '').toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onCancel}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Import from Email Campaign</h2>
          <input
            type="text"
            placeholder="Search campaigns…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">No campaigns found.</div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => onSelect(c)}
                  className="w-full text-left px-4 py-3 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-900/20 border border-transparent hover:border-emerald-200 dark:hover:border-emerald-700 transition"
                >
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{c.name || c.subject}</div>
                  {c.subject && c.name && <div className="text-xs text-slate-400 mt-0.5">{c.subject}</div>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 shrink-0 flex justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">Cancel</button>
        </div>
      </div>
    </div>
  );
};

// ─── Bulletin Card ────────────────────────────────────────────────────────────

const BulletinCard: React.FC<{
  bulletin: DigitalBulletin;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCopyLink: () => void;
}> = ({ bulletin, onEdit, onDuplicate, onDelete, onCopyLink }) => {
  const isPublished = bulletin.status === 'published';
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Color bar */}
      <div className={`h-1.5 w-full ${isPublished ? 'bg-gradient-to-r from-emerald-400 to-teal-400' : 'bg-gradient-to-r from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-500'}`} />
      <div className="p-5">
        {/* Status badge */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
            isPublished
              ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
          }`}>
            {isPublished ? <Globe size={10} /> : <Lock size={10} />}
            {isPublished ? 'Published' : 'Draft'}
          </span>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
            <Clock size={10} /> {formatRelative(bulletin.updatedAt || bulletin.createdAt)}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1 line-clamp-2">{bulletin.title}</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
          {(bulletin.blocks || []).length} block{(bulletin.blocks || []).length !== 1 ? 's' : ''}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 transition"
          >
            <Pencil size={12} /> Edit
          </button>
          <button
            onClick={onDuplicate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition"
          >
            <Copy size={12} /> Duplicate
          </button>
          {isPublished && (
            <button
              onClick={onCopyLink}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 text-xs font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition"
            >
              <Link size={12} /> Copy Link
            </button>
          )}
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-100 dark:border-red-900/40 text-red-500 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 transition ml-auto"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main BulletinManager ─────────────────────────────────────────────────────

export const BulletinManager: React.FC<BulletinManagerProps> = ({
  churchId, currentUser, church, campaigns = [],
}) => {
  const [bulletins, setBulletins] = useState<DigitalBulletin[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeBulletin, setActiveBulletin] = useState<DigitalBulletin | null>(null);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDataChart, setShowDataChart] = useState(false);
  const [showPcoImport, setShowPcoImport] = useState(false);
  const [previewMode, setPreviewMode] = useState<'mobile' | 'desktop'>('mobile');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const canManage = canManageBulletins(currentUser);

  // ─── Load bulletins ───────────────────────────────────────────────────────

  const loadBulletins = useCallback(async () => {
    setLoading(true);
    try {
      const data = await firestore.getBulletins(churchId);
      setBulletins(data);
    } catch {
      showToast('Failed to load bulletins.', 'error');
    } finally {
      setLoading(false);
    }
  }, [churchId]);

  useEffect(() => { loadBulletins(); }, [loadBulletins]);

  // ─── Toast ────────────────────────────────────────────────────────────────

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ─── Auto-save blocks ─────────────────────────────────────────────────────

  const handleBlocksChange = useCallback(async (blocks: EmailBlock[]) => {
    if (!activeBulletin) return;
    const updated = { ...activeBulletin, blocks, updatedAt: Date.now() };
    setActiveBulletin(updated);
    setBulletins(prev => prev.map(b => b.id === updated.id ? updated : b));
    try {
      setSaving(true);
      await firestore.updateBulletin(activeBulletin.id, { blocks, updatedAt: Date.now() });
    } catch {
      showToast('Auto-save failed.', 'error');
    } finally {
      setSaving(false);
    }
  }, [activeBulletin]);

  // ─── Create new bulletin ──────────────────────────────────────────────────

  const handleCreate = async (title: string) => {
    if (!currentUser) return;
    const bulletin: DigitalBulletin = {
      id: newBulletinId(),
      churchId,
      title,
      status: 'draft',
      blocks: [],
      templateSettings: DEFAULT_TEMPLATE,
      sourceCampaignId: null,
      publishedAt: null,
      createdBy: currentUser.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    try {
      await firestore.saveBulletin(bulletin);
      setBulletins(prev => [bulletin, ...prev]);
      setActiveBulletin(bulletin);
      setShowNewModal(false);
    } catch {
      showToast('Failed to create bulletin.', 'error');
    }
  };

  // ─── Import from email campaign ───────────────────────────────────────────

  const handleImportEmail = async (campaign: EmailCampaign) => {
    if (!currentUser) return;
    const bulletin: DigitalBulletin = {
      id: newBulletinId(),
      churchId,
      title: campaign.name || campaign.subject || 'Imported Bulletin',
      status: 'draft',
      blocks: campaign.blocks || [],
      templateSettings: campaign.templateSettings || DEFAULT_TEMPLATE,
      sourceCampaignId: campaign.id,
      publishedAt: null,
      createdBy: currentUser.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    try {
      await firestore.saveBulletin(bulletin);
      setBulletins(prev => [bulletin, ...prev]);
      setActiveBulletin(bulletin);
      setShowImportModal(false);
      showToast('Bulletin created from email campaign.', 'success');
    } catch {
      showToast('Failed to import campaign.', 'error');
    }
  };

  // ─── Duplicate ────────────────────────────────────────────────────────────

  const handleDuplicate = async (original: DigitalBulletin) => {
    const copy: DigitalBulletin = {
      ...original,
      id: newBulletinId(),
      title: `Copy of ${original.title}`,
      status: 'draft',
      publishedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    try {
      await firestore.saveBulletin(copy);
      setBulletins(prev => [copy, ...prev]);
      showToast('Bulletin duplicated as a new draft.', 'success');
    } catch {
      showToast('Failed to duplicate.', 'error');
    }
  };

  // ─── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = async (bulletin: DigitalBulletin) => {
    if (!window.confirm(`Delete "${bulletin.title}"? This cannot be undone.`)) return;
    try {
      await firestore.deleteBulletin(bulletin.id);
      setBulletins(prev => prev.filter(b => b.id !== bulletin.id));
      if (activeBulletin?.id === bulletin.id) setActiveBulletin(null);
      showToast('Bulletin deleted.', 'success');
    } catch {
      showToast('Failed to delete.', 'error');
    }
  };

  // ─── Publish / Unpublish ──────────────────────────────────────────────────

  const handleTogglePublish = async () => {
    if (!activeBulletin) return;
    const newStatus: BulletinStatus = activeBulletin.status === 'published' ? 'draft' : 'published';
    const updates: Partial<DigitalBulletin> = {
      status: newStatus,
      publishedAt: newStatus === 'published' ? Date.now() : null,
    };
    try {
      await firestore.updateBulletin(activeBulletin.id, updates);
      const updated = { ...activeBulletin, ...updates, updatedAt: Date.now() };
      setActiveBulletin(updated);
      setBulletins(prev => prev.map(b => b.id === updated.id ? updated : b));
      showToast(newStatus === 'published' ? 'Bulletin published!' : 'Bulletin unpublished.', 'success');
    } catch {
      showToast('Failed to update status.', 'error');
    }
  };

  // ─── Copy link ────────────────────────────────────────────────────────────

  const handleCopyLink = async (bulletinId: string) => {
    try {
      await navigator.clipboard.writeText(bulletinUrl(bulletinId));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      showToast('Link copied to clipboard!', 'success');
    } catch {
      showToast('Could not copy link.', 'error');
    }
  };

  // ─── Settings / PCO import callbacks (pass-through) ──────────────────────

  const handleSaveSettings = async (settings: TemplateSettings) => {
    if (!activeBulletin) return;
    const updated = { ...activeBulletin, templateSettings: settings, updatedAt: Date.now() };
    setActiveBulletin(updated);
    setBulletins(prev => prev.map(b => b.id === updated.id ? updated : b));
    try {
      await firestore.updateBulletin(activeBulletin.id, { templateSettings: settings });
      setShowSettings(false);
    } catch {
      showToast('Failed to save settings.', 'error');
    }
  };

  const handlePcoImport = (newBlocks: EmailBlock[]) => {
    if (!activeBulletin) return;
    handleBlocksChange([...(activeBulletin.blocks || []), ...newBlocks]);
    setShowPcoImport(false);
  };

  const handleInsertDataChart = (block: EmailBlock) => {
    if (!activeBulletin) return;
    handleBlocksChange([...(activeBulletin.blocks || []), block]);
    setShowDataChart(false);
  };

  // ─── Access denied ────────────────────────────────────────────────────────

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-24 text-slate-400">
        <Lock size={32} className="mb-3 opacity-40" />
        <p className="text-sm font-medium">You don't have permission to manage Digital Bulletins.</p>
        <p className="text-xs mt-1 opacity-60">Contact your Church Admin.</p>
      </div>
    );
  }

  // ─── Editor view ─────────────────────────────────────────────────────────

  if (activeBulletin) {
    const blocks = (activeBulletin.blocks || []) as EmailBlock[];
    const settings = activeBulletin.templateSettings || DEFAULT_TEMPLATE;
    const isPublished = activeBulletin.status === 'published';

    return (
      <div className="flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-slate-950">
        {/* Toast */}
        {toast && (
          <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
            {toast.msg}
          </div>
        )}

        {/* Top bar */}
        <div className="shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center gap-3">
          {/* Back */}
          <button
            onClick={() => setActiveBulletin(null)}
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
          >
            <ArrowLeft size={16} /> Back
          </button>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />

          {/* Title */}
          <input
            type="text"
            value={activeBulletin.title}
            onChange={async e => {
              const title = e.target.value;
              const updated = { ...activeBulletin, title, updatedAt: Date.now() };
              setActiveBulletin(updated);
              setBulletins(prev => prev.map(b => b.id === updated.id ? updated : b));
              try { await firestore.updateBulletin(activeBulletin.id, { title }); } catch { /* non-fatal */ }
            }}
            className="flex-1 min-w-0 text-sm font-bold text-slate-900 dark:text-white bg-transparent border-none outline-none focus:ring-2 focus:ring-emerald-500 rounded px-1"
          />

          {/* Saving indicator */}
          {saving && (
            <span className="text-xs text-slate-400 flex items-center gap-1 shrink-0">
              <Loader2 size={12} className="animate-spin" /> Saving…
            </span>
          )}

          {/* Preview toggle */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 shrink-0">
            <button
              onClick={() => setPreviewMode('mobile')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition ${previewMode === 'mobile' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              <Smartphone size={13} /> Mobile
            </button>
            <button
              onClick={() => setPreviewMode('desktop')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition ${previewMode === 'desktop' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              <Monitor size={13} /> Desktop
            </button>
          </div>

          {/* Status badge */}
          <span className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${isPublished ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
            {isPublished ? <Globe size={10} /> : <Lock size={10} />}
            {isPublished ? 'Published' : 'Draft'}
          </span>

          {/* Publish / Unpublish */}
          <button
            onClick={handleTogglePublish}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              isPublished
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {isPublished ? <Lock size={12} /> : <Globe size={12} />}
            {isPublished ? 'Unpublish' : 'Publish'}
          </button>

          {/* Copy link */}
          {isPublished && (
            <button
              onClick={() => handleCopyLink(activeBulletin.id)}
              title={bulletinUrl(activeBulletin.id)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition"
            >
              {copied ? <CheckCircle size={12} /> : <Link size={12} />}
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          )}
        </div>

        {/* Published URL bar */}
        {isPublished && (
          <div className="shrink-0 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-900/40 px-4 py-2 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
            <Globe size={12} />
            <a href={bulletinUrl(activeBulletin.id)} target="_blank" rel="noopener noreferrer" className="underline truncate font-mono">
              {bulletinUrl(activeBulletin.id)}
            </a>
          </div>
        )}

        {/* Main area: builder + preview */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* EmailBuilder (left) */}
          <div className="flex-1 overflow-hidden min-w-0">
            <EmailBuilder
              context="bulletin"
              blocks={blocks}
              setBlocks={handleBlocksChange}
              onImportPco={() => setShowPcoImport(true)}
              onOpenPastoralCare={() => { /* pastoral care chart not needed in bulletins */ }}
              onOpenDataChart={() => setShowDataChart(true)}
              onOpenSettings={() => setShowSettings(true)}
              churchId={churchId}
              churchName={church?.name}
            />
          </div>

          {/* Live preview (right) */}
          <div className="hidden lg:flex flex-col w-[420px] shrink-0 border-l border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 overflow-y-auto">
            <div className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-950 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <Eye size={14} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Preview</span>
              <span className="ml-auto text-xs text-slate-400">{previewMode === 'mobile' ? '📱 Mobile' : '🖥 Desktop'}</span>
            </div>
            <div className="flex-1 p-4 flex justify-center">
              <div
                style={{ width: previewMode === 'mobile' ? 390 : '100%', maxWidth: '100%', transition: 'width 0.25s ease' }}
                className="rounded-xl overflow-hidden shadow-lg"
              >
                {blocks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-slate-400 bg-white dark:bg-slate-800 rounded-xl">
                    <Eye size={24} className="mb-2 opacity-30" />
                    <p className="text-xs">Add blocks to preview</p>
                  </div>
                ) : (
                  <EmailPreview
                    blocks={blocks}
                    settings={settings}
                    churchLogoUrl={church?.logoUrl}
                    contentType="blocks"
                    content=""
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modals */}
        {showSettings && (
          <TemplateSettingsEditor
            settings={settings}
            onSave={handleSaveSettings}
            onClose={() => setShowSettings(false)}
          />
        )}
        {showDataChart && (
          <DataChartSelector
            churchId={churchId}
            onInsert={handleInsertDataChart}
            onClose={() => setShowDataChart(false)}
          />
        )}
        {showPcoImport && (
          <PcoImportModal
            churchId={churchId}
            onClose={() => setShowPcoImport(false)}
            onImport={handlePcoImport}
          />
        )}
      </div>
    );
  }

  // ─── List view ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="shrink-0 px-6 py-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            📋 Digital Bulletin
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Build and share responsive web pages for your congregation.
          </p>
        </div>
        <button
          onClick={() => setShowImportModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
        >
          <Mail size={14} /> Import Email
        </button>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition"
        >
          <Plus size={16} /> New Bulletin
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : bulletins.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="text-6xl mb-4">📋</div>
            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-2">No bulletins yet</h3>
            <p className="text-sm text-center max-w-xs mb-6">
              Create your first digital bulletin to share with your congregation as a web page.
            </p>
            <button
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition"
            >
              <Plus size={16} /> Create First Bulletin
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {bulletins.map(b => (
              <BulletinCard
                key={b.id}
                bulletin={b}
                onEdit={() => setActiveBulletin(b)}
                onDuplicate={() => handleDuplicate(b)}
                onDelete={() => handleDelete(b)}
                onCopyLink={() => handleCopyLink(b.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showNewModal && (
        <NewBulletinModal
          onConfirm={handleCreate}
          onCancel={() => setShowNewModal(false)}
        />
      )}
      {showImportModal && (
        <ImportFromEmailModal
          campaigns={campaigns}
          onSelect={handleImportEmail}
          onCancel={() => setShowImportModal(false)}
        />
      )}
    </div>
  );
};
