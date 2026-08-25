import React from 'react';
import { ArrowRight, RefreshCw, Sparkles, MessageSquare, AlertCircle, HeartHandshake, CheckCircle } from 'lucide-react';
import { TeamFitReallocation } from '../../types';
import { WidgetWrapper } from '../SharedUI';

interface TeamFitReallocationWidgetProps {
  reallocations: TeamFitReallocation[];
  onOpenOutreachModal: (reallocation: TeamFitReallocation) => void;
  onRemove?: () => void;
}

export const TeamFitReallocationWidget: React.FC<TeamFitReallocationWidgetProps> = ({
  reallocations,
  onOpenOutreachModal,
  onRemove
}) => {
  return (
    <WidgetWrapper
      title="Team Fit & Reallocation"
      onRemove={onRemove}
      source="Ministry Placement Diagnostics"
      headerControl={
        <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold text-xs">
          {reallocations.length} Opportunities
        </span>
      }
    >
      <div className="space-y-3">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Identifies volunteers whose spiritual gifts or behavioral temperaments clash with their current duties, and recommends healthier ministry placements.
        </p>

        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
          {reallocations.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <CheckCircle className="w-8 h-8 mx-auto text-emerald-500" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Great Volunteer Alignment!
              </p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                No acute role mismatches or friction points were detected across your assessed serving volunteers.
              </p>
            </div>
          ) : (
            reallocations.map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-800 transition-all shadow-xs space-y-2.5"
              >
                {/* Header & Transfer Flow */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {item.avatar ? (
                      <img
                        src={item.avatar}
                        alt={item.personName}
                        className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center text-xs font-black">
                        {item.personName.charAt(0)}
                      </div>
                    )}

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-slate-900 dark:text-white">
                          {item.personName}
                        </span>
                        {item.primaryGift && (
                          <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 font-bold text-[10px]">
                            {item.primaryGift}
                          </span>
                        )}
                        {item.discStyle && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-mono font-bold text-[10px]">
                            {item.discStyle}
                          </span>
                        )}
                      </div>

                      {/* Team Shift Route */}
                      <div className="flex items-center gap-1.5 text-[11px] font-bold mt-1">
                        <span className="text-slate-500 dark:text-slate-400 line-through opacity-80">
                          {item.currentTeamName}
                        </span>
                        <ArrowRight className="w-3 h-3 text-indigo-500" />
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {item.recommendedTeamName}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenOutreachModal(item)}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer shrink-0 self-start sm:self-center"
                    title="Suggest volunteer reallocation to the team leader"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Suggest Transfer</span>
                  </button>
                </div>

                {/* Diagnostics Comparison */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="p-2 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30">
                    <span className="text-[9px] uppercase font-bold text-rose-600 dark:text-rose-400 block mb-0.5">
                      ⚠️ Current Friction
                    </span>
                    <p className="text-slate-700 dark:text-slate-300">
                      {item.currentFitReason}
                    </p>
                  </div>

                  <div className="p-2 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                    <span className="text-[9px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block mb-0.5">
                      ✨ Better Opportunity
                    </span>
                    <p className="text-slate-700 dark:text-slate-300">
                      {item.recommendedFitReason}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </WidgetWrapper>
  );
};
