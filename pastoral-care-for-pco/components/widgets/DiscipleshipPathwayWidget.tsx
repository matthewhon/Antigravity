import React from 'react';
import { BookOpen, Sparkles, TrendingUp, Layers, CheckCircle2 } from 'lucide-react';
import { AssessmentAggregates } from '../../services/assessmentAnalyticsService';

interface DiscipleshipPathwayWidgetProps {
  analytics: AssessmentAggregates | null;
}

export const DiscipleshipPathwayWidget: React.FC<DiscipleshipPathwayWidgetProps> = ({
  analytics
}) => {
  const themes = analytics?.discipleshipThemes || [];

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between h-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center font-bold">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-black text-slate-900 dark:text-white">Discipleship & Equipping Tracks</h4>
            <p className="text-[11px] text-slate-400">Curriculum & Sermon Pathways Based on Collective Blind Spots</p>
          </div>
        </div>
      </div>

      {/* Themes */}
      <div className="space-y-2.5">
        {themes.map((t, idx) => (
          <div
            key={idx}
            className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-md font-black text-[9px] uppercase tracking-wider ${
                  t.category === 'Doctrinal'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : t.category === 'Relational'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : t.category === 'Leadership'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                    : 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300'
                }`}>
                  {t.category}
                </span>
                <span className="font-bold text-xs text-slate-900 dark:text-white">
                  {t.theme}
                </span>
              </div>

              <span className="text-[10px] font-mono font-bold text-slate-400">
                {t.impactPercentage}% Impact
              </span>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
              {t.rationale}
            </p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <p className="text-[10px] text-slate-400 italic">
        Generated dynamically by analyzing churchwide Spiritual Gifts, DISC tendencies, and MBTI growth areas.
      </p>
    </div>
  );
};
