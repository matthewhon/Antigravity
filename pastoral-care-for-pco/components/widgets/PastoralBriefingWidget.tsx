import React, { useState } from 'react';
import { Shield, Sparkles, BookOpen, Heart, Zap, Copy, Check, MessageSquare, Compass, ArrowUpRight } from 'lucide-react';
import { AssessmentAggregates } from '../../services/assessmentAnalyticsService';

interface PastoralBriefingWidgetProps {
  analytics: AssessmentAggregates | null;
  onNavigateToCare?: () => void;
}

export const PastoralBriefingWidget: React.FC<PastoralBriefingWidgetProps> = ({
  analytics,
  onNavigateToCare
}) => {
  const [copied, setCopied] = useState(false);

  if (!analytics || analytics.totalAssessmentsCount === 0) {
    return (
      <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-900/90 via-slate-900 to-slate-950 text-white border border-indigo-500/30 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-md">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black">Pastoral Strategic Intelligence Briefing</h3>
              <p className="text-xs text-indigo-200/80">Synthesized Preaching & Leadership Alignment</p>
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          As congregation members complete the Spiritual Gifts, Faith-Based DISC, and MBTI assessments, this executive briefing synthesizes the church's collective culture, communication sweet-spots, and shepherding recommendations for the pastoral team.
        </p>
      </div>
    );
  }

  const { briefing, disc, gifts, mbti, totalAssessmentsCount } = analytics;

  const handleCopy = () => {
    const text = [
      `=== PASTORAL STRATEGIC BRIEFING (${totalAssessmentsCount} ASSESSMENTS) ===`,
      '',
      `• PREACHING & TEACHING TONE:`,
      briefing.preachingToneAdvice,
      '',
      `• VISION CASTING & CULTURE:`,
      briefing.visionCastingStrategy,
      '',
      `• CHANGE MANAGEMENT GUIDELINE:`,
      briefing.changeManagementGuideline,
      '',
      `• FELLOWSHIP & SMALL GROUPS:`,
      briefing.fellowshipAndSmallGroupStructure,
      '',
      `• CONGREGATIONAL BLIND SPOTS:`,
      ...briefing.topCongregationalBlindSpots.map(s => `- ${s}`),
      '',
      `• SCRIPTURE ANCHOR:`,
      `"${briefing.scriptureAnchor.text}" — ${briefing.scriptureAnchor.verse}`
    ].join('\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="p-6 sm:p-7 rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 text-white border border-indigo-500/30 shadow-xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-lg shadow-indigo-600/30 shrink-0">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-black tracking-tight">
                Pastoral Strategic Briefing
              </h3>
              <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {totalAssessmentsCount} Assessments Synthesized
              </span>
            </div>
            <p className="text-xs text-indigo-200/70 mt-0.5">
              Actionable shepherding, preaching tone, and leadership alignment tailored to your flock.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold text-white flex items-center gap-1.5 transition cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied Briefing!' : 'Copy Briefing'}</span>
        </button>
      </div>

      {/* 3 Core Pastoral Pillars Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Preaching & Tone */}
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
          <div className="flex items-center gap-2 text-indigo-300">
            <BookOpen className="w-4 h-4" />
            <h4 className="text-xs font-black uppercase tracking-wider">Preaching & Vision Tone</h4>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {briefing.preachingToneAdvice}
          </p>
        </div>

        {/* Change Management */}
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
          <div className="flex items-center gap-2 text-emerald-300">
            <Zap className="w-4 h-4" />
            <h4 className="text-xs font-black uppercase tracking-wider">Change Management</h4>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {briefing.changeManagementGuideline}
          </p>
        </div>

        {/* Fellowship & Discipleship */}
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
          <div className="flex items-center gap-2 text-pink-300">
            <Heart className="w-4 h-4" />
            <h4 className="text-xs font-black uppercase tracking-wider">Small Groups & Fellowship</h4>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {briefing.fellowshipAndSmallGroupStructure}
          </p>
        </div>
      </div>

      {/* Blind Spots & Scripture Anchor Footer */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-white/10">
        <div className="space-y-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 block">
            Congregational Blind Spots & Watchouts
          </span>
          <ul className="space-y-1 text-xs text-slate-300">
            {briefing.topCongregationalBlindSpots.map((spot, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="text-amber-400 font-bold">•</span>
                <span>{spot}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-3.5 rounded-2xl bg-indigo-950/60 border border-indigo-500/20 space-y-1">
          <span className="text-[9px] font-black uppercase tracking-wider text-indigo-300 block">
            Pastoral Scripture Anchor
          </span>
          <p className="text-xs italic text-indigo-100 font-serif leading-snug">
            “{briefing.scriptureAnchor.text}”
          </p>
          <p className="text-[10px] font-bold text-indigo-300 text-right">
            — {briefing.scriptureAnchor.verse}
          </p>
        </div>
      </div>
    </div>
  );
};
