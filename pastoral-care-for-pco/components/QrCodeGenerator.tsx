import React, { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import {
  QrCode, Plus, Trash2, Download, Copy, Link2, Mail, Phone, MessageSquare,
  Globe, User, Wifi, Calendar, ExternalLink, Check, Loader2, Pencil, X, Search
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type QrType = 'url' | 'email' | 'phone' | 'sms' | 'vcard' | 'wifi' | 'text';

interface SavedQr {
  id: string;
  label: string;
  type: QrType;
  value: string;
  fgColor: string;
  bgColor: string;
  size: number;
  createdAt: number;
}

interface QrTypeOption {
  type: QrType;
  icon: React.ReactNode;
  label: string;
  placeholder: string;
  buildValue: (fields: Record<string, string>) => string;
  fields: { key: string; label: string; placeholder: string; type?: string }[];
}

// ─── QR Type Definitions ─────────────────────────────────────────────────────

const QR_TYPES: QrTypeOption[] = [
  {
    type: 'url',
    icon: <Link2 size={15} />,
    label: 'URL / Link',
    placeholder: 'https://example.com',
    buildValue: (f) => f.url || '',
    fields: [{ key: 'url', label: 'URL', placeholder: 'https://your-church.com' }],
  },
  {
    type: 'email',
    icon: <Mail size={15} />,
    label: 'Email',
    placeholder: 'email@example.com',
    buildValue: (f) => {
      let s = `mailto:${f.email || ''}`;
      const params: string[] = [];
      if (f.subject) params.push(`subject=${encodeURIComponent(f.subject)}`);
      if (f.body)    params.push(`body=${encodeURIComponent(f.body)}`);
      if (params.length) s += '?' + params.join('&');
      return s;
    },
    fields: [
      { key: 'email',   label: 'Email Address', placeholder: 'pastor@church.com' },
      { key: 'subject', label: 'Subject (optional)', placeholder: 'Prayer Request' },
      { key: 'body',    label: 'Body (optional)', placeholder: 'Hello…' },
    ],
  },
  {
    type: 'phone',
    icon: <Phone size={15} />,
    label: 'Phone',
    placeholder: '+1 555-000-0000',
    buildValue: (f) => `tel:${(f.phone || '').replace(/\s/g, '')}`,
    fields: [{ key: 'phone', label: 'Phone Number', placeholder: '+15550001234', type: 'tel' }],
  },
  {
    type: 'sms',
    icon: <MessageSquare size={15} />,
    label: 'SMS',
    placeholder: '+1 555-000-0000',
    buildValue: (f) => {
      let s = `smsto:${(f.phone || '').replace(/\s/g, '')}`;
      if (f.message) s += `:${f.message}`;
      return s;
    },
    fields: [
      { key: 'phone',   label: 'Phone Number', placeholder: '+15550001234', type: 'tel' },
      { key: 'message', label: 'Pre-filled Message (optional)', placeholder: 'Hi, I\'d like to connect…' },
    ],
  },
  {
    type: 'vcard',
    icon: <User size={15} />,
    label: 'Contact Card',
    placeholder: 'Pastor John Smith',
    buildValue: (f) => {
      const lines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${f.name || ''}`,
        f.org   ? `ORG:${f.org}`                 : '',
        f.phone ? `TEL;TYPE=WORK,VOICE:${f.phone}` : '',
        f.email ? `EMAIL:${f.email}`              : '',
        f.url   ? `URL:${f.url}`                  : '',
        f.address ? `ADR:;;${f.address};;;;`      : '',
        'END:VCARD',
      ].filter(Boolean);
      return lines.join('\n');
    },
    fields: [
      { key: 'name',    label: 'Full Name',       placeholder: 'Pastor John Smith' },
      { key: 'org',     label: 'Organization',    placeholder: 'Grace Community Church' },
      { key: 'phone',   label: 'Phone',           placeholder: '+15550001234', type: 'tel' },
      { key: 'email',   label: 'Email',           placeholder: 'john@church.com' },
      { key: 'url',     label: 'Website',         placeholder: 'https://church.com' },
      { key: 'address', label: 'Address',         placeholder: '123 Main St, City, State' },
    ],
  },
  {
    type: 'wifi',
    icon: <Wifi size={15} />,
    label: 'WiFi Network',
    placeholder: 'NetworkName',
    buildValue: (f) => `WIFI:T:${f.security || 'WPA'};S:${f.ssid || ''};P:${f.password || ''};;`,
    fields: [
      { key: 'ssid',     label: 'Network Name (SSID)', placeholder: 'ChurchWifi' },
      { key: 'password', label: 'Password',            placeholder: 'YourPassword', type: 'password' },
      { key: 'security', label: 'Security Type',       placeholder: 'WPA' },
    ],
  },
  {
    type: 'text',
    icon: <Calendar size={15} />,
    label: 'Plain Text',
    placeholder: 'Service times: Sunday 9am & 11am',
    buildValue: (f) => f.text || '',
    fields: [{ key: 'text', label: 'Text Content', placeholder: 'Join us Sundays at 9am & 11am!' }],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LOCAL_KEY = 'qr_generator_saved';
const loadSaved = (): SavedQr[] => {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; }
};
const persistSaved = (list: SavedQr[]) => {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)); } catch { /* ignore */ }
};

const shortLabel = (q: SavedQr) => q.label || q.value.slice(0, 40);

// ─── Canvas QR Preview ────────────────────────────────────────────────────────

const QrPreview: React.FC<{
  value: string;
  fgColor: string;
  bgColor: string;
  size: number;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}> = ({ value, fgColor, bgColor, size, canvasRef }) => {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (!value.trim()) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      return;
    }
    setError(null);
    QRCode.toCanvas(canvasRef.current, value, {
      width: size,
      color: { dark: fgColor, light: bgColor },
      errorCorrectionLevel: 'H',
      margin: 2,
    }).catch(e => setError(e.message));
  }, [value, fgColor, bgColor, size, canvasRef]);

  if (error) {
    return (
      <div className="flex items-center justify-center w-full aspect-square bg-red-50 dark:bg-red-900/20 rounded-xl text-red-500 text-sm p-4 text-center">
        ⚠️ {error}
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef as React.RefObject<HTMLCanvasElement>}
      width={size}
      height={size}
      className="rounded-xl shadow-lg max-w-full mx-auto block"
      style={{ imageRendering: 'pixelated' }}
    />
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const QrCodeGenerator: React.FC<{ churchId?: string }> = ({ churchId: _churchId }) => {
  // ── State ──────────────────────────────────────────────────────────────────
  const [saved, setSaved] = useState<SavedQr[]>(loadSaved);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Editor state
  const [selectedType, setSelectedType] = useState<QrType>('url');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [label, setLabel] = useState('');
  const [fgColor, setFgColor] = useState('#1e293b');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [size, setSize] = useState(300);
  const [editingLabel, setEditingLabel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [search, setSearch] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const typeConfig = QR_TYPES.find(t => t.type === selectedType)!;
  const qrValue = typeConfig.buildValue(fields);

  // ── Derived ────────────────────────────────────────────────────────────────
  const filteredSaved = search.trim()
    ? saved.filter(q =>
        q.label.toLowerCase().includes(search.toLowerCase()) ||
        q.value.toLowerCase().includes(search.toLowerCase()) ||
        q.type.toLowerCase().includes(search.toLowerCase())
      )
    : saved;

  // ── Load saved into editor ─────────────────────────────────────────────────
  const loadIntoEditor = useCallback((q: SavedQr) => {
    setSelectedType(q.type);
    setFgColor(q.fgColor);
    setBgColor(q.bgColor);
    setSize(q.size);
    setLabel(q.label);
    setIsCreating(false);
    setActiveId(q.id);

    // Reverse-engineer fields from saved value
    const cfg = QR_TYPES.find(t => t.type === q.type)!;
    // Best-effort: put value into first field key so preview renders correctly
    // For simple types (url, phone, text, sms) this works fine.
    const firstKey = cfg.fields[0].key;
    setFields({ [firstKey]: q.value });
  }, []);

  // ── Save current ──────────────────────────────────────────────────────────
  const handleSave = () => {
    if (!qrValue.trim()) return;
    const entry: SavedQr = {
      id: activeId && !isCreating ? activeId : `qr_${Date.now()}`,
      label: label || typeConfig.label,
      type: selectedType,
      value: qrValue,
      fgColor,
      bgColor,
      size,
      createdAt: Date.now(),
    };
    setSaved(prev => {
      const idx = prev.findIndex(q => q.id === entry.id);
      let next: SavedQr[];
      if (idx >= 0) {
        next = prev.map(q => q.id === entry.id ? entry : q);
      } else {
        next = [entry, ...prev];
      }
      persistSaved(next);
      return next;
    });
    setActiveId(entry.id);
    setIsCreating(false);
  };

  const handleNew = () => {
    setIsCreating(true);
    setActiveId(null);
    setSelectedType('url');
    setFields({});
    setLabel('');
    setFgColor('#1e293b');
    setBgColor('#ffffff');
    setSize(300);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this QR code?')) return;
    setSaved(prev => {
      const next = prev.filter(q => q.id !== id);
      persistSaved(next);
      return next;
    });
    if (activeId === id) {
      setActiveId(null);
      setIsCreating(false);
    }
  };

  // ── Download PNG ──────────────────────────────────────────────────────────
  const handleDownloadPng = async () => {
    if (!canvasRef.current || !qrValue.trim()) return;
    setIsDownloading(true);
    try {
      const url = canvasRef.current.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${label || 'qr-code'}.png`;
      a.click();
    } finally {
      setIsDownloading(false);
    }
  };

  // ── Download SVG ──────────────────────────────────────────────────────────
  const handleDownloadSvg = async () => {
    if (!qrValue.trim()) return;
    setIsDownloading(true);
    try {
      const svg = await QRCode.toString(qrValue, {
        type: 'svg',
        color: { dark: fgColor, light: bgColor },
        errorCorrectionLevel: 'H',
        margin: 2,
      });
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${label || 'qr-code'}.svg`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  };

  // ── Copy value ────────────────────────────────────────────────────────────
  const handleCopy = () => {
    navigator.clipboard.writeText(qrValue).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Field change ──────────────────────────────────────────────────────────
  const setField = (key: string, value: string) => setFields(prev => ({ ...prev, [key]: value }));

  const showEditor = isCreating || activeId !== null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Sidebar: Saved QRs ──────────────────────────────────────────── */}
      <div className="w-72 shrink-0 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-col">
        {/* Header */}
        <div className="px-4 pt-5 pb-3 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <QrCode size={16} className="text-violet-500" /> QR Codes
            </h2>
            <button
              onClick={handleNew}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition"
              title="Create new QR Code"
            >
              <Plus size={13} /> New
            </button>
          </div>
          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search saved…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
          {filteredSaved.length === 0 ? (
            <div className="text-center py-10 px-4">
              <QrCode size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {search ? 'No results found' : 'No QR codes yet.\nClick New to create one.'}
              </p>
            </div>
          ) : (
            filteredSaved.map(q => {
              const tc = QR_TYPES.find(t => t.type === q.type)!;
              return (
                <button
                  key={q.id}
                  onClick={() => loadIntoEditor(q)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition group ${
                    activeId === q.id && !isCreating
                      ? 'bg-violet-50 dark:bg-violet-900/20 ring-1 ring-violet-200 dark:ring-violet-800'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {/* Mini QR preview dot */}
                  <div
                    className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-white"
                    style={{ backgroundColor: q.fgColor }}
                  >
                    <QrCode size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {shortLabel(q)}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-0.5">
                        {tc.icon} {tc.label}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(q.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 rounded transition"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Main Panel ───────────────────────────────────────────────────── */}
      {!showEditor ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-950 p-8">
          <div className="w-20 h-20 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <QrCode size={40} className="text-violet-500" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">QR Code Generator</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
              Create QR codes for links, contacts, WiFi credentials, and more. Select a saved code or create a new one.
            </p>
          </div>
          <button
            onClick={handleNew}
            className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl transition shadow-sm"
          >
            <Plus size={16} /> Create New QR Code
          </button>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden bg-slate-50 dark:bg-slate-950">

          {/* ── Editor Column ─────────────────────────────────────────────── */}
          <div className="w-[420px] shrink-0 overflow-y-auto bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 flex flex-col">
            {/* Editor header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="flex-1 min-w-0">
                {editingLabel ? (
                  <input
                    autoFocus
                    className="w-full text-sm font-bold border-b-2 border-violet-500 bg-transparent text-slate-900 dark:text-white outline-none pb-0.5"
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    onBlur={() => setEditingLabel(false)}
                    onKeyDown={e => { if (e.key === 'Enter') setEditingLabel(false); }}
                    placeholder="QR Code Name"
                  />
                ) : (
                  <button
                    onClick={() => setEditingLabel(true)}
                    className="flex items-center gap-1.5 group"
                    title="Click to rename"
                  >
                    <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {label || (isCreating ? 'New QR Code' : 'Untitled QR Code')}
                    </span>
                    <Pencil size={11} className="text-slate-400 opacity-0 group-hover:opacity-100 transition" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <button
                  onClick={handleSave}
                  disabled={!qrValue.trim()}
                  className="px-3 py-1.5 text-xs font-semibold bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg transition"
                >
                  {isCreating ? 'Save' : 'Update'}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Type selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">
                  QR Type
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {QR_TYPES.map(t => (
                    <button
                      key={t.type}
                      onClick={() => { setSelectedType(t.type); setFields({}); }}
                      className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl text-[10px] font-semibold border transition ${
                        selectedType === t.type
                          ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-violet-300 dark:hover:border-violet-700'
                      }`}
                    >
                      {t.icon}
                      <span className="truncate w-full text-center leading-tight">{t.label.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic fields */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                  {typeConfig.label} Details
                </label>
                {typeConfig.fields.map(f => (
                  <div key={f.key}>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{f.label}</label>
                    <input
                      type={f.type || 'text'}
                      placeholder={f.placeholder}
                      value={fields[f.key] || ''}
                      onChange={e => setField(f.key, e.target.value)}
                      className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 placeholder:text-slate-300 dark:placeholder:text-slate-500"
                    />
                  </div>
                ))}
              </div>

              {/* Appearance */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-3">
                  Appearance
                </label>
                <div className="space-y-3">
                  {/* Colors */}
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">QR Color</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={fgColor}
                          onChange={e => setFgColor(e.target.value)}
                          className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer p-0.5 bg-white"
                          title="Foreground color"
                        />
                        <input
                          type="text"
                          value={fgColor}
                          onChange={e => setFgColor(e.target.value)}
                          className="flex-1 text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono"
                        />
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Background</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={bgColor}
                          onChange={e => setBgColor(e.target.value)}
                          className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer p-0.5 bg-white"
                          title="Background color"
                        />
                        <input
                          type="text"
                          value={bgColor}
                          onChange={e => setBgColor(e.target.value)}
                          className="flex-1 text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Color presets */}
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Quick Presets</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: 'Classic', fg: '#000000', bg: '#ffffff' },
                        { label: 'Slate', fg: '#1e293b', bg: '#ffffff' },
                        { label: 'Indigo', fg: '#4f46e5', bg: '#eef2ff' },
                        { label: 'Violet', fg: '#7c3aed', bg: '#f5f3ff' },
                        { label: 'Emerald', fg: '#059669', bg: '#ecfdf5' },
                        { label: 'Rose', fg: '#e11d48', bg: '#fff1f2' },
                        { label: 'Dark', fg: '#e2e8f0', bg: '#0f172a' },
                      ].map(p => (
                        <button
                          key={p.label}
                          onClick={() => { setFgColor(p.fg); setBgColor(p.bg); }}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition ${
                            fgColor === p.fg && bgColor === p.bg
                              ? 'ring-2 ring-violet-500 border-violet-300'
                              : 'border-slate-200 dark:border-slate-600 hover:border-violet-300'
                          }`}
                          style={{ backgroundColor: p.bg, color: p.fg }}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Size slider */}
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                      Size: <span className="font-semibold text-slate-700 dark:text-slate-300">{size}px</span>
                    </label>
                    <input
                      type="range"
                      min={150}
                      max={600}
                      step={50}
                      value={size}
                      onChange={e => setSize(Number(e.target.value))}
                      className="w-full accent-violet-600"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                      <span>150px</span><span>600px</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Encoded value preview */}
              {qrValue.trim() && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                    Encoded Value
                  </label>
                  <div className="relative">
                    <div className="text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-slate-700 dark:text-slate-300 break-all pr-10 max-h-20 overflow-y-auto">
                      {qrValue}
                    </div>
                    <button
                      onClick={handleCopy}
                      className="absolute top-2 right-2 p-1 text-slate-400 hover:text-violet-600 rounded transition"
                      title="Copy value"
                    >
                      {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Preview Column ─────────────────────────────────────────────── */}
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 bg-slate-50 dark:bg-slate-950 overflow-y-auto">
            {/* QR canvas */}
            <div
              className="rounded-2xl p-5 shadow-xl border border-slate-200 dark:border-slate-700"
              style={{ backgroundColor: bgColor }}
            >
              {qrValue.trim() ? (
                <QrPreview
                  value={qrValue}
                  fgColor={fgColor}
                  bgColor={bgColor}
                  size={Math.min(size, 400)}
                  canvasRef={canvasRef}
                />
              ) : (
                <div
                  className="flex flex-col items-center justify-center gap-3 rounded-xl"
                  style={{ width: Math.min(size, 400), height: Math.min(size, 400) }}
                >
                  <QrCode size={48} className="text-slate-300 dark:text-slate-600" />
                  <p className="text-xs text-slate-400 text-center">Fill in the fields to generate your QR code</p>
                </div>
              )}
            </div>

            {/* Label */}
            {(label || activeId) && (
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {label || typeConfig.label}
              </p>
            )}

            {/* Download buttons */}
            {qrValue.trim() && (
              <div className="flex flex-col items-center gap-3">
                <div className="flex gap-2">
                  <button
                    onClick={handleDownloadPng}
                    disabled={isDownloading}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white rounded-xl transition shadow-sm"
                  >
                    {isDownloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                    Download PNG
                  </button>
                  <button
                    onClick={handleDownloadSvg}
                    disabled={isDownloading}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-xl transition"
                  >
                    {isDownloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                    Download SVG
                  </button>
                </div>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 transition"
                >
                  {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  {copied ? 'Copied!' : 'Copy encoded value'}
                </button>

                {/* If it's a URL, show open link */}
                {(selectedType === 'url' && fields.url) && (
                  <a
                    href={fields.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-700 transition"
                  >
                    <ExternalLink size={12} /> Open Link
                  </a>
                )}
              </div>
            )}

            {/* Tips */}
            <div className="max-w-sm text-center">
              <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
                {selectedType === 'wifi' && '📱 Scan to instantly connect to your church WiFi — no typing needed.'}
                {selectedType === 'url'  && '🔗 Link to your website, giving page, event registration, or any URL.'}
                {selectedType === 'email' && '✉️ Let visitors email you directly by scanning. Great for prayer requests.'}
                {selectedType === 'sms'  && '💬 Allow people to text your church number instantly.'}
                {selectedType === 'vcard' && '👤 Share a digital contact card for your pastor or staff.'}
                {selectedType === 'text'  && '📝 Encode any plain text — service times, addresses, announcements.'}
                {selectedType === 'phone' && '📞 Link directly to call your church phone number.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QrCodeGenerator;
