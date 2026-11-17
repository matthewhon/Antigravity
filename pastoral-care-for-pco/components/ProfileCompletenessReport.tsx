import React, { useEffect, useMemo, useState } from 'react';
import { PeopleDashboardData, PcoGroup, PcoPerson } from '../types';
import { pcoService } from '../services/pcoService';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import {
  Download, Search, ExternalLink, Users, ListFilter, CheckCircle2,
  AlertCircle, Calendar, UserCheck, ChevronLeft, ChevronRight, Loader2
} from 'lucide-react';
import { PersonProfileDrawer } from './PersonProfileDrawer';

interface ProfileCompletenessReportProps {
  data: PeopleDashboardData;
  groups?: PcoGroup[];
  churchId?: string;
  pcoConnected?: boolean;
}

type ScopeMode = 'all' | 'pco_list' | 'pco_group';
type StatusFilter = 'active' | 'all' | 'inactive';

interface ProfileFieldDef {
  key: string;
  label: string;
  check: (p: PcoPerson) => boolean;
}

const PROFILE_FIELDS: ProfileFieldDef[] = [
  {
    key: 'birthdate',
    label: 'Birthdate',
    check: (p) => Boolean(p.birthdate),
  },
  {
    key: 'email',
    label: 'Email',
    check: (p) => Boolean(p.email || p.primary_email),
  },
  {
    key: 'phone',
    label: 'Phone',
    check: (p) => Boolean(p.phone || p.primary_phone || p.e164Phone),
  },
  {
    key: 'address',
    label: 'Address',
    check: (p) =>
      Boolean(
        p.addresses &&
          p.addresses.length > 0 &&
          (p.addresses[0].street || p.addresses[0].city || p.addresses[0].zip)
      ),
  },
  {
    key: 'gender',
    label: 'Gender',
    check: (p) => Boolean(p.gender),
  },
  {
    key: 'anniversary',
    label: 'Anniversary',
    check: (p) => Boolean(p.anniversary),
  },
  {
    key: 'membership',
    label: 'Membership',
    check: (p) => Boolean(p.membership || p.membershipStatus || p.membership_status),
  },
  {
    key: 'household',
    label: 'Household',
    check: (p) => Boolean(p.householdId),
  },
  {
    key: 'avatar',
    label: 'Profile Photo',
    check: (p) => Boolean(p.avatar),
  },
  {
    key: 'campus',
    label: 'Primary Campus',
    check: (p) => Boolean(p.primaryCampusId || p.primaryCampusName),
  },
];

const PAGE_SIZE = 50;

function getBarColor(pct: number): string {
  if (pct >= 80) return '#10b981'; // Emerald
  if (pct >= 50) return '#f59e0b'; // Amber
  return '#f43f5e'; // Rose
}

function escapeCsvCell(val: string | number | null | undefined): string {
  const str = val == null ? '' : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export const ProfileCompletenessReport: React.FC<ProfileCompletenessReportProps> = ({
  data,
  groups = [],
  churchId,
  pcoConnected = false,
}) => {
  // Scope & filter state
  const [scopeMode, setScopeMode] = useState<ScopeMode>('all');
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [excludeChildren, setExcludeChildren] = useState<boolean>(false);

  // PCO Lists state
  const [pcoLists, setPcoLists] = useState<{ id: string; name: string; totalPeople: number }[]>([]);
  const [isLoadingLists, setIsLoadingLists] = useState<boolean>(false);
  const [listMemberIdsCache, setListMemberIdsCache] = useState<Record<string, string[]>>({});
  const [isLoadingListMembers, setIsLoadingListMembers] = useState<boolean>(false);
  const [listError, setListError] = useState<string | null>(null);

  // Drill-down & table state
  const [selectedFieldKey, setSelectedFieldKey] = useState<string>('all_missing');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [drawerPersonId, setDrawerPersonId] = useState<string | null>(null);

  // Fetch PCO Lists when user switches to pco_list mode (or on mount if connected)
  useEffect(() => {
    if (!pcoConnected || !churchId || pcoLists.length > 0) return;
    setIsLoadingLists(true);
    pcoService
      .getPeopleLists(churchId)
      .then((raw) => {
        const mapped = (raw || [])
          .map((l: any) => ({
            id: l.id,
            name: l.attributes?.name || l.name || 'Unnamed List',
            totalPeople: l.attributes?.total_people ?? l.totalPeople ?? 0,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setPcoLists(mapped);
      })
      .catch((err) => {
        console.error('Failed to load PCO lists:', err);
        setListError('Unable to load Planning Center lists.');
      })
      .finally(() => setIsLoadingLists(false));
  }, [pcoConnected, churchId, pcoLists.length]);

  // Fetch member IDs for the selected PCO List
  useEffect(() => {
    if (scopeMode !== 'pco_list' || !selectedListId || !churchId) return;
    if (listMemberIdsCache[selectedListId]) {
      setListError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingListMembers(true);
    setListError(null);

    pcoService
      .getListPeopleIds(churchId, selectedListId)
      .then((ids) => {
        if (cancelled) return;
        setListMemberIdsCache((prev) => ({ ...prev, [selectedListId]: ids || [] }));
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load list members:', err);
        setListError('Failed to fetch members for this Planning Center list.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingListMembers(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scopeMode, selectedListId, churchId, listMemberIdsCache]);

  const activeGroups = useMemo(
    () =>
      groups
        .filter((g) => !g.archivedAt)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [groups]
  );

  // Filter people by scope (All / PCO List / PCO Group) + status + child toggle
  const scopedPeople = useMemo(() => {
    let people = data.allPeople || [];

    if (scopeMode === 'pco_list') {
      if (!selectedListId) return [];
      const ids = listMemberIdsCache[selectedListId];
      if (!ids) return [];
      const idSet = new Set(ids);
      people = people.filter((p) => idSet.has(p.id));
    } else if (scopeMode === 'pco_group') {
      if (!selectedGroupId) return [];
      const group = activeGroups.find((g) => g.id === selectedGroupId);
      const memberIdSet = new Set(group?.memberIds || []);
      people = people.filter(
        (p) => p.groupIds?.includes(selectedGroupId) || memberIdSet.has(p.id)
      );
    }

    if (statusFilter === 'active') {
      people = people.filter((p) => (p.status || '').toLowerCase() === 'active');
    } else if (statusFilter === 'inactive') {
      people = people.filter((p) => (p.status || '').toLowerCase() === 'inactive');
    }

    if (excludeChildren) {
      people = people.filter((p) => !p.child);
    }

    return people;
  }, [
    data.allPeople,
    scopeMode,
    selectedListId,
    listMemberIdsCache,
    selectedGroupId,
    activeGroups,
    statusFilter,
    excludeChildren,
  ]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [scopeMode, selectedListId, selectedGroupId, statusFilter, excludeChildren, selectedFieldKey, searchQuery]);

  // Compute field completeness stats & per-person completeness
  const { fieldStats, personEvaluations, avgCompleteness, completeCount, missingBirthdateCount } =
    useMemo(() => {
      const total = scopedPeople.length;
      const presentCounts: Record<string, number> = {};
      PROFILE_FIELDS.forEach((f) => {
        presentCounts[f.key] = 0;
      });

      let totalPctSum = 0;
      let fullProfiles = 0;

      const evaluations = scopedPeople.map((person) => {
        const missingFields: ProfileFieldDef[] = [];
        let present = 0;

        for (const field of PROFILE_FIELDS) {
          if (field.check(person)) {
            present++;
            presentCounts[field.key]++;
          } else {
            missingFields.push(field);
          }
        }

        const completenessPct = Math.round((present / PROFILE_FIELDS.length) * 100);
        totalPctSum += completenessPct;
        if (missingFields.length === 0) fullProfiles++;

        return {
          person,
          missingFields,
          missingKeys: new Set(missingFields.map((f) => f.key)),
          completenessPct,
        };
      });

      const stats = PROFILE_FIELDS.map((field) => {
        const present = presentCounts[field.key];
        const missing = total - present;
        const pctComplete = total > 0 ? Math.round((present / total) * 100) : 0;
        return {
          key: field.key,
          label: field.label,
          present,
          missing,
          pctComplete,
        };
      });

      const birthdateStat = stats.find((s) => s.key === 'birthdate');

      return {
        fieldStats: stats,
        personEvaluations: evaluations,
        avgCompleteness: total > 0 ? Math.round(totalPctSum / total) : 0,
        completeCount: fullProfiles,
        missingBirthdateCount: birthdateStat ? birthdateStat.missing : 0,
      };
    }, [scopedPeople]);

  // Filter drill-down list
  const filteredEvaluations = useMemo(() => {
    let list = personEvaluations;

    if (selectedFieldKey === 'all_missing') {
      list = list.filter((e) => e.missingFields.length > 0);
    } else if (selectedFieldKey !== 'everyone') {
      list = list.filter((e) => e.missingKeys.has(selectedFieldKey));
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.person.name?.toLowerCase().includes(q) ||
          e.person.email?.toLowerCase().includes(q) ||
          e.person.phone?.toLowerCase().includes(q)
      );
    }

    // Sort by least complete first, then alphabetically
    return list.slice().sort((a, b) => {
      if (a.completenessPct !== b.completenessPct) {
        return a.completenessPct - b.completenessPct;
      }
      return (a.person.name || '').localeCompare(b.person.name || '');
    });
  }, [personEvaluations, selectedFieldKey, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredEvaluations.length / PAGE_SIZE));
  const pagedEvaluations = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredEvaluations.slice(start, start + PAGE_SIZE);
  }, [filteredEvaluations, currentPage]);

  const handleExportCsv = () => {
    const headers = [
      'Name',
      'Status',
      'Membership',
      'Email',
      'Phone',
      'Birthdate',
      'Gender',
      'Anniversary',
      'Address',
      'Household',
      'Profile Photo',
      'Primary Campus',
      'Completeness %',
      'Missing Fields',
    ];

    const rows = filteredEvaluations.map(({ person, missingFields, completenessPct }) => {
      const addr = person.addresses?.[0];
      const addrStr = addr
        ? [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', ')
        : '';
      return [
        person.name,
        person.status || '',
        person.membership || person.membershipStatus || person.membership_status || '',
        person.email || person.primary_email || '',
        person.phone || person.primary_phone || person.e164Phone || '',
        person.birthdate || '',
        person.gender || '',
        person.anniversary || '',
        addrStr,
        person.householdName || person.householdId || '',
        person.avatar ? 'Yes' : 'No',
        `${completenessPct}%`,
        missingFields.map((f) => f.label).join('; '),
      ]
        .map(escapeCsvCell)
        .join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `profile-completeness-${selectedFieldKey}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const selectedFieldLabel =
    selectedFieldKey === 'all_missing'
      ? 'Any Missing Field'
      : selectedFieldKey === 'everyone'
        ? 'All People in Scope'
        : `Missing ${PROFILE_FIELDS.find((f) => f.key === selectedFieldKey)?.label || ''}`;

  const needsScopeSelection =
    (scopeMode === 'pco_list' && !selectedListId) ||
    (scopeMode === 'pco_group' && !selectedGroupId);

  return (
    <div className="space-y-8">
      {/* ── Filter & Scope Bar ───────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 lg:p-6 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Scope Mode Toggle */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <ListFilter size={14} /> Scope:
            </span>
            <div className="bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl flex flex-wrap gap-1 border border-slate-200 dark:border-slate-700/60">
              {[
                { id: 'all', label: 'All People' },
                { id: 'pco_list', label: 'PCO List' },
                { id: 'pco_group', label: 'PCO Group' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setScopeMode(opt.id as ScopeMode)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition-all ${
                    scopeMode === opt.id
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* PCO List Dropdown */}
            {scopeMode === 'pco_list' && (
              <div className="flex items-center gap-2">
                <select
                  value={selectedListId}
                  onChange={(e) => setSelectedListId(e.target.value)}
                  disabled={!pcoConnected || isLoadingLists}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 min-w-[220px] max-w-[320px]"
                >
                  <option value="">
                    {!pcoConnected
                      ? 'Connect Planning Center to load lists'
                      : isLoadingLists
                        ? 'Loading PCO lists...'
                        : 'Select a Planning Center list...'}
                  </option>
                  {pcoLists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name} ({list.totalPeople})
                    </option>
                  ))}
                </select>
                {isLoadingListMembers && (
                  <Loader2 size={16} className="animate-spin text-indigo-500" />
                )}
              </div>
            )}

            {/* PCO Group Dropdown */}
            {scopeMode === 'pco_group' && (
              <select
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 min-w-[220px] max-w-[320px]"
              >
                <option value="">
                  {activeGroups.length === 0
                    ? 'No synced groups found'
                    : 'Select a Planning Center group...'}
                </option>
                {activeGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.membersCount})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Status & Exclude Children Toggles */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl flex gap-1 border border-slate-200 dark:border-slate-700/60">
              {[
                { id: 'active', label: 'Active' },
                { id: 'all', label: 'All Statuses' },
                { id: 'inactive', label: 'Inactive' },
              ].map((st) => (
                <button
                  key={st.id}
                  onClick={() => setStatusFilter(st.id as StatusFilter)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    statusFilter === st.id
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setExcludeChildren((prev) => !prev)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 ${
                excludeChildren
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
              }`}
            >
              <span
                className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] ${
                  excludeChildren
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-700'
                }`}
              >
                {excludeChildren ? '✓' : ''}
              </span>
              Exclude Children
            </button>
          </div>
        </div>

        {listError && (
          <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{listError}</p>
        )}
      </div>

      {needsScopeSelection ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center shadow-sm">
          <Users size={32} className="mx-auto text-slate-400 mb-3" />
          <h4 className="text-lg font-black text-slate-900 dark:text-white">
            Select a {scopeMode === 'pco_list' ? 'Planning Center List' : 'Planning Center Group'}
          </h4>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Choose a {scopeMode === 'pco_list' ? 'list' : 'group'} above to analyze profile completeness for its members.
          </p>
        </div>
      ) : (
        <>
          {/* ── KPI Summary Cards ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl p-5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold opacity-75">People in Scope</p>
                <Users size={18} className="opacity-70" />
              </div>
              <p className="text-3xl font-black mt-1">{scopedPeople.length.toLocaleString()}</p>
              <p className="text-xs font-medium opacity-70 mt-1">
                {statusFilter === 'active'
                  ? 'Active profiles'
                  : statusFilter === 'inactive'
                    ? 'Inactive profiles'
                    : 'All statuses'}
                {excludeChildren ? ' (adults only)' : ''}
              </p>
            </div>

            <div className="rounded-2xl p-5 bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold opacity-75">Avg. Completeness</p>
                <UserCheck size={18} className="opacity-70" />
              </div>
              <p className="text-3xl font-black mt-1">{avgCompleteness}%</p>
              <p className="text-xs font-medium opacity-70 mt-1">
                Across {PROFILE_FIELDS.length} profile fields
              </p>
            </div>

            <div className="rounded-2xl p-5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold opacity-75">100% Complete</p>
                <CheckCircle2 size={18} className="opacity-70" />
              </div>
              <p className="text-3xl font-black mt-1">{completeCount.toLocaleString()}</p>
              <p className="text-xs font-medium opacity-70 mt-1">
                {scopedPeople.length > 0
                  ? `${Math.round((completeCount / scopedPeople.length) * 100)}% of scope`
                  : '0% of scope'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedFieldKey('birthdate')}
              className="text-left rounded-2xl p-5 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 hover:ring-2 hover:ring-rose-400/50 transition-all"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold opacity-75">Missing Birthdate</p>
                <Calendar size={18} className="opacity-70" />
              </div>
              <p className="text-3xl font-black mt-1">{missingBirthdateCount.toLocaleString()}</p>
              <p className="text-xs font-medium opacity-70 mt-1">
                {scopedPeople.length > 0
                  ? `${Math.round((missingBirthdateCount / scopedPeople.length) * 100)}% missing — click to filter`
                  : '0% missing'}
              </p>
            </button>
          </div>

          {/* ── Field Completeness Chart + Breakdown ───────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 lg:p-8 shadow-sm">
              <div className="mb-6">
                <h4 className="text-xl font-black text-slate-900 dark:text-white">
                  Completeness by Profile Field
                </h4>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Percentage of people in scope who have each field populated. Click a bar to filter the list below.
                </p>
              </div>

              <div className="h-[380px] w-full">
                {scopedPeople.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={fieldStats}
                      layout="vertical"
                      margin={{ top: 5, right: 24, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" opacity={0.2} />
                      <XAxis
                        type="number"
                        domain={[0, 100]}
                        tickFormatter={(v) => `${v}%`}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: '#64748b' }}
                      />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={110}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fontWeight: 600, fill: '#64748b' }}
                      />
                      <Tooltip
                        formatter={(_value: any, _name: any, props: any) => {
                          const item = props?.payload;
                          if (!item) return ['', ''];
                          return [
                            `${item.pctComplete}% (${item.present} have / ${item.missing} missing)`,
                            item.label,
                          ];
                        }}
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          border: 'none',
                          borderRadius: '12px',
                          color: '#f8fafc',
                          boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                        }}
                        itemStyle={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}
                      />
                      <Bar
                        dataKey="pctComplete"
                        radius={[0, 8, 8, 0]}
                        cursor="pointer"
                        onClick={(entry: any) => {
                          if (entry?.key) setSelectedFieldKey(entry.key);
                        }}
                      >
                        {fieldStats.map((entry) => (
                          <Cell key={entry.key} fill={getBarColor(entry.pctComplete)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                    No people match the current scope and filters.
                  </div>
                )}
              </div>
            </div>

            {/* Field Summary Table */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col">
              <div className="mb-4">
                <h4 className="text-lg font-black text-slate-900 dark:text-white">Field Breakdown</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Click any row to view people missing that field.
                </p>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto flex-1">
                {fieldStats.map((stat) => {
                  const isSelected = selectedFieldKey === stat.key;
                  return (
                    <button
                      key={stat.key}
                      type="button"
                      onClick={() => setSelectedFieldKey(isSelected ? 'all_missing' : stat.key)}
                      className={`w-full py-2.5 px-2.5 flex items-center justify-between text-left rounded-xl transition-colors ${
                        isSelected
                          ? 'bg-indigo-50 dark:bg-indigo-900/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{stat.label}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {stat.present.toLocaleString()} have ·{' '}
                          <span className="text-rose-600 dark:text-rose-400 font-semibold">
                            {stat.missing.toLocaleString()} missing
                          </span>
                        </p>
                      </div>
                      <span
                        className={`text-xs font-black px-2.5 py-1 rounded-lg ${
                          stat.pctComplete >= 80
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                            : stat.pctComplete >= 50
                              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                              : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        {stat.pctComplete}%
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Drill-Down Table: People Missing Info ──────────────────────────── */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 lg:p-8 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h4 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <AlertCircle size={20} className="text-amber-500" />
                  {selectedFieldLabel}
                  <span className="text-sm font-bold text-slate-400 dark:text-slate-500">
                    ({filteredEvaluations.length.toLocaleString()})
                  </span>
                </h4>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Sorted by lowest completeness first. Click a person to view their profile or open in Planning Center.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Missing Field Filter */}
                <select
                  value={selectedFieldKey}
                  onChange={(e) => setSelectedFieldKey(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all_missing">Missing Any Field</option>
                  <option value="everyone">All People in Scope</option>
                  {PROFILE_FIELDS.map((f) => (
                    <option key={f.key} value={f.key}>
                      Missing {f.label}
                    </option>
                  ))}
                </select>

                {/* Search */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search name, email, phone..."
                    className="pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 w-48 sm:w-56"
                  />
                </div>

                {/* Export CSV */}
                <button
                  type="button"
                  onClick={handleExportCsv}
                  disabled={filteredEvaluations.length === 0}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-black uppercase tracking-wide hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors disabled:opacity-40"
                >
                  <Download size={14} /> Export CSV
                </button>
              </div>
            </div>

            {pagedEvaluations.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">
                No people match this filter.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        <th className="py-3 pr-4">Person</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3">Completeness</th>
                        <th className="py-3 px-3">Missing Fields</th>
                        <th className="py-3 pl-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                      {pagedEvaluations.map(({ person, missingFields, completenessPct }) => (
                        <tr
                          key={person.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3 pr-4">
                            <button
                              type="button"
                              onClick={() => churchId && setDrawerPersonId(person.id)}
                              className="flex items-center gap-3 text-left group"
                            >
                              {person.avatar ? (
                                <img
                                  src={person.avatar}
                                  alt={person.name}
                                  className="w-8 h-8 rounded-full object-cover shrink-0"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300 shrink-0">
                                  {(person.name || '?').charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div>
                                <p className="font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                  {person.name}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {person.membership || person.membershipStatus || 'No membership'}
                                </p>
                              </div>
                            </button>
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-md text-xs font-bold ${
                                (person.status || '').toLowerCase() === 'active'
                                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {person.status || 'Unknown'}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${completenessPct}%`,
                                    backgroundColor: getBarColor(completenessPct),
                                  }}
                                />
                              </div>
                              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                {completenessPct}%
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            {missingFields.length === 0 ? (
                              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                Complete
                              </span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {missingFields.map((f) => (
                                  <span
                                    key={f.key}
                                    className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/40"
                                  >
                                    {f.label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="py-3 pl-3 text-right">
                            <div className="inline-flex items-center gap-2">
                              {churchId && (
                                <button
                                  type="button"
                                  onClick={() => setDrawerPersonId(person.id)}
                                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                                >
                                  View
                                </button>
                              )}
                              <a
                                href={`https://people.planningcenteronline.com/people/${person.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open in Planning Center"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              >
                                <ExternalLink size={14} />
                              </a>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <span>
                      Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                      {Math.min(currentPage * PAGE_SIZE, filteredEvaluations.length)} of{' '}
                      {filteredEvaluations.length.toLocaleString()}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span>
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {drawerPersonId && churchId && (
        <PersonProfileDrawer
          personId={drawerPersonId}
          churchId={churchId}
          onClose={() => setDrawerPersonId(null)}
        />
      )}
    </div>
  );
};
