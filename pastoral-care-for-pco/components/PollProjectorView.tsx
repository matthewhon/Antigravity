import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Wifi, Users, ChevronRight, X, Tv2, QrCode, Star,
  Loader2, AlignLeft, CheckCircle, Circle, ToggleLeft
} from 'lucide-react';
import { Poll, PollQuestion } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getApiBase(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'https://pastoralcare.barnabassoftware.com';
    }
    return window.location.origin;
  }
  return '';
}

function getPollShareUrl(pollId: string): string {
  return `${window.location.origin}/poll/${pollId}`;
}

// ─── QR Code (via Google Charts API) ─────────────────────────────────────────

const QrCodeImg: React.FC<{ url: string; size?: number }> = ({ url, size = 120 }) => {
  const encoded = encodeURIComponent(url);
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&bgcolor=1e1b4b&color=ffffff&margin=10`;
  return (
    <img
      src={src}
      alt="Scan to participate"
      width={size}
      height={size}
      className="rounded-xl"
      style={{ imageRendering: 'pixelated' }}
    />
  );
};

// ─── Animated Bar ─────────────────────────────────────────────────────────────

const AnimatedBar: React.FC<{
  label: string;
  count: number;
  total: number;
  maxCount: number;
  index: number;
  color: string;
  isLeading: boolean;
}> = ({ label, count, total, maxCount, index, color, isLeading }) => {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const barW = maxCount > 0 ? (count / maxCount) * 100 : 0;
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDisplayed(barW), 100 + index * 60);
    return () => clearTimeout(timer);
  }, [barW, index]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={`text-2xl font-bold ${isLeading ? 'text-white' : 'text-slate-300'}`}>
          {label}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-slate-400 text-lg font-medium">{count} vote{count !== 1 ? 's' : ''}</span>
          <span className={`text-3xl font-black ${isLeading ? 'text-violet-300' : 'text-slate-400'}`}>
            {pct}%
          </span>
        </div>
      </div>
      <div className="h-10 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${displayed}%`,
            background: isLeading
              ? 'linear-gradient(90deg, #7c3aed, #4f46e5)'
              : 'linear-gradient(90deg, #475569, #334155)',
          }}
        />
      </div>
    </div>
  );
};

// ─── Question Result Card ─────────────────────────────────────────────────────

const QuestionResultCard: React.FC<{
  question: PollQuestion;
  result: any;
  animKey: string;
}> = ({ question, result, animKey }) => {
  if (!result) return null;

  const isText = result.type === 'text';
  const isRating = result.type === 'rating';

  if (isText) {
    return (
      <div key={animKey} className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-3 text-slate-300 mb-6">
          <AlignLeft size={22} className="text-violet-400" />
          <span className="text-xl">Free Text Responses</span>
          <span className="ml-auto text-slate-400 text-lg">{result.count} response{result.count !== 1 ? 's' : ''}</span>
        </div>
        <div className="grid grid-cols-1 gap-3 max-h-[50vh] overflow-hidden">
          {(result.answers || []).slice(0, 8).map((ans: string, i: number) => (
            <div
              key={i}
              className="bg-white/10 backdrop-blur rounded-2xl px-6 py-4 text-white text-xl font-medium border border-white/10"
              style={{ animation: `slideIn 0.4s ease-out ${i * 80}ms both` }}
            >
              {ans}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isRating) {
    const max = result.max || 5;
    const avg = result.avg || 0;
    const dist = result.dist || {};
    const maxCount = Math.max(...Object.values<number>(dist), 1);
    return (
      <div key={animKey} className="space-y-6 animate-fade-in">
        <div className="text-center">
          <div className="text-8xl font-black text-violet-300 mb-2">
            {avg.toFixed(1)}
          </div>
          <div className="text-slate-400 text-2xl">out of {max}</div>
          <div className="flex justify-center gap-1 mt-4">
            {Array.from({ length: max }, (_, i) => i + 1).map(n => (
              <Star
                key={n}
                size={36}
                className={n <= Math.round(avg) ? 'text-amber-400 fill-amber-400' : 'text-slate-600 fill-transparent'}
              />
            ))}
          </div>
        </div>
        <div className="space-y-3 mt-8">
          {Array.from({ length: max }, (_, i) => i + 1).map(n => (
            <div key={n} className="flex items-center gap-4">
              <span className="text-slate-400 text-lg w-6 text-right">{n}</span>
              <div className="flex-1 h-8 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400/70 rounded-full transition-all duration-700"
                  style={{ width: `${((dist[n] || 0) / maxCount) * 100}%` }}
                />
              </div>
              <span className="text-slate-400 text-lg w-8 text-right">{dist[n] || 0}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Choice-based
  const opts: string[] = result.options || [];
  const counts: Record<string, number> = result.counts || {};
  const total = result.total || 0;
  const maxCount = Math.max(...opts.map(o => counts[o] || 0), 1);
  const leadingOpt = opts.reduce((a, b) => (counts[a] || 0) >= (counts[b] || 0) ? a : b, opts[0]);

  return (
    <div key={animKey} className="space-y-5 animate-fade-in">
      {opts.map((opt, idx) => (
        <AnimatedBar
          key={`${opt}-${animKey}`}
          label={opt}
          count={counts[opt] || 0}
          total={total}
          maxCount={maxCount}
          index={idx}
          color="violet"
          isLeading={opt === leadingOpt && (counts[opt] || 0) > 0}
        />
      ))}
    </div>
  );
};

// ─── Admin Control Overlay ────────────────────────────────────────────────────

const AdminOverlay: React.FC<{
  pollId: string;
  question: PollQuestion | null;
  questionIndex: number;
  totalQuestions: number;
  pollClosed: boolean;
  onAdvance: () => void;
  onGoto: (idx: number) => void;
  apiBase: string;
}> = ({ pollId, question, questionIndex, totalQuestions, pollClosed, onAdvance, onGoto, apiBase }) => {
  const [isActing, setIsActing] = useState(false);

  const handleCloseAndAdvance = async () => {
    if (isActing) return;
    setIsActing(true);
    try {
      const res = await fetch(`${apiBase}/polls/${pollId}/close-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentIndex: questionIndex }),
      });
      if (res.ok) onAdvance();
    } catch (e) {
      console.error('close-question failed', e);
    } finally {
      setIsActing(false);
    }
  };

  const handleGoto = async (idx: number) => {
    if (isActing) return;
    setIsActing(true);
    try {
      await fetch(`${apiBase}/polls/${pollId}/active-question`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeQuestionIndex: idx }),
      });
      onGoto(idx);
    } catch (e) {
      console.error('active-question failed', e);
    } finally {
      setIsActing(false);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-6">
      <div className="max-w-3xl mx-auto bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-3xl px-6 py-5 shadow-2xl">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Question dots */}
          <div className="flex items-center gap-2 flex-1">
            {Array.from({ length: totalQuestions }, (_, i) => (
              <button
                key={i}
                onClick={() => handleGoto(i)}
                className={`w-8 h-8 rounded-full text-xs font-bold transition-all ${
                  i === questionIndex
                    ? 'bg-violet-500 text-white scale-125 shadow-lg shadow-violet-500/40'
                    : i < questionIndex
                    ? 'bg-emerald-600/50 text-emerald-300'
                    : 'bg-white/10 text-slate-400 hover:bg-white/20'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {!pollClosed && (
              <button
                onClick={handleCloseAndAdvance}
                disabled={isActing}
                className="flex items-center gap-2 px-5 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold rounded-2xl transition-all shadow-lg shadow-violet-500/30 text-sm"
              >
                {isActing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ChevronRight size={16} />
                )}
                {questionIndex >= totalQuestions - 1 ? 'Close Poll' : 'Next Question'}
              </button>
            )}
            {pollClosed && (
              <span className="px-4 py-2 bg-slate-700 text-slate-300 rounded-xl text-sm font-semibold">
                Poll Closed
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main Projector View ──────────────────────────────────────────────────────

interface PollProjectorViewProps {
  pollId: string;
}

export const PollProjectorView: React.FC<PollProjectorViewProps> = ({ pollId }) => {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [localActiveIndex, setLocalActiveIndex] = useState<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isAdmin = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('admin');
  const apiBase = getApiBase();

  const fetchResults = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/polls/${pollId}/live-results`);
      if (!res.ok) throw new Error('Poll not found');
      const json = await res.json();
      setData(json);
      // Sync the server-side activeQuestionIndex if admin just set it
      setLocalActiveIndex(json.activeQuestionIndex ?? 0);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load poll');
    } finally {
      setIsLoading(false);
    }
  }, [pollId, apiBase]);

  useEffect(() => {
    fetchResults();
    intervalRef.current = setInterval(fetchResults, 3000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchResults]);

  // Derive display state
  const questions: PollQuestion[] = data?.questions || [];
  const questionResults = data?.questionResults || {};
  const totalResponses = data?.totalResponses || 0;
  const pollClosed = data?.status === 'closed';
  const activeQ = questions[localActiveIndex] || null;
  const activeResult = activeQ ? questionResults[activeQ.id] : null;
  const pollTitle = data?.title || '';
  const shareUrl = getPollShareUrl(pollId);

  // Show end screen when past last question
  const showEndScreen = pollClosed || localActiveIndex >= questions.length;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={48} className="animate-spin text-violet-400 mx-auto mb-4" />
          <p className="text-slate-400 text-xl">Loading poll…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center text-red-400">
          <X size={48} className="mx-auto mb-4" />
          <p className="text-xl">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 flex flex-col relative select-none overflow-hidden">
      {/* Ambient glow orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-10 py-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Tv2 size={20} className="text-white" />
          </div>
          <span className="text-white font-bold text-xl truncate max-w-md">{pollTitle}</span>
        </div>
        <div className="flex items-center gap-6">
          {/* Live indicator */}
          {!pollClosed && (
            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-400 text-sm font-semibold">LIVE</span>
            </div>
          )}
          {/* Response count */}
          <div className="flex items-center gap-2 text-slate-300">
            <Users size={18} className="text-violet-400" />
            <span className="text-lg font-bold">{totalResponses}</span>
            <span className="text-slate-500">response{totalResponses !== 1 ? 's' : ''}</span>
          </div>
          {/* Question counter */}
          {questions.length > 0 && !showEndScreen && (
            <div className="text-slate-400 text-sm font-semibold">
              Q{localActiveIndex + 1} / {questions.length}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex">
        {/* Left: Question + Results */}
        <div className={`flex-1 flex flex-col justify-center px-16 py-10 ${isAdmin ? 'pb-36' : ''}`}>
          {showEndScreen ? (
            /* End screen */
            <div className="text-center space-y-6 animate-fade-in">
              <div className="text-7xl mb-4">🎉</div>
              <h2 className="text-5xl font-black text-white">Poll Complete!</h2>
              <p className="text-slate-400 text-2xl">Thank you for participating</p>
              <div className="text-6xl font-black text-violet-300 mt-8">{totalResponses}</div>
              <p className="text-slate-400 text-xl">total response{totalResponses !== 1 ? 's' : ''}</p>
            </div>
          ) : activeQ ? (
            <div className="space-y-10">
              {/* Question text */}
              <div>
                <div className="text-violet-400 text-sm font-bold uppercase tracking-widest mb-3">
                  Question {localActiveIndex + 1} of {questions.length}
                </div>
                <h1 className="text-4xl lg:text-5xl font-black text-white leading-tight">
                  {activeQ.text || <span className="text-slate-500 italic">Untitled question</span>}
                </h1>
              </div>

              {/* Results */}
              <QuestionResultCard
                question={activeQ}
                result={activeResult}
                animKey={`${activeQ.id}-${localActiveIndex}`}
              />
            </div>
          ) : (
            /* No questions yet */
            <div className="text-center text-slate-500">
              <p className="text-2xl">Waiting for questions…</p>
            </div>
          )}
        </div>

        {/* Right sidebar: QR + participation */}
        <div className="w-72 shrink-0 flex flex-col items-center justify-center gap-6 border-l border-white/5 px-8 py-10">
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 text-slate-400 text-sm font-semibold">
              <QrCode size={14} />
              Scan to vote
            </div>
            <QrCodeImg url={shareUrl} size={160} />
            <p className="text-slate-500 text-xs mt-2 break-all">{shareUrl}</p>
          </div>

          {/* Wifi icon + Vote tip */}
          <div className="flex items-center gap-2 text-slate-500 text-xs text-center">
            <Wifi size={14} />
            <span>Open on your phone to participate</span>
          </div>
        </div>
      </div>

      {/* Admin overlay */}
      {isAdmin && (
        <AdminOverlay
          pollId={pollId}
          question={activeQ}
          questionIndex={localActiveIndex}
          totalQuestions={questions.length}
          pollClosed={pollClosed}
          onAdvance={() => fetchResults()}
          onGoto={(idx) => {
            setLocalActiveIndex(idx);
            fetchResults();
          }}
          apiBase={apiBase}
        />
      )}

      {/* Inline CSS for animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .animate-fade-in { animation: fadeIn 0.5s ease-out both; }
      `}</style>
    </div>
  );
};
