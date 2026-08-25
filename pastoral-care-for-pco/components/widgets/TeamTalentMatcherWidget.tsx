import React from 'react';
import { Target, Users, Send, MessageSquare, CheckCircle2, Sparkles, Phone, Mail, Award, AlertCircle } from 'lucide-react';
import { ServicesTeam, TeamCandidateSuggestion } from '../../types';
import { WidgetWrapper } from '../SharedUI';

interface TeamTalentMatcherWidgetProps {
  teams: ServicesTeam[];
  selectedTeamId: string | null;
  onSelectTeamId: (teamId: string) => void;
  suggestions: TeamCandidateSuggestion[];
  onOpenOutreachModal: (candidate: TeamCandidateSuggestion, team: ServicesTeam) => void;
  onRemove?: () => void;
}

export const TeamTalentMatcherWidget: React.FC<TeamTalentMatcherWidgetProps> = ({
  teams,
  selectedTeamId,
  onSelectTeamId,
  suggestions,
  onOpenOutreachModal,
  onRemove
}) => {
  const currentTeam = teams.find(t => t.id === selectedTeamId) || teams[0];

  return (
    <WidgetWrapper
      title="Team Candidate Matcher"
      onRemove={onRemove}
      source="Spiritual Gifts & DISC Engine"
      headerControl={
        <div className="flex items-center gap-2">
          <select
            value={currentTeam?.id || ''}
            onChange={(e) => onSelectTeamId(e.target.value)}
            className="bg-slate-100 dark:bg-slate-800 border-none text-[11px] font-bold text-slate-700 dark:text-slate-200 rounded-lg py-1.5 px-3 cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500 max-w-[200px] truncate"
            title="Select target team to find volunteer matches"
          >
            {teams.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.memberIds?.length || 0} roster)
              </option>
            ))}
          </select>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Team Context Summary */}
        {currentTeam && (
          <div className="p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">
                <Target className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>Candidate Recommendations for</span>
                  <span className="text-indigo-600 dark:text-indigo-400">{currentTeam.name}</span>
                </h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Ranked by Romans 12 Spiritual Gifts, DISC work-style & MBTI cognitive alignment
                </p>
              </div>
            </div>

            <span className="px-2.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-black text-xs shrink-0">
              {suggestions.length} Matches Found
            </span>
          </div>
        )}

        {/* Suggestions List */}
        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
          {suggestions.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <Sparkles className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="text-xs font-bold text-slate-600 dark:text-slate-400">
                No new assessment matches found for {currentTeam?.name || 'this team'}.
              </p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                Encourage church members to take the Spiritual Gifts, DISC, and MBTI assessments to unlock more candidate suggestions.
              </p>
            </div>
          ) : (
            suggestions.map(candidate => (
              <div
                key={candidate.personId}
                className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700/60 transition-all shadow-xs space-y-2.5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-3">
                    {candidate.avatar ? (
                      <img
                        src={candidate.avatar}
                        alt={candidate.personName}
                        className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-black">
                        {candidate.personName.charAt(0)}
                      </div>
                    )}

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-slate-900 dark:text-white">
                          {candidate.personName}
                        </span>

                        {/* Match Score Badge */}
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-black text-[10px] flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" />
                          {candidate.matchScore}% Match
                        </span>

                        {/* Serving status badge */}
                        {!candidate.isCurrentlyServing ? (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold text-[9px] uppercase tracking-wider">
                            ✨ Untapped Talent
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold text-[9px]">
                            Serving ({candidate.currentTeams.join(', ') || 'Active'})
                          </span>
                        )}
                      </div>

                      {/* Trait badges */}
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {candidate.primaryGift && (
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 font-bold text-[10px]">
                            Gift: {candidate.primaryGift}
                          </span>
                        )}
                        {candidate.discStyle && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-mono font-bold text-[10px]">
                            DISC: {candidate.discStyle}
                          </span>
                        )}
                        {candidate.mbtiType && (
                          <span className="px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-mono font-bold text-[10px]">
                            MBTI: {candidate.mbtiType}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Outreach Button */}
                  {currentTeam && (
                    <button
                      type="button"
                      onClick={() => onOpenOutreachModal(candidate, currentTeam)}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer shrink-0 self-start sm:self-center"
                      title="Send volunteer recommendation to the team leader"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Suggest to Leader</span>
                    </button>
                  )}
                </div>

                {/* Match Rationales */}
                <div className="bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/60 space-y-1">
                  {candidate.matchingReasons.map((reason, i) => (
                    <p key={i} className="text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-1.5">
                      <span className="text-emerald-500 font-black">✓</span>
                      <span>{reason}</span>
                    </p>
                  ))}
                  {candidate.suggestedRoles && candidate.suggestedRoles.length > 0 && (
                    <p className="text-[10px] text-slate-400 font-medium pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                      💡 <strong>Suggested Roles:</strong> {candidate.suggestedRoles.join(' • ')}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </WidgetWrapper>
  );
};
