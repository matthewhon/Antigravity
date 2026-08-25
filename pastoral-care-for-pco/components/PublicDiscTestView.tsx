import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Compass, Check, ArrowRight, ArrowLeft, RefreshCw, Printer, 
  Sparkles, Award, BookOpen, Heart, User, Shield, Users, 
  CheckCircle2, AlertCircle, Share2, HelpCircle, ChevronRight,
  Flame, Target, Scale, Zap, Info, Loader2, ExternalLink
} from 'lucide-react';
import { 
  DISC_QUESTIONS,
  DISC_PROFILES,
  DISC_DIMENSIONS_INFO,
  calculateDiscScores,
  DiscCalculationResult,
  DiscDimension
} from '../constants/discTestData';
import { firestore } from '../services/firestoreService';
import { Church, DiscTestResponse } from '../types';

interface PublicDiscTestViewProps {
  churchId: string;
}

const SCALE_LABELS = [
  { value: 1, label: 'Rarely / Never', desc: 'Does not describe me' },
  { value: 2, label: 'Occasionally', desc: 'Seldom like me' },
  { value: 3, label: 'Sometimes', desc: 'Moderately like me' },
  { value: 4, label: 'Often', desc: 'Usually describes me' },
  { value: 5, label: 'Consistently', desc: 'Strongly describes me' }
];

export const PublicDiscTestView: React.FC<PublicDiscTestViewProps> = ({ churchId }) => {
  const [church, setChurch] = useState<Church | null>(null);
  const [loadingChurch, setLoadingChurch] = useState(true);

  // Flow steps: 'intro' | 'info' | 'questions' | 'results'
  const [step, setStep] = useState<'intro' | 'info' | 'questions' | 'results'>('intro');

  // Test taker information (supports pre-fill via query params)
  const [personId, setPersonId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Assessment answers: 1-28 statement ID -> score (1-5)
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [validationWarning, setValidationWarning] = useState<string | null>(null);

  // Results state
  const [calculatedResults, setCalculatedResults] = useState<DiscCalculationResult | null>(null);
  const [submittedResponse, setSubmittedResponse] = useState<DiscTestResponse | null>(null);

  const questionCardRef = useRef<HTMLDivElement | null>(null);
  const advanceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
      }
    };
  }, []);

  // Parse URL query parameters
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const qPersonId = params.get('personId');
      const qName = params.get('name');
      const qEmail = params.get('email');
      const qPhone = params.get('phone');

      if (qPersonId) setPersonId(qPersonId);
      if (qName) {
        const parts = qName.trim().split(' ');
        setFirstName(parts[0] || '');
        setLastName(parts.slice(1).join(' ') || '');
      }
      if (qEmail) setEmail(qEmail);
      if (qPhone) setPhone(qPhone);
    }
  }, []);

  // Fetch church info
  useEffect(() => {
    async function loadChurch() {
      if (!churchId) {
        setLoadingChurch(false);
        return;
      }
      try {
        const data = await firestore.getChurch(churchId);
        setChurch(data);
      } catch (err) {
        console.warn('Could not load church details:', err);
      } finally {
        setLoadingChurch(false);
      }
    }
    loadChurch();
  }, [churchId]);

  const totalQuestions = DISC_QUESTIONS.length; // 28
  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const progressPercent = Math.round((answeredCount / totalQuestions) * 100);

  const unansweredQuestions = useMemo(() => {
    return DISC_QUESTIONS.filter(q => answers[q.id] === undefined);
  }, [answers]);

  const goToQuestion = (idx: number) => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
    }
    const safeIdx = Math.max(0, Math.min(totalQuestions - 1, idx));
    setCurrentQuestionIndex(safeIdx);
    if (questionCardRef.current) {
      questionCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const jumpToFirstUnanswered = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
    }
    const firstMissingIdx = DISC_QUESTIONS.findIndex(q => answers[q.id] === undefined);
    if (firstMissingIdx !== -1) {
      setCurrentQuestionIndex(firstMissingIdx);
      setValidationWarning(`Jumping to unanswered statement #${DISC_QUESTIONS[firstMissingIdx].id}...`);
      setTimeout(() => setValidationWarning(null), 3500);
      if (questionCardRef.current) {
        questionCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  const safeIndex = Math.max(0, Math.min(totalQuestions - 1, currentQuestionIndex));
  const currentQ = DISC_QUESTIONS[safeIndex] || DISC_QUESTIONS[0];

  const handleSelectScore = (questionId: number, score: number) => {
    setAnswers(prev => ({ ...prev, [questionId]: score }));

    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
    }

    // Auto advance smoothly to next statement after brief delay
    advanceTimerRef.current = setTimeout(() => {
      setCurrentQuestionIndex(prev => Math.min(totalQuestions - 1, prev + 1));
      if (questionCardRef.current) {
        questionCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 200);
  };

  const handleFinalSubmit = async () => {
    if (answeredCount < totalQuestions) {
      jumpToFirstUnanswered();
      return;
    }

    setSubmitting(true);
    try {
      const results = calculateDiscScores(answers);
      setCalculatedResults(results);

      const responseId = `disc_resp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim() || 'Anonymous Participant';

      const responseRecord: DiscTestResponse = {
        id: responseId,
        churchId,
        personId: personId || null,
        personName: fullName,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || null,
        answers,
        styleCode: results.styleCode,
        styleName: results.profile.name,
        primaryDimension: results.primaryDimension,
        secondaryDimension: results.secondaryDimension,
        scores: results.scores,
        percentages: results.percentages,
        submittedAt: Date.now()
      };

      await firestore.saveDiscResponse(responseRecord);
      setSubmittedResponse(responseRecord);
      setStep('results');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      console.error('Error saving DISC assessment response:', err);
      alert('An error occurred while saving your test. Your results are displayed on screen.');
      setStep('results');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // ─── Step 1: Render Intro ──────────────────────────────────────────────────
  if (step === 'intro') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans">
        {/* Header */}
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 py-6 px-6 sm:px-12">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              {church?.logoUrl ? (
                <img src={church.logoUrl} alt={church.name} className="h-10 w-auto object-contain rounded-lg" />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black shadow-md">
                  <Compass className="w-5 h-5" />
                </div>
              )}
              <div>
                <h1 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  {church?.name || 'Faith-Based DISC Assessment'}
                </h1>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  King James Version (KJV) & Baptist Distinctives
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Hero & Intro Content */}
        <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-8 py-10 space-y-8">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-10 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-800/60 text-xs font-black uppercase tracking-wider">
              <Compass className="w-3.5 h-3.5 text-emerald-600" />
              <span>Biblical Personality & Ministry Style</span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
              Understanding God’s Divine Design in You
            </h2>

            <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              The Bible teaches that God created every member of the body of Christ with intentional temperament, unique giftings, and a purposeful role in the local church. When we understand how the Lord has wired us, we can serve Him with greater joy, build up our brothers and sisters in Christ, and minister with deeper fruitfulness.
            </p>

            {/* Scripture Callout (KJV) */}
            <div className="p-5 sm:p-6 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border-l-4 border-emerald-600 space-y-2">
              <p className="text-sm sm:text-base italic text-emerald-950 dark:text-emerald-200 font-serif leading-relaxed">
                “Now there are diversities of gifts, but the same Spirit. And there are differences of administrations, but the same Lord. And there are diversities of operations, but it is the same God which worketh all in all. But the manifestation of the Spirit is given to every man to profit withal.”
              </p>
              <p className="text-xs font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider text-right">
                — 1 Corinthians 12:4–7 (KJV)
              </p>
            </div>

            {/* The 4 Biblical DISC Dimensions */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-emerald-600" />
                <span>The 4 Faith-Based DISC Dimensions</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                {/* D */}
                <div className="p-4 rounded-2xl bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-red-600 text-white font-black text-xs flex items-center justify-center">D</span>
                    <h4 className="text-xs font-black text-red-900 dark:text-red-200">Dominance (Decisive & Driving)</h4>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Bold, goal-driven leaders like <strong>Nehemiah</strong> and <strong>Paul</strong> who overcome obstacles and contend for the faith (1 Cor 16:13 KJV).
                  </p>
                </div>

                {/* I */}
                <div className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-amber-500 text-white font-black text-xs flex items-center justify-center">I</span>
                    <h4 className="text-xs font-black text-amber-900 dark:text-amber-200">Influence (Inspiring & Interactive)</h4>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Enthusiastic, relational encouragers like <strong>Barnabas</strong> and <strong>Peter</strong> who share the Gospel warmly (Prov 18:24 KJV).
                  </p>
                </div>

                {/* S */}
                <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-emerald-600 text-white font-black text-xs flex items-center justify-center">S</span>
                    <h4 className="text-xs font-black text-emerald-900 dark:text-emerald-200">Steadiness (Supportive & Stable)</h4>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Faithful, patient servants like <strong>Ruth</strong> and <strong>Timothy</strong> who provide quiet, steadfast loyalty in the church (1 Cor 15:58 KJV).
                  </p>
                </div>

                {/* C */}
                <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-blue-600 text-white font-black text-xs flex items-center justify-center">C</span>
                    <h4 className="text-xs font-black text-blue-900 dark:text-blue-200">Conscientiousness (Careful & Discerning)</h4>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Analytical, doctrinally sound stewards like <strong>Luke</strong> and <strong>Ezra</strong> who ensure all things are done in order (2 Tim 2:15 KJV).
                  </p>
                </div>
              </div>
            </div>

            {/* Test Details Card */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-2xl bg-slate-100 dark:bg-slate-800">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
                  <Shield className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    28 Statements • 5 Minutes
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Rate each statement honestly on a scale of 1 to 5 based on how you naturally operate.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setStep('info')}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition cursor-pointer"
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

  // ─── Step 2: Render Info Entry ─────────────────────────────────────────────
  if (step === 'info') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans">
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 py-6 px-6 sm:px-12">
          <div className="max-w-xl mx-auto flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                {church?.name || 'Faith-Based DISC Assessment'}
              </h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Step 1 of 2: Participant Information
              </p>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-xl mx-auto w-full px-4 sm:px-6 py-10">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">
                Who is taking the assessment?
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Your results will be calculated and linked to your pastoral care profile.
              </p>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                if (!firstName.trim() || !lastName.trim() || !email.trim()) {
                  alert('Please provide your first name, last name, and email address.');
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
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white text-sm focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 outline-none transition"
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
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white text-sm focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 outline-none transition"
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
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white text-sm focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 outline-none transition"
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
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white text-sm focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 outline-none transition"
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
                  className="px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-md transition cursor-pointer"
                >
                  <span>Start Statements</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </main>
      </div>
    );
  }

  // ─── Step 3: Render Questions ──────────────────────────────────────────────
  if (step === 'questions') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans">
        {/* Sticky Header & Progress */}
        <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 py-4 px-4 sm:px-8">
          <div className="max-w-3xl mx-auto space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
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

            {/* Progress Bar */}
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-emerald-600 h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </header>

        {/* Main Question Card Area */}
        <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-8 py-8 space-y-6">
          <div 
            ref={questionCardRef}
            className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-10 border border-slate-200 dark:border-slate-800 shadow-sm space-y-8 animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Statement Header and Text */}
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold uppercase tracking-wider">
                  <span>Statement #{currentQ.id}</span>
                  <span className="text-slate-400">•</span>
                  <span>{currentQ.trait}</span>
                </div>

                <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  {currentQ.kjvReference}
                </div>
              </div>

              <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 dark:text-white leading-relaxed">
                “{currentQ.text}”
              </h3>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 italic">
                Biblical context: {currentQ.biblicalContext}
              </div>
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
                        ? 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/50 shadow-md ring-2 ring-emerald-600/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700 bg-slate-50/50 dark:bg-slate-800/40'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm mb-0 sm:mb-2 mr-3 sm:mr-0 shrink-0 transition ${
                      isSelected
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}>
                      {opt.value}
                    </div>
                    <div>
                      <div className={`text-xs font-bold ${
                        isSelected ? 'text-emerald-900 dark:text-emerald-200' : 'text-slate-800 dark:text-slate-200'
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
                disabled={safeIndex === 0}
                onClick={() => goToQuestion(safeIndex - 1)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 dark:text-slate-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              <div className="flex items-center gap-2">
                {safeIndex < totalQuestions - 1 ? (
                  <button
                    type="button"
                    onClick={() => goToQuestion(safeIndex + 1)}
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
                        <span>Calculating Ministry Style...</span>
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
            {unansweredQuestions.length > 0 && (safeIndex === totalQuestions - 1 || validationWarning) && (
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-900 dark:text-amber-200 animate-in fade-in">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-black uppercase tracking-wider">
                      {unansweredQuestions.length} Unanswered {unansweredQuestions.length === 1 ? 'Statement' : 'Statements'} Remaining
                    </div>
                    <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                      All {totalQuestions} statements must be answered to calculate your DISC ministry profile. Missing: {unansweredQuestions.slice(0, 7).map(q => `#${q.id}`).join(', ')}{unansweredQuestions.length > 7 ? ` +${unansweredQuestions.length - 7} more` : ''}.
                    </p>
                  </div>
                </div>
                {unansweredQuestions[0] && (
                  <button
                    type="button"
                    onClick={jumpToFirstUnanswered}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0 shadow-md transition cursor-pointer"
                  >
                    <span>Go to Statement #{unansweredQuestions[0].id}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Quick Jump Matrix */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <span>Statement Quick Jump:</span>
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
                  <span>Jump to next missing {unansweredQuestions[0] ? `(#${unansweredQuestions[0].id})` : ''}</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-7 sm:grid-cols-14 gap-1.5">
              {DISC_QUESTIONS.map((q, idx) => {
                const isAnswered = answers[q.id] !== undefined;
                const isCurrent = safeIndex === idx;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => goToQuestion(idx)}
                    className={`h-8 rounded-lg text-xs font-bold transition flex items-center justify-center cursor-pointer relative ${
                      isCurrent
                        ? 'ring-2 ring-emerald-600 bg-emerald-600 text-white font-black shadow-sm'
                        : isAnswered
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50'
                        : 'bg-amber-50/70 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/40 hover:bg-amber-100'
                    }`}
                    title={isAnswered ? `Statement ${q.id} (Answered)` : `Statement ${q.id} (Unanswered)`}
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

  // ─── Step 4: Render Results ────────────────────────────────────────────────
  const results = calculatedResults || (submittedResponse ? {
    scores: submittedResponse.scores,
    maxScorePerDimension: 35,
    percentages: submittedResponse.percentages,
    primaryDimension: submittedResponse.primaryDimension,
    secondaryDimension: submittedResponse.secondaryDimension,
    styleCode: submittedResponse.styleCode,
    profile: DISC_PROFILES[submittedResponse.styleCode] || DISC_PROFILES[submittedResponse.primaryDimension] || DISC_PROFILES['D']
  } : null);

  if (!results) {
    return <div className="p-8 text-center text-slate-500">No results found.</div>;
  }

  const profile = results.profile;
  const takerName = submittedResponse?.personName || `${firstName} ${lastName}`.trim() || 'Participant';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans print:bg-white print:text-black">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 py-6 px-6 sm:px-12 print:hidden">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black shadow-md">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                {church?.name || 'Faith-Based DISC Profile'}
              </h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Biblical Temperament & Ministry Style
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-2 transition cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print / Save PDF</span>
          </button>
        </div>
      </header>

      {/* Main Results Body */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-8 py-10 space-y-8 print:p-0 print:space-y-6">
        {/* Hero Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-10 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Official Ministry Assessment
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                {takerName}’s Biblical DISC Profile
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <div 
                className="px-4 py-2 rounded-2xl text-white font-black text-xl tracking-wider shadow-md flex items-center gap-2"
                style={{ backgroundColor: profile.color }}
              >
                <span>{profile.code}</span>
              </div>
            </div>
          </div>

          {/* Profile Name & Summary */}
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider"
              style={{ backgroundColor: `${profile.color}15`, color: profile.color }}
            >
              <Award className="w-3.5 h-3.5" />
              <span>{profile.name}</span>
            </div>

            <p className="text-base sm:text-lg text-slate-700 dark:text-slate-200 font-medium leading-relaxed">
              {profile.summary}
            </p>

            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {profile.fullDescription}
            </p>
          </div>

          {/* Theme Scripture Verse (KJV) */}
          <div className="p-5 sm:p-6 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border-l-4 border-emerald-600 space-y-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Anchoring Scripture (King James Version)
            </span>
            <p className="text-sm sm:text-base italic text-emerald-950 dark:text-emerald-200 font-serif leading-relaxed">
              “{profile.themeVerseKjv.text}”
            </p>
            <p className="text-xs font-black text-emerald-800 dark:text-emerald-400 text-right">
              — {profile.themeVerseKjv.verse}
            </p>
          </div>

          {/* 4 Dimension Percentage Sliders */}
          <div className="space-y-4 pt-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-600" />
              <span>Your 4 Dimension Distribution</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(['D', 'I', 'S', 'C'] as DiscDimension[]).map(dim => {
                const info = DISC_DIMENSIONS_INFO[dim];
                const score = results.scores[dim];
                const pct = results.percentages[dim];
                const isPrimary = results.primaryDimension === dim;
                const isSecondary = results.secondaryDimension === dim;

                return (
                  <div key={dim} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span 
                          className="w-6 h-6 rounded-md text-white font-black text-xs flex items-center justify-center shrink-0"
                          style={{ backgroundColor: info.color }}
                        >
                          {dim}
                        </span>
                        <div>
                          <span className="text-xs font-bold text-slate-900 dark:text-white">{info.name.split(' ')[0]}</span>
                          {isPrimary && (
                            <span className="ml-1.5 text-[10px] font-black uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                              Primary
                            </span>
                          )}
                          {isSecondary && (
                            <span className="ml-1.5 text-[10px] font-black uppercase px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                              Secondary
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs font-black text-slate-900 dark:text-white font-mono">
                        {pct}% ({score}/35)
                      </span>
                    </div>

                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(5, pct)}%`, backgroundColor: info.color }}
                      />
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                      {info.motto}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Biblical Exemplar Model */}
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Biblical Model & Character Archetype
            </span>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>{profile.biblicalExemplar.name}</span>
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {profile.biblicalExemplar.description}
            </p>
            <p className="text-xs italic text-slate-500 dark:text-slate-400 pt-1">
              {profile.biblicalExemplar.kjvPassage}
            </p>
          </div>

          {/* Baptist Ministry Strengths & Serving Recommendations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Ministry Strengths */}
            <div className="p-5 rounded-2xl bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Baptist Ministry Strengths</span>
              </h4>
              <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                {profile.baptistMinistryStrengths.map((s, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-emerald-600 font-bold">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Ideal Church Serving Roles */}
            <div className="p-5 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-indigo-800 dark:text-indigo-300 flex items-center gap-2">
                <Target className="w-4 h-4 text-indigo-600" />
                <span>Recommended Church Serving Areas</span>
              </h4>
              <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                {profile.idealServingRoles.map((r, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-indigo-600 font-bold">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Spiritual Growth & Communication */}
          <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="p-5 rounded-2xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 space-y-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <Heart className="w-4 h-4 text-amber-600" />
                <span>Spiritual Growth & Sanctification Focus</span>
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                {profile.spiritualGrowthAreas.map((g, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-amber-600 font-bold">•</span>
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start gap-3">
              <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Communication with Brethren
                </span>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  {profile.communicationTips}
                </p>
              </div>
            </div>
          </div>

          {/* Footer Note */}
          <div className="text-center pt-4 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-400">
              Scriptures taken from the King James Version (KJV). Recorded for {church?.name || 'Pastoral Care'}.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};
