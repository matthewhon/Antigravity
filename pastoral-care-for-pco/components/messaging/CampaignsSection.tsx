import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db as firebaseDb, storage } from '../../services/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import {
    collection, doc, setDoc, query, where, getDocs, limit
} from 'firebase/firestore';
import { pcoService } from '../../services/pcoService';
import { firestore } from '../../services/firestoreService';
import { SmsCampaign, Church, User, hasBroadcastAccess } from '../../types';
import {
    MessageSquare, Send, Clock, Plus, ArrowLeft, Trash2,
    ChevronDown, CheckCircle, Loader2, X, Calendar, Phone, Search,
    AlertTriangle, Copy, Mail, Smile, Image as ImageIcon, Link,
    Sparkles, ChevronRight, RotateCcw, Contact, Upload, FileText,
    Folder, Link2, Camera, Edit3, UserCheck, List, Layers, BarChart3
} from 'lucide-react';
import { ToolPage, ToolTabs, ToolButton, ToolEmptyState } from '../tool-shell';
import { SmsAnalytics } from './SmsAnalytics';
import { SmsEventPickerModal } from '../SmsEventPickerModal';
import { SimpleRichTextEditor } from '../SimpleRichTextEditor';
import { VariablePicker } from '../VariablePicker';
import { formatPhone } from './smsUtils';
import {
    compressSmsImage, STATUS_LABELS, SEGMENT_NOTE, ALL_MERGE_TAGS,
    COMMON_EMOJIS, countSegments, getSmsAiSuggestion
} from './smsHelpers';

const API_BASE = '';

export const ScheduleModal: React.FC<{
    onConfirm: (scheduledAt: number, recurringFrequency?: 'daily' | 'weekly' | 'monthly') => void;
    onCancel: () => void;
    isBusy: boolean;
}> = ({ onConfirm, onCancel, isBusy }) => {
    const defaultDt = () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const [dateTime, setDateTime] = useState(defaultDt);
    const [frequency, setFrequency] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');

    const handleConfirm = () => {
        const ts = new Date(dateTime).getTime();
        if (isNaN(ts) || ts <= Date.now()) { alert('Please choose a future time.'); return; }
        onConfirm(ts, frequency === 'none' ? undefined : frequency);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                    <Clock size={16} className="text-amber-500" /> Schedule Text Blast
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Recipients will be resolved from your PCO list or group at send time.
                </p>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Send Date &amp; Time</label>
                <input
                    type="datetime-local"
                    value={dateTime}
                    onChange={e => setDateTime(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                    title="Send date and time"
                    placeholder="Select date and time"
                    className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
                />
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Repeat</label>
                <select
                    value={frequency}
                    onChange={e => setFrequency(e.target.value as any)}
                    title="Repeat frequency"
                    className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-6"
                >
                    <option value="none">Does not repeat</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                </select>
                <div className="flex gap-2">
                    <button onClick={onCancel} className="flex-1 py-2.5 text-sm text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition font-semibold">Cancel</button>
                    <button onClick={handleConfirm} disabled={isBusy} className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition">
                        {isBusy ? <><Loader2 size={13} className="animate-spin" />Scheduling...</> : <><Calendar size={13} />Schedule</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const FilePickerDialog: React.FC<{
    churchId: string;
    currentUser?: User;
    onSelect: (url: string) => void;
    onSelectAsMms?: (url: string) => void;
    onClose: () => void;
}> = ({ churchId, currentUser, onSelect, onSelectAsMms, onClose }) => {
    const [files, setFiles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'upload' | 'library'>('upload');
    const [search, setSearch] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const [uploadError, setUploadError] = useState('');
    const [uploadedFile, setUploadedFile] = useState<any | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        firestore.getTenantFiles(churchId).then(f => {
            setFiles(f);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [churchId]);

    const handleFileUpload = async (file: File) => {
        if (!file) return;
        setIsUploading(true);
        setUploadProgress(0);
        setUploadError('');
        setUploadedFile(null);

        try {
            const fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const gcsPath = `tenants/${churchId}/uploads/${fileId}_${cleanName}`;
            const sRef = storageRef(storage, gcsPath);

            const task = uploadBytesResumable(sRef, file);

            await new Promise<void>((resolve, reject) => {
                task.on('state_changed',
                    snap => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
                    reject,
                    () => resolve()
                );
            });

            const publicUrl = await getDownloadURL(sRef);
            const tenantFile = {
                id: fileId,
                churchId,
                uploaderUid: currentUser?.id || 'system',
                originalName: file.name,
                mimeType: file.type || 'application/octet-stream',
                sizeBytes: file.size,
                publicUrl,
                gcsPath,
                createdAt: Date.now(),
            };

            await firestore.saveTenantFile(tenantFile);
            setFiles(prev => [tenantFile, ...prev]);
            setUploadedFile(tenantFile);
            setUploadProgress(null);
        } catch (err: any) {
            console.error('File upload failed', err);
            setUploadError(err.message || 'File upload failed. Please try again.');
        } finally {
            setIsUploading(false);
        }
    };

    const filteredFiles = files.filter(f =>
        !search.trim() || f.originalName?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-6 w-full max-w-lg mx-auto flex flex-col max-h-[85vh] border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <FileText size={18} className="text-indigo-500" /> Attach File or Document
                    </h3>
                    <button onClick={onClose} title="Close" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition"><X size={16} /></button>
                </div>

                <div className="flex border-b border-slate-200 dark:border-slate-700 mb-4">
                    <button
                        type="button"
                        onClick={() => setTab('upload')}
                        className={`flex-1 py-2 text-xs font-bold transition flex items-center justify-center gap-1.5 border-b-2 ${
                            tab === 'upload'
                                ? 'text-indigo-600 dark:text-indigo-400 border-indigo-600'
                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 border-transparent'
                        }`}
                    >
                        <Upload size={14} /> Upload New File
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab('library')}
                        className={`flex-1 py-2 text-xs font-bold transition flex items-center justify-center gap-1.5 border-b-2 ${
                            tab === 'library'
                                ? 'text-indigo-600 dark:text-indigo-400 border-indigo-600'
                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 border-transparent'
                        }`}
                    >
                        <FileText size={14} /> Church Library ({files.length})
                    </button>
                </div>

                {tab === 'upload' ? (
                    <div className="space-y-4 flex-1 flex flex-col justify-center">
                        <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            onChange={e => {
                                const f = e.target.files?.[0];
                                if (f) handleFileUpload(f);
                            }}
                        />

                        {!uploadedFile ? (
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={e => e.preventDefault()}
                                onDrop={e => {
                                    e.preventDefault();
                                    const f = e.dataTransfer.files?.[0];
                                    if (f) handleFileUpload(f);
                                }}
                                className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition"
                            >
                                <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3">
                                    <Upload size={22} />
                                </div>
                                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                                    {isUploading ? 'Uploading file...' : 'Click to select or drag & drop'}
                                </p>
                                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                                    PDF, flyer, bulletin, document, audio, or image to share via link
                                </p>
                            </div>
                        ) : (
                            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                        <CheckCircle size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100 truncate">{uploadedFile.originalName}</p>
                                        <p className="text-xs text-emerald-600 dark:text-emerald-400">{formatFileSize(uploadedFile.sizeBytes)} • Ready to attach</p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => onSelect(`${window.location.origin}/f/${uploadedFile.id}`)}
                                        className="flex-1 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm"
                                    >
                                        <Link size={13} /> Insert Link in Message
                                    </button>
                                    {uploadedFile.mimeType?.startsWith('image/') && onSelectAsMms && (
                                        <button
                                            type="button"
                                            onClick={() => onSelectAsMms(uploadedFile.publicUrl || `${window.location.origin}/f/${uploadedFile.id}`)}
                                            className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm"
                                        >
                                            <ImageIcon size={13} /> Send as MMS
                                        </button>
                                    )}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setUploadedFile(null)}
                                    className="text-[11px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-center w-full pt-1"
                                >
                                    Upload a different file
                                </button>
                            </div>
                        )}

                        {uploadProgress !== null && (
                            <div className="space-y-1">
                                <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-600 transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                                </div>
                                <p className="text-[11px] text-slate-400 text-right">{uploadProgress}%</p>
                            </div>
                        )}

                        {uploadError && (
                            <div className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 p-2.5 rounded-xl border border-red-200 dark:border-red-800">
                                {uploadError}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="relative mb-3">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search existing files..."
                                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        {loading ? (
                            <div className="flex-1 flex items-center justify-center py-10"><Loader2 size={24} className="animate-spin text-slate-400" /></div>
                        ) : filteredFiles.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">No files match your search.</p>
                                <p className="text-xs text-slate-400">Switch to the upload tab to add a new file.</p>
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                                {filteredFiles.map(f => {
                                    const isImg = f.mimeType?.startsWith('image/');
                                    return (
                                        <div
                                            key={f.id}
                                            className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition text-left"
                                        >
                                            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                                {isImg ? (
                                                    <ImageIcon size={18} className="text-emerald-500" />
                                                ) : (
                                                    <FileText size={18} className="text-indigo-500" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{f.originalName}</div>
                                                <div className="text-[10px] text-slate-400">{formatFileSize(f.sizeBytes)} • {new Date(f.createdAt).toLocaleDateString()}</div>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {isImg && onSelectAsMms && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onSelectAsMms(f.publicUrl || `${window.location.origin}/f/${f.id}`)}
                                                        className="px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-lg text-xs font-bold border border-emerald-200 dark:border-emerald-800 transition"
                                                        title="Attach as MMS Image"
                                                    >
                                                        MMS
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => onSelect(`${window.location.origin}/f/${f.id}`)}
                                                    className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition"
                                                >
                                                    Insert Link
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

interface ComposerProps {
    campaign: SmsCampaign;
    churchId: string;
    church: Church;
    currentUser: User;
    apiBase: string;
    onBack: () => void;
    onSave: (updates: Partial<SmsCampaign>) => Promise<void>;
    onSend: (campaign: SmsCampaign) => void;
    onSchedule: (campaign: SmsCampaign, scheduledAt: number, freq?: 'daily' | 'weekly' | 'monthly') => void;
    onCancelSchedule?: () => void;
    onViewAnalytics?: () => void;
    isSending: boolean;
}

export const CampaignComposer: React.FC<ComposerProps> = ({
    campaign, churchId, church, currentUser, onBack, onSave, onSend, onSchedule, onCancelSchedule, onViewAnalytics, isSending,
}) => {
    const [local, setLocal] = useState<SmsCampaign>(campaign);
    const [pcoLists, setPcoLists] = useState<{ id: string; name: string; total_people: number }[]>([]);
    const [pcoGroups, setPcoGroups] = useState<{ id: string; name: string; memberCount: number }[]>([]);
    const [toTab, setToTab] = useState<'lists' | 'groups'>('lists');
    const [loadingLists, setLoadingLists] = useState(false);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [showSchedule, setShowSchedule] = useState(false);
    const [lastSaved, setLastSaved] = useState<number | null>(null);
    const [signups, setSignups] = useState<{ id: string; name: string }[]>([]);
    const [loadingSignups, setLoadingSignups] = useState(false);

    useEffect(() => {
        if (local.campaignType === 'event_registration' && signups.length === 0) {
            setLoadingSignups(true);
            fetch(`/api/public/registrations/${churchId}`)
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) {
                        setSignups(data);
                    }
                    setLoadingSignups(false);
                })
                .catch(() => setLoadingSignups(false));
        }
    }, [local.campaignType, churchId, signups.length]);

    const [showEmojis, setShowEmojis] = useState(false);
    const [showLinkDlg, setShowLinkDlg] = useState(false);
    const [showFilePicker, setShowFilePicker] = useState(false);
    const [showEventPicker, setShowEventPicker] = useState(false);
    const [linkUrl, setLinkUrl] = useState('');
    const [imageUrl, setImageUrl] = useState((local.mediaUrls && local.mediaUrls[0]) || '');
    const [sendAsMms, setSendAsMms] = useState<boolean>(
        Boolean((local.mediaUrls && local.mediaUrls.length > 0) || (local.mediaUrls && local.mediaUrls[0]))
    );
    const [showImagePanel, setShowImagePanel] = useState(false);
    const [imageTab, setImageTab] = useState<'upload' | 'url'>('upload');
    const [imageUploadProgress, setImageUploadProgress] = useState<number | null>(null);
    const [imageUploadError, setImageUploadError] = useState('');
    const [urlInput, setUrlInput] = useState('');
    const imageFileInputRef = useRef<HTMLInputElement>(null);
    const [aiSuggestion, setAiSuggestion] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const [showAiPanel, setShowAiPanel] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const m = (local.mediaUrls && local.mediaUrls[0]) || '';
        if (m) {
            setImageUrl(m);
            setSendAsMms(true);
        }
    }, [local.mediaUrls]);

    const isMmsActive = Boolean(imageUrl && sendAsMms && local.channelType !== 'email');
    const segments = isMmsActive ? 1 : countSegments(local.body || '');
    const canSend = !!(local.body?.trim()) && !!(local.toListId || local.toGroupId) && (local.channelType === 'email' ? !!(local.emailSubject?.trim()) : true);

    const update = useCallback((patch: Partial<SmsCampaign>) => {
        setLocal(prev => ({ ...prev, ...patch }));
        onSave(patch).then(() => setLastSaved(Date.now()));
    }, [onSave]);

    const handleToggleMms = (enabled: boolean) => {
        setSendAsMms(enabled);
        if (imageUrl) {
            update({ mediaUrls: enabled ? [imageUrl] : [] });
        }
    };

    const handleSetImage = (url: string, asMms: boolean = true) => {
        setImageUrl(url);
        setSendAsMms(asMms);
        update({ mediaUrls: asMms ? [url] : [] });
        setShowImagePanel(false);
    };

    const handleRemoveImage = () => {
        setImageUrl('');
        setSendAsMms(false);
        update({ mediaUrls: [] });
        setShowImagePanel(false);
    };

    const handleInsertImageLink = () => {
        if (!imageUrl) return;
        insertAtCursor(' ' + imageUrl);
    };

    const handleImageFileUpload = async (file: File) => {
        if (!file.type.startsWith('image/')) {
            setImageUploadError('Please select an image file (JPG, PNG, GIF, WebP).');
            return;
        }
        setImageUploadError('');
        setImageUploadProgress(0);
        let compressedFile = file;
        try {
            compressedFile = await compressSmsImage(file) as File;
        } catch (err) {
            console.warn('[ImageCompress] Compression failed, uploading original', err);
        }
        const cleanName = compressedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `sms-media/${churchId}/broadcast/${Date.now()}_${cleanName}`;
        const sRef = storageRef(storage, path);
        const task = uploadBytesResumable(sRef, compressedFile);
        task.on(
            'state_changed',
            snap => setImageUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
            err => { setImageUploadError('Upload failed: ' + err.message); setImageUploadProgress(null); },
            async () => {
                const url = await getDownloadURL(task.snapshot.ref);
                setImageUploadProgress(null);
                handleSetImage(url, sendAsMms);
            }
        );
    };

    const insertAtCursor = (text: string) => {
        const el = textareaRef.current;
        if (!el) { update({ body: (local.body || '') + text }); return; }
        const start = el.selectionStart ?? (local.body || '').length;
        const end = el.selectionEnd ?? start;
        const before = (local.body || '').slice(0, start);
        const after = (local.body || '').slice(end);
        const newBody = before + text + after;
        update({ body: newBody });
        requestAnimationFrame(() => {
            el.focus();
            const pos = start + text.length;
            el.setSelectionRange(pos, pos);
        });
    };

    const handleAiSuggest = async () => {
        if (!local.body?.trim()) return;
        setAiLoading(true);
        setShowAiPanel(true);
        setAiSuggestion('');
        try {
            const suggestion = await getSmsAiSuggestion(local.body, churchId);
            setAiSuggestion(suggestion);
        } catch {
            setAiSuggestion('Unable to get AI suggestion. Please try again.');
        } finally {
            setAiLoading(false);
        }
    };

    useEffect(() => {
        setLoadingLists(true);
        pcoService.getPeopleLists(churchId).then((raw: any[]) => {
            const mapped = raw.map(r => ({
                id: r.id,
                name: r.attributes?.name || 'Unnamed',
                total_people: r.attributes?.total_people ?? 0,
            }));
            const filtered = mapped.filter(list => hasBroadcastAccess(currentUser, list.id, church));
            setPcoLists(filtered);

            setDoc(doc(firebaseDb, 'debugLogs', `sms_broadcast_${Date.now()}`), {
                currentUser_id: currentUser?.id,
                currentUser_roles: currentUser?.roles || [],
                raw_lists: mapped.length,
                filtered_lists: filtered.length,
                accessMap: church?.broadcastPermissions?.allowedAccess || {},
                timestamp: new Date().toISOString()
            }).catch(() => {});

            setLoadingLists(false);
        }).catch(() => setLoadingLists(false));
    }, [churchId, church, currentUser]);

    useEffect(() => {
        if (toTab === 'groups' && pcoGroups.length === 0) {
            setLoadingGroups(true);
            pcoService.getGroups(churchId).then((raw: any[]) => {
                setPcoGroups(raw.map(r => ({
                    id: r.id,
                    name: r.attributes?.name || 'Unnamed',
                    memberCount: r.attributes?.memberships_count ?? r.attributes?.member_count ?? 0,
                })).filter(group => hasBroadcastAccess(currentUser, group.id, church)));
                setLoadingGroups(false);
            }).catch(() => setLoadingGroups(false));
        }
    }, [toTab, churchId, pcoGroups.length, church, currentUser]);

    const recipientLabel = (local.toGroupId && local.toGroupName)
        ? `Group: ${local.toGroupName}`
        : (local.toListId && local.toListName)
            ? `List: ${local.toListName}`
            : '';

    return (
        <div className="flex flex-col h-full">
            <div className="flex flex-wrap items-center gap-2 px-3 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <button onClick={onBack} title="Back to campaigns" className="p-1.5 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0">
                        <ArrowLeft size={18} />
                    </button>
                    <div className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 min-w-0">
                        <span className="cursor-pointer hover:text-indigo-600 font-medium hidden sm:inline" onClick={onBack}>Campaigns</span>
                        <ChevronDown size={14} className="-rotate-90 hidden sm:block" />
                        <span className="font-semibold text-slate-900 dark:text-white truncate">{local.name}</span>
                    </div>
                    {lastSaved && (
                        <span className="text-[10px] font-medium text-emerald-500 flex items-center gap-1 shrink-0">
                            <CheckCircle size={11} /> Saved
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {local.status === 'sent' && onViewAnalytics && (
                        <button
                            onClick={onViewAnalytics}
                            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl transition border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 bg-indigo-50/70 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
                        >
                            <BarChart3 size={14} /> View Analytics
                        </button>
                    )}
                    {local.status === 'scheduled' && onCancelSchedule && (
                        <button
                            onClick={onCancelSchedule}
                            disabled={isSending}
                            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl transition border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                        >
                            <X size={14} /> Cancel Schedule
                        </button>
                    )}
                    {local.status !== 'scheduled' && (
                        <button
                            onClick={() => setShowSchedule(true)}
                            disabled={!canSend || isSending}
                            className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl transition border ${canSend && !isSending ? 'border-amber-400 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100' : 'border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed'}`}
                        >
                            <Clock size={14} /> Schedule
                        </button>
                    )}
                    {local.status !== 'scheduled' && (
                        <button
                            onClick={() => onSend(local)}
                            disabled={!canSend || isSending}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition ${canSend && !isSending ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200 dark:shadow-indigo-900/40' : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'}`}
                        >
                            {isSending ? <><Loader2 size={14} className="animate-spin" />Sending...</> : <><Send size={14} />Send Now</>}
                        </button>
                    )}
                </div>
            </div>

            <div className="flex flex-col md:flex-row flex-1 overflow-hidden overflow-y-auto md:overflow-hidden">
                <div className="w-full md:w-[380px] md:shrink-0 md:overflow-y-auto md:border-r border-b md:border-b-0 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-4 space-y-4">
                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">Campaign Name</label>
                        <input
                            type="text"
                            value={local.name}
                            onChange={e => update({ name: e.target.value })}
                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="e.g. Sunday Service Reminder"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">Broadcast Type</label>
                        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                            <button
                                onClick={() => update({ channelType: 'sms' })}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold rounded-lg transition ${(!local.channelType || local.channelType === 'sms') ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-600' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            >
                                <MessageSquare size={14} /> SMS Text
                            </button>
                            <button
                                onClick={() => update({ channelType: 'email' })}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold rounded-lg transition ${local.channelType === 'email' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-600' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            >
                                <Mail size={14} /> Email
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">Recipients</label>
                        <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600 mb-3">
                            {(['lists', 'groups'] as const).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setToTab(tab)}
                                    className={`flex-1 py-1.5 text-xs font-bold capitalize transition ${toTab === tab ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                                >
                                    PCO {tab === 'lists' ? 'Lists' : 'Groups'}
                                </button>
                            ))}
                        </div>

                        {toTab === 'lists' && (
                            <>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Recipients missing a phone number will be skipped and logged.</p>
                                {loadingLists ? (
                                    <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={13} className="animate-spin" /> Loading lists...</div>
                                ) : (
                                    <select
                                        title="Select a PCO list"
                                        className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        value={local.toListId || ''}
                                        onChange={e => {
                                            const sel = pcoLists.find(l => l.id === e.target.value);
                                            update({ toListId: sel?.id ?? null, toListName: sel?.name ?? null, toGroupId: null, toGroupName: null });
                                        }}
                                    >
                                        <option value="">— Select a PCO List —</option>
                                        {pcoLists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.total_people})</option>)}
                                    </select>
                                )}
                            </>
                        )}

                        {toTab === 'groups' && (
                            <>
                                {loadingGroups ? (
                                    <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={13} className="animate-spin" /> Loading groups...</div>
                                ) : (
                                    <select
                                        title="Select a PCO group"
                                        className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        value={local.toGroupId || ''}
                                        onChange={e => {
                                            const sel = pcoGroups.find(g => g.id === e.target.value);
                                            update({ toGroupId: sel?.id ?? null, toGroupName: sel?.name ?? null, toListId: null, toListName: null });
                                        }}
                                    >
                                        <option value="">— Select a PCO Group —</option>
                                        {pcoGroups.map(g => <option key={g.id} value={g.id}>{g.name}{g.memberCount > 0 ? ` (${g.memberCount})` : ''}</option>)}
                                    </select>
                                )}
                            </>
                        )}

                        {(local.toListId || local.toGroupId) && (
                            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mt-2">
                                <CheckCircle size={12} /> {recipientLabel}
                            </div>
                        )}
                    </div>

                    {local.channelType !== 'email' && (
                        <div className="bg-slate-50 dark:bg-slate-900/30 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3 mt-4">
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">Campaign Type</label>
                                <select
                                    title="Campaign Type"
                                    className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-xl px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                                    value={local.campaignType || 'standard'}
                                    onChange={e => {
                                        const type = e.target.value;
                                        update({
                                            campaignType: type,
                                            pcoSignupId: type === 'event_registration' ? local.pcoSignupId : undefined
                                        });
                                    }}
                                >
                                    <option value="standard">Standard SMS Blast</option>
                                    <option value="event_registration">Event Registration Flow</option>
                                </select>
                            </div>

                            {local.campaignType === 'event_registration' && (
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">PCO Event Signup</label>
                                    {loadingSignups ? (
                                        <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 size={11} className="animate-spin" /> Loading Events...</div>
                                    ) : (
                                        <select
                                            title="Select PCO Event"
                                            className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-xl px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            value={local.pcoSignupId || ''}
                                            onChange={e => update({ pcoSignupId: e.target.value })}
                                        >
                                            <option value="">— Select PCO Event Signup —</option>
                                            {signups.map(s => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {local.status === 'sent' && (
                        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Send Results</p>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { label: 'Sent', value: local.deliveredCount ?? '—', color: 'text-emerald-600' },
                                    { label: 'Failed', value: local.failedCount ?? '—', color: 'text-red-500' },
                                    { label: 'Opt-Outs', value: local.optOutCount ?? '—', color: 'text-amber-600' },
                                    { label: 'Total', value: local.recipientCount ?? '—', color: 'text-slate-700 dark:text-slate-300' },
                                ].map(s => (
                                    <div key={s.label} className="text-center p-2 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                                        <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                                        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">{s.label}</p>
                                    </div>
                                ))}
                            </div>
                            {onViewAnalytics && (
                                <button
                                    type="button"
                                    onClick={onViewAnalytics}
                                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800 transition"
                                >
                                    <BarChart3 size={13} /> View Broadcast Analytics
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex-1 md:overflow-y-auto p-4">
                    <div className="max-w-xl mx-auto space-y-4">
                        <div>
                            {local.channelType === 'email' ? (
                                <>
                                    <div className="mb-4">
                                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">Email Subject</label>
                                        <input
                                            type="text"
                                            value={local.emailSubject || ''}
                                            onChange={e => update({ emailSubject: e.target.value })}
                                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            placeholder="Enter subject line..."
                                        />
                                    </div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Email Body</label>
                                    </div>
                                    <SimpleRichTextEditor value={local.body || ''} onChange={body => update({ body })} />
                                </>
                            ) : (
                                <>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Message</label>
                                        <span className={`text-xs font-bold ${isMmsActive ? 'text-indigo-600 dark:text-indigo-400' : segments > 3 ? 'text-red-500' : segments > 1 ? 'text-amber-600' : 'text-slate-400'}`}>
                                            {isMmsActive
                                                ? `${local.body?.length ?? 0} chars • MMS (1 media message)`
                                                : `${local.body?.length ?? 0} chars • ${segments} segment${segments !== 1 ? 's' : ''}`
                                            }
                                        </span>
                                    </div>
                                    <textarea
                                        ref={textareaRef}
                                        rows={8}
                                        value={local.body || ''}
                                        onChange={e => update({ body: e.target.value })}
                                        placeholder="Type your message here..."
                                        className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-2xl px-4 py-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-medium leading-relaxed"
                                    />
                                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                                        <div className="relative">
                                            <button
                                                type="button"
                                                title="Insert emoji"
                                                onClick={() => { setShowEmojis(v => !v); setShowLinkDlg(false); }}
                                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
                                            >
                                                <Smile size={13} /> Emoji
                                            </button>
                                            {showEmojis && (
                                                <div className="absolute top-full left-0 mt-1 z-30 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3 grid grid-cols-10 gap-1 min-w-[260px]">
                                                    {COMMON_EMOJIS.map(em => (
                                                        <button key={em} onClick={() => { insertAtCursor(em); setShowEmojis(false); }}
                                                            className="text-xl hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg p-1 transition leading-none"
                                                            title={em}>
                                                            {em}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div className="relative">
                                            <button
                                                type="button"
                                                title="Insert link"
                                                onClick={() => { setShowLinkDlg(v => !v); setShowEmojis(false); setShowFilePicker(false); setShowImagePanel(false); }}
                                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
                                            >
                                                <Link size={13} /> Link
                                            </button>
                                            {showLinkDlg && (
                                                <div className="absolute top-full left-0 mt-1 z-30 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3 w-72">
                                                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Insert Link URL</p>
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="url"
                                                            value={linkUrl}
                                                            onChange={e => setLinkUrl(e.target.value)}
                                                            placeholder="https://example.com"
                                                            className="flex-1 text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                        <button
                                                            onClick={() => { if (linkUrl.trim()) { insertAtCursor(' ' + linkUrl.trim()); setLinkUrl(''); setShowLinkDlg(false); } }}
                                                            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition"
                                                        >Insert</button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            title="Attach a file or document link"
                                            onClick={() => { setShowFilePicker(v => !v); setShowEmojis(false); setShowLinkDlg(false); setShowImagePanel(false); }}
                                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
                                        >
                                            <FileText size={13} /> File
                                        </button>
                                        <button
                                            type="button"
                                            title="Attach or upload image (MMS / Link options)"
                                            onClick={() => {
                                                setShowImagePanel(v => !v);
                                                setShowFilePicker(false);
                                                setShowEmojis(false);
                                                setShowLinkDlg(false);
                                            }}
                                            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition ${
                                                imageUrl
                                                    ? sendAsMms
                                                        ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                                                        : 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700'
                                                    : showImagePanel
                                                        ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700'
                                                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'
                                            }`}
                                        >
                                            <ImageIcon size={13} /> {imageUrl ? (sendAsMms ? 'Image (MMS) ✓' : 'Image (Link) ✓') : 'Image'}
                                        </button>
                                        {imageUrl && (
                                            <button
                                                type="button"
                                                title="Remove image"
                                                onClick={handleRemoveImage}
                                                className="p-1.5 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                                            >
                                                <X size={13} />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            title="Attach Church Contact Card (vCard)"
                                            onClick={() => {
                                                const newValue = !local.attachVcard;
                                                update({ attachVcard: newValue });
                                            }}
                                            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition ${local.attachVcard ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                                                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'
                                                }`}
                                        >
                                            <Contact size={13} /> {local.attachVcard ? 'Contact Card ✓' : 'Contact Card'}
                                        </button>
                                        <div className="flex-1" />
                                        <button
                                            type="button"
                                            title="Suggest message from upcoming event or registration"
                                            onClick={() => setShowEventPicker(true)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition"
                                        >
                                            <Calendar size={13} />
                                            Suggest from Events
                                        </button>
                                        <button
                                            type="button"
                                            title="AI SMS helper ... suggest shorter message"
                                            onClick={handleAiSuggest}
                                            disabled={!local.body?.trim() || aiLoading}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:opacity-50 transition"
                                        >
                                            {aiLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                                            AI Shorten
                                        </button>
                                    </div>

                                    {showImagePanel && (
                                        <div className="mt-3 border-2 border-indigo-200 dark:border-indigo-700 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-md">
                                            <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                                                {(['upload', 'url'] as const).map(t => (
                                                    <button
                                                        key={t}
                                                        type="button"
                                                        onClick={() => setImageTab(t)}
                                                        className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wide transition ${
                                                            imageTab === t
                                                                ? 'text-indigo-600 dark:text-indigo-300 border-b-2 border-indigo-500 bg-white dark:bg-slate-900'
                                                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                                                        }`}
                                                    >
                                                        <span className="inline-flex items-center justify-center gap-1.5">
                                                            {t === 'upload' ? <Folder size={12} aria-hidden="true" /> : <Link2 size={12} aria-hidden="true" />}
                                                            {t === 'upload' ? 'Upload Image File' : 'Paste Image URL'}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="p-4 space-y-3">
                                                {imageTab === 'upload' ? (
                                                    <>
                                                        <input
                                                            ref={imageFileInputRef}
                                                            type="file"
                                                            accept="image/*"
                                                            className="hidden"
                                                            onChange={e => {
                                                                const f = e.target.files?.[0];
                                                                if (f) handleImageFileUpload(f);
                                                            }}
                                                        />
                                                        <div
                                                            onClick={() => imageFileInputRef.current?.click()}
                                                            onDragOver={e => e.preventDefault()}
                                                            onDrop={e => {
                                                                e.preventDefault();
                                                                const f = e.dataTransfer.files?.[0];
                                                                if (f) handleImageFileUpload(f);
                                                            }}
                                                            className="flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition text-center"
                                                        >
                                                            <Upload size={22} className="text-slate-400" />
                                                            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                                                Click or drag &amp; drop image here
                                                            </p>
                                                            <p className="text-[10px] text-slate-400">JPG, PNG, GIF, WebP — up to 5 MB</p>
                                                        </div>
                                                        {imageUploadProgress !== null && (
                                                            <div className="space-y-1">
                                                                <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-indigo-600 transition-all duration-200" style={{ width: `${imageUploadProgress}%` }} />
                                                                </div>
                                                                <p className="text-[10px] text-slate-400 text-right">{imageUploadProgress}%</p>
                                                            </div>
                                                        )}
                                                        {imageUploadError && <p className="text-xs text-red-500">{imageUploadError}</p>}
                                                    </>
                                                ) : (
                                                    <div className="space-y-2">
                                                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Public Image URL</p>
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="url"
                                                                value={urlInput}
                                                                onChange={e => setUrlInput(e.target.value)}
                                                                placeholder="https://example.com/photo.jpg"
                                                                className="flex-1 text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (urlInput.trim()) {
                                                                        handleSetImage(urlInput.trim(), sendAsMms);
                                                                        setUrlInput('');
                                                                    }
                                                                }}
                                                                disabled={!urlInput.trim()}
                                                                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition"
                                                            >
                                                                Use URL
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                                                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Delivery Options</p>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                        <label
                                                            className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${
                                                                sendAsMms
                                                                    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-700'
                                                                    : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                                                            }`}
                                                        >
                                                            <input
                                                                type="radio"
                                                                name="deliveryMode"
                                                                checked={sendAsMms}
                                                                onChange={() => handleToggleMms(true)}
                                                                className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                                                            />
                                                            <div className="text-left">
                                                                <span className="block text-xs font-bold text-slate-900 dark:text-white">Send as MMS Attachment</span>
                                                                <span className="block text-[10px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                                                                    Displays directly as an inline photo in the recipient's SMS app.
                                                                </span>
                                                            </div>
                                                        </label>

                                                        <label
                                                            className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${
                                                                !sendAsMms
                                                                    ? 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-300 dark:border-indigo-700'
                                                                    : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                                                            }`}
                                                        >
                                                            <input
                                                                type="radio"
                                                                name="deliveryMode"
                                                                checked={!sendAsMms}
                                                                onChange={() => handleToggleMms(false)}
                                                                className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                                                            />
                                                            <div className="text-left">
                                                                <span className="block text-xs font-bold text-slate-900 dark:text-white">Send as Link in Text (SMS)</span>
                                                                <span className="block text-[10px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                                                                    Sends standard SMS text with link to avoid carrier MMS fees.
                                                                </span>
                                                            </div>
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {imageUrl && (
                                        <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center gap-3">
                                            <div className="relative group w-16 h-16 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-700 shrink-0 border border-slate-200 dark:border-slate-600">
                                                <img src={imageUrl} alt="MMS attachment" className="w-full h-full object-cover" onError={() => setImageUrl('')} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                                                        sendAsMms
                                                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                                                            : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700'
                                                    }`}>
                                                        {sendAsMms ? <Camera size={12} aria-hidden="true" /> : <Link2 size={12} aria-hidden="true" />}
                                                        {sendAsMms ? 'MMS Picture Attachment' : 'Link in Message'}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                                    {sendAsMms
                                                        ? 'Delivered natively as a photo message to recipients (MMS carrier rates apply).'
                                                        : 'Delivered as standard SMS. Click "Insert Link" if you wish to include the URL in your text.'}
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleMms(!sendAsMms)}
                                                    className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 transition"
                                                >
                                                    {sendAsMms ? 'Switch to Link Only' : 'Send as MMS'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleInsertImageLink}
                                                    title="Insert link into text body"
                                                    className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-100 transition flex items-center gap-1"
                                                >
                                                    <Link size={11} /> Insert Link
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleRemoveImage}
                                                    title="Remove image"
                                                    className="p-1.5 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {local.attachVcard && (
                                        <div className="mt-2 flex items-center gap-2.5 p-2.5 bg-indigo-50 dark:bg-indigo-900/25 border border-indigo-200 dark:border-indigo-800 rounded-2xl max-w-[280px]">
                                            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                                                <Contact size={16} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 truncate">Contact Card Attached</p>
                                                <p className="text-[10px] text-indigo-500 dark:text-indigo-400">Share your number and name</p>
                                            </div>
                                        </div>
                                    )}
                                    {showAiPanel && (
                                        <div className="mt-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-2xl p-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-500 flex items-center gap-1.5"><Sparkles size={11} /> AI Suggestion</span>
                                                <button onClick={() => setShowAiPanel(false)} title="Dismiss AI suggestion" className="text-indigo-400 hover:text-indigo-600"><X size={14} /></button>
                                            </div>
                                            {aiLoading ? (
                                                <div className="flex items-center gap-2 text-sm text-indigo-500"><Loader2 size={14} className="animate-spin" /> Analyzing your message...</div>
                                            ) : (
                                                <>
                                                    <p className="text-sm text-indigo-800 dark:text-indigo-200 leading-relaxed whitespace-pre-wrap mb-3">{aiSuggestion}</p>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-xs font-bold ${countSegments(aiSuggestion) > 1 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                            {aiSuggestion.length} chars • {countSegments(aiSuggestion)} seg
                                                        </span>
                                                        <div className="flex-1" />
                                                        <button
                                                            onClick={() => { update({ body: aiSuggestion }); setShowAiPanel(false); }}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition"
                                                        >
                                                            <ChevronRight size={12} /> Use This
                                                        </button>
                                                        <button
                                                            onClick={handleAiSuggest}
                                                            title="Regenerate AI suggestion"
                                                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-xl hover:bg-indigo-200 transition"
                                                        >
                                                            <RotateCcw size={11} /> Retry
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">{SEGMENT_NOTE}</p>
                                </>
                            )}
                        </div>

                        <div>
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Merge Tags</label>
                                <VariablePicker churchId={churchId} church={church} onInsert={insertAtCursor} buttonLabel="All & Custom Variables" />
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {ALL_MERGE_TAGS.slice(0, 12).map(({ tag, label }) => (
                                    <button
                                        key={tag}
                                        title={`Insert ${label} merge tag`}
                                        onClick={() => insertAtCursor(tag)}
                                        className="px-3 py-1.5 text-xs font-mono font-semibold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800 transition"
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1.5">
                                Tags will be replaced with each recipient's actual data at send time.
                            </p>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-3">Preview</label>
                            <div className="bg-slate-100 dark:bg-slate-800 rounded-3xl p-4 max-w-[260px] shadow-inner">
                                {imageUrl && sendAsMms && (
                                    <div className="mb-2 rounded-xl overflow-hidden max-w-[220px] border border-slate-200 dark:border-slate-700 shadow-sm relative group">
                                        <img src={imageUrl} alt="MMS preview" className="w-full h-auto object-cover" />
                                        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-black/60 backdrop-blur-xs rounded text-[9px] font-bold text-white uppercase tracking-wider">
                                            MMS
                                        </div>
                                    </div>
                                )}
                                {local.attachVcard && (
                                    <div className="mb-2 bg-indigo-50 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-850 rounded-2xl p-2.5 flex items-center gap-2 max-w-[220px]">
                                        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                                            <Contact size={16} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-indigo-800 dark:text-indigo-200 truncate">Contact.vcf</p>
                                            <p className="text-[10px] text-slate-400 dark:text-slate-500">VCARD File • {church.name || 'Church'}</p>
                                        </div>
                                    </div>
                                )}
                                <div className="bg-indigo-600 text-white text-sm px-3 py-2 rounded-2xl rounded-bl-sm shadow-sm max-w-[220px] leading-relaxed whitespace-pre-wrap break-words font-medium">
                                    {(local.body || '')
                                        .replace('{firstName}', 'John').replace('{lastName}', 'Smith')
                                        .replace('{fullName}', 'John Smith').replace('{email}', 'john@example.com')
                                        .replace('{phone}', '(615) 555-0100').replace('{city}', 'Nashville')
                                        .replace('{state}', 'TN').replace('{birthday}', 'Jan 15')
                                        .replace('{anniversary}', 'Jun 10')
                                        || <span className="opacity-50 italic">Your message will appear here...</span>}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
                            <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                            <span>All outbound messages require an opt-out mechanism. Recipients who reply STOP are automatically excluded from future sends.</span>
                        </div>
                    </div>
                </div>
            </div>

            {showSchedule && (
                <ScheduleModal
                    onConfirm={(ts, freq) => { setShowSchedule(false); onSchedule(local, ts, freq); }}
                    onCancel={() => setShowSchedule(false)}
                    isBusy={isSending}
                />
            )}

            {showFilePicker && (
                <FilePickerDialog
                    churchId={churchId}
                    currentUser={currentUser}
                    onSelect={(url) => { insertAtCursor(' ' + url); setShowFilePicker(false); }}
                    onSelectAsMms={(url) => {
                        handleSetImage(url, true);
                        setShowFilePicker(false);
                    }}
                    onClose={() => setShowFilePicker(false)}
                />
            )}

            {showEventPicker && (
                <SmsEventPickerModal
                    churchId={churchId}
                    onSelect={(suggestedBody) => {
                        update({ body: suggestedBody });
                        setShowEventPicker(false);
                    }}
                    onClose={() => setShowEventPicker(false)}
                />
            )}
        </div>
    );
};

// --- Campaign List ------------------------------------------------------------

export const CampaignList: React.FC<{
    campaigns: SmsCampaign[];
    isLoading: boolean;
    churchId?: string;
    smsNumberId?: string | null;
    canViewAnalytics?: boolean;
    initialTab?: 'all' | 'draft' | 'scheduled' | 'sent' | 'analytics';
    onOpen: (c: SmsCampaign) => void;
    onDelete: (id: string) => void;
    onDuplicate: (c: SmsCampaign) => void;
    onCreate: () => void;
    onViewAnalytics?: (c: SmsCampaign) => void;
}> = ({ campaigns, isLoading, churchId, smsNumberId, canViewAnalytics = false, initialTab, onOpen, onDelete, onDuplicate, onCreate, onViewAnalytics }) => {
    const [tab, setTab] = useState<'all' | 'draft' | 'scheduled' | 'sent' | 'analytics'>(initialTab || 'all');

    useEffect(() => {
        if (initialTab) setTab(initialTab);
    }, [initialTab]);

    const filtered = tab === 'all' ? campaigns : campaigns.filter(c => c.status === tab);
    const counts = {
        all: campaigns.length,
        draft: campaigns.filter(c => c.status === 'draft').length,
        scheduled: campaigns.filter(c => c.status === 'scheduled').length,
        sent: campaigns.filter(c => c.status === 'sent').length,
    };

    const tabItems: { value: 'all' | 'draft' | 'scheduled' | 'sent' | 'analytics'; label: string; count?: number; icon?: any }[] = [
        { value: 'all', label: 'All', count: counts.all },
        { value: 'draft', label: 'Drafts', count: counts.draft },
        { value: 'scheduled', label: 'Scheduled', count: counts.scheduled },
        { value: 'sent', label: 'Sent', count: counts.sent },
    ];
    if (canViewAnalytics && churchId) {
        tabItems.push({ value: 'analytics', label: 'Analytics', icon: BarChart3 });
    }

    return (
        <ToolPage>
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <MessageSquare size={18} className="text-indigo-500 dark:text-indigo-400" aria-hidden="true" /> Text campaigns
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Send bulk SMS to your congregation</p>
                </div>
                <ToolButton variant="primary" icon={Plus} onClick={onCreate}>
                    New
                </ToolButton>
            </div>

            {/* Tabs */}
            <ToolTabs
                ariaLabel="Filter campaigns by status"
                className="mb-5"
                value={tab}
                onChange={setTab}
                tabs={tabItems}
            />

            {/* Content */}
            {tab === 'analytics' && churchId ? (
                <SmsAnalytics
                    churchId={churchId}
                    campaigns={campaigns}
                    smsNumberId={smsNumberId}
                    onSelectCampaign={onViewAnalytics}
                    embedded
                />
            ) : isLoading ? (
                <div className="flex items-center justify-center h-40 text-slate-400"><Loader2 size={22} className="animate-spin mr-2" /> Loading campaigns...</div>
            ) : filtered.length === 0 ? (
                <ToolEmptyState
                    icon={MessageSquare}
                    title={tab === 'sent' ? 'No sent campaigns yet' : 'No text campaigns yet'}
                    action={tab !== 'sent' ? (
                        <ToolButton variant="primary" icon={Plus} onClick={onCreate}>
                            Create Campaign
                        </ToolButton>
                    ) : undefined}
                />
            ) : (
                <div className="space-y-3">
                    {filtered.map(c => {
                        const si = STATUS_LABELS[c.status] || STATUS_LABELS.draft;
                        return (
                            <div
                                key={c.id}
                                className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl hover:border-indigo-300 dark:hover:border-indigo-600 transition cursor-pointer"
                                onClick={() => onOpen(c)}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0 mt-0.5">
                                        {c.channelType === 'email' ? <Mail size={16} className="text-indigo-500" /> : <MessageSquare size={16} className="text-indigo-500" />}
                                    </div>
                                    <div className="flex-grow min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-slate-900 dark:text-white truncate">{c.name}</span>
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${si.color}`}>{si.label}</span>
                                        </div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 space-y-0.5">
                                            {(c.toListId && c.toListName) && <div>List: {c.toListName}</div>}
                                            {(c.toGroupId && c.toGroupName) && <div>Group: {c.toGroupName}</div>}
                                            {c.status === 'sent' && c.sentAt && (
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-emerald-600 dark:text-emerald-400">
                                                        Sent {new Date(c.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {c.deliveredCount ?? 0} delivered
                                                    </span>
                                                    {canViewAnalytics && onViewAnalytics && (
                                                        <button
                                                            type="button"
                                                            onClick={e => { e.stopPropagation(); onViewAnalytics(c); }}
                                                            className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-semibold hover:underline"
                                                        >
                                                            <BarChart3 size={12} /> View Analytics
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                            {c.status === 'scheduled' && c.scheduledAt && (
                                                <div className="text-amber-600 dark:text-amber-400">
                                                    {c.recurringFrequency ? `Repeats ${c.recurringFrequency}. Next: ` : 'Scheduled: '}
                                                    {new Date(c.scheduledAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                                </div>
                                            )}
                                            {c.status === 'failed' && c.lastError && <div className="text-red-500">Send failed</div>}
                                        </div>
                                    </div>
                                    {/* Always-visible action buttons (no hover-only on touch) */}
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button onClick={e => { e.stopPropagation(); onDuplicate(c); }} className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition" title="Duplicate"><Copy size={14} /></button>
                                        <button onClick={e => { e.stopPropagation(); onDelete(c.id); }} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition" title="Delete"><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </ToolPage>
    );
};

// --- New Message Composer ----------------------------------------------------

type RecipientMode = 'individual' | 'list' | 'group';

export const NewMessageComposer: React.FC<{
    churchId: string;
    church: Church;
    currentUser: User;
    /** When set, all sends go from this specific phone number */
    twilioNumberId?: string | null;
    onClose: () => void;
    onSent: () => void;
}> = ({ churchId, church, currentUser, twilioNumberId, onClose, onSent }) => {
    const [mode, setMode] = useState<RecipientMode>('individual');
    const [body, setBody] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [sentCount, setSentCount] = useState<number | null>(null);

    // Individual ... PCO person search
    const [personSearch, setPersonSearch] = useState('');
    const [personResults, setPersonResults] = useState<{ id: string; name: string; phone?: string; avatar?: string | null; membership?: string | null }[]>([]);
    const [personLoading, setPersonLoading] = useState(false);
    const [selectedPerson, setSelectedPerson] = useState<{ id: string; name: string; phone: string; avatar?: string | null } | null>(null);
    const [manualEntry, setManualEntry] = useState(false);
    const [phone, setPhone] = useState('');
    const [recipientName, setRecipientName] = useState('');

    // PCO Lists
    const [pcoLists, setPcoLists] = useState<{ id: string; name: string; total_people: number }[]>([]);
    const [listSearch, setListSearch] = useState('');
    const [selectedList, setSelectedList] = useState<{ id: string; name: string; total_people: number } | null>(null);
    const [loadingLists, setLoadingLists] = useState(false);

    // PCO Groups
    const [pcoGroups, setPcoGroups] = useState<{ id: string; name: string; memberCount: number }[]>([]);
    const [groupSearch, setGroupSearch] = useState('');
    const [selectedGroup, setSelectedGroup] = useState<{ id: string; name: string; memberCount: number } | null>(null);
    const [loadingGroups, setLoadingGroups] = useState(false);

    // Composer extras
    const [showEmojisNM, setShowEmojisNM] = useState(false);
    const [showLinkDlgNM, setShowLinkDlgNM] = useState(false);
    const [showFilePickerNM, setShowFilePickerNM] = useState(false);
    const [showEventPickerNM, setShowEventPickerNM] = useState(false);
    const [linkUrlNM, setLinkUrlNM] = useState('');
    const [imageUrlNM, setImageUrlNM] = useState(''); // final publicly-accessible URL (MMS)
    const [attachVcardNM, setAttachVcardNM] = useState(false);
    const [aiSuggestionNM, setAiSuggestionNM] = useState('');
    const [aiLoadingNM, setAiLoadingNM] = useState(false);
    const [showAiPanelNM, setShowAiPanelNM] = useState(false);
    const [showImagePanelNM, setShowImagePanelNM] = useState(false); // expanded image panel
    const [imageUploadProgress, setImageUploadProgress] = useState<number | null>(null); // 0-100
    const [imageUploadError, setImageUploadError] = useState('');
    const [urlInputNM, setUrlInputNM] = useState(''); // manual URL tab input
    const [imageTab, setImageTab] = useState<'upload' | 'url'>('upload');
    const fileInputRefNM = useRef<HTMLInputElement>(null);
    const textareaRefNM = useRef<HTMLTextAreaElement>(null);

    const MAX_CHARS = 1600;
    const segCount = Math.ceil((body.length || 1) / 160);
    const charLeft = MAX_CHARS - body.length;

    const insertAtCursorNM = (text: string) => {
        const el = textareaRefNM.current;
        if (!el) { setBody(b => b + text); return; }
        const start = el.selectionStart ?? body.length;
        const end = el.selectionEnd ?? start;
        const newBody = body.slice(0, start) + text + body.slice(end);
        setBody(newBody);
        requestAnimationFrame(() => {
            el.focus();
            const pos = start + text.length;
            el.setSelectionRange(pos, pos);
        });
    };

    const handleAiSuggestNM = async () => {
        if (!body.trim()) return;
        setAiLoadingNM(true);
        setShowAiPanelNM(true);
        setAiSuggestionNM('');
        try {
            const suggestion = await getSmsAiSuggestion(body, churchId);
            setAiSuggestionNM(suggestion);
        } catch {
            setAiSuggestionNM('Unable to get AI suggestion. Please try again.');
        } finally {
            setAiLoadingNM(false);
        }
    };

    /** Upload a File to Firebase Storage and set imageUrlNM on completion. */
    const handleImageFileUpload = async (file: File) => {
        if (!file.type.startsWith('image/')) {
            setImageUploadError('Please select an image file (JPG, PNG, GIF, WebP).');
            return;
        }
        setImageUploadError('');
        setImageUploadProgress(0);
        let compressedFile = file;
        try {
            compressedFile = await compressSmsImage(file) as File;
        } catch (err) {
            console.warn('[ImageCompress] Compression failed, uploading original', err);
        }
        const path = `mms/${churchId}/${Date.now()}_${compressedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const sRef = storageRef(storage, path);
        const task = uploadBytesResumable(sRef, compressedFile);
        task.on(
            'state_changed',
            snap => setImageUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
            err => { setImageUploadError('Upload failed: ' + err.message); setImageUploadProgress(null); },
            async () => {
                const url = await getDownloadURL(task.snapshot.ref);
                setImageUrlNM(url);
                setImageUploadProgress(null);
            }
        );
    };

    // Debounced people search (fires when personSearch changes)
    useEffect(() => {
        if (mode !== 'individual' || manualEntry) return;
        const q = personSearch.trim();
        if (q.length < 2) { setPersonResults([]); return; }
        setPersonLoading(true);

        const col = collection(firebaseDb, 'people');
        const isPhone = /^[\d\s+()\-]{4,}$/.test(q);
        const qLower = q.toLowerCase();

        const queries: Promise<any>[] = [];

        if (isPhone) {
            queries.push(
                getDocs(query(col, where('churchId', '==', churchId), where('phone', '>=', q), where('phone', '<=', q + '\uffff'), limit(20)))
            );
        } else {
            const qCap = q.charAt(0).toUpperCase() + q.slice(1).toLowerCase();
            queries.push(
                getDocs(query(col, where('churchId', '==', churchId), where('name', '>=', q), where('name', '<=', q + '\uffff'), limit(25))),
                getDocs(query(col, where('churchId', '==', churchId), where('name', '>=', qCap), where('name', '<=', qCap + '\uffff'), limit(25))),
                getDocs(query(col, where('churchId', '==', churchId), where('nameLower', '>=', qLower), where('nameLower', '<=', qLower + '\uffff'), limit(25)))
            );
        }

        Promise.allSettled(queries)
            .then(results => {
                const seen = new Set<string>();
                const merged: typeof personResults = [];
                results.forEach(r => {
                    if (r.status !== 'fulfilled') return;
                    r.value.docs.forEach((d: any) => {
                        if (seen.has(d.id)) return;
                        seen.add(d.id);
                        const p = d.data() as any;
                        merged.push({ id: d.id, name: p.name || '', phone: (p.phone || '').trim(), avatar: p.avatar || null, membership: p.membership || null });
                    });
                });
                const filtered = merged
                    .filter(p => {
                        const matches = p.name.toLowerCase().includes(qLower) || (isPhone && (p.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '')));
                        return matches && p.phone && p.phone.replace(/\D/g, '').length >= 10;
                    })
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .slice(0, 20);
                setPersonResults(filtered);
            })
            .catch(() => setPersonResults([]))
            .finally(() => setPersonLoading(false));
    }, [personSearch, mode, manualEntry, churchId]);

    useEffect(() => {
        if (mode !== 'list' || pcoLists.length > 0) return;
        setLoadingLists(true);
        pcoService.getPeopleLists(churchId)
            .then(raw => setPcoLists(raw.map((l: any) => ({
                id: l.id,
                name: l.attributes?.name || l.name || 'Unnamed List',
                total_people: l.attributes?.total_people ?? l.total_people ?? 0,
            })).filter(list => hasBroadcastAccess(currentUser, list.id, church))))
            .catch(() => { })
            .finally(() => setLoadingLists(false));
    }, [mode, churchId, currentUser, church]);

    // Load PCO groups when mode switches
    useEffect(() => {
        if (mode !== 'group' || pcoGroups.length > 0) return;
        setLoadingGroups(true);
        pcoService.getGroups(churchId)
            .then((raw: any[]) => setPcoGroups(raw.map(x => ({
                id: x.id,
                name: x.attributes?.name || x.name || 'Unnamed Group',
                memberCount: x.attributes?.members_count ?? x.attributes?.member_count ?? x.memberCount ?? 0,
            })).filter(group => hasBroadcastAccess(currentUser, group.id, church))))
            .catch(() => { })
            .finally(() => setLoadingGroups(false));
    }, [mode, churchId, currentUser, church]);

    const filteredLists = pcoLists.filter(l => l.name.toLowerCase().includes(listSearch.toLowerCase()));
    const filteredGroups = pcoGroups.filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase()));

    const canSend = body.trim().length > 0 && (
        (mode === 'individual' && (
            (selectedPerson && selectedPerson.phone.replace(/\D/g, '').length >= 10) ||
            (manualEntry && phone.replace(/\D/g, '').length >= 10)
        )) ||
        (mode === 'list' && !!selectedList) ||
        (mode === 'group' && !!selectedGroup)
    );

    const safeJson = async (res: Response): Promise<any> => {
        const text = await res.text();
        try {
            return JSON.parse(text);
        } catch {
            throw new Error(`Server error ${res.status}: ${text.slice(0, 120) || res.statusText}`);
        }
    };

    const handleSend = async () => {
        if (!canSend || sending) return;
        setError('');
        setSending(true);
        try {
            if (mode === 'individual') {
                const toPhone = selectedPerson ? selectedPerson.phone : phone;
                const toName = selectedPerson ? selectedPerson.name : recipientName.trim();
                const res = await fetch(`${API_BASE}/api/messaging/send-individual`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        churchId,
                        toPhone: toPhone.replace(/[^\d+]/g, ''),
                        body,
                        mediaUrls: imageUrlNM ? [imageUrlNM] : undefined,
                        sentBy: currentUser.id,
                        sentByName: currentUser.name,
                        personName: toName || undefined,
                        personId: selectedPerson?.id || undefined,
                        twilioNumberId: twilioNumberId ?? undefined,
                        attachVcard: attachVcardNM,
                    }),
                });
                const data = await safeJson(res);
                if (!data.success) throw new Error(data.error || `Send failed (HTTP ${res.status})`);
                setSentCount(1);
            } else if (mode === 'list' && selectedList) {
                const res = await fetch(`${API_BASE}/api/messaging/send-to-list`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        churchId,
                        pcoListId: selectedList.id,
                        listName: selectedList.name,
                        body,
                        mediaUrls: imageUrlNM ? [imageUrlNM] : undefined,
                        sentBy: currentUser.id,
                        sentByName: currentUser.name,
                        twilioNumberId: twilioNumberId ?? undefined,
                        attachVcard: attachVcardNM,
                    }),
                });
                const data = await safeJson(res);
                if (!data.success) throw new Error(data.error || `Send failed (HTTP ${res.status})`);
                setSentCount(data.sent || selectedList.total_people);
            } else if (mode === 'group' && selectedGroup) {
                const res = await fetch(`${API_BASE}/api/messaging/send-to-group`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        churchId,
                        pcoGroupId: selectedGroup.id,
                        groupName: selectedGroup.name,
                        body,
                        mediaUrls: imageUrlNM ? [imageUrlNM] : undefined,
                        sentBy: currentUser.id,
                        sentByName: currentUser.name,
                        twilioNumberId: twilioNumberId ?? undefined,
                        attachVcard: attachVcardNM,
                    }),
                });
                const data = await safeJson(res);
                if (!data.success) throw new Error(data.error || `Send failed (HTTP ${res.status})`);
                setSentCount(data.sent || selectedGroup.memberCount);
            }
        } catch (e: any) {
            setError(e.message || 'Send failed');
        } finally {
            setSending(false);
        }
    };

    if (sentCount !== null) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 w-full max-w-sm text-center shadow-2xl">
                    <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle size={32} className="text-emerald-600" />
                    </div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white mb-1">Message Sent!</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                        {sentCount === 1
                            ? 'Your message was delivered.'
                            : `Queued for ${sentCount.toLocaleString()} recipient${sentCount !== 1 ? 's' : ''}.`
                        }
                    </p>
                    <button onClick={onSent} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl transition">
                        Done
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[95vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
                    <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <Edit3 size={18} className="text-indigo-500" /> New Message
                    </h2>
                    <button onClick={onClose} title="Close" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

                    {/* Recipient Mode */}
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Send To</p>
                        <div className="grid grid-cols-3 gap-2">
                            {([
                                { key: 'individual', icon: <UserCheck size={16} />, label: 'Individual' },
                                { key: 'list', icon: <List size={16} />, label: 'PCO List' },
                                { key: 'group', icon: <Layers size={16} />, label: 'PCO Group' },
                            ] as { key: RecipientMode; icon: React.ReactNode; label: string }[]).map(opt => (
                                <button
                                    key={opt.key}
                                    onClick={() => setMode(opt.key)}
                                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl border-2 transition text-xs font-black ${mode === opt.key
                                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'
                                            : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-300'
                                        }`}
                                >
                                    {opt.icon}
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Individual ... PCO person search */}
                    {mode === 'individual' && (
                        <div className="space-y-3">
                            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block">Recipient</label>

                            {selectedPerson ? (
                                <div className="flex items-center gap-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-500 rounded-2xl">
                                    <div className="w-10 h-10 rounded-full bg-indigo-200 dark:bg-indigo-800 overflow-hidden flex items-center justify-center shrink-0">
                                        {selectedPerson.avatar
                                            ? <img src={selectedPerson.avatar} alt={selectedPerson.name} className="w-full h-full object-cover" />
                                            : <span className="text-sm font-black text-indigo-600 dark:text-indigo-300">{selectedPerson.name.charAt(0)}</span>
                                        }
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-indigo-800 dark:text-indigo-200 truncate">{selectedPerson.name}</p>
                                        <p className="text-xs text-indigo-500 font-mono">{formatPhone(selectedPerson.phone)}</p>
                                    </div>
                                    <button
                                        onClick={() => { setSelectedPerson(null); setPersonSearch(''); setManualEntry(false); }}
                                        title="Change recipient"
                                        className="text-indigo-400 hover:text-indigo-600 transition shrink-0"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ) : manualEntry ? (
                                <div className="space-y-2">
                                    <div className="relative">
                                        <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="tel"
                                            value={phone}
                                            onChange={e => setPhone(e.target.value)}
                                            placeholder="+1 (615) 555-0100"
                                            autoFocus
                                            className="w-full pl-8 pr-3 text-sm border-2 border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                    <div className="relative">
                                        <UserCheck size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            value={recipientName}
                                            onChange={e => setRecipientName(e.target.value)}
                                            placeholder="Name (optional)"
                                            className="w-full pl-8 pr-3 text-sm border-2 border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                    <button
                                        onClick={() => { setManualEntry(false); setPhone(''); setRecipientName(''); }}
                                        className="text-xs text-indigo-500 hover:text-indigo-700 font-semibold"
                                    >← Search PCO people instead</button>
                                </div>
                            ) : (
                                <div>
                                    <div className="relative">
                                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        {personLoading && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-400 animate-spin" />}
                                        <input
                                            type="text"
                                            value={personSearch}
                                            onChange={e => setPersonSearch(e.target.value)}
                                            placeholder="Search by name or phone number..."
                                            autoFocus
                                            className="w-full pl-8 pr-8 text-sm border-2 border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                    {personResults.length > 0 && (
                                        <div className="mt-1 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-lg max-h-48 overflow-y-auto">
                                            {personResults.map(p => (
                                                <button
                                                    key={p.id}
                                                    onClick={() => {
                                                        if (!p.phone) return;
                                                        setSelectedPerson({ id: p.id, name: p.name, phone: p.phone, avatar: p.avatar });
                                                        setPersonSearch('');
                                                        setPersonResults([]);
                                                    }}
                                                    disabled={!p.phone}
                                                    className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition text-left ${!p.phone ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                >
                                                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 overflow-hidden flex items-center justify-center shrink-0">
                                                        {p.avatar
                                                            ? <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                                                            : <span className="text-xs font-black text-indigo-600 dark:text-indigo-300">{p.name.charAt(0)}</span>
                                                        }
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{p.name}</p>
                                                        <p className="text-xs text-slate-400 truncate">
                                                            {p.phone ? formatPhone(p.phone) : <span className="text-amber-500 text-[10px]">No phone number</span>}
                                                            {p.membership && <span className="ml-2 text-[10px] text-slate-400">· {p.membership}</span>}
                                                        </p>
                                                    </div>
                                                    {p.phone && <ChevronRight size={14} className="text-indigo-400 shrink-0" />}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {personSearch.trim().length >= 2 && !personLoading && personResults.length === 0 && (
                                        <p className="text-xs text-slate-400 text-center py-2">
                                            No PCO people found matching &ldquo;{personSearch}&rdquo;
                                        </p>
                                    )}
                                    <button
                                        onClick={() => setManualEntry(true)}
                                        className="mt-2 text-xs text-slate-400 hover:text-indigo-600 font-semibold transition"
                                    >
                                        + Enter phone number manually
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* PCO List picker */}
                    {mode === 'list' && (
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block mb-2">Select Planning Center List</label>
                            {selectedList ? (
                                <div className="flex items-center justify-between p-3 bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-500 rounded-2xl">
                                    <div>
                                        <p className="font-bold text-sm text-indigo-700 dark:text-indigo-300">{selectedList.name}</p>
                                        <p className="text-xs text-indigo-500">{selectedList.total_people.toLocaleString()} people</p>
                                    </div>
                                    <button onClick={() => setSelectedList(null)} title="Clear selected list" className="text-indigo-400 hover:text-indigo-600 transition"><X size={16} /></button>
                                </div>
                            ) : (
                                <div className="border-2 border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                                    <div className="relative">
                                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="Search lists..."
                                            value={listSearch}
                                            onChange={e => setListSearch(e.target.value)}
                                            className="w-full pl-8 pr-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                                        />
                                    </div>
                                    <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
                                        {loadingLists ? (
                                            <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-slate-400" /></div>
                                        ) : filteredLists.length === 0 ? (
                                            <p className="text-center text-sm text-slate-400 py-4">No lists found</p>
                                        ) : filteredLists.map(l => (
                                            <button key={l.id} onClick={() => setSelectedList(l)} className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition flex items-center justify-between">
                                                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{l.name}</span>
                                                <span className="text-xs text-slate-400">{l.total_people.toLocaleString()}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* PCO Group picker */}
                    {mode === 'group' && (
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block mb-2">Select Planning Center Group</label>
                            {selectedGroup ? (
                                <div className="flex items-center justify-between p-3 bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-500 rounded-2xl">
                                    <div>
                                        <p className="font-bold text-sm text-indigo-700 dark:text-indigo-300">{selectedGroup.name}</p>
                                        <p className="text-xs text-indigo-500">{selectedGroup.memberCount.toLocaleString()} members</p>
                                    </div>
                                    <button onClick={() => setSelectedGroup(null)} title="Clear selected group" className="text-indigo-400 hover:text-indigo-600 transition"><X size={16} /></button>
                                </div>
                            ) : (
                                <div className="border-2 border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                                    <div className="relative">
                                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="Search groups..."
                                            value={groupSearch}
                                            onChange={e => setGroupSearch(e.target.value)}
                                            className="w-full pl-8 pr-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                                        />
                                    </div>
                                    <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
                                        {loadingGroups ? (
                                            <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-slate-400" /></div>
                                        ) : filteredGroups.length === 0 ? (
                                            <p className="text-center text-sm text-slate-400 py-4">No groups found</p>
                                        ) : filteredGroups.map(g => (
                                            <button key={g.id} onClick={() => setSelectedGroup(g)} className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition flex items-center justify-between">
                                                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{g.name}</span>
                                                <span className="text-xs text-slate-400">{g.memberCount.toLocaleString()}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Message editor */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Message</label>
                            <span className={`text-[10px] font-semibold ${charLeft < 0 ? 'text-red-500' : charLeft < 50 ? 'text-amber-500' : 'text-slate-400'}`}>
                                {body.length}/{MAX_CHARS} · {segCount} segment{segCount !== 1 ? 's' : ''}
                            </span>
                        </div>
                        <textarea
                            ref={textareaRefNM}
                            rows={5}
                            value={body}
                            onChange={e => setBody(e.target.value)}
                            maxLength={MAX_CHARS}
                            placeholder={mode === 'individual'
                                ? 'Type your message...'
                                : 'Type your message... Use merge tags to personalize.'}
                            className="w-full text-sm border-2 border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 resize-none"
                        />
                        {/* Composer toolbar */}
                        <div className="flex items-center gap-1 mt-2 flex-wrap">
                            {/* Emoji */}
                            <div className="relative">
                                <button type="button" title="Insert emoji"
                                    onClick={() => { setShowEmojisNM(v => !v); setShowLinkDlgNM(false); }}
                                    className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
                                ><Smile size={12} /> Emoji</button>
                                {showEmojisNM && (
                                    <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3 grid grid-cols-10 gap-1 min-w-[260px]">
                                        {COMMON_EMOJIS.map(em => (
                                            <button key={em} onClick={() => { insertAtCursorNM(em); setShowEmojisNM(false); }}
                                                className="text-xl hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg p-1 transition leading-none" title={em}>{em}</button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {/* Link */}
                            <div className="relative">
                                <button type="button" title="Insert link"
                                    onClick={() => { setShowLinkDlgNM(v => !v); setShowEmojisNM(false); setShowFilePickerNM(false); }}
                                    className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
                                ><Link size={12} /> Link</button>
                                {showLinkDlgNM && (
                                    <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3 w-72">
                                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Insert Link URL</p>
                                        <div className="flex gap-2">
                                            <input type="url" value={linkUrlNM} onChange={e => setLinkUrlNM(e.target.value)}
                                                placeholder="https://example.com"
                                                className="flex-1 text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                            <button onClick={() => { if (linkUrlNM.trim()) { insertAtCursorNM(' ' + linkUrlNM.trim()); setLinkUrlNM(''); setShowLinkDlgNM(false); } }}
                                                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition">Insert</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            {/* File */}
                            <button type="button" title="Attach file link"
                                onClick={() => { setShowFilePickerNM(v => !v); setShowEmojisNM(false); setShowLinkDlgNM(false); setShowImagePanelNM(false); }}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
                            ><FileText size={12} /> File</button>
                            {/* Image / MMS */}
                            <button type="button" title="Attach image (MMS)"
                                onClick={() => { setShowImagePanelNM(v => !v); setShowEmojisNM(false); setShowLinkDlgNM(false); setShowFilePickerNM(false); }}
                                className={`flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg border transition ${imageUrlNM ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700' : showImagePanelNM ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'}`}
                            ><ImageIcon size={12} /> {imageUrlNM ? 'Image \u2713' : 'Image (MMS)'}</button>
                            {imageUrlNM && (
                                <button type="button" title="Remove image" onClick={() => { setImageUrlNM(''); setShowImagePanelNM(false); }} className="p-1 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition"><X size={12} /></button>
                            )}
                            {/* Attach vCard */}
                            <button type="button" title="Attach Church Contact Card (vCard)"
                                onClick={() => setAttachVcardNM(v => !v)}
                                className={`flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg border transition ${attachVcardNM ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'}`}
                            ><Contact size={12} /> {attachVcardNM ? 'Contact Card ✓' : 'Contact Card'}</button>
                            <div className="flex-1" />
                            {/* AI Event Recommender */}
                            <button type="button" title="Suggest message from upcoming event or registration"
                                onClick={() => setShowEventPickerNM(true)}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition"
                            ><Calendar size={12} /> Suggest from Events</button>
                            {/* AI Helper */}
                            <button type="button" title="AI SMS helper" onClick={handleAiSuggestNM}
                                disabled={!body.trim() || aiLoadingNM}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:opacity-50 transition"
                            >{aiLoadingNM ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} AI Shorten</button>
                        </div>
                        {/* Image upload panel */}
                        {showImagePanelNM && (
                            <div className="mt-3 border-2 border-indigo-200 dark:border-indigo-700 rounded-2xl overflow-hidden">
                                <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                                    {(['upload', 'url'] as const).map(tab => (
                                        <button key={tab} type="button" onClick={() => setImageTab(tab)} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wide transition ${imageTab === tab ? 'text-indigo-600 dark:text-indigo-300 border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}>{tab === 'upload' ? '\uD83D\uDCC1 Upload File' : '\uD83D\uDD17 Paste URL'}</button>
                                    ))}
                                </div>
                                <div className="p-4 bg-white dark:bg-slate-900 space-y-3">
                                    {imageTab === 'upload' ? (
                                        <>
                                            <input ref={fileInputRefNM} type="file" accept="image/*" aria-label="Upload image for MMS" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFileUpload(f); }} />
                                            <div onClick={() => fileInputRefNM.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImageFileUpload(f); }} className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition">
                                                <Upload size={24} className="text-slate-400" />
                                                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Click or drag &amp; drop</p>
                                                <p className="text-[10px] text-slate-400">JPG, PNG, GIF, WebP — max 5 MB</p>
                                            </div>
                                            {imageUploadProgress !== null && (<div className="space-y-1"><div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden" title={`Uploading: ${imageUploadProgress}%`} aria-label={`Upload progress: ${imageUploadProgress}%`}><div className="bar-fill bg-indigo-500" ref={el => el?.style.setProperty('--bar-w', `${imageUploadProgress}%`)} /></div><p className="text-[10px] text-slate-400 text-right">{imageUploadProgress}%</p></div>)}
                                            {imageUploadError && <p className="text-xs text-red-500">{imageUploadError}</p>}
                                        </>
                                    ) : (
                                        <div className="space-y-2">
                                            <div className="flex gap-2">
                                                <input type="url" value={urlInputNM} onChange={e => setUrlInputNM(e.target.value)} placeholder="https://example.com/photo.jpg" className="flex-1 text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                                <button type="button" onClick={() => { if (urlInputNM.trim()) { setImageUrlNM(urlInputNM.trim()); setUrlInputNM(''); } }} disabled={!urlInputNM.trim()} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition">Use URL</button>
                                            </div>
                                        </div>
                                    )}
                                    {imageUrlNM && (<div className="flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl"><img src={imageUrlNM} alt="MMS preview" className="w-16 h-16 object-cover rounded-lg shrink-0" onError={() => setImageUrlNM('')} /><div className="flex-1 min-w-0"><p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">Image attached</p><p className="text-[10px] text-emerald-600 truncate">{imageUrlNM}</p></div><button type="button" title="Remove image" onClick={() => setImageUrlNM('')} className="text-red-400 hover:text-red-600 shrink-0"><X size={14} /></button></div>)}
                                    {attachVcardNM && (
                                        <div className="mt-2 flex items-center gap-2.5 p-2.5 bg-indigo-50 dark:bg-indigo-900/25 border border-indigo-200 dark:border-indigo-800 rounded-xl max-w-[280px]">
                                            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                                                <Contact size={16} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 truncate">Contact Card Attached</p>
                                                <p className="text-[10px] text-indigo-550 dark:text-indigo-400">Share your number and name</p>
                                            </div>
                                            <button type="button" title="Remove contact card" onClick={() => setAttachVcardNM(false)} className="text-red-400 hover:text-red-600 shrink-0"><X size={14} /></button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        {/* AI panel NM */}
                        {showAiPanelNM && (
                            <div className="mt-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-2xl p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-500 flex items-center gap-1"><Sparkles size={10} /> AI Suggestion</span>
                                    <button onClick={() => setShowAiPanelNM(false)} title="Dismiss" className="text-indigo-400 hover:text-indigo-600"><X size={13} /></button>
                                </div>
                                {aiLoadingNM ? (
                                    <div className="flex items-center gap-2 text-sm text-indigo-500"><Loader2 size={13} className="animate-spin" /> Analyzing...</div>
                                ) : (
                                    <>
                                        <p className="text-sm text-indigo-800 dark:text-indigo-200 leading-relaxed whitespace-pre-wrap mb-2">{aiSuggestionNM}</p>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs font-bold ${countSegments(aiSuggestionNM) > 1 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                {aiSuggestionNM.length} chars • {countSegments(aiSuggestionNM)} seg
                                            </span>
                                            <div className="flex-1" />
                                            <button onClick={() => { setBody(aiSuggestionNM); setShowAiPanelNM(false); }}
                                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition"
                                            ><ChevronRight size={11} /> Use This</button>
                                            <button onClick={handleAiSuggestNM} title="Retry" className="flex items-center gap-1 px-2 py-1.5 text-xs font-semibold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-xl hover:bg-indigo-200 transition">
                                                <RotateCcw size={10} /> Retry
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                        {/* Merge tags hint */}
                        {mode !== 'individual' && (
                            <div className="mt-2">
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Merge Tags</p>
                                    <VariablePicker churchId={churchId} church={church} onInsert={insertAtCursorNM} buttonLabel="All & Custom Variables" />
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {ALL_MERGE_TAGS.slice(0, 10).map(({ tag, label }) => (
                                        <button key={tag} type="button" title={`Insert ${label}`}
                                            onClick={() => insertAtCursorNM(tag)}
                                            className="px-2 py-1 text-[10px] font-mono font-semibold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800 transition"
                                        >{tag}</button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
                            <AlertTriangle size={14} className="shrink-0" />{error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 pb-6 pt-4 border-t border-slate-200 dark:border-slate-700 shrink-0 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-2xl transition">
                        Cancel
                    </button>
                    <button
                        onClick={handleSend}
                        disabled={!canSend || sending}
                        className="flex-[2] py-3 text-sm font-black bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl transition flex items-center justify-center gap-2"
                    >
                        {sending
                            ? <><Loader2 size={16} className="animate-spin" /> Sending...</>
                            : mode === 'individual'
                                ? <><Send size={15} /> Send Message</>
                                : <><Send size={15} /> Send to {mode === 'list' ? selectedList?.name : selectedGroup?.name}</>}
                    </button>
                </div>
            </div>

            {/* Event Recommender Modal */}
            {showEventPickerNM && (
                <SmsEventPickerModal
                    churchId={churchId}
                    onSelect={(suggestedBody) => {
                        setBody(suggestedBody);
                        setShowEventPickerNM(false);
                    }}
                    onClose={() => setShowEventPickerNM(false)}
                />
            )}
            {/* File Picker Modal */}
            {showFilePickerNM && (
                <FilePickerDialog
                    churchId={churchId}
                    currentUser={currentUser}
                    onSelect={(url) => {
                        insertAtCursorNM(' ' + url);
                        setShowFilePickerNM(false);
                    }}
                    onSelectAsMms={(url) => {
                        setImageUrlNM(url);
                        setShowFilePickerNM(false);
                    }}
                    onClose={() => setShowFilePickerNM(false)}
                />
            )}
        </div>
    );
};
