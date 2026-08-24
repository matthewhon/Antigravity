import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Target, RefreshCw, Loader2, Sparkles, Image as ImageIcon, Upload, 
  Copy, CheckCircle, ExternalLink, Code, Layers, Eye, Smartphone, 
  Monitor, Award, Plus, Trash2, Heart, DollarSign, Calendar, Users, 
  Clock, AlertCircle, HelpCircle, ArrowUpRight 
} from 'lucide-react';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../services/firebase';
import { Church } from '../types';
import { PledgeCampaignWidget } from './widgets/PledgeCampaignWidget';

const apiBaseUrl = typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null'
  ? window.location.origin
  : (process.env.NODE_ENV === 'production'
    ? 'https://pastoralcare.barnabassoftware.com'
    : 'http://localhost:8080');

interface CampaignPledgesManagerProps {
  churchId: string;
  church?: Church;
}

export const CampaignPledgesManager: React.FC<CampaignPledgesManagerProps> = ({ churchId, church }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'customizer' | 'submissions'>('overview');
  
  // Campaigns list
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [toast, setToast] = useState('');

  // Selected campaign for customizer
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');

  // Customizer form state
  const [headline, setHeadline] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [graphicStyle, setGraphicStyle] = useState<'progress_bar' | 'thermometer' | 'radial_gauge' | 'card_hero' | 'minimal'>('progress_bar');
  const [colorTheme, setColorTheme] = useState('indigo');
  const [progressBasis, setProgressBasis] = useState<'both' | 'received' | 'pledged'>('both');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [allowOnlinePledging, setAllowOnlinePledging] = useState(true);
  const [pledgeButtonText, setPledgeButtonText] = useState('Pledge Now');
  const [givingEmbedMode, setGivingEmbedMode] = useState<'modal' | 'direct_link' | 'inline'>('modal');
  const [givingButtonText, setGivingButtonText] = useState('Give to Campaign');
  const [defaultFundId, setDefaultFundId] = useState('');
  const [milestones, setMilestones] = useState<{ amount: string; title: string }[]>([]);
  const [autoHeight, setAutoHeight] = useState(true);
  const [scale, setScale] = useState<number>(1);

  // Uploading state
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Saving state
  const [isSaving, setIsSaving] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedIframe, setCopiedIframe] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  // Submissions state
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  // Fetch campaigns from backend
  const loadCampaigns = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const queryStr = refresh ? '?refresh=true' : '';
      const res = await fetch(`${apiBaseUrl}/api/public/pledge-campaigns/${churchId}${queryStr}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch campaigns');
      
      const list = Array.isArray(data) ? data : [];
      setCampaigns(list);
      if (list.length > 0 && !selectedCampaignId) {
        setSelectedCampaignId(list[0].id);
      }
    } catch (e: any) {
      showToast(`Error loading campaigns: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [churchId, selectedCampaignId]);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  // When selected campaign changes, populate customizer fields
  useEffect(() => {
    if (!selectedCampaignId) return;
    const camp = campaigns.find(c => String(c.id) === String(selectedCampaignId));
    if (camp) {
      setHeadline(camp.headline || camp.name || '');
      setImageUrl(camp.imageUrl || '');
      setBannerUrl(camp.bannerUrl || '');
      setGraphicStyle(camp.graphicStyle || 'progress_bar');
      setColorTheme(camp.colorTheme || 'indigo');
      setProgressBasis(camp.progressBasis || 'both');
      setStartDate(camp.startDate || (camp.startsAt ? camp.startsAt.slice(0, 10) : ''));
      setEndDate(camp.endDate || (camp.endsAt ? camp.endsAt.slice(0, 10) : ''));
      setDefaultFundId(camp.defaultFundId || camp.fundId || '');
      setAllowOnlinePledging(camp.allowOnlinePledging !== false);
      setPledgeButtonText(camp.pledgeButtonText || 'Pledge Now');
      setGivingEmbedMode(camp.givingEmbedMode || 'modal');
      setGivingButtonText(camp.givingButtonText || 'Give to Campaign');
      setMilestones(camp.milestones || []);
    }
  }, [selectedCampaignId, campaigns]);

  // Load submissions when tab is opened
  useEffect(() => {
    if (activeTab === 'submissions') {
      setLoadingSubmissions(true);
      fetch(`${apiBaseUrl}/api/pledge-submissions/${churchId}/${selectedCampaignId || 'all'}`)
        .then(r => r.json())
        .then(data => {
          setSubmissions(Array.isArray(data) ? data : []);
        })
        .catch(err => {
          console.error('Failed to load submissions:', err);
        })
        .finally(() => setLoadingSubmissions(false));
    }
  }, [activeTab, churchId, selectedCampaignId]);

  // Sync from Planning Center Giving
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch(`${apiBaseUrl}/pco/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ churchId, area: 'pledges' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      await loadCampaigns(true);
      showToast('Planning Center campaigns synced successfully!');
    } catch (e: any) {
      showToast(`Sync failed: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Upload image to Firebase Storage
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setUploadProgress(0);

    try {
      const fileId = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const sRef = storageRef(storage, `tenants/${churchId}/uploads/${fileId}`);
      const task = uploadBytesResumable(sRef, file);

      task.on(
        'state_changed',
        snap => {
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          setUploadProgress(pct);
        },
        err => {
          showToast(`Image upload failed: ${err.message}`);
          setUploadingImage(false);
        },
        async () => {
          const downloadUrl = await getDownloadURL(task.snapshot.ref);
          setBannerUrl(downloadUrl);
          setUploadingImage(false);
          showToast('Image uploaded successfully!');
        }
      );
    } catch (err: any) {
      showToast(`Upload error: ${err.message}`);
      setUploadingImage(false);
    }
  };

  // Save campaign configuration
  const handleSaveConfig = async () => {
    if (!selectedCampaignId) return;
    setIsSaving(true);
    try {
      const payload = {
        headline,
        imageUrl,
        bannerUrl,
        graphicStyle,
        colorTheme,
        progressBasis,
        startDate: startDate || null,
        endDate: endDate || null,
        defaultFundId: defaultFundId || null,
        allowOnlinePledging,
        pledgeButtonText,
        givingEmbedMode,
        givingButtonText,
        milestones
      };

      const res = await fetch(`${apiBaseUrl}/api/pledge-campaign-config/${churchId}/${selectedCampaignId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save configuration');

      // Refresh campaigns from backend to recalculate totals for this date range
      await loadCampaigns(true);
      showToast('Campaign widget & date range configuration saved!');
    } catch (e: any) {
      showToast(`Save failed: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Milestones manipulation
  const addMilestone = () => {
    setMilestones([...milestones, { amount: '', title: '' }]);
  };
  const updateMilestone = (idx: number, field: 'amount' | 'title', val: string) => {
    const next = [...milestones];
    next[idx][field] = val;
    setMilestones(next);
  };
  const removeMilestone = (idx: number) => {
    setMilestones(milestones.filter((_, i) => i !== idx));
  };

  // Selected Campaign Details
  const selectedCampaign = campaigns.find(c => String(c.id) === String(selectedCampaignId)) || campaigns[0];

  // Embed URLs
  const domain = process.env.NODE_ENV === 'production'
    ? 'https://pastoralcare.barnabassoftware.com'
    : window.location.origin;

  const embedParams = `type=pledge_campaign&churchId=${churchId}&campaignId=${selectedCampaignId}&graphicStyle=${graphicStyle}&color=${colorTheme}&theme=${themeMode}&progressBasis=${progressBasis}&givingMode=${givingEmbedMode}&givingBtnText=${encodeURIComponent(givingButtonText)}&pledgeBtnText=${encodeURIComponent(pledgeButtonText)}&allowPledges=${allowOnlinePledging}`
    + (autoHeight ? '&autoHeight=true' : '')
    + (scale !== 1 ? `&scale=${scale}` : '');

  const scriptEmbedCode = `<script src="${domain}/widget.js?${embedParams}" async></script>`;
  const iframeEmbedCode = `<iframe src="${domain}/?widget=true&${embedParams}" width="100%" height="700" style="border:none; border-radius:24px; overflow:hidden;" allow="clipboard-write"></iframe>`;

  const copyToClipboard = (text: string, isScript: boolean) => {
    navigator.clipboard.writeText(text);
    if (isScript) {
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    } else {
      setCopiedIframe(true);
      setTimeout(() => setCopiedIframe(false), 2000);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
      {/* ─── Toast Notification ─────────────────────────────────────────── */}
      {toast && (
        <div className="fixed top-20 right-6 z-50 bg-slate-900 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-2xl border border-slate-700 animate-in fade-in slide-in-from-top-2 flex items-center gap-2">
          <Sparkles size={14} className="text-amber-400" /> {toast}
        </div>
      )}

      {/* ─── Top Header Bar ────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between px-6 py-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Target className="text-indigo-600 dark:text-indigo-400" size={24} /> Campaign Pledges
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage Planning Center pledge campaigns, customize visual graphics & media, take pledges online, and embed widgets on your church website.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                activeTab === 'overview'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              Campaigns
            </button>
            <button
              onClick={() => setActiveTab('customizer')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                activeTab === 'customizer'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              Design & Embed Widget
            </button>
            <button
              onClick={() => setActiveTab('submissions')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                activeTab === 'submissions'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              Pledge Submissions
            </button>
          </div>

          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="flex items-center gap-2 px-3.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition disabled:opacity-50 shadow-sm"
          >
            {isSyncing ? <Loader2 size={14} className="animate-spin text-indigo-500" /> : <RefreshCw size={14} />}
            {isSyncing ? 'Syncing...' : 'Sync from PCO'}
          </button>
        </div>
      </div>

      {/* ─── TAB 1: CAMPAIGNS OVERVIEW ─────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="flex-1 overflow-y-auto p-6 max-w-7xl mx-auto w-full space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <Loader2 size={32} className="animate-spin mb-3 text-indigo-500" />
              <span className="text-sm font-medium">Fetching campaigns from Planning Center...</span>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-white dark:bg-slate-800/40 p-8 space-y-4">
              <Target size={48} className="mx-auto text-slate-300 dark:text-slate-600" />
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">No Pledge Campaigns Found</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                We couldn't find any active pledge campaigns in your Planning Center Giving account. Create a Pledge Campaign in Planning Center, then click Sync.
              </p>
              <button
                onClick={handleSync}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition inline-flex items-center gap-2"
              >
                <RefreshCw size={14} /> Sync from Planning Center
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {campaigns.map((camp: any) => {
                const goal = (camp.goalCents || 0) / 100;
                const pledged = (camp.totalPledgedCents || 0) / 100;
                const received = (camp.totalReceivedCents || 0) / 100;
                const pledgedPct = goal > 0 ? ((pledged / goal) * 100).toFixed(1) : '0';
                const receivedPct = goal > 0 ? ((received / goal) * 100).toFixed(1) : '0';

                return (
                  <div
                    key={camp.id}
                    className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm hover:shadow-md transition flex flex-col justify-between"
                  >
                    <div>
                      {camp.bannerUrl || camp.imageUrl ? (
                        <div className="h-36 w-full overflow-hidden relative">
                          <img src={camp.bannerUrl || camp.imageUrl} alt={camp.name} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent" />
                          <span className="absolute bottom-3 left-4 text-xs font-bold text-white bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/15">
                            {camp.fundName}
                          </span>
                        </div>
                      ) : (
                        <div className="p-4 bg-gradient-to-r from-indigo-50 to-indigo-100/50 dark:from-indigo-950/40 dark:to-slate-800 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                          <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg shadow-sm border border-indigo-100 dark:border-indigo-900">
                            {camp.fundName}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                            PCO ID: {camp.id}
                          </span>
                        </div>
                      )}

                      <div className="p-5 space-y-4">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">{camp.name}</h3>
                            {(camp.startDate || camp.endDate || camp.startsAt || camp.endsAt) && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md shrink-0">
                                <Calendar size={11} className="text-indigo-500" />
                                {camp.startDate || camp.startsAt?.slice(0, 10) || 'Open'} → {camp.endDate || camp.endsAt?.slice(0, 10) || 'Ongoing'}
                              </span>
                            )}
                          </div>
                          {camp.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                              {camp.description.replace(/<[^>]+>/g, '')}
                            </p>
                          )}
                        </div>

                        {/* Dual Progress Bar & Numbers */}
                        <div className="space-y-2">
                          <div className="flex justify-between items-baseline text-xs">
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              ${Math.round(received).toLocaleString()} Given ({receivedPct}%)
                            </span>
                            <span className="font-bold text-indigo-600 dark:text-indigo-400">
                              ${Math.round(pledged).toLocaleString()} Pledged ({pledgedPct}%)
                            </span>
                          </div>

                          <div className="relative w-full h-3.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden p-0.5">
                            {parseFloat(pledgedPct) > 0 && (
                              <div
                                className="absolute top-0 bottom-0 left-0 bg-indigo-300 dark:bg-indigo-700/60 rounded-full transition-all duration-700"
                                style={{ width: `${Math.min(100, Math.max(4, parseFloat(pledgedPct)))}%` }}
                              />
                            )}
                            {parseFloat(receivedPct) > 0 && (
                              <div
                                className="relative h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-700 shadow-sm"
                                style={{ width: `${Math.min(100, Math.max(5, parseFloat(receivedPct)))}%` }}
                              />
                            )}
                          </div>

                          <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold">
                            <span>Target Goal: ${Math.round(goal).toLocaleString()}</span>
                            <span>{camp.pledgeCount || 0} Pledges</span>
                          </div>
                        </div>

                        {/* Quick Stats Grid */}
                        <div className="grid grid-cols-2 gap-2 text-center pt-1">
                          <div className="p-2 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                            <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">Given to Fund</span>
                            <div className="text-sm font-black text-emerald-700 dark:text-emerald-300 mt-0.5">${Math.round(received).toLocaleString()}</div>
                          </div>
                          <div className="p-2 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30">
                            <span className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400">Total Pledged</span>
                            <div className="text-sm font-black text-indigo-700 dark:text-indigo-300 mt-0.5">${Math.round(pledged).toLocaleString()}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-5 pt-0 flex gap-2">
                      <button
                        onClick={() => {
                          setSelectedCampaignId(camp.id);
                          setActiveTab('customizer');
                        }}
                        className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition shadow-sm flex items-center justify-center gap-1.5"
                      >
                        <Sparkles size={14} /> Customize Widget
                      </button>
                      <button
                        onClick={() => {
                          setSelectedCampaignId(camp.id);
                          setActiveTab('submissions');
                        }}
                        className="px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750 font-bold rounded-xl text-xs transition"
                        title="View Pledges"
                      >
                        <Users size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: DESIGN & EMBED WIDGET ──────────────────────────────── */}
      {activeTab === 'customizer' && (
        <div className="flex flex-1 overflow-hidden">
          {/* Left Config Sidebar */}
          <div className="w-80 md:w-96 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-y-auto p-6 space-y-6 shrink-0">
            {/* Campaign Selection Dropdown */}
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Select Campaign</label>
              <select
                value={selectedCampaignId}
                onChange={e => setSelectedCampaignId(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {campaigns.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.fundName})
                  </option>
                ))}
              </select>
            </div>

            {/* Custom Headline */}
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Widget Headline</label>
              <input
                type="text"
                value={headline}
                onChange={e => setHeadline(e.target.value)}
                placeholder="e.g. Building Our Future Together"
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            {/* Campaign Image Upload */}
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Hero Banner / Flyer Image</label>
              <div className="space-y-3">
                {bannerUrl && (
                  <div className="relative rounded-xl overflow-hidden h-28 border border-slate-200 dark:border-slate-700 group">
                    <img src={bannerUrl} alt="Campaign Hero" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setBannerUrl('')}
                      className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-lg opacity-0 group-hover:opacity-100 transition hover:bg-rose-600"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    className="flex-1 py-2 px-3 border border-dashed border-indigo-300 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {uploadingImage ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    {uploadingImage ? `Uploading ${uploadProgress}%` : 'Upload Image'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </div>

                <input
                  type="url"
                  placeholder="Or paste image URL (https://...)"
                  value={bannerUrl}
                  onChange={e => setBannerUrl(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Progress Metric Focus */}
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Progress Metric Focus</label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl">
                {[
                  { id: 'both', label: 'Combined' },
                  { id: 'received', label: 'Money Given' },
                  { id: 'pledged', label: 'Pledges' },
                ].map(pb => (
                  <button
                    key={pb.id}
                    onClick={() => setProgressBasis(pb.id as any)}
                    className={`py-1.5 px-2 text-[11px] font-bold rounded-lg transition text-center ${
                      progressBasis === pb.id
                        ? 'bg-white dark:bg-slate-750 text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {pb.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Campaign Date Range (Beginning & End Dates) */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-wider text-slate-500">Campaign Date Range</label>
                {selectedCampaign?.pcoStartsAt && (
                  <button
                    type="button"
                    onClick={() => {
                      setStartDate(selectedCampaign.pcoStartsAt ? selectedCampaign.pcoStartsAt.slice(0, 10) : '');
                      setEndDate(selectedCampaign.pcoEndsAt ? selectedCampaign.pcoEndsAt.slice(0, 10) : '');
                    }}
                    className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                  >
                    Reset to PCO
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Beginning Date</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">End Date</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">
                PCO donations & pledges between these dates are synced and calculated toward this campaign.
              </p>
            </div>

            {/* Visual Graphic Style */}
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Visual Graphic Style</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'progress_bar', label: 'Progress Bar' },
                  { id: 'thermometer',  label: 'Thermometer' },
                  { id: 'radial_gauge', label: 'Radial Gauge' },
                  { id: 'card_hero',    label: 'Hero Card' },
                ].map(st => (
                  <button
                    key={st.id}
                    onClick={() => setGraphicStyle(st.id as any)}
                    className={`py-2 px-2.5 text-xs font-bold rounded-xl border text-center transition ${
                      graphicStyle === st.id
                        ? 'bg-indigo-50 dark:bg-indigo-900/40 border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Color Accent Theme */}
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Color Accent</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'indigo',  bg: 'bg-indigo-600' },
                  { id: 'blue',    bg: 'bg-blue-600' },
                  { id: 'emerald', bg: 'bg-emerald-600' },
                  { id: 'amber',   bg: 'bg-amber-600' },
                  { id: 'rose',    bg: 'bg-rose-600' },
                  { id: 'violet',  bg: 'bg-violet-600' },
                ].map(c => (
                  <button
                    key={c.id}
                    onClick={() => setColorTheme(c.id)}
                    className={`w-8 h-8 rounded-full ${c.bg} transition transform hover:scale-110 flex items-center justify-center ${
                      colorTheme === c.id ? 'ring-4 ring-offset-2 ring-indigo-400 dark:ring-offset-slate-900 scale-105' : ''
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Theme Mode */}
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Theme Mode</label>
              <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                <button
                  onClick={() => setThemeMode('light')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                    themeMode === 'light' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'
                  }`}
                >
                  Light
                </button>
                <button
                  onClick={() => setThemeMode('dark')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                    themeMode === 'dark' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'
                  }`}
                >
                  Dark
                </button>
              </div>
            </div>

            {/* Online Pledging Settings */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowOnlinePledging}
                  onChange={e => setAllowOnlinePledging(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Allow Online Pledging (Auto-Sync to PCO)
                </span>
              </label>

              {allowOnlinePledging && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Pledge Button Text</label>
                  <input
                    type="text"
                    value={pledgeButtonText}
                    onChange={e => setPledgeButtonText(e.target.value)}
                    placeholder="Pledge Now"
                    className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-medium"
                  />
                </div>
              )}
            </div>

            {/* Giving Integration Settings */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-500">Planning Center Giving Integration</label>
              
              <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                <button
                  onClick={() => setGivingEmbedMode('modal')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                    givingEmbedMode === 'modal' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-500'
                  }`}
                >
                  Modal Popup
                </button>
                <button
                  onClick={() => setGivingEmbedMode('direct_link')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                    givingEmbedMode === 'direct_link' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-500'
                  }`}
                >
                  Direct Link
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Giving Button Text</label>
                <input
                  type="text"
                  value={givingButtonText}
                  onChange={e => setGivingButtonText(e.target.value)}
                  placeholder="Give to Campaign"
                  className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1 flex items-center justify-between">
                  <span>Default Giving Fund</span>
                  <span className="text-[10px] text-indigo-500 font-bold lowercase">pre-selected in form</span>
                </label>
                <select
                  value={defaultFundId}
                  onChange={e => setDefaultFundId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Campaign Default Fund ({selectedCampaign?.fundName || 'Auto'})</option>
                  {(selectedCampaign?.availableFunds || []).map((f: any) => (
                    <option key={f.id} value={f.id}>
                      {f.name} {f.id === selectedCampaign?.fundId ? '(Linked to Campaign)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">
                  When donors click &quot;Give to Campaign&quot;, the Church Center form will automatically open with this fund pre-selected.
                </p>
              </div>
            </div>

            {/* Campaign Milestones Builder */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-wider text-slate-500">Campaign Milestones</label>
                <button
                  onClick={addMilestone}
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                >
                  <Plus size={13} /> Add
                </button>
              </div>

              {milestones.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No milestones defined yet. Click Add to define target phases.</p>
              ) : (
                <div className="space-y-2">
                  {milestones.map((m, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        type="number"
                        placeholder="Amount ($)"
                        value={m.amount}
                        onChange={e => updateMilestone(idx, 'amount', e.target.value)}
                        className="w-24 px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-slate-50 dark:bg-slate-900 font-bold text-slate-900 dark:text-white"
                      />
                      <input
                        type="text"
                        placeholder="Phase / Title"
                        value={m.title}
                        onChange={e => updateMilestone(idx, 'title', e.target.value)}
                        className="flex-1 px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                      />
                      <button
                        onClick={() => removeMilestone(idx)}
                        className="text-slate-400 hover:text-rose-500 p-1 transition"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Save Config Button */}
            <button
              onClick={handleSaveConfig}
              disabled={isSaving}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>

          {/* Right Live Preview & Embed Code Stage */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center space-y-6">
            {/* Viewport Width Switcher */}
            <div className="flex items-center justify-between w-full max-w-4xl">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Live Preview</span>
              </div>

              <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-xl">
                <button
                  onClick={() => setPreviewDevice('desktop')}
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition ${
                    previewDevice === 'desktop' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
                  }`}
                >
                  <Monitor size={13} /> Desktop
                </button>
                <button
                  onClick={() => setPreviewDevice('mobile')}
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition ${
                    previewDevice === 'mobile' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
                  }`}
                >
                  <Smartphone size={13} /> Mobile
                </button>
              </div>
            </div>

            {/* Render Live Widget Preview */}
            <div className={`w-full transition-all duration-300 ${previewDevice === 'mobile' ? 'max-w-sm' : 'max-w-4xl'}`}>
              <PledgeCampaignWidget
                churchId={churchId}
                campaignId={selectedCampaignId}
                graphicStyle={graphicStyle}
                color={colorTheme}
                theme={themeMode}
                givingEmbedMode={givingEmbedMode}
                givingButtonText={givingButtonText}
                pledgeButtonText={pledgeButtonText}
                allowOnlinePledging={allowOnlinePledging}
              />
            </div>

            {/* Embed Code Boxes */}
            <div className="w-full max-w-4xl space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Code size={16} className="text-indigo-500" /> Embed on Your Website
              </h3>

              {/* Script Embed */}
              <div className="bg-slate-900 rounded-2xl p-4 text-white space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-300">Responsive Script Embed (Recommended)</span>
                  <button
                    onClick={() => copyToClipboard(scriptEmbedCode, true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
                  >
                    {copiedScript ? <CheckCircle size={13} /> : <Copy size={13} />}
                    {copiedScript ? 'Copied!' : 'Copy Code'}
                  </button>
                </div>
                <pre className="text-xs font-mono bg-slate-950 p-3 rounded-xl overflow-x-auto text-indigo-300 border border-slate-800">
                  {scriptEmbedCode}
                </pre>
              </div>

              {/* Iframe Embed */}
              <div className="bg-slate-900 rounded-2xl p-4 text-white space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-300">Iframe Embed</span>
                  <button
                    onClick={() => copyToClipboard(iframeEmbedCode, false)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-bold transition shadow-sm"
                  >
                    {copiedIframe ? <CheckCircle size={13} /> : <Copy size={13} />}
                    {copiedIframe ? 'Copied!' : 'Copy Code'}
                  </button>
                </div>
                <pre className="text-xs font-mono bg-slate-950 p-3 rounded-xl overflow-x-auto text-slate-300 border border-slate-800">
                  {iframeEmbedCode}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 3: PLEDGE SUBMISSIONS LOG ─────────────────────────────── */}
      {activeTab === 'submissions' && (() => {
        const totalPledgedVol = submissions.reduce((s, sub) => s + (sub.totalCommitment || sub.amount || 0), 0);
        const monthlySubs = submissions.filter(s => s.pledgeType === 'monthly');
        const oneTimeSubs = submissions.filter(s => s.pledgeType !== 'monthly');
        const monthlyCashflow = monthlySubs.reduce((s, sub) => s + (sub.monthlyAmount || 0), 0);

        return (
          <div className="flex-1 overflow-y-auto p-6 max-w-7xl mx-auto w-full space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">Online Pledge Submissions</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pledges submitted through the website widget and automatically synced to Planning Center.
                </p>
              </div>
              <span className="text-xs font-bold text-slate-400">
                {submissions.length} Total Submissions
              </span>
            </div>

            {/* Top Summary Metrics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm space-y-1">
                <span className="text-[10px] font-black uppercase text-slate-400">Total Pledged Commitment</span>
                <div className="text-xl font-black text-indigo-600 dark:text-indigo-400">
                  ${totalPledgedVol.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  Across {submissions.length} total pledges
                </span>
              </div>

              <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm space-y-1">
                <span className="text-[10px] font-black uppercase text-slate-400">Monthly Recurring Pledges</span>
                <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                  ${monthlyCashflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-bold text-slate-400">/mo</span>
                </div>
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  {monthlySubs.length} recurring pledges scheduled
                </span>
              </div>

              <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm space-y-1">
                <span className="text-[10px] font-black uppercase text-slate-400">One-Time Pledges</span>
                <div className="text-xl font-black text-slate-900 dark:text-white">
                  ${oneTimeSubs.reduce((s, sub) => s + (sub.totalCommitment || sub.amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  {oneTimeSubs.length} one-time gifts pledged
                </span>
              </div>
            </div>

            {loadingSubmissions ? (
              <div className="flex items-center justify-center h-48 text-slate-400">
                <Loader2 size={24} className="animate-spin mr-2 text-indigo-500" /> Loading submissions...
              </div>
            ) : submissions.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                <Heart size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">No online pledges recorded yet.</p>
                <p className="text-[11px] text-slate-400 mt-1">When visitors submit a pledge on your website widget, they will appear here.</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">
                      <th className="px-4 py-3 text-left">Pledger Name</th>
                      <th className="px-4 py-3 text-left">Contact</th>
                      <th className="px-4 py-3 text-left">Schedule & Breakdown</th>
                      <th className="px-4 py-3 text-left">Total Commitment</th>
                      <th className="px-4 py-3 text-left">PCO Sync Status</th>
                      <th className="px-4 py-3 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium">
                    {submissions.map(sub => {
                      const total = sub.totalCommitment || sub.amount || 0;
                      const isMonthly = sub.pledgeType === 'monthly';

                      return (
                        <tr key={sub.id} className="hover:bg-slate-50 dark:hover:bg-slate-750 transition">
                          <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                            {sub.firstName} {sub.lastName}
                            {sub.isNewPerson && (
                              <span className="ml-2 text-[10px] bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded font-bold border border-indigo-200 dark:border-indigo-800">
                                New Person
                              </span>
                            )}
                            {sub.jointGiverType === 'joint' && (
                              <span className="ml-1 text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded font-medium">
                                Joint
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                            <div>{sub.email}</div>
                            {sub.phone && <div className="text-[10px] text-slate-400">{sub.phone}</div>}
                          </td>
                          <td className="px-4 py-3">
                            {isMonthly ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800/80">
                                <Calendar size={11} className="text-emerald-500" />
                                ${(sub.monthlyAmount || 0).toLocaleString()}/mo × {sub.durationMonths || 1} mos
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-lg">
                                <DollarSign size={11} className="text-slate-400" />
                                One-Time Gift
                              </span>
                            )}
                            {sub.notes && (
                              <div className="text-[10px] text-slate-400 italic mt-0.5 line-clamp-1">
                                {sub.notes}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 font-black text-slate-900 dark:text-white">
                            ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3">
                            {sub.status === 'synced_to_pco' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                                <CheckCircle size={12} /> Synced to PCO {sub.pcoPledgeId ? `(#${sub.pcoPledgeId})` : ''}
                              </span>
                            ) : sub.status === 'pending_pco_permission' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-2.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800" title={sub.syncWarning || 'PCO connected user lacks Giving Manager permissions'}>
                                <AlertCircle size={12} /> Saved (PCO Giving permission needed)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 px-2.5 py-0.5 rounded-full border border-rose-200 dark:border-rose-800">
                                <AlertCircle size={12} /> Pending Sync
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-400">
                            {sub.submittedAt ? new Date(sub.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};
