import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Sparkles, Award, CheckCircle2, ArrowRight, ArrowLeft,
  ChevronRight, RefreshCw, Printer, BookOpen, Heart, 
  HelpCircle, Check, Loader2, Share2, Info, Star, Compass,
  Brain, Users, Zap, Shield, Target, MessageSquare
} from 'lucide-react';
import { firestore } from '../services/firestoreService';
import { Church, MbtiTestResponse } from '../types';
import { 
  MBTI_QUESTIONS,
  MBTI_TYPE_PROFILES,
  MBTI_TEMPERAMENT_COLORS,
  calculateMbtiType,
  CalculatedMbtiResult,
  MbtiTypeProfile
} from '../constants/mbtiTestData';

interface PublicMbtiTestViewProps {
  churchId: string;
  isEmbedded?: boolean;
}

const SCALE_LABELS = [
  { value: 1, label: 'Disagree Strongly', desc: 'Completely inaccurate for me' },
  { value: 2, label: 'Disagree', desc: 'Generally not true for me' },
  { value: 3, label: 'Neutral', desc: 'Sometimes or neutral' },
  { value: 4, label: 'Agree', desc: 'Generally true for me' },
  { value: 5, label: 'Agree Strongly', desc: 'Strongly & consistently true' },
];

export const PublicMbtiTestView: React.FC<PublicMbtiTestViewProps> = ({ churchId, isEmbedded }) => {
  const [church, setChurch] = useState<Church | null>(null);
  const [loadingChurch, setLoadingChurch] = useState(true);
  const [step, setStep] = useState<'intro' | 'info' | 'questions' | 'results'>('intro');

  // Respondent info
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [personId, setPersonId] = useState<string | null>(null);

  // Assessment answers: questionId (1-28) -> value (1-5)
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // Submitting / Result state
  const [submitting, setSubmitting] = useState(false);
  const [calculatedResults, setCalculatedResults] = useState<CalculatedMbtiResult | null>(null);
  const [submittedResponse, setSubmittedResponse] = useState<MbtiTestResponse | null>(null);

  const questionCardRef = useRef<HTMLDivElement | null>(null);

  // 1. Read URL query parameters for prefilled recipient data
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlPersonId = params.get('personId') || params.get('p');
      const urlEmail = params.get('email') || params.get('e');
      const urlName = params.get('name') || params.get('n');
      const urlFirstName = params.get('firstName') || params.get('fn');
      const urlLastName = params.get('lastName') || params.get('ln');
      const urlPhone = params.get('phone');

      if (urlPersonId) setPersonId(urlPersonId);
      if (urlEmail) setEmail(urlEmail);
      if (urlPhone) setPhone(urlPhone);
      if (urlFirstName) setFirstName(urlFirstName);
      if (urlLastName) setLastName(urlLastName);
      if (urlName && !urlFirstName) {
        const parts = urlName.trim().split(' ');
        setFirstName(parts[0] || '');
        setLastName(parts.slice(1).join(' ') || '');
      }
    }
  }, []);

  // 2. Fetch Church Information
  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        setLoadingChurch(true);
        if (churchId) {
          const c = await firestore.getChurch(churchId);
          if (isMounted) setChurch(c);
        }
      } catch (err) {
        console.warn('Error loading church info:', err);
      } finally {
        if (isMounted) setLoadingChurch(false);
      }
    }
    load();
    return () => { isMounted = false; };
  }, [churchId]);

  const totalQuestions = MBTI_QUESTIONS.length; // 28
  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const progressPercent = Math.round((answeredCount / totalQuestions) * 100);

  const unansweredQuestions = useMemo(() => {
    return MBTI_QUESTIONS.filter(q => answers[q.id] === undefined);
  }, [answers]);

  const [validationWarning, setValidationWarning] = useState<string | null>(null);

  const jumpToFirstUnanswered = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    const firstMissingIdx = MBTI_QUESTIONS.findIndex(q => answers[q.id] === undefined);
    if (firstMissingIdx !== -1) {
      setCurrentQuestionIndex(firstMissingIdx);
      setValidationWarning(`Jumping to unanswered statement #${MBTI_QUESTIONS[firstMissingIdx].id}`);
      setTimeout(() => setValidationWarning(null), 3500);
      if (questionCardRef.current) {
        questionCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  const currentQ = MBTI_QUESTIONS[currentQuestionIndex] || MBTI_QUESTIONS[0];

  const handleSelectScore = (questionId: number, score: number) => {
    setAnswers(prev => ({ ...prev, [questionId]: score }));

    // Auto advance smoothly to next question
    if (currentQuestionIndex < totalQuestions - 1) {
      setTimeout(() => {
        setCurrentQuestionIndex(prev => prev + 1);
        if (questionCardRef.current) {
          questionCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 180);
    }
  };

  const handleFinalSubmit = async () => {
    if (answeredCount < totalQuestions) {
      jumpToFirstUnanswered();
      return;
    }

    setSubmitting(true);
    try {
      const results = calculateMbtiType(answers);
      setCalculatedResults(results);

      const responseId = `mbti_resp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim() || 'Anonymous Participant';

      const responseRecord: MbtiTestResponse = {
        id: responseId,
        churchId,
        personId: personId || null,
        personName: fullName,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || null,
        answers,
        mbtiType: results.mbtiType,
        typeName: results.profile.name,
        temperament: results.profile.temperament,
        dimensionScores: results.dimensionScores,
        traitPercentages: results.traitPercentages,
        submittedAt: Date.now()
      };

      await firestore.saveMbtiResponse(responseRecord);
      setSubmittedResponse(responseRecord);
      setStep('results');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      console.error('Error saving MBTI response:', err);
      alert('An error occurred while saving your test. Your results are displayed on screen.');
      setStep('results');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // ─── Render Intro Step ─────────────────────────────────────────────────────
  if (step === 'intro') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans">
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 py-6 px-6 sm:px-12">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              {church?.logoUrl ? (
                <img src={church.logoUrl} alt={church.name} className="h-10 w-auto object-contain rounded-lg" />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center font-black shadow-md">
                  <Brain className="w-5 h-5" />
                </div>
              )}
              <div>
                <h1 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  {church?.name || 'Myers-Briggs Personality Assessment'}
                </h1>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Discover Your 16 Personality Profile
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-8 py-10 space-y-8">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-10 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border border-violet-100 dark:border-violet-800/60 text-xs font-black uppercase tracking-wider">
              <Brain className="w-3.5 h-3.5 text-violet-600" />
              <span>Myers-Briggs Type Indicator (MBTI)</span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
              Understanding How God Has Wired Your Personality
            </h2>

            <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              God created each of us with unique temperament traits, communication patterns, and strengths. The Myers-Briggs assessment helps you understand how you focus your energy, take in information, make decisions, and structure your daily life.
            </p>

            {/* The 4 Dimensions Explained */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                    ⚡ Energy: E vs. I
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400">Social Focus</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  <strong>Extraversion (E)</strong> draws energy from action and engaging with people, while <strong>Introversion (I)</strong> recharges through reflection and quiet solitude.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                    🔍 Information: S vs. N
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400">Perception</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  <strong>Sensing (S)</strong> focuses on concrete facts and hands-on reality, while <strong>Intuition (N)</strong> looks at big-picture patterns, symbols, and future possibilities.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                    ⚖️ Decisions: T vs. F
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400">Judgment</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  <strong>Thinking (T)</strong> prioritizes objective logic and principles, while <strong>Feeling (F)</strong> prioritizes personal values, empathy, and relational harmony.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                    📅 Lifestyle: J vs. P
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400">Structure</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  <strong>Judging (J)</strong> prefers organized schedules, closure, and advance planning, while <strong>Perceiving (P)</strong> enjoys flexibility, spontaneity, and open options.
                </p>
              </div>
            </div>

            {/* Test Details Card */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-2xl bg-slate-100 dark:bg-slate-800">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-violet-600 text-white flex items-center justify-center shrink-0">
                  <Compass className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">28 Targeted Statements</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Takes approximately 4–6 minutes to complete.</p>
                </div>
              </div>
              <button
                onClick={() => setStep('info')}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-violet-600/20 transition-all cursor-pointer"
              >
                <span>Begin Assessment</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ─── Render Info Step ──────────────────────────────────────────────────────
  if (step === 'info') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans">
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 py-6 px-6 sm:px-12">
          <div className="max-w-xl mx-auto flex items-center justify-between">
            <h1 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
              Step 1 of 2: Your Information
            </h1>
            <button
              onClick={() => setStep('intro')}
              className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-white transition cursor-pointer"
            >
              Back
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-xl mx-auto w-full px-4 sm:px-8 py-10">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-10 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Who is taking this assessment?
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Your name and email allow us to save your personality profile in the church management system.
              </p>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                if (!firstName.trim() || !lastName.trim() || !email.trim()) {
                  alert('Please enter your first name, last name, and email address.');
                  return;
                }
                setStep('questions');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="John"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white text-sm focus:border-violet-600 focus:ring-1 focus:ring-violet-600 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Doe"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white text-sm focus:border-violet-600 focus:ring-1 focus:ring-violet-600 outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="john.doe@example.com"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white text-sm focus:border-violet-600 focus:ring-1 focus:ring-violet-600 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Phone Number <span className="text-slate-400 font-normal lowercase">(optional)</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="(555) 000-0000"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white text-sm focus:border-violet-600 focus:ring-1 focus:ring-violet-600 outline-none transition"
                />
              </div>

              <div className="pt-4 flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setStep('intro')}
                  className="px-5 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold uppercase tracking-wider hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="px-6 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-md transition cursor-pointer"
                >
                  <span>Start Questions</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </main>
      </div>
    );
  }

  // ─── Render Questions Step ─────────────────────────────────────────────────
  if (step === 'questions') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans">
        <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 py-4 px-4 sm:px-8">
          <div className="max-w-3xl mx-auto space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-black text-violet-600 dark:text-violet-400 uppercase tracking-wider">
                  Statement {currentQuestionIndex + 1} of {totalQuestions}
                </span>
                <span className="text-slate-400">•</span>
                <span className="text-slate-500 dark:text-slate-400 font-medium">
                  {answeredCount} answered
                </span>
              </div>
              <span className="font-black text-slate-900 dark:text-white">
                {progressPercent}%
              </span>
            </div>

            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-violet-600 h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-8 py-8 space-y-6">
          <div 
            ref={questionCardRef}
            className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-10 border border-slate-200 dark:border-slate-800 shadow-sm space-y-8 animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="space-y-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold uppercase tracking-wider">
                <span>Statement #{currentQ.id}</span>
              </div>
              <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 dark:text-white leading-relaxed">
                “{currentQ.text}”
              </h3>
              <p className="text-xs text-slate-400">
                Rate your level of agreement with this statement.
              </p>
            </div>

            {/* Scale Options (1 to 5) */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 pt-2">
              {SCALE_LABELS.map(opt => {
                const isSelected = answers[currentQ.id] === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelectScore(currentQ.id, opt.value)}
                    className={`flex sm:flex-col items-center sm:justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer text-left sm:text-center ${
                      isSelected
                        ? 'border-violet-600 bg-violet-50/80 dark:bg-violet-950/50 shadow-md ring-2 ring-violet-600/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-violet-300 dark:hover:border-violet-700 bg-slate-50/50 dark:bg-slate-800/40'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm mb-0 sm:mb-2 mr-3 sm:mr-0 shrink-0 transition ${
                      isSelected
                        ? 'bg-violet-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}>
                      {opt.value}
                    </div>
                    <div>
                      <div className={`text-xs font-bold ${
                        isSelected ? 'text-violet-900 dark:text-violet-200' : 'text-slate-800 dark:text-slate-200'
                      }`}>
                        {opt.label}
                      </div>
                      <div className="text-[10px] text-slate-400 hidden sm:block mt-0.5">
                        {opt.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Navigation Controls */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
              <button
                type="button"
                disabled={currentQuestionIndex === 0}
                onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 dark:text-slate-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              <div className="flex items-center gap-2">
                {currentQuestionIndex < totalQuestions - 1 ? (
                  <button
                    type="button"
                    onClick={() => setCurrentQuestionIndex(prev => Math.min(totalQuestions - 1, prev + 1))}
                    className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <span>Next</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : answeredCount < totalQuestions ? (
                  <button
                    type="button"
                    onClick={jumpToFirstUnanswered}
                    className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-amber-600/20 transition cursor-pointer"
                  >
                    <AlertCircle className="w-4 h-4" />
                    <span>Go to Unanswered ({totalQuestions - answeredCount} left)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleFinalSubmit}
                    className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition cursor-pointer"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Analyzing Personality...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Submit & View Results</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Unanswered Statements Warning Banner */}
            {unansweredQuestions.length > 0 && (currentQuestionIndex === totalQuestions - 1 || validationWarning) && (
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-900 dark:text-amber-200 animate-in fade-in">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-black uppercase tracking-wider">
                      {unansweredQuestions.length} Unanswered {unansweredQuestions.length === 1 ? 'Statement' : 'Statements'} Remaining
                    </div>
                    <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                      All {totalQuestions} statements must be answered to determine your MBTI personality type. Missing: {unansweredQuestions.slice(0, 7).map(q => `#${q.id}`).join(', ')}{unansweredQuestions.length > 7 ? ` +${unansweredQuestions.length - 7} more` : ''}.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={jumpToFirstUnanswered}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0 shadow-md transition cursor-pointer"
                >
                  <span>Go to Question #{unansweredQuestions[0]?.id}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Quick Jump Matrix */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <span>Question Quick Jump:</span>
                {unansweredQuestions.length > 0 && (
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800/40">
                    {unansweredQuestions.length} remaining
                  </span>
                )}
              </span>
              {answeredCount === totalQuestions ? (
                <button
                  type="button"
                  onClick={handleFinalSubmit}
                  disabled={submitting}
                  className="text-xs font-black text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Ready to submit ({answeredCount}/{totalQuestions})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={jumpToFirstUnanswered}
                  className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Jump to next missing (#{unansweredQuestions[0]?.id})</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-7 sm:grid-cols-14 gap-1.5">
              {MBTI_QUESTIONS.map((q, idx) => {
                const isAnswered = answers[q.id] !== undefined;
                const isCurrent = currentQuestionIndex === idx;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentQuestionIndex(idx)}
                    className={`h-8 rounded-lg text-xs font-bold transition flex items-center justify-center cursor-pointer relative ${
                      isCurrent
                        ? 'ring-2 ring-violet-600 bg-violet-600 text-white font-black shadow-sm'
                        : isAnswered
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50'
                        : 'bg-amber-50/70 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/40 hover:bg-amber-100'
                    }`}
                    title={isAnswered ? `Question ${q.id} (Answered)` : `Question ${q.id} (Unanswered)`}
                  >
                    <span>{q.id}</span>
                    {!isAnswered && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 absolute top-1 right-1" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ─── Render Results Step ───────────────────────────────────────────────────
  const results = calculatedResults || (submittedResponse ? {
    mbtiType: submittedResponse.mbtiType,
    profile: MBTI_TYPE_PROFILES[submittedResponse.mbtiType] || MBTI_TYPE_PROFILES['ENFJ'],
    dimensionScores: submittedResponse.dimensionScores,
    traitPercentages: submittedResponse.traitPercentages
  } : null);

  const profile = results?.profile || MBTI_TYPE_PROFILES['ENFJ'];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 py-6 px-6 sm:px-12 print:hidden">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {church?.logoUrl ? (
              <img src={church.logoUrl} alt={church.name} className="h-10 w-auto object-contain rounded-lg" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center font-black shadow-md">
                <Brain className="w-5 h-5" />
              </div>
            )}
            <div>
              <h1 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                {church?.name || 'Myers-Briggs Assessment'}
              </h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Personality & Ministry Profile
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print / Save PDF</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-8 py-10 space-y-8">
        {/* Type Reveal Celebration Card */}
        <div className="bg-gradient-to-br from-violet-900 via-indigo-900 to-purple-900 text-white rounded-3xl p-6 sm:p-10 shadow-xl relative overflow-hidden space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-black uppercase tracking-wider">
            <Award className="w-3.5 h-3.5 text-amber-300" />
            <span>Personality Assessment Completed for {firstName} {lastName}</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-baseline gap-3">
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-white">
              {results?.mbtiType}
            </h2>
            <span className="text-xl sm:text-2xl font-bold text-amber-300">
              — {profile.name}
            </span>
          </div>

          <p className="text-violet-100 text-sm sm:text-base max-w-2xl leading-relaxed">
            {profile.tagline}
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-white/10 text-white border border-white/20 uppercase tracking-wider">
              Temperament: {profile.temperament}
            </span>
          </div>
        </div>

        {/* 4 Cognitive Dichotomies Percentage Breakdown */}
        {results?.traitPercentages && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                Your 4 Myers-Briggs Personality Dimensions
              </h3>
              <p className="text-xs text-slate-400">
                Detailed percentage breakdown across each cognitive pair.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Energy: Extraversion vs. Introversion */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex justify-between items-center text-xs font-black">
                  <span className={results.traitPercentages.energy.type === 'E' ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500'}>
                    Extraverted ({results.traitPercentages.energy.ePercent}%)
                  </span>
                  <span className={results.traitPercentages.energy.type === 'I' ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500'}>
                    Introverted ({results.traitPercentages.energy.iPercent}%)
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-3 rounded-full overflow-hidden flex">
                  <div 
                    className="h-full bg-violet-600 transition-all duration-500"
                    style={{ width: `${results.traitPercentages.energy.ePercent}%` }}
                  />
                  <div 
                    className="h-full bg-indigo-400 transition-all duration-500"
                    style={{ width: `${results.traitPercentages.energy.iPercent}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  Primary Source of Energy: <strong className="text-slate-700 dark:text-slate-200">{results.traitPercentages.energy.type === 'E' ? 'Extraversion' : 'Introversion'}</strong>
                </p>
              </div>

              {/* Information: Sensing vs. Intuition */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex justify-between items-center text-xs font-black">
                  <span className={results.traitPercentages.information.type === 'S' ? 'text-sky-600 dark:text-sky-400' : 'text-slate-500'}>
                    Sensing ({results.traitPercentages.information.sPercent}%)
                  </span>
                  <span className={results.traitPercentages.information.type === 'N' ? 'text-sky-600 dark:text-sky-400' : 'text-slate-500'}>
                    Intuition ({results.traitPercentages.information.nPercent}%)
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-3 rounded-full overflow-hidden flex">
                  <div 
                    className="h-full bg-sky-600 transition-all duration-500"
                    style={{ width: `${results.traitPercentages.information.sPercent}%` }}
                  />
                  <div 
                    className="h-full bg-cyan-400 transition-all duration-500"
                    style={{ width: `${results.traitPercentages.information.nPercent}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  Information Processing: <strong className="text-slate-700 dark:text-slate-200">{results.traitPercentages.information.type === 'S' ? 'Sensing (Concrete Details)' : 'Intuition (Big Picture & Patterns)'}</strong>
                </p>
              </div>

              {/* Decisions: Thinking vs. Feeling */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex justify-between items-center text-xs font-black">
                  <span className={results.traitPercentages.decisions.type === 'T' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}>
                    Thinking ({results.traitPercentages.decisions.tPercent}%)
                  </span>
                  <span className={results.traitPercentages.decisions.type === 'F' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}>
                    Feeling ({results.traitPercentages.decisions.fPercent}%)
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-3 rounded-full overflow-hidden flex">
                  <div 
                    className="h-full bg-amber-500 transition-all duration-500"
                    style={{ width: `${results.traitPercentages.decisions.tPercent}%` }}
                  />
                  <div 
                    className="h-full bg-pink-400 transition-all duration-500"
                    style={{ width: `${results.traitPercentages.decisions.fPercent}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  Decision Style: <strong className="text-slate-700 dark:text-slate-200">{results.traitPercentages.decisions.type === 'T' ? 'Thinking (Logic & Principles)' : 'Feeling (Empathy & Harmony)'}</strong>
                </p>
              </div>

              {/* Structure: Judging vs. Perceiving */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex justify-between items-center text-xs font-black">
                  <span className={results.traitPercentages.structure.type === 'J' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}>
                    Judging ({results.traitPercentages.structure.jPercent}%)
                  </span>
                  <span className={results.traitPercentages.structure.type === 'P' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}>
                    Perceiving ({results.traitPercentages.structure.pPercent}%)
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-3 rounded-full overflow-hidden flex">
                  <div 
                    className="h-full bg-emerald-600 transition-all duration-500"
                    style={{ width: `${results.traitPercentages.structure.jPercent}%` }}
                  />
                  <div 
                    className="h-full bg-teal-400 transition-all duration-500"
                    style={{ width: `${results.traitPercentages.structure.pPercent}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  Daily Structure: <strong className="text-slate-700 dark:text-slate-200">{results.traitPercentages.structure.type === 'J' ? 'Judging (Planned & Orderly)' : 'Perceiving (Flexible & Spontaneous)'}</strong>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Detailed Profile & Ministry Application */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white">
              Profile Overview: {profile.name}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
              {profile.fullDescription}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
            {/* Ministry Strengths */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Strengths in Ministry & Community</span>
              </h4>
              <div className="space-y-2">
                {profile.ministryStrengths.map((s, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 text-xs text-slate-700 dark:text-slate-300 font-medium flex items-start gap-2">
                    <span className="text-emerald-500 font-bold">•</span>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Growth Areas */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                <span>Areas for Spiritual & Team Growth</span>
              </h4>
              <div className="space-y-2">
                {profile.growthAreas.map((g, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 text-xs text-slate-700 dark:text-slate-300 font-medium flex items-start gap-2">
                    <span className="text-amber-500 font-bold">•</span>
                    <span>{g}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Communication Style */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
              <span>Communication Tendencies</span>
            </h4>
            <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
              {profile.communicationStyle}
            </p>
          </div>

          {/* Ideal Serving Roles */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
              Recommended Church Serving Areas for {results?.mbtiType}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {profile.idealServingRoles.map(role => (
                <div key={role} className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-700 dark:text-slate-300 font-medium">
                  <Check className="w-4 h-4 text-violet-600 shrink-0" />
                  <span>{role}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Retake Option */}
        <div className="text-center pt-4 print:hidden">
          <button
            type="button"
            onClick={() => {
              if (confirm('Would you like to reset and retake the assessment?')) {
                setAnswers({});
                setCurrentQuestionIndex(0);
                setStep('intro');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline cursor-pointer"
          >
            Retake Myers-Briggs Personality Assessment
          </button>
        </div>
      </main>
    </div>
  );
};
