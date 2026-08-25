import React from 'react';
import { Compass, ArrowUpRight, ShieldCheck, Activity } from 'lucide-react';
import { AssessmentAggregates } from '../../services/assessmentAnalyticsService';

interface DiscClimateWidgetProps {
  analytics: AssessmentAggregates | null;
  onNavigateToDisc?: () => void;
}

export const DiscClimateWidget: React.FC<DiscClimateWidgetProps> = ({
  analytics,
  onNavigateToDisc
}) => {
  if (!analytics || analytics.discCount === 0) {
    return (
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between h-full space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-black text-slate-900 dark:text-white">DISC Church Climate</h4>
              <p className="text-[11px] text-slate-400">Behavioral Culture & Pace</p>
            </div>
          </div>
        </div>
        <div className="text-center py-6 space-y-2">
          <Activity className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">No DISC assessments completed yet.</p>
          {onNavigateToDisc && (
            <button
              type="button"
              onClick={onNavigateToDisc}
              className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Launch Assessment Campaign</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    );
  }

  const { disc, discCount } = analytics;
  const { dimensionAverages, dominantStyleProfile, dominantStyleCode } = disc;

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between h-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-black text-slate-900 dark:text-white">DISC Church Climate</h4>
            <p className="text-[11px] text-slate-400">{discCount} Assessment{discCount === 1 ? '' : 's'} Completed</p>
          </div>
        </div>

        {onNavigateToDisc && (
          <button
            type="button"
            onClick={onNavigateToDisc}
            className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Manage</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Dominant Pattern Badge */}
      <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-800/40 flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="text-[9px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            Primary Culture Profile
          </span>
          <div className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-mono text-[10px]">
              {dominantStyleCode}
            </span>
            <span>{dominantStyleProfile?.name.split('(')[0].trim() || 'Balanced Shepherd'}</span>
          </div>
        </div>
      </div>

      {/* 4 Dimension Distribution Bars */}
      <div className="space-y-2">
        <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-bold">
          <div>
            <span className="text-red-600 dark:text-red-400 block font-mono">D: {dimensionAverages.D}%</span>
            <span className="text-[9px] text-slate-400">Dominance</span>
          </div>
          <div>
            <span className="text-amber-600 dark:text-amber-400 block font-mono">I: {dimensionAverages.I}%</span>
            <span className="text-[9px] text-slate-400">Influence</span>
          </div>
          <div>
            <span className="text-emerald-600 dark:text-emerald-400 block font-mono">S: {dimensionAverages.S}%</span>
            <span className="text-[9px] text-slate-400">Steadiness</span>
          </div>
          <div>
            <span className="text-blue-600 dark:text-blue-400 block font-mono">C: {dimensionAverages.C}%</span>
            <span className="text-[9px] text-slate-400">Conscientious</span>
          </div>
        </div>

        <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden flex shadow-inner">
          <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${dimensionAverages.D}%` }} title={`Dominance: ${dimensionAverages.D}%`} />
          <div className="h-full bg-amber-500 transition-all duration-500" style={{ width: `${dimensionAverages.I}%` }} title={`Influence: ${dimensionAverages.I}%`} />
          <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${dimensionAverages.S}%` }} title={`Steadiness: ${dimensionAverages.S}%`} />
          <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${dimensionAverages.C}%` }} title={`Conscientiousness: ${dimensionAverages.C}%`} />
        </div>
      </div>

      {/* Climate Snippet */}
      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug line-clamp-2 italic">
        "{disc.climateSummary}"
      </p>
    </div>
  );
};
