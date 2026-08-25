import React from 'react';
import { Brain, ArrowUpRight, Users } from 'lucide-react';
import { AssessmentAggregates } from '../../services/assessmentAnalyticsService';

interface MbtiTemperamentWidgetProps {
  analytics: AssessmentAggregates | null;
  onNavigateToMbti?: () => void;
}

export const MbtiTemperamentWidget: React.FC<MbtiTemperamentWidgetProps> = ({
  analytics,
  onNavigateToMbti
}) => {
  if (!analytics || analytics.mbtiCount === 0) {
    return (
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between h-full space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center font-bold">
              <Brain className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-black text-slate-900 dark:text-white">MBTI Temperaments</h4>
              <p className="text-[11px] text-slate-400">Cognitive & Social Energy Mix</p>
            </div>
          </div>
        </div>
        <div className="text-center py-6 space-y-2">
          <Users className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">No MBTI assessments completed yet.</p>
          {onNavigateToMbti && (
            <button
              type="button"
              onClick={onNavigateToMbti}
              className="text-xs font-bold text-violet-600 dark:text-violet-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Launch Assessment Campaign</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    );
  }

  const { mbti, mbtiCount } = analytics;

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between h-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center font-bold">
            <Brain className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-black text-slate-900 dark:text-white">MBTI Temperaments</h4>
            <p className="text-[11px] text-slate-400">{mbtiCount} Assessment{mbtiCount === 1 ? '' : 's'} Completed</p>
          </div>
        </div>

        {onNavigateToMbti && (
          <button
            type="button"
            onClick={onNavigateToMbti}
            className="text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Manage</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Energy & Decision-Making Sliders */}
      <div className="space-y-2">
        {/* Extravert vs Introvert */}
        <div className="space-y-1 text-[11px]">
          <div className="flex justify-between font-bold text-slate-700 dark:text-slate-300">
            <span className="text-violet-600 dark:text-violet-400">Extraverts (E): {mbti.extravertPercent}%</span>
            <span className="text-indigo-500 dark:text-indigo-400">Introverts (I): {mbti.introvertPercent}%</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden flex">
            <div className="h-full bg-violet-600" style={{ width: `${mbti.extravertPercent}%` }} />
            <div className="h-full bg-indigo-400" style={{ width: `${mbti.introvertPercent}%` }} />
          </div>
        </div>

        {/* Thinking vs Feeling */}
        <div className="space-y-1 text-[11px]">
          <div className="flex justify-between font-bold text-slate-700 dark:text-slate-300">
            <span className="text-amber-600 dark:text-amber-400">Thinking (T): {mbti.thinkingPercent}%</span>
            <span className="text-pink-500 dark:text-pink-400">Feeling (F): {mbti.feelingPercent}%</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden flex">
            <div className="h-full bg-amber-500" style={{ width: `${mbti.thinkingPercent}%` }} />
            <div className="h-full bg-pink-400" style={{ width: `${mbti.feelingPercent}%` }} />
          </div>
        </div>
      </div>

      {/* 4 Temperaments Grid */}
      <div className="grid grid-cols-2 gap-2">
        {mbti.temperaments.map(t => (
          <div key={t.key} className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-0.5">
            <div className="flex items-center justify-between text-[10px] font-bold">
              <span className="truncate max-w-[90px]" style={{ color: t.color }}>{t.key}</span>
              <span className="text-slate-900 dark:text-white font-mono">{t.percent}%</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-1 rounded-full overflow-hidden">
              <div className="h-full" style={{ width: `${t.percent}%`, backgroundColor: t.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
