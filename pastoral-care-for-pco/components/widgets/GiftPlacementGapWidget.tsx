import React from 'react';
import { Target, Users, Send, MessageSquare, CheckCircle2, ArrowUpRight, Award } from 'lucide-react';
import { AssessmentAggregates } from '../../services/assessmentAnalyticsService';

interface GiftPlacementGapWidgetProps {
  analytics: AssessmentAggregates | null;
  onOpenEngagementModal?: (match: AssessmentAggregates['placementMatches'][0]) => void;
  onNavigateToServices?: () => void;
}

export const GiftPlacementGapWidget: React.FC<GiftPlacementGapWidgetProps> = ({
  analytics,
  onOpenEngagementModal,
  onNavigateToServices
}) => {
  const matches = analytics?.placementMatches || [];

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between h-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
            <Target className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-black text-slate-900 dark:text-white">Ministry Placement Matcher</h4>
            <p className="text-[11px] text-slate-400">Untapped Gifts & Recommended Serving Teams</p>
          </div>
        </div>

        <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold text-xs">
          {matches.length} Matches
        </span>
      </div>

      {/* Matches List */}
      {matches.length === 0 ? (
        <div className="text-center py-8 space-y-2">
          <Award className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Complete member assessments to discover talent matches for open ministry roles.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
          {matches.map((m, idx) => (
            <div
              key={idx}
              className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition"
            >
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                    {m.personName}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold text-[10px]">
                    {m.primaryGift}
                  </span>
                  {m.discStyle && (
                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-mono text-[9px] font-bold">
                      {m.discStyle}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  → Recommended: <strong className="text-slate-700 dark:text-slate-200">{m.recommendedTeam}</strong>
                </div>
              </div>

              {onOpenEngagementModal && (
                <button
                  type="button"
                  onClick={() => onOpenEngagementModal(m)}
                  className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition cursor-pointer shrink-0"
                  title="Open Pastoral Outreach & Serving Invite"
                >
                  <MessageSquare className="w-3 h-3" />
                  <span>Invite</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Footer Helper */}
      <p className="text-[10px] text-slate-400 italic">
        Matches members based on Romans 12 Spiritual Gifts, DISC work-style tendencies, and open ministry teams.
      </p>
    </div>
  );
};
