import React, { useState, useMemo } from 'react';
import { AlertTriangle, Flame, Users, CheckCircle, ShieldAlert, ChevronRight, MessageSquare, Target, ArrowRight } from 'lucide-react';
import { TeamHealthDiagnostic } from '../../types';
import { WidgetWrapper } from '../SharedUI';

interface StrugglingTeamsWidgetProps {
  diagnostics: TeamHealthDiagnostic[];
  onSelectTeamForMatching?: (teamId: string) => void;
  onOpenOutreachModal?: (teamId: string) => void;
  onRemove?: () => void;
}

export const StrugglingTeamsWidget: React.FC<StrugglingTeamsWidgetProps> = ({
  diagnostics,
  onSelectTeamForMatching,
  onOpenOutreachModal,
  onRemove
}) => {
  const [filterMode, setFilterMode] = useState<'All' | 'Struggling' | 'Critical'>('Struggling');

  const stats = useMemo(() => {
    const critical = diagnostics.filter(d => d.status === 'Critical').length;
    const struggling = diagnostics.filter(d => d.status === 'Struggling').length;
    const moderate = diagnostics.filter(d => d.status === 'Moderate').length;
    const healthy = diagnostics.filter(d => d.status === 'Healthy').length;
    const totalOpenSlots = diagnostics.reduce((acc, d) => acc + d.openSlotsCount, 0);
    const totalBurnout = diagnostics.reduce((acc, d) => acc + d.burnoutCount, 0);

    return { critical, struggling, moderate, healthy, totalOpenSlots, totalBurnout };
  }, [diagnostics]);

  const filteredList = useMemo(() => {
    if (filterMode === 'Critical') {
      return diagnostics.filter(d => d.status === 'Critical');
    }
    if (filterMode === 'Struggling') {
      return diagnostics.filter(d => d.status === 'Critical' || d.status === 'Struggling' || d.status === 'Moderate');
    }
    return diagnostics;
  }, [diagnostics, filterMode]);

  const getStatusBadge = (status: TeamHealthDiagnostic['status']) => {
    switch (status) {
      case 'Critical':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            Critical Strain
          </span>
        );
      case 'Struggling':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Struggling
          </span>
        );
      case 'Moderate':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60">
            Moderate
          </span>
        );
      case 'Healthy':
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Healthy
          </span>
        );
    }
  };

  const getScoreColor = (score: number) => {
    if (score < 50) return 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900';
    if (score < 70) return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900';
    if (score < 85) return 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-900';
    return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900';
  };

  return (
    <WidgetWrapper
      title="Struggling Teams Radar"
      onRemove={onRemove}
      source="PCO Services Diagnostics"
      headerControl={
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-[10px] font-bold">
          <button
            type="button"
            onClick={() => setFilterMode('Struggling')}
            className={`px-2 py-0.5 rounded-md transition-all ${
              filterMode === 'Struggling'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Needs Attention ({stats.critical + stats.struggling + stats.moderate})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('Critical')}
            className={`px-2 py-0.5 rounded-md transition-all ${
              filterMode === 'Critical'
                ? 'bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Critical ({stats.critical})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('All')}
            className={`px-2 py-0.5 rounded-md transition-all ${
              filterMode === 'All'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All ({diagnostics.length})
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* KPI Mini-Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Critical Teams</p>
              <p className="text-sm font-black text-rose-600 dark:text-rose-400">{stats.critical}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Struggling Teams</p>
              <p className="text-sm font-black text-amber-600 dark:text-amber-400">{stats.struggling}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-500 flex items-center justify-center font-bold">
              <span className="text-xs font-black">!</span>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Total Open Slots</p>
              <p className="text-sm font-black text-slate-900 dark:text-white">{stats.totalOpenSlots}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center font-bold">
              <Flame className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">High-Risk Volunteers</p>
              <p className="text-sm font-black text-orange-600 dark:text-orange-400">{stats.totalBurnout}</p>
            </div>
          </div>
        </div>

        {/* Teams List */}
        <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1 custom-scrollbar">
          {filteredList.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <CheckCircle className="w-10 h-10 mx-auto text-emerald-500" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">All Teams are Healthy!</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No teams are currently flagged with critical staffing deficits, low fill rates, or high volunteer burnout.
              </p>
            </div>
          ) : (
            filteredList.map(diag => (
              <div
                key={diag.teamId}
                className={`p-4 rounded-2xl border transition-all ${
                  diag.status === 'Critical'
                    ? 'bg-rose-50/40 dark:bg-rose-950/10 border-rose-200 dark:border-rose-900/50 hover:border-rose-300'
                    : diag.status === 'Struggling'
                    ? 'bg-amber-50/30 dark:bg-amber-950/10 border-amber-200 dark:border-amber-900/50 hover:border-amber-300'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-2xl flex flex-col items-center justify-center font-black border ${getScoreColor(diag.healthScore)}`}>
                      <span className="text-sm leading-none">{diag.healthScore}</span>
                      <span className="text-[8px] uppercase tracking-tighter opacity-80 mt-0.5">Health</span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-black text-slate-900 dark:text-white">
                          {diag.teamName}
                        </h4>
                        {getStatusBadge(diag.status)}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {diag.serviceTypeName ? `${diag.serviceTypeName} • ` : ''}
                        Leader{diag.leaderNames.length > 1 ? 's' : ''}: {diag.leaderNames.length > 0 ? diag.leaderNames.join(', ') : <span className="text-rose-500 font-bold">None Assigned</span>}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {onSelectTeamForMatching && (
                      <button
                        type="button"
                        onClick={() => onSelectTeamForMatching(diag.teamId)}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                        title="Find candidate matches for this team"
                      >
                        <Target className="w-3.5 h-3.5" />
                        <span>Find Candidates</span>
                      </button>
                    )}

                    {onOpenOutreachModal && (
                      <button
                        type="button"
                        onClick={() => onOpenOutreachModal(diag.teamId)}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200 dark:border-slate-700"
                        title="Send recommendation or notice to team leader"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Notify Leader</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Metric Badges & Risk Reasons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 mb-2">
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl border border-slate-100 dark:border-slate-700/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Fill Rate</span>
                    <span className={`text-xs font-black ${diag.fillRate < 60 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'}`}>
                      {diag.fillRate}%
                    </span>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl border border-slate-100 dark:border-slate-700/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Open Slots (30d)</span>
                    <span className={`text-xs font-black ${diag.openSlotsCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {diag.openSlotsCount} open
                    </span>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl border border-slate-100 dark:border-slate-700/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Roster Depth</span>
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                      {diag.rosterSize} members
                    </span>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl border border-slate-100 dark:border-slate-700/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Burnout Vol.</span>
                    <span className={`text-xs font-black ${diag.burnoutCount > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-slate-800 dark:text-slate-200'}`}>
                      {diag.burnoutCount} high risk
                    </span>
                  </div>
                </div>

                {/* Risk Reasons Callout */}
                {diag.riskReasons.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {diag.riskReasons.map((reason, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                        <span>{reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </WidgetWrapper>
  );
};
