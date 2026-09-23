import React, { useState, useMemo } from 'react';
import { PcoGroup, PcoPerson, Church, User, GroupRecommendation } from '../types';
import { generateGroupRecommendations } from '../services/groupRecommenderService';
import { 
  Users, Sparkles, UserPlus, Filter, MapPin, 
  CheckCircle2, AlertCircle, Info, ChevronRight, Search 
} from 'lucide-react';

interface GroupsViewProps {
  groups: PcoGroup[];
  people: PcoPerson[];
  church: Church;
  currentUser: User;
  onSelectPerson: (person: PcoPerson) => void;
}

export const GroupsView: React.FC<GroupsViewProps> = ({
  groups,
  people,
  church,
  currentUser,
  onSelectPerson
}) => {
  const [selectedGroupId, setSelectedGroupId] = useState<string>(groups[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyUnassigned, setOnlyUnassigned] = useState(true);
  const [prioritizeAtRisk, setPrioritizeAtRisk] = useState(false);
  const [invitedMap, setInvitedMap] = useState<Record<string, boolean>>({});

  const activeGroup = useMemo(() => {
    return groups.find(g => g.id === selectedGroupId) || groups[0];
  }, [groups, selectedGroupId]);

  const peopleMap = useMemo(() => {
    const map = new Map<string, PcoPerson>();
    people.forEach(p => map.set(p.id, p));
    return map;
  }, [people]);

  const recommendations = useMemo(() => {
    if (!activeGroup) return [];
    return generateGroupRecommendations(activeGroup, people, {
      onlyUnassigned,
      prioritizeAtRisk
    });
  }, [activeGroup, people, onlyUnassigned, prioritizeAtRisk]);

  const filteredRecommendations = useMemo(() => {
    if (!searchQuery.trim()) return recommendations;
    const q = searchQuery.toLowerCase();
    return recommendations.filter(rec => {
      const person = peopleMap.get(rec.personId);
      return person && person.name.toLowerCase().includes(q);
    });
  }, [recommendations, searchQuery, peopleMap]);

  const toggleInvite = (personId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setInvitedMap(prev => ({ ...prev, [personId]: !prev[personId] }));
  };

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center h-full">
        <Users className="w-12 h-12 text-slate-300 dark:text-zinc-700 mb-3" />
        <h3 className="font-bold text-slate-700 dark:text-zinc-300">No Groups Found</h3>
        <p className="text-xs text-slate-500 max-w-xs mt-1">Sync Planning Center to import church small groups.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-zinc-950 overflow-y-auto">
      {/* Top Banner & Selector */}
      <div className="p-4 bg-white dark:bg-zinc-900 border-b border-slate-200/80 dark:border-zinc-800 space-y-3 shrink-0">
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Select Group</label>
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="w-full bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {groups.map(g => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.membersCount || 0} members)
              </option>
            ))}
          </select>
        </div>

        {activeGroup && (
          <div className="bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent p-3.5 rounded-2xl border border-indigo-500/20 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-sm text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                <Sparkles size={15} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                {activeGroup.name}
              </h2>
              <span className="text-[10px] font-black uppercase bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">
                {activeGroup.groupTypeName || 'Group'}
              </span>
            </div>
            {activeGroup.description && (
              <p className="text-xs text-slate-600 dark:text-zinc-400 line-clamp-2 italic">
                "{activeGroup.description}"
              </p>
            )}
            <div className="flex flex-wrap gap-2 text-[10px] text-slate-500 font-semibold pt-1">
              <span>Members: {activeGroup.membersCount || 0}</span>
              {activeGroup.targetDemographic && <span>• Target: {activeGroup.targetDemographic}</span>}
              {activeGroup.meetingDay && <span>• Meets: {activeGroup.meetingDay}</span>}
            </div>
          </div>
        )}
      </div>

      {/* AI Recommender Control & Candidate Recommendations */}
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
              <Sparkles size={13} className="text-indigo-500" />
              AI Match Suggestions ({filteredRecommendations.length})
            </h3>
          </div>
        </div>

        {/* Filters bar */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={() => setOnlyUnassigned(!onlyUnassigned)}
            className={`px-3 py-1.5 rounded-xl font-bold border transition text-[11px] flex items-center gap-1.5 ${
              onlyUnassigned 
                ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-500 text-indigo-600 dark:text-indigo-400' 
                : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400'
            }`}
          >
            <Filter size={12} />
            Un-grouped Only
          </button>
          <button
            onClick={() => setPrioritizeAtRisk(!prioritizeAtRisk)}
            className={`px-3 py-1.5 rounded-xl font-bold border transition text-[11px] flex items-center gap-1.5 ${
              prioritizeAtRisk 
                ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-500 text-amber-600 dark:text-amber-400' 
                : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400'
            }`}
          >
            <AlertCircle size={12} />
            Prioritize At-Risk
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search candidates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Candidate List */}
        <div className="space-y-2.5 pb-8">
          {filteredRecommendations.map((rec) => {
            const person = peopleMap.get(rec.personId);
            if (!person) return null;
            const isInvited = !!invitedMap[person.id];

            return (
              <div
                key={rec.personId}
                onClick={() => onSelectPerson(person)}
                className="bg-white dark:bg-zinc-900 rounded-2xl p-3.5 border border-slate-200/80 dark:border-zinc-800 shadow-sm hover:border-indigo-500/40 transition cursor-pointer space-y-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      {person.avatar ? (
                        <img src={person.avatar} alt={person.name} className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-sm">
                          {person.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-sm text-slate-900 dark:text-zinc-100 truncate">
                        {person.name}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                        {person.membership || 'Attender'} {person.age ? `• ${person.age} yrs` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        {rec.matchScore}% Match
                      </span>
                    </div>
                    <button
                      onClick={(e) => toggleInvite(person.id, e)}
                      className={`p-2 rounded-xl transition ${
                        isInvited 
                          ? 'bg-emerald-500 text-white' 
                          : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100'
                      }`}
                      title={isInvited ? 'Invited' : 'Invite to group'}
                    >
                      {isInvited ? <CheckCircle2 size={16} /> : <UserPlus size={16} />}
                    </button>
                  </div>
                </div>

                {/* Match Reasons Badges */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {rec.matchReasons.map((reason, idx) => (
                    <span
                      key={idx}
                      className="text-[9px] font-semibold bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 px-2 py-0.5 rounded-md"
                    >
                      {reason}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
