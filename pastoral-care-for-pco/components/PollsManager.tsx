import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart2, Plus, Trash2, Eye, Pencil, Loader2, X, Copy, Check,
  ChevronDown, ChevronUp, CheckCircle, Circle, GripVertical, ToggleLeft,
  ToggleRight, Link, ArrowLeft, Users, Clock, Star, AlignLeft, List,
  Tv2, MessageSquare, Smartphone, ExternalLink, Wifi, ThumbsUp, Image as ImageIcon, Upload
} from 'lucide-react';
import { firestore } from '../services/firestoreService';
import { storage } from '../services/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Poll, PollQuestion, PollQuestionType, PollResponse, PollStatus } from '../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

const newQuestion = (order: number): PollQuestion => ({
  id: `q_${Date.now()}_${order}`,
  type: 'single_choice',
  text: '',
  required: false,
  options: ['Option A', 'Option B'],
  ratingMax: 5,
  order,
});

const newPoll = (churchId: string, createdBy: string): Poll => ({
  id: `poll_${Date.now()}`,
  churchId,
  title: '',
  description: '',
  status: 'draft',
  questions: [newQuestion(0)],
  allowMultipleSubmissions: false,
  requireName: false,
  requireEmail: false,
  showResultsToRespondents: false,
  closesAt: null,
  totalResponses: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  createdBy,
  activeQuestionIndex: 0,
  smsVotingEnabled: false,
});

const STATUS_MAP: Record<PollStatus, { label: string; color: string }> = {
  draft:  { label: 'Draft',  color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  active: { label: 'Active', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  closed: { label: 'Closed', color: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' },
};

const TYPE_LABELS: Record<PollQuestionType, { label: string; icon: React.ReactNode }> = {
  single_choice:   { label: 'Single Choice',   icon: <Circle size={13} /> },
  multiple_choice: { label: 'Multiple Choice',  icon: <CheckCircle size={13} /> },
  text:            { label: 'Free Text',        icon: <AlignLeft size={13} /> },
  rating:          { label: 'Rating',           icon: <Star size={13} /> },
  yes_no:          { label: 'Yes / No',         icon: <ToggleLeft size={13} /> },
  thumbs_up_down:  { label: 'Thumbs Up/Down',   icon: <ThumbsUp size={13} /> },
};

function getPollShareUrl(pollId: string): string {
  return `${window.location.origin}/poll/${pollId}`;
}

function getPollLiveUrl(pollId: string, admin = false): string {
  return `${window.location.origin}/poll/${pollId}/live${admin ? '?admin=1' : ''}`;
}

// ─── CopyButton ─────────────────────────────────────────────────────────────

const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label }) => {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handle}
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition"
      title="Copy link"
    >
      {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> {label || 'Copy Link'}</>}
    </button>
  );
};

// ─── Shared upload hook ───────────────────────────────────────────────────────

function useUpload(folder: string) {
  const [uploading, setUploading] = useState(false);

  const upload = useCallback(async (file: File): Promise<string> => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const filename = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const sRef = storageRef(storage, filename);
      const task = uploadBytesResumable(sRef, file);
      
      await task;
      const url = await getDownloadURL(sRef);
      setUploading(false);
      return url;
    } catch (e) {
      setUploading(false);
      throw e;
    }
  }, [folder]);

  return { upload, uploading };
}

// ─── Results View ────────────────────────────────────────────────────────────

const ResultsView: React.FC<{ poll: Poll; responses: PollResponse[]; onBack: () => void }> = ({
  poll, responses, onBack
}) => {
  const [activeQ, setActiveQ] = useState(0);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <div className="font-bold text-slate-900 dark:text-white">{poll.title}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{responses.length} response{responses.length !== 1 ? 's' : ''}</div>
        </div>
        {/* Live projector link */}
        <a
          href={getPollLiveUrl(poll.id, true)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition"
          title="Open Live Projector View"
        >
          <Tv2 size={12} /> Present Live
        </a>
      </div>

      {/* Question tabs */}
      {poll.questions.length > 1 && (
        <div className="flex gap-1 p-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 overflow-x-auto shrink-0">
          {poll.questions.map((q, i) => (
            <button
              key={q.id}
              onClick={() => setActiveQ(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                activeQ === i
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              Q{i + 1}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {poll.questions.filter((_, i) => poll.questions.length <= 1 || i === activeQ).map(q => {
          const qAnswers = responses
            .map(r => r.answers[q.id])
            .filter(Boolean);

          if (q.type === 'text') {
            return (
              <div key={q.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">{q.text}</h3>
                {qAnswers.length === 0 ? (
                  <p className="text-sm text-slate-400">No responses yet.</p>
                ) : (
                  <div className="space-y-2">
                    {qAnswers.map((ans, i) => (
                      <div key={i} className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/50 rounded-xl px-4 py-2.5">
                        {String(ans)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          if (q.type === 'rating') {
            const nums = qAnswers.map(a => Number(a)).filter(n => !isNaN(n));
            const avg = nums.length > 0 ? (nums.reduce((s, n) => s + n, 0) / nums.length).toFixed(1) : '—';
            const max = q.ratingMax || 5;
            const dist: Record<number, number> = {};
            for (let i = 1; i <= max; i++) dist[i] = 0;
            nums.forEach(n => { dist[n] = (dist[n] || 0) + 1; });
            const maxCount = Math.max(...Object.values(dist), 1);
            return (
              <div key={q.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">{q.text}</h3>
                <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mb-4">
                  {avg} <span className="text-base font-normal text-slate-400">/ {max}</span>
                </div>
                <div className="space-y-1.5">
                  {Array.from({ length: max }, (_, i) => i + 1).map(star => (
                    <div key={star} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-4 text-right">{star}</span>
                      <div className="flex-1 h-4 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all"
                          style={{ width: `${((dist[star] || 0) / maxCount) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400 w-5">{dist[star] || 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          const opts = q.type === 'yes_no' ? ['Yes', 'No'] : q.type === 'thumbs_up_down' ? ['Thumbs Up', 'Thumbs Down'] : (q.options || []);
          const counts: Record<string, number> = {};
          opts.forEach(o => counts[o] = 0);
          qAnswers.forEach(ans => {
            if (Array.isArray(ans)) ans.forEach(a => { counts[a] = (counts[a] || 0) + 1; });
            else { counts[String(ans)] = (counts[String(ans)] || 0) + 1; }
          });
          const total = Math.max(Object.values(counts).reduce((s, n) => s + n, 0), 1);
          const maxCount = Math.max(...Object.values(counts), 1);

          return (
            <div key={q.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4">{q.text}</h3>
              <div className="space-y-2.5">
                {opts.map(opt => {
                  const count = counts[opt] || 0;
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={opt}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-slate-700 dark:text-slate-200">{opt}</span>
                        <span className="text-xs text-slate-400">{count} ({pct}%)</span>
                      </div>
                      <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all"
                          style={{ width: `${(count / maxCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Individual Responses */}
        {responses.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
              <Users size={15} className="text-indigo-500" /> Individual Responses
            </h3>
            <div className="space-y-3">
              {responses.map(r => (
                <div key={r.id} className="text-sm border border-slate-100 dark:border-slate-700 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-slate-800 dark:text-slate-100">{r.respondentName || 'Anonymous'}</span>
                    <span className="text-xs text-slate-400">{new Date(r.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                  {r.respondentEmail && <div className="text-xs text-slate-400 mb-1">{r.respondentEmail}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Question Editor ─────────────────────────────────────────────────────────

const QuestionEditor: React.FC<{
  question: PollQuestion;
  index: number;
  total: number;
  onChange: (q: PollQuestion) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}> = ({ question, index, total, onChange, onRemove, onMoveUp, onMoveDown }) => {
  const [open, setOpen] = useState(true);
  const imageUpload = useUpload('poll_images');
  const isChoice = question.type === 'single_choice' || question.type === 'multiple_choice';

  const update = (patch: Partial<PollQuestion>) => onChange({ ...question, ...patch });

  const addOption = () => update({ options: [...(question.options || []), `Option ${(question.options?.length || 0) + 1}`] });
  const removeOption = (i: number) => update({ options: question.options?.filter((_, idx) => idx !== i) });
  const updateOption = (i: number, val: string) => {
    const opts = [...(question.options || [])];
    opts[i] = val;
    update({ options: opts });
  };

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-slate-800">
        <div className="flex flex-col gap-0.5 text-slate-300 dark:text-slate-600 cursor-move">
          <GripVertical size={14} />
        </div>
        <span className="text-xs font-bold text-slate-400 w-5">{index + 1}</span>
        <div className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
          {question.text || <span className="text-slate-300 dark:text-slate-600 italic">Untitled question</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onMoveUp} disabled={index === 0} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30 transition"><ChevronUp size={13} /></button>
          <button onClick={onMoveDown} disabled={index === total - 1} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30 transition"><ChevronDown size={13} /></button>
          <button onClick={() => setOpen(p => !p)} className="p-1 text-slate-400 hover:text-slate-600 transition">
            {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <button onClick={onRemove} className="p-1 text-slate-400 hover:text-red-500 transition"><Trash2 size={13} /></button>
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-100 dark:border-slate-700 p-4 bg-white dark:bg-slate-800 space-y-3">
          {/* Question Text */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Question</label>
            <input
              type="text"
              className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Enter your question…"
              value={question.text}
              onChange={e => update({ text: e.target.value })}
            />
          </div>

          {/* Type + Required */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Type</label>
              <select
                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={question.type}
                onChange={e => update({ type: e.target.value as PollQuestionType })}
              >
                {(Object.entries(TYPE_LABELS) as [PollQuestionType, { label: string }][]).map(([val, { label }]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-0.5">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-indigo-600 w-3.5 h-3.5"
                  checked={question.required}
                  onChange={e => update({ required: e.target.checked })}
                />
                Required
              </label>
            </div>
          </div>

          {/* Question Image */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Image (optional)</label>
            {question.imageUrl ? (
              <div className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 w-full max-w-sm">
                <img src={question.imageUrl} alt="Question" className="w-full h-32 object-cover" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <button onClick={() => update({ imageUrl: undefined })} className="p-2 bg-white text-red-600 rounded-lg shadow hover:bg-red-50 transition">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={async e => {
                    const f = e.target.files?.[0];
                    if (f) {
                      try {
                        const url = await imageUpload.upload(f);
                        update({ imageUrl: url });
                      } catch (err) {
                        alert('Failed to upload image.');
                      }
                    }
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  disabled={imageUpload.uploading}
                />
                <div className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300">
                  {imageUpload.uploading ? (
                    <><Loader2 size={15} className="animate-spin text-indigo-500" /> Uploading...</>
                  ) : (
                    <><ImageIcon size={15} className="text-slate-400" /> Upload Image</>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Options for choice questions */}
          {isChoice && (
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Options</label>
              <div className="space-y-2">
                {(question.options || []).map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-5 h-5 shrink-0 flex items-center justify-center text-slate-400 text-xs font-bold">{i + 1}</div>
                    <input
                      type="text"
                      className="flex-1 text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={opt}
                      onChange={e => updateOption(i, e.target.value)}
                    />
                    <button onClick={() => removeOption(i)} className="text-slate-300 hover:text-red-500 transition shrink-0">
                      <X size={13} />
                    </button>
                  </div>
                ))}
                {(question.options || []).length < 10 && (
                  <button
                    onClick={addOption}
                    className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition mt-1"
                  >
                    <Plus size={12} /> Add option
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Rating max */}
          {question.type === 'rating' && (
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Max Rating</label>
              <select
                className="text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={question.ratingMax || 5}
                onChange={e => update({ ratingMax: Number(e.target.value) })}
              >
                {[3, 5, 7, 10].map(n => <option key={n} value={n}>{n} Stars</option>)}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Poll Editor ─────────────────────────────────────────────────────────────

const PollEditor: React.FC<{
  poll: Poll;
  onBack: () => void;
  onSave: (poll: Poll) => void;
  isSaving: boolean;
  churchSmsNumber?: string;
}> = ({ poll: initialPoll, onBack, onSave, isSaving, churchSmsNumber }) => {
  const [poll, setPoll] = useState<Poll>(initialPoll);
  const imageUpload = useUpload('poll_images');

  const update = (patch: Partial<Poll>) => setPoll(p => ({ ...p, ...patch, updatedAt: Date.now() }));
  const updateQuestion = (idx: number, q: PollQuestion) => {
    const qs = [...poll.questions];
    qs[idx] = q;
    update({ questions: qs });
  };
  const addQuestion = () => update({ questions: [...poll.questions, newQuestion(poll.questions.length)] });
  const removeQuestion = (idx: number) => update({ questions: poll.questions.filter((_, i) => i !== idx) });
  const moveQuestion = (idx: number, dir: 1 | -1) => {
    const qs = [...poll.questions];
    const target = idx + dir;
    if (target < 0 || target >= qs.length) return;
    [qs[idx], qs[target]] = [qs[target], qs[idx]];
    qs.forEach((q, i) => q.order = i);
    update({ questions: qs });
  };

  const Toggle: React.FC<{ label: string; value: boolean; onChange: (v: boolean) => void; description?: string }> = ({ label, value, onChange, description }) => (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
      <div>
        <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{label}</div>
        {description && <div className="text-xs text-slate-400 mt-0.5">{description}</div>}
      </div>
      <button onClick={() => onChange(!value)} className="shrink-0 mt-0.5">
        {value
          ? <ToggleRight size={22} className="text-indigo-600 dark:text-indigo-400" />
          : <ToggleLeft size={22} className="text-slate-300 dark:text-slate-600" />
        }
      </button>
    </div>
  );

  // First choice-based question for SMS voting
  const firstChoiceQ = poll.questions.find(q => q.type === 'single_choice' || q.type === 'multiple_choice' || q.type === 'yes_no');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
            <ArrowLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-slate-900 dark:text-white">{poll.title || 'Untitled Poll'}</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_MAP[poll.status].color}`}>
            {STATUS_MAP[poll.status].label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Present Live button */}
          {poll.id && (
            <a
              href={getPollLiveUrl(poll.id, true)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-violet-100 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-900/40 rounded-xl transition"
            >
              <Tv2 size={13} /> Present Live
            </a>
          )}
          {/* Status toggle */}
          <select
            className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={poll.status}
            onChange={e => update({ status: e.target.value as PollStatus })}
          >
            <option value="draft">Draft</option>
            <option value="active">Active (accepting responses)</option>
            <option value="closed">Closed</option>
          </select>
          <button
            onClick={() => onSave(poll)}
            disabled={isSaving || !poll.title.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white rounded-xl transition"
          >
            {isSaving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : 'Save Poll'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Questions */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Title + Description */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Poll Title <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="w-full text-sm font-semibold border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:font-normal"
                placeholder="e.g. What service time works best for you?"
                value={poll.title}
                onChange={e => update({ title: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Description (optional)</label>
              <textarea
                rows={2}
                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                placeholder="A short intro or context for respondents…"
                value={poll.description || ''}
                onChange={e => update({ description: e.target.value })}
              />
            </div>
            
            {/* Header Image */}
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Header Image (optional)</label>
              {poll.imageUrl ? (
                <div className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 w-full max-w-sm">
                  <img src={poll.imageUrl} alt="Poll Header" className="w-full h-32 object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <button onClick={() => update({ imageUrl: undefined })} className="p-2 bg-white text-red-600 rounded-lg shadow hover:bg-red-50 transition">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative w-max">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async e => {
                      const f = e.target.files?.[0];
                      if (f) {
                        try {
                          const url = await imageUpload.upload(f);
                          update({ imageUrl: url });
                        } catch (err) {
                          alert('Failed to upload image.');
                        }
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    disabled={imageUpload.uploading}
                  />
                  <div className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300">
                    {imageUpload.uploading ? (
                      <><Loader2 size={15} className="animate-spin text-indigo-500" /> Uploading...</>
                    ) : (
                      <><ImageIcon size={15} className="text-slate-400" /> Upload Header Image</>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Questions */}
          <div className="space-y-3">
            {poll.questions.map((q, idx) => (
              <QuestionEditor
                key={q.id}
                question={q}
                index={idx}
                total={poll.questions.length}
                onChange={updated => updateQuestion(idx, updated)}
                onRemove={() => removeQuestion(idx)}
                onMoveUp={() => moveQuestion(idx, -1)}
                onMoveDown={() => moveQuestion(idx, 1)}
              />
            ))}
          </div>
          <button
            onClick={addQuestion}
            className="flex items-center gap-2 w-full py-3 border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 rounded-xl hover:border-indigo-400 hover:text-indigo-600 dark:hover:border-indigo-600 dark:hover:text-indigo-400 transition text-sm font-medium"
          >
            <Plus size={15} /> Add Question
          </button>
        </div>

        {/* Right: Settings */}
        <div className="w-72 shrink-0 border-l border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 overflow-y-auto p-5 space-y-5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Poll Settings</h3>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700/50 px-4">
            <Toggle
              label="Require Name"
              value={poll.requireName}
              onChange={v => update({ requireName: v })}
              description="Ask respondents for their full name"
            />
            <Toggle
              label="Require Email"
              value={poll.requireEmail}
              onChange={v => update({ requireEmail: v })}
              description="Collect respondent email addresses"
            />
            <Toggle
              label="Show Results After Submit"
              value={poll.showResultsToRespondents}
              onChange={v => update({ showResultsToRespondents: v })}
              description="Let respondents see aggregated results"
            />
          </div>

          {/* Auto-close */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
              <Clock size={12} /> Auto-Close Date (optional)
            </label>
            <input
              type="datetime-local"
              className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={poll.closesAt ? new Date(poll.closesAt).toISOString().slice(0, 16) : ''}
              onChange={e => update({ closesAt: e.target.value ? new Date(e.target.value).getTime() : null })}
            />
          </div>

          {/* ─── SMS Voting ─── */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-1.5">
              <MessageSquare size={11} /> SMS Text-to-Vote
            </h3>
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
              <Toggle
                label="Enable SMS Voting"
                value={!!poll.smsVotingEnabled}
                onChange={v => update({ smsVotingEnabled: v })}
                description="Let people text a number to vote"
              />

              {poll.smsVotingEnabled && (
                <>
                  {/* Keyword */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Activation Keyword (optional)</label>
                    <input
                      type="text"
                      className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
                      placeholder="e.g. VOTE"
                      value={poll.smsVoteKeyword || ''}
                      onChange={e => update({ smsVoteKeyword: e.target.value.toUpperCase().replace(/\s+/g, '') })}
                    />
                    <p className="text-xs text-slate-400 mt-1">Text this keyword to your number to receive the poll prompt</p>
                  </div>

                  {/* Phone number display */}
                  {churchSmsNumber && (
                    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl px-3 py-3 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        <Smartphone size={12} /> Text votes to:
                        <span className="font-mono">{churchSmsNumber}</span>
                      </div>
                      {firstChoiceQ && (
                        <div className="space-y-1">
                          {(firstChoiceQ.type === 'yes_no' ? ['Yes', 'No'] : (firstChoiceQ.options || [])).slice(0, 10).map((opt, i) => (
                            <div key={i} className="text-xs text-slate-500 dark:text-slate-400">
                              Text <span className="font-bold text-indigo-600 dark:text-indigo-400">{i + 1}</span> for {opt}
                            </div>
                          ))}
                        </div>
                      )}
                      {!firstChoiceQ && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          Add a choice question above to enable numbered voting
                        </p>
                      )}
                    </div>
                  )}
                  {!churchSmsNumber && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <Wifi size={11} /> SMS not configured — provision a Twilio number first
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ─── Live Projector ─── */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-1.5">
              <Tv2 size={11} /> Live Display
            </h3>
            <div className="space-y-2">
              <a
                href={getPollLiveUrl(poll.id, true)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 w-full px-3 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-xl transition"
              >
                <Tv2 size={13} /> Open Projector View (Admin)
                <ExternalLink size={11} className="ml-auto" />
              </a>
              <a
                href={getPollLiveUrl(poll.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-xl transition"
              >
                <Eye size={12} /> Audience Display (no controls)
                <ExternalLink size={11} className="ml-auto" />
              </a>
              <CopyButton text={getPollLiveUrl(poll.id)} label="Copy Display URL" />
            </div>
          </div>

          {/* Share Link */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
              <Link size={12} /> Share Link
            </label>
            <div className="flex flex-col gap-2">
              <div className="text-xs font-mono text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg px-3 py-2 break-all">
                {getPollShareUrl(poll.id)}
              </div>
              <CopyButton text={getPollShareUrl(poll.id)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Poll List View ──────────────────────────────────────────────────────────

const PollListView: React.FC<{
  polls: Poll[];
  isLoading: boolean;
  onEdit: (p: Poll) => void;
  onResults: (p: Poll) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}> = ({ polls, isLoading, onEdit, onResults, onDelete, onCreate }) => {
  const [tab, setTab] = useState<'all' | 'active' | 'draft' | 'closed'>('all');
  const filtered = tab === 'all' ? polls : polls.filter(p => p.status === tab);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <List size={24} className="text-violet-500" /> Polls
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Send a link to anyone — no login required
          </p>
        </div>
        <button
          onClick={onCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl transition shadow-sm"
        >
          <Plus size={15} /> New Poll
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-5 w-fit">
        {(['all', 'active', 'draft', 'closed'] as const).map(t => {
          const count = t === 'all' ? polls.length : polls.filter(p => p.status === t).length;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition capitalize ${
                tab === t
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {t}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                tab === t ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
              }`}>{count}</span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-slate-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Loading polls…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
          <List size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-slate-600 dark:text-slate-400 font-medium">
            {tab === 'all' ? 'No polls yet' : `No ${tab} polls`}
          </p>
          {tab === 'all' && (
            <>
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-1 mb-4">Create your first poll to start collecting responses</p>
              <button onClick={onCreate} className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl transition">
                <span className="flex items-center gap-1.5"><Plus size={14} /> Create Poll</span>
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => {
            const st = STATUS_MAP[p.status];
            return (
              <div
                key={p.id}
                className="flex items-center gap-4 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-violet-300 dark:hover:border-violet-700 transition cursor-pointer group"
                onClick={() => onEdit(p)}
              >
                <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                  <List size={18} className="text-violet-500" />
                </div>
                <div className="flex-grow min-w-0">
                  <div className="font-semibold text-slate-900 dark:text-white truncate">{p.title || 'Untitled Poll'}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>{p.questions.length} question{p.questions.length !== 1 ? 's' : ''}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1"><Users size={10} /> {p.totalResponses} response{p.totalResponses !== 1 ? 's' : ''}</span>
                    <span>·</span>
                    <span>{new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    {p.smsVotingEnabled && (
                      <><span>·</span><span className="flex items-center gap-0.5 text-violet-500"><MessageSquare size={10} /> SMS</span></>
                    )}
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${st.color}`}>{st.label}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                  {/* Present Live */}
                  <a
                    href={getPollLiveUrl(p.id, true)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="p-1.5 text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                    title="Present Live"
                  >
                    <Tv2 size={14} />
                  </a>
                  <button
                    onClick={e => { e.stopPropagation(); onResults(p); }}
                    className="p-1.5 text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                    title="View Results"
                  >
                    <BarChart2 size={14} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); onEdit(p); }}
                    className="p-1.5 text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); onDelete(p.id); }}
                    className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <CopyButton text={getPollShareUrl(p.id)} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Main PollsManager ───────────────────────────────────────────────────────

interface PollsManagerProps {
  churchId: string;
  currentUserId: string;
  churchSmsNumber?: string;
}

type ManagerView = 'list' | 'editor' | 'results';

export const PollsManager: React.FC<PollsManagerProps> = ({ churchId, currentUserId, churchSmsNumber }) => {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<ManagerView>('list');
  const [activePoll, setActivePoll] = useState<Poll | null>(null);
  const [activeResponses, setActiveResponses] = useState<PollResponse[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    setIsLoading(true);
    firestore.getPolls(churchId)
      .then(ps => { setPolls(ps); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [churchId]);

  const handleCreate = () => {
    const p = newPoll(churchId, currentUserId);
    setActivePoll(p);
    setView('editor');
  };

  const handleSave = useCallback(async (poll: Poll) => {
    setIsSaving(true);
    try {
      await firestore.savePoll(poll);
      setPolls(prev => {
        const exists = prev.some(p => p.id === poll.id);
        return exists ? prev.map(p => p.id === poll.id ? poll : p) : [poll, ...prev];
      });
      setActivePoll(poll);
      showToast('Poll saved!');
    } catch (e: any) {
      showToast(e.message || 'Failed to save poll.', 'error');
    } finally {
      setIsSaving(false);
    }
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this poll and all its responses?')) return;
    try {
      await firestore.deletePoll(id);
      setPolls(prev => prev.filter(p => p.id !== id));
      showToast('Poll deleted.');
    } catch (e: any) {
      showToast(e.message || 'Failed to delete poll.', 'error');
    }
  };

  const handleResults = async (poll: Poll) => {
    setActivePoll(poll);
    const responses = await firestore.getPollResponses(poll.id);
    setActiveResponses(responses);
    setView('results');
  };

  return (
    <div className="flex flex-col h-full relative">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold text-white ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
        }`}>
          {toast.msg}
        </div>
      )}

      {view === 'list' && (
        <PollListView
          polls={polls}
          isLoading={isLoading}
          onEdit={p => { setActivePoll(p); setView('editor'); }}
          onResults={handleResults}
          onDelete={handleDelete}
          onCreate={handleCreate}
        />
      )}

      {view === 'editor' && activePoll && (
        <PollEditor
          poll={activePoll}
          onBack={() => setView('list')}
          onSave={handleSave}
          isSaving={isSaving}
          churchSmsNumber={churchSmsNumber}
        />
      )}

      {view === 'results' && activePoll && (
        <ResultsView
          poll={activePoll}
          responses={activeResponses}
          onBack={() => setView('list')}
        />
      )}
    </div>
  );
};
