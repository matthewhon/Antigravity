import React from 'react';
import { Layers, Send, CheckCircle2, Users, ArrowUpRight } from 'lucide-react';
import { AssessmentAggregates } from '../../services/assessmentAnalyticsService';

interface AssessmentFunnelWidgetProps {
  analytics: AssessmentAggregates | null;
  onOpenSendModal?: () => void;
}

export const AssessmentFunnelWidget: React.FC<AssessmentFunnelWidgetProps> = ({
  analytics,
  onOpenSendModal
}) => {
  const totalAssessed = analytics?.totalUniquePeopleAssessed || 0;
  const peopleCount = analytics?.peopleCount || 1;
  const adoptionRate = analytics?.adoptionRate || 0;

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between h-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-black text-slate-900 dark:text-white">Assessment Discovery</h4>
            <p className="text-[11px] text-slate-400">Congregational Engagement</p>
          </div>
        </div>

        <span className="px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-mono font-black text-xs">
          {adoptionRate}%
        </span>
      </div>

      {/* Progress & Counts */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
          <span>{totalAssessed} People Assessed</span>
          <span className="text-slate-400 font-normal">of {peopleCount} Active Records</span>
        </div>
        <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-500 rounded-full transition-all duration-500" 
            style={{ width: `${Math.max(4, adoptionRate)}%` }} 
          />
        </div>
      </div>

      {/* 3 Tests Quick Count */}
      <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
          <span className="text-indigo-600 dark:text-indigo-400 font-black text-xs block font-mono">
            {analytics?.giftsCount || 0}
          </span>
          <span className="text-slate-400">Gifts</span>
        </div>
        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
          <span className="text-emerald-600 dark:text-emerald-400 font-black text-xs block font-mono">
            {analytics?.discCount || 0}
          </span>
          <span className="text-slate-400">DISC</span>
        </div>
        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
          <span className="text-violet-600 dark:text-violet-400 font-black text-xs block font-mono">
            {analytics?.mbtiCount || 0}
          </span>
          <span className="text-slate-400">MBTI</span>
        </div>
      </div>

      {/* Action Button */}
      {onOpenSendModal && (
        <button
          type="button"
          onClick={onOpenSendModal}
          className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Send Test Invitations</span>
        </button>
      )}
    </div>
  );
};
