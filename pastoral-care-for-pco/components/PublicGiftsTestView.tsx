import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Sparkles, Award, CheckCircle2, ArrowRight, ArrowLeft,
  ChevronRight, RefreshCw, Printer, BookOpen, Heart, 
  HelpCircle, Check, Loader2, Share2, Info, Star, Compass
} from 'lucide-react';
import { firestore } from '../services/firestoreService';
import { Church, GiftsTestResponse, SpiritualGiftType } from '../types';
import { 
  SPIRITUAL_GIFTS_QUESTIONS, 
  SPIRITUAL_GIFTS_DEFINITIONS,
  SPIRITUAL_GIFTS_SCRIPTURES,
  calculateSpiritualGifts,
  CalculatedGiftsResult
} from '../constants/spiritualGiftsTestData';

interface PublicGiftsTestViewProps {
  churchId: string;
  testId?: string;
  isEmbedded?: boolean;
}

const SCALE_LABELS = [
  { value: 1, label: 'Rarely / Never', desc: 'Almost never applies to me' },
  { value: 2, label: 'Seldom', desc: 'Occasionally true' },
  { value: 3, label: 'Sometimes', desc: 'Moderately true in my life' },
  { value: 4, label: 'Usually', desc: 'Frequently true for me' },
  { value: 5, label: 'Consistently', desc: 'Strongly & consistently true' },
];

export const PublicGiftsTestView: React.FC<PublicGiftsTestViewProps> = ({ churchId, isEmbedded }) => {
  const [church, setChurch] = useState<Church | null>(null);
  const [loadingChurch, setLoadingChurch] = useState(true);
  const [step, setStep] = useState<'intro' | 'info' | 'questions' | 'results'>('intro');

  // Respondent info
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [personId, setPersonId] = useState<string | null>(null);

  // Assessment answers: questionId (1-42) -> value (1-5)
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [activeTabGift, setActiveTabGift] = useState<SpiritualGiftType>('Helps');

  // Submitting / Result state
  const [submitting, setSubmitting] = useState(false);
  const [submittedResponse, setSubmittedResponse] = useState<GiftsTestResponse | null>(null);
  const [calculatedResults, setCalculatedResults] = useState<CalculatedGiftsResult | null>(null);

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

  const totalQuestions = SPIRITUAL_GIFTS_QUESTIONS.length; // 42
  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const progressPercent = Math.round((answeredCount / totalQuestions) * 100);

  const currentQ = SPIRITUAL_GIFTS_QUESTIONS[currentQuestionIndex] || SPIRITUAL_GIFTS_QUESTIONS[0];

  const handleSelectScore = (questionId: number, score: number) => {
    setAnswers(prev => ({ ...prev, [questionId]: score }));

    // Auto advance smoothly to next unanswered question after a brief delay
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
      alert(`Please answer all ${totalQuestions} questions before submitting (currently answered ${answeredCount}/${totalQuestions}).`);
      return;
    }

    setSubmitting(true);
    try {
      const results = calculateSpiritualGifts(answers);
      setCalculatedResults(results);
      setActiveTabGift(results.primaryGift);

      const responseId = `gift_resp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim() || 'Anonymous Participant';

      const responseRecord: GiftsTestResponse = {
        id: responseId,
        churchId,
        personId: personId || null,
        personName: fullName,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || null,
        answers,
        scores: results.scores,
        primaryGift: results.primaryGift,
        secondaryGift: results.secondaryGift,
        rankedGifts: results.rankedGifts,
        submittedAt: Date.now()
      };

      await firestore.saveGiftsTestResponse(responseRecord);
      setSubmittedResponse(responseRecord);
      setStep('results');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      console.error('Error saving spiritual gifts response:', err);
      alert('An error occurred while saving your test. Your results are displayed on screen.');
      setStep('results');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // ─── Render Intro ──────────────────────────────────────────────────────────
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
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-md">
                  <Sparkles className="w-5 h-5" />
                </div>
              )}
              <div>
                <h1 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  {church?.name || 'Spiritual Gifts Assessment'}
                </h1>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Discover How God Has Gifted You
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Hero & Intro Content */}
        <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-8 py-10 space-y-8">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-10 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800/60 text-xs font-black uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Spiritual Gifts Test</span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
              An Explanation of Spiritual Gifts
            </h2>

            <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              When you accepted Christ, you not only got saved… you were given something very special from God. You were given a giftedness to serve God in a unique way. God’s plan for your life is that you would meet a specific need in the church family, and He has gifted you in a special way to meet that need.
            </p>

            {/* Scripture Highlight Box */}
            <div className="p-5 sm:p-6 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border-l-4 border-indigo-600 space-y-2">
              <p className="text-sm sm:text-base italic text-indigo-950 dark:text-indigo-200 font-serif leading-relaxed">
                {SPIRITUAL_GIFTS_SCRIPTURES.firstPeter.text}
              </p>
              <p className="text-xs font-black text-indigo-700 dark:text-indigo-400 uppercase tracking-wider text-right">
                — {SPIRITUAL_GIFTS_SCRIPTURES.firstPeter.verse}
              </p>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              If you have trusted Christ, then you have a spiritual gift! Even if you don’t know what it is or don’t feel particularly gifted in a specific area, the Bible teaches that you do have a special gift that you can use to serve God. And, believe it or not, your gift is vital to the work of God in our church family.
            </p>

            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
              <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                <span>The 6 Spiritual Gifts in this Survey (Romans 12:6–8)</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                {Object.values(SPIRITUAL_GIFTS_DEFINITIONS).map(g => (
                  <div key={g.name} className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">{g.name}</h4>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                      {g.shortDescription}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Test Details Card */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-2xl bg-slate-100 dark:bg-slate-800">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <Compass className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">42 Quick Assessment Questions</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Takes approximately 5–7 minutes to complete.</p>
                </div>
              </div>
              <button
                onClick={() => setStep('info')}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
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
                Your name and email allow us to save your results and send you a copy of your spiritual gifts profile.
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
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none transition"
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
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none transition"
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
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none transition"
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
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none transition"
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
                  className="px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-md transition cursor-pointer"
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

  // ─── Render Questions ──────────────────────────────────────────────────────
  if (step === 'questions') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans">
        {/* Sticky Header & Progress */}
        <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 py-4 px-4 sm:px-8">
          <div className="max-w-3xl mx-auto space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                  Question {currentQuestionIndex + 1} of {totalQuestions}
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
                className="bg-indigo-600 h-full rounded-full transition-all duration-300 ease-out"
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
            {/* Question Number and Prompt */}
            <div className="space-y-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold uppercase tracking-wider">
                <span>Statement #{currentQ.id}</span>
              </div>
              <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 dark:text-white leading-relaxed">
                “{currentQ.text}”
              </h3>
              <p className="text-xs text-slate-400">
                Rate how accurately this statement describes you on a scale of 1 to 5.
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
                        ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/50 shadow-md ring-2 ring-indigo-600/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 bg-slate-50/50 dark:bg-slate-800/40'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm mb-0 sm:mb-2 mr-3 sm:mr-0 shrink-0 transition ${
                      isSelected
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}>
                      {opt.value}
                    </div>
                    <div>
                      <div className={`text-xs font-bold ${
                        isSelected ? 'text-indigo-900 dark:text-indigo-200' : 'text-slate-800 dark:text-slate-200'
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
                ) : (
                  <button
                    type="button"
                    disabled={submitting || answeredCount < totalQuestions}
                    onClick={handleFinalSubmit}
                    className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition cursor-pointer"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Calculating Scores...</span>
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
          </div>

          {/* Quick Jump Matrix */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Question Quick Jump:
              </span>
              {answeredCount === totalQuestions && (
                <button
                  type="button"
                  onClick={handleFinalSubmit}
                  disabled={submitting}
                  className="text-xs font-black text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Ready to submit ({answeredCount}/{totalQuestions})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-7 sm:grid-cols-14 gap-1.5">
              {SPIRITUAL_GIFTS_QUESTIONS.map((q, idx) => {
                const isAnswered = answers[q.id] !== undefined;
                const isCurrent = currentQuestionIndex === idx;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentQuestionIndex(idx)}
                    className={`h-8 rounded-lg text-xs font-bold transition flex items-center justify-center cursor-pointer ${
                      isCurrent
                        ? 'ring-2 ring-indigo-600 bg-indigo-600 text-white font-black'
                        : isAnswered
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    {q.id}
                  </button>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ─── Render Results ────────────────────────────────────────────────────────
  const results = calculatedResults || (submittedResponse ? {
    scores: submittedResponse.scores,
    primaryGift: submittedResponse.primaryGift,
    secondaryGift: submittedResponse.secondaryGift,
    rankedGifts: submittedResponse.rankedGifts
  } : null);

  const activeDef = results ? SPIRITUAL_GIFTS_DEFINITIONS[activeTabGift] : null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 py-6 px-6 sm:px-12 print:hidden">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {church?.logoUrl ? (
              <img src={church.logoUrl} alt={church.name} className="h-10 w-auto object-contain rounded-lg" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-md">
                <Sparkles className="w-5 h-5" />
              </div>
            )}
            <div>
              <h1 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                {church?.name || 'Spiritual Gifts Profile'}
              </h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Official Assessment Results
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

      {/* Main Results Container */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-8 py-10 space-y-8">
        {/* Celebration Banner */}
        <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-violet-900 text-white rounded-3xl p-6 sm:p-10 shadow-xl relative overflow-hidden">
          <div className="relative z-10 space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-black uppercase tracking-wider">
              <Award className="w-3.5 h-3.5 text-amber-300" />
              <span>Assessment Completed for {firstName} {lastName}</span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
              Your Primary Spiritual Gift is <span className="text-amber-300 underline decoration-amber-400 decoration-wavy underline-offset-8">{results?.primaryGift}</span>
            </h2>

            <p className="text-indigo-100 text-sm sm:text-base max-w-2xl leading-relaxed">
              {results ? SPIRITUAL_GIFTS_DEFINITIONS[results.primaryGift].shortDescription : ''}
            </p>

            {results?.secondaryGift && (
              <div className="pt-2 flex items-center gap-2 text-xs text-indigo-200">
                <span className="font-black uppercase tracking-wider text-white">Secondary Gift:</span>
                <span className="px-2.5 py-0.5 rounded-full bg-white/10 font-bold text-amber-200">
                  {results.secondaryGift} ({results.scores[results.secondaryGift.toLowerCase() as keyof typeof results.scores]}/35)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Score Breakdown Table & Progress Bars */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                Spiritual Gifts Scoring Key Breakdown
              </h3>
              <p className="text-xs text-slate-400">
                Each category scored out of a maximum of 35 points (7 questions × 5 max points).
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {results?.rankedGifts.map((rg, idx) => {
              const def = SPIRITUAL_GIFTS_DEFINITIONS[rg.gift];
              const isSelected = activeTabGift === rg.gift;
              return (
                <div
                  key={rg.gift}
                  onClick={() => setActiveTabGift(rg.gift)}
                  className={`p-4 rounded-2xl border-2 transition cursor-pointer ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 shadow-sm'
                      : 'border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                        #{idx + 1}
                      </span>
                      <div>
                        <span className="text-sm font-black text-slate-900 dark:text-white">
                          {rg.gift}
                        </span>
                        {idx === 0 && (
                          <span className="ml-2 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                            Primary
                          </span>
                        )}
                        {idx === 1 && (
                          <span className="ml-2 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                            Secondary
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-base font-black text-slate-900 dark:text-white">
                        {rg.score}
                      </span>
                      <span className="text-xs text-slate-400"> / 35</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-bold ml-2">
                        ({rg.percentage}%)
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(5, rg.percentage)}%`,
                        backgroundColor: def.color
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Gift Deep Dive Card */}
        {activeDef && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div className="flex items-center gap-3">
              <div 
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md"
                style={{ backgroundColor: activeDef.color }}
              >
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white">
                  Gift Profile: {activeDef.name}
                </h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {activeDef.biblicalTitle}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-1">
                  Biblical Definition & Purpose
                </h4>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {activeDef.fullDescription}
                </p>
              </div>

              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
                  Scripture References
                </h4>
                <div className="flex flex-wrap gap-2">
                  {activeDef.scriptureReferences.map(ref => (
                    <span key={ref} className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold">
                      📖 {ref}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
                  Practical Ways to Serve with this Gift in Church
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {activeDef.recommendedServingAreas.map(area => (
                    <div key={area} className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-700 dark:text-slate-300 font-medium">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>{area}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Retake Button & Footer */}
        <div className="text-center pt-4 print:hidden">
          <button
            type="button"
            onClick={() => {
              if (confirm('Would you like to reset and retake the test?')) {
                setAnswers({});
                setCurrentQuestionIndex(0);
                setStep('intro');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline cursor-pointer"
          >
            Retake Spiritual Gifts Test
          </button>
        </div>
      </main>
    </div>
  );
};
