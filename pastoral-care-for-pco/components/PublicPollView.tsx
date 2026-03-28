import React, { useState, useEffect } from 'react';
import { Star, CheckCircle, Loader2, ChevronRight, AlertCircle } from 'lucide-react';
import { Poll, PollQuestion, PollResponse } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getApiBase(): string {
  // In prod the app is served by the same Cloud Run instance, so we use same origin.
  // In dev, fall back to the deployed backend.
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'https://pastoral-care-for-pco-u3gnt7kb5a-uc.a.run.app';
    }
    return window.location.origin;
  }
  return '';
}

function generateSessionToken(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getSessionToken(): string {
  const key = 'pollSessionToken';
  let token = localStorage.getItem(key);
  if (!token) {
    token = generateSessionToken();
    localStorage.setItem(key, token);
  }
  return token;
}

// ─── Question Renderers ───────────────────────────────────────────────────────

const SingleChoiceInput: React.FC<{
  question: PollQuestion;
  value: string;
  onChange: (v: string) => void;
}> = ({ question, value, onChange }) => (
  <div className="space-y-2.5">
    {(question.options || []).map((opt, i) => (
      <label
        key={i}
        className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
          value === opt
            ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
            : 'border-slate-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-700 bg-white dark:bg-slate-800/50'
        }`}
      >
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
          value === opt
            ? 'border-violet-500 bg-violet-500'
            : 'border-slate-300 dark:border-slate-600'
        }`}>
          {value === opt && <div className="w-2 h-2 rounded-full bg-white" />}
        </div>
        <span className={`text-sm font-medium transition-colors ${
          value === opt ? 'text-violet-700 dark:text-violet-300' : 'text-slate-700 dark:text-slate-300'
        }`}>{opt}</span>
      </label>
    ))}
  </div>
);

const MultipleChoiceInput: React.FC<{
  question: PollQuestion;
  value: string[];
  onChange: (v: string[]) => void;
}> = ({ question, value, onChange }) => {
  const toggle = (opt: string) => {
    if (value.includes(opt)) onChange(value.filter(v => v !== opt));
    else onChange([...value, opt]);
  };
  return (
    <div className="space-y-2.5">
      {(question.options || []).map((opt, i) => {
        const checked = value.includes(opt);
        return (
          <label
            key={i}
            className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
              checked
                ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                : 'border-slate-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-700 bg-white dark:bg-slate-800/50'
            }`}
          >
            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${
              checked ? 'border-violet-500 bg-violet-500' : 'border-slate-300 dark:border-slate-600'
            }`}>
              {checked && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
            </div>
            <span className={`text-sm font-medium transition-colors ${
              checked ? 'text-violet-700 dark:text-violet-300' : 'text-slate-700 dark:text-slate-300'
            }`}>{opt}</span>
          </label>
        );
      })}
    </div>
  );
};

const YesNoInput: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <div className="flex gap-3">
    {['Yes', 'No'].map(opt => (
      <button
        key={opt}
        onClick={() => onChange(opt)}
        className={`flex-1 py-3.5 rounded-xl border-2 text-sm font-semibold transition-all ${
          value === opt
            ? opt === 'Yes'
              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
              : 'border-red-400 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/50'
        }`}
      >
        {opt}
      </button>
    ))}
  </div>
);

const TextInput: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string }> = ({ value, onChange, placeholder }) => (
  <textarea
    rows={3}
    className="w-full text-sm border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-violet-500 dark:focus:border-violet-500 resize-none transition"
    placeholder={placeholder || 'Your answer…'}
    value={value}
    onChange={e => onChange(e.target.value)}
  />
);

const RatingInput: React.FC<{
  question: PollQuestion;
  value: string;
  onChange: (v: string) => void;
}> = ({ question, value, onChange }) => {
  const max = question.ratingMax || 5;
  const current = value ? Number(value) : 0;
  const [hovered, setHovered] = useState(0);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {Array.from({ length: max }, (_, i) => i + 1).map(star => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(String(star))}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            className="transition-transform active:scale-90"
          >
            <Star
              size={32}
              className={`transition-colors ${
                star <= (hovered || current)
                  ? 'text-amber-400 fill-amber-400'
                  : 'text-slate-300 dark:text-slate-600 fill-transparent'
              }`}
            />
          </button>
        ))}
      </div>
      {current > 0 && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {current} / {max} {current === 1 ? 'star' : 'stars'}
        </p>
      )}
    </div>
  );
};

// ─── Results Summary (shown after submit if poll allows it) ──────────────────

const ResultsSummary: React.FC<{ poll: Poll; rawResponses: any[] }> = ({ poll, rawResponses }) => {
  return (
    <div className="space-y-4 mt-2">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Current Results</h3>
      {poll.questions.map(q => {
        const answers = rawResponses.map(r => r.answers?.[q.id]).filter(Boolean);
        const opts = q.type === 'yes_no' ? ['Yes', 'No'] : (q.options || []);
        const total = Math.max(answers.length, 1);

        if (q.type === 'text') {
          return (
            <div key={q.id} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">{q.text}</p>
              <p className="text-xs text-slate-400">{answers.length} text response{answers.length !== 1 ? 's' : ''}</p>
            </div>
          );
        }

        if (q.type === 'rating') {
          const nums = answers.map(Number).filter(n => !isNaN(n));
          const avg = nums.length > 0 ? (nums.reduce((s, n) => s + n, 0) / nums.length).toFixed(1) : '—';
          return (
            <div key={q.id} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">{q.text}</p>
              <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">{avg}<span className="text-sm font-normal text-slate-400"> / {q.ratingMax || 5}</span></p>
            </div>
          );
        }

        const counts: Record<string, number> = {};
        opts.forEach(o => counts[o] = 0);
        answers.forEach(a => {
          if (Array.isArray(a)) a.forEach(x => { counts[x] = (counts[x] || 0) + 1; });
          else { counts[String(a)] = (counts[String(a)] || 0) + 1; }
        });
        const maxCount = Math.max(...Object.values(counts), 1);

        return (
          <div key={q.id} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-3">{q.text}</p>
            <div className="space-y-2">
              {opts.map(opt => {
                const count = counts[opt] || 0;
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={opt}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600 dark:text-slate-300">{opt}</span>
                      <span className="text-slate-400">{count} ({pct}%)</span>
                    </div>
                    <div className="h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-500 rounded-full" style={{ width: `${(count / maxCount) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Main Public Poll View ────────────────────────────────────────────────────

interface PublicPollViewProps {
  pollId: string;
}

type LoadState = 'loading' | 'ready' | 'error' | 'submitted' | 'closed' | 'not_found';

export const PublicPollView: React.FC<PublicPollViewProps> = ({ pollId }) => {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [poll, setPoll] = useState<Poll | null>(null);
  const [churchName, setChurchName] = useState<string>('');
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [submitResults, setSubmitResults] = useState<any[] | null>(null);
  const [totalAfterSubmit, setTotalAfterSubmit] = useState(0);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const apiBase = getApiBase();
    fetch(`${apiBase}/polls/${pollId}`)
      .then(async res => {
        if (res.status === 404) { setLoadState('not_found'); return; }
        if (!res.ok) throw new Error('Failed to load poll');
        const data = await res.json();
        setPoll(data);
        // Try to fetch church name
        if (data.churchId) {
          try {
            const { firestore } = await import('../services/firestoreService');
            const church = await firestore.getChurch(data.churchId);
            if (church?.name) setChurchName(church.name);
          } catch { /* ignore */ }
        }
        if (data.status === 'closed') { setLoadState('closed'); }
        else { setLoadState('ready'); }
      })
      .catch(() => setLoadState('error'));
  }, [pollId]);

  const setAnswer = (questionId: string, value: string | string[]) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
    setValidationErrors(prev => { const n = { ...prev }; delete n[questionId]; return n; });
  };

  const validate = (): boolean => {
    if (!poll) return false;
    const errors: Record<string, string> = {};
    if (poll.requireName && !name.trim()) errors['__name'] = 'Please enter your name.';
    if (poll.requireEmail && !email.trim()) errors['__email'] = 'Please enter your email.';
    poll.questions.forEach(q => {
      if (!q.required) return;
      const ans = answers[q.id];
      if (!ans || (Array.isArray(ans) && ans.length === 0) || (typeof ans === 'string' && !ans.trim())) {
        errors[q.id] = 'This question is required.';
      }
    });
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!poll || !validate()) return;
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/polls/${pollId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers,
          respondentName: name || undefined,
          respondentEmail: email || undefined,
          sessionToken: getSessionToken(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');
      setTotalAfterSubmit(data.totalResponses || 0);
      if (data.responses) setSubmitResults(data.responses);
      setLoadState('submitted');
    } catch (e: any) {
      setErrorMsg(e.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Render states ───────────────────────────────────────────────────────

  const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {/* Brand accent */}
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div>
            {churchName && <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{churchName}</div>}
            <div className="text-xs text-slate-400">Church Poll</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center p-4 pt-8 pb-16">
        <div className="w-full max-w-2xl">
          {children}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-slate-400 py-4">
        Powered by <span className="font-semibold text-slate-500">Barnabas</span>
      </div>
    </div>
  );

  if (loadState === 'loading') {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <Loader2 size={32} className="animate-spin mb-3" />
          <p className="text-sm">Loading poll…</p>
        </div>
      </Shell>
    );
  }

  if (loadState === 'not_found') {
    return (
      <Shell>
        <div className="text-center py-20">
          <AlertCircle size={40} className="mx-auto text-slate-400 mb-3" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Poll Not Found</h2>
          <p className="text-sm text-slate-500">This poll link may be invalid or has been removed.</p>
        </div>
      </Shell>
    );
  }

  if (loadState === 'error') {
    return (
      <Shell>
        <div className="text-center py-20">
          <AlertCircle size={40} className="mx-auto text-red-400 mb-3" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Something went wrong</h2>
          <p className="text-sm text-slate-500">Unable to load this poll. Please try again later.</p>
        </div>
      </Shell>
    );
  }

  if (loadState === 'closed') {
    return (
      <Shell>
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-10 text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{poll?.title}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">This poll is now closed and is no longer accepting responses.</p>
          {poll?.totalResponses ? (
            <p className="text-xs text-slate-400 mt-3">{poll.totalResponses} response{poll.totalResponses !== 1 ? 's' : ''} collected</p>
          ) : null}
        </div>
      </Shell>
    );
  }

  if (loadState === 'submitted') {
    return (
      <Shell>
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-10 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-5">
            <CheckCircle size={32} className="text-emerald-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Thank you!</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Your response has been recorded.</p>
          {totalAfterSubmit > 0 && (
            <p className="text-xs text-slate-400 mt-1">{totalAfterSubmit} total response{totalAfterSubmit !== 1 ? 's' : ''}</p>
          )}
          {submitResults && poll && (
            <div className="mt-8 text-left">
              <ResultsSummary poll={poll} rawResponses={submitResults} />
            </div>
          )}
        </div>
      </Shell>
    );
  }

  // ─── Main form ───────────────────────────────────────────────────────────

  if (!poll) return null;

  return (
    <Shell>
      <div className="space-y-5">
        {/* Poll header card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 px-8 py-7">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{poll.title}</h1>
          {poll.description && (
            <p className="text-slate-600 dark:text-slate-400 mt-2 text-sm leading-relaxed">{poll.description}</p>
          )}
        </div>

        {/* Respondent info */}
        {(poll.requireName || poll.requireEmail) && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 px-8 py-6 space-y-4">
            {poll.requireName && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                  Your Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className={`w-full text-sm border-2 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none transition ${
                    validationErrors['__name']
                      ? 'border-red-400 focus:border-red-500'
                      : 'border-slate-200 dark:border-slate-600 focus:border-violet-500'
                  }`}
                  placeholder="Jane Smith"
                  value={name}
                  onChange={e => { setName(e.target.value); setValidationErrors(p => { const n = { ...p }; delete n['__name']; return n; }); }}
                />
                {validationErrors['__name'] && <p className="text-xs text-red-500 mt-1">{validationErrors['__name']}</p>}
              </div>
            )}
            {poll.requireEmail && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  className={`w-full text-sm border-2 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none transition ${
                    validationErrors['__email']
                      ? 'border-red-400 focus:border-red-500'
                      : 'border-slate-200 dark:border-slate-600 focus:border-violet-500'
                  }`}
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setValidationErrors(p => { const n = { ...p }; delete n['__email']; return n; }); }}
                />
                {validationErrors['__email'] && <p className="text-xs text-red-500 mt-1">{validationErrors['__email']}</p>}
              </div>
            )}
          </div>
        )}

        {/* Questions */}
        {poll.questions.map((q, idx) => (
          <div
            key={q.id}
            className={`bg-white dark:bg-slate-800 rounded-2xl shadow-sm border px-8 py-6 transition ${
              validationErrors[q.id]
                ? 'border-red-400 dark:border-red-600'
                : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <div className="mb-4">
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Question {idx + 1}</span>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                {q.text}
                {q.required && <span className="text-red-500 ml-1">*</span>}
              </h2>
              {q.type === 'multiple_choice' && (
                <p className="text-xs text-slate-400 mt-0.5">Select all that apply</p>
              )}
            </div>

            {q.type === 'single_choice' && (
              <SingleChoiceInput
                question={q}
                value={(answers[q.id] as string) || ''}
                onChange={v => setAnswer(q.id, v)}
              />
            )}
            {q.type === 'multiple_choice' && (
              <MultipleChoiceInput
                question={q}
                value={(answers[q.id] as string[]) || []}
                onChange={v => setAnswer(q.id, v)}
              />
            )}
            {q.type === 'yes_no' && (
              <YesNoInput
                value={(answers[q.id] as string) || ''}
                onChange={v => setAnswer(q.id, v)}
              />
            )}
            {q.type === 'text' && (
              <TextInput
                value={(answers[q.id] as string) || ''}
                onChange={v => setAnswer(q.id, v)}
              />
            )}
            {q.type === 'rating' && (
              <RatingInput
                question={q}
                value={(answers[q.id] as string) || ''}
                onChange={v => setAnswer(q.id, v)}
              />
            )}

            {validationErrors[q.id] && (
              <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                <AlertCircle size={11} /> {validationErrors[q.id]}
              </p>
            )}
          </div>
        ))}

        {/* Error */}
        {errorMsg && (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
            <AlertCircle size={15} className="shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-60 text-white text-base font-semibold rounded-2xl shadow-lg shadow-violet-500/20 transition-all active:scale-[0.99]"
        >
          {isSubmitting ? (
            <><Loader2 size={18} className="animate-spin" /> Submitting…</>
          ) : (
            <><ChevronRight size={18} /> Submit Response</>
          )}
        </button>
      </div>
    </Shell>
  );
};
