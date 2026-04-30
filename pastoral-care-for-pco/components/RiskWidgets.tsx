
import React, { useState, useMemo } from 'react';
import { PcoPerson, RiskSettings, RiskChangeRecord } from '../types';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar } from 'recharts';

interface RiskProps {
  people: PcoPerson[];
  currentTheme?: 'traditional' | 'dark';
  recentRiskChanges?: RiskChangeRecord[];
}

const RISK_COLORS = {
  'Healthy': '#10b981', // Emerald
  'At Risk': '#f59e0b', // Amber
  'Disconnected': '#f43f5e' // Rose
};

const TOOLTIP_STYLE = {
    borderRadius: '12px',
    border: 'none',
    backgroundColor: '#1e293b',
    color: '#fff',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
};

export const RiskDistributionWidget: React.FC<RiskProps> = ({ people, currentTheme = 'traditional' }) => {
  const data = [
    { name: 'Healthy', value: people.filter(p => p.riskProfile?.category === 'Healthy').length },
    { name: 'At Risk', value: people.filter(p => p.riskProfile?.category === 'At Risk').length },
    { name: 'Disconnected', value: people.filter(p => p.riskProfile?.category === 'Disconnected').length },
  ];

  const total = people.length;

  return (
    <div className="bg-white dark:bg-slate-850 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-sm h-full flex flex-col transition-colors">
      <div className="flex justify-between items-center mb-6">
        <h4 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Risk Distribution</h4>
        <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-1 rounded font-bold">{total} Analyzed</span>
      </div>
      
      <div className="flex-1 flex items-center">
        <ResponsiveContainer width="100%" height={200} minWidth={1} minHeight={1} debounce={1}>
          <PieChart>
            <Pie
              data={data}
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={RISK_COLORS[entry.name as keyof typeof RISK_COLORS]} />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} />
            <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" wrapperStyle={{color: currentTheme === 'dark' ? '#94a3b8' : '#64748b'}} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      
      <div className="mt-4 text-center">
        <p className="text-xs text-slate-400 dark:text-slate-500">
            <strong className="text-slate-900 dark:text-white">{Math.round((data[0].value / (total || 1)) * 100)}%</strong> of your people are considered Healthy.
        </p>
      </div>
    </div>
  );
};

export const RiskFactorsWidget: React.FC<RiskProps> = ({ people, currentTheme = 'traditional' }) => {
    // Aggregate all negative factors from risk profiles
    const factorCounts: Record<string, number> = {};
    people.forEach(p => {
        p.riskProfile?.factors.forEach(f => {
            factorCounts[f] = (factorCounts[f] || 0) + 1;
        });
    });
    
    // Convert to array for Recharts
    const data = Object.entries(factorCounts)
        .map(([name, value]) => ({ name, value }))
        .sort((a,b) => b.value - a.value);

    const gridColor = currentTheme === 'dark' ? '#334155' : '#f1f5f9';
    const axisColor = currentTheme === 'dark' ? '#94a3b8' : '#64748b';

    return (
        <div className="bg-white dark:bg-slate-850 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-sm h-full flex flex-col transition-colors">
            <div className="flex justify-between items-center mb-6">
                <h4 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Risk Factors</h4>
                <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
            </div>
            
            <div className="flex-1 w-full min-h-[200px]">
                {data.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                        <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                            <XAxis type="number" hide />
                            <YAxis 
                                dataKey="name" 
                                type="category" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fontSize: 10, fontWeight: 700, fill: axisColor }} 
                                width={90}
                            />
                            <Tooltip 
                                cursor={{fill: currentTheme === 'dark' ? '#334155' : '#f8fafc'}}
                                contentStyle={TOOLTIP_STYLE}
                                itemStyle={{ color: '#fff' }}
                            />
                            <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full flex items-center justify-center text-center p-4">
                        <p className="text-xs font-bold text-slate-400 dark:text-slate-500">No negative factors detected.</p>
                    </div>
                )}
            </div>
            
            <div className="mt-4 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
                <p className="text-[10px] text-indigo-600 dark:text-indigo-400 leading-tight">
                    <strong>Insight:</strong> These are the specific criteria from your Risk Profile settings that members are failing to meet.
                </p>
            </div>
        </div>
    );
};

export const AtRiskListWidget: React.FC<RiskProps> = ({ people }) => {
  // Filter for 'At Risk' and sort by score (lowest first)
  const atRiskPeople = people
    .filter(p => p.riskProfile?.category === 'At Risk')
    .sort((a, b) => (a.riskProfile?.score || 0) - (b.riskProfile?.score || 0))
    .slice(0, 5); // Top 5

  return (
    <div className="bg-white dark:bg-slate-850 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-sm h-full flex flex-col transition-colors">
        <div className="flex justify-between items-center mb-6">
            <h4 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Needs Attention</h4>
            <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
            {atRiskPeople.length > 0 ? (
                atRiskPeople.map(p => (
                    <div key={p.id} className="p-3 rounded-2xl bg-amber-50/50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 flex items-center gap-3 group hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors cursor-pointer">
                        <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-amber-500 font-black text-sm shadow-sm">
                            {p.riskProfile?.score}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-slate-900 dark:text-white truncate">{p.name}</p>
                            <div className="flex gap-1 flex-wrap mt-1">
                                {p.riskProfile?.factors.map(f => (
                                    <span key={f} className="text-[8px] bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded uppercase tracking-tight">
                                        {f}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                ))
            ) : (
                <div className="h-full flex items-center justify-center text-center p-4">
                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500">No one currently flagged as "At Risk". Good job!</p>
                </div>
            )}
        </div>
        
        <div className="mt-6 pt-4 border-t border-slate-50 dark:border-slate-800 text-right">
            <button className="text-[10px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300">View Full List →</button>
        </div>
    </div>
  );
};

export const StatusChangesWidget: React.FC<RiskProps> = ({ recentRiskChanges = [] }) => {
    // Categorize the actual changes
    const improvedCount = recentRiskChanges.filter(c => 
        (c.oldCategory === 'At Risk' && c.newCategory === 'Healthy') ||
        (c.oldCategory === 'Disconnected' && (c.newCategory === 'Healthy' || c.newCategory === 'At Risk'))
    ).length;
    
    const declinedCount = recentRiskChanges.filter(c => 
        (c.oldCategory === 'Healthy' && c.newCategory === 'At Risk')
    ).length;

    const disconnectedCount = recentRiskChanges.filter(c => 
        (c.oldCategory === 'Healthy' || c.oldCategory === 'At Risk') && c.newCategory === 'Disconnected'
    ).length;

    const recentMovements = [...recentRiskChanges]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 8)
        .map(c => {
            let type: 'improved' | 'declined' | 'dropped' = 'declined';
            if (c.newCategory === 'Disconnected') type = 'dropped';
            else if (c.newCategory === 'Healthy') type = 'improved';
            else if (c.oldCategory === 'Disconnected' && c.newCategory === 'At Risk') type = 'improved';
            return {
                id: c.id,
                name: c.personName,
                changeType: type,
                oldCategory: c.oldCategory,
                newCategory: c.newCategory
            };
        });

    return (
        <div className="bg-white dark:bg-slate-850 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-sm h-full flex flex-col transition-colors">
            <div className="flex justify-between items-center mb-6">
                <h4 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Status Changes (30d)</h4>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-6">
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-3 text-center border border-emerald-100 dark:border-emerald-900/30">
                    <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">+{improvedCount}</p>
                    <p className="text-[8px] font-bold text-emerald-400 dark:text-emerald-500/80 uppercase tracking-widest mt-1">Improved</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-3 text-center border border-amber-100 dark:border-amber-900/30">
                    <p className="text-2xl font-black text-amber-500 dark:text-amber-400">-{declinedCount}</p>
                    <p className="text-[8px] font-bold text-amber-400 dark:text-amber-500/80 uppercase tracking-widest mt-1">Declined</p>
                </div>
                <div className="bg-rose-50 dark:bg-rose-900/20 rounded-2xl p-3 text-center border border-rose-100 dark:border-rose-900/30">
                    <p className="text-2xl font-black text-rose-500 dark:text-rose-400">-{disconnectedCount}</p>
                    <p className="text-[8px] font-bold text-rose-400 dark:text-rose-500/80 uppercase tracking-widest mt-1">Dropped</p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Recent Movements</p>
                {recentMovements.length === 0 ? (
                    <div className="h-20 flex items-center justify-center text-center p-2">
                        <p className="text-[10px] text-slate-400 font-medium">No recent status changes</p>
                    </div>
                ) : recentMovements.map(m => (
                    <div key={m.id} className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors">
                        <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${
                                m.changeType === 'improved' ? 'bg-emerald-500' : 
                                m.changeType === 'declined' ? 'bg-amber-500' : 'bg-rose-500'
                            }`}></div>
                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate max-w-[120px]">{m.name}</span>
                        </div>
                        <div className="text-right">
                            <p className={`text-[9px] font-black uppercase tracking-wider ${
                                 m.changeType === 'improved' ? 'text-emerald-600 dark:text-emerald-400' : 
                                 m.changeType === 'declined' ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'
                            }`}>
                                {m.newCategory} {m.changeType === 'improved' ? '↗' : '↘'}
                            </p>
                            <p className="text-[8px] text-slate-400 uppercase font-medium mt-0.5">was {m.oldCategory}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export const PeopleDirectoryWidget: React.FC<RiskProps> = ({ people }) => {
    // Filter active people first
    const activePeople = useMemo(() => people.filter(p => p.status !== 'inactive'), [people]);

    // Column Filters
    const [nameFilter, setNameFilter] = useState('');
    const [membershipFilter, setMembershipFilter] = useState('All');
    const [genderFilter, setGenderFilter] = useState('All');
    const [riskFilter, setRiskFilter] = useState('All');
    const [engagementFilter, setEngagementFilter] = useState('All');
    const [birthdateFilter, setBirthdateFilter] = useState('');

    // Extract unique values for dropdowns
    const uniqueMemberships = useMemo(() => {
        const memberships = new Set(activePeople.map(p => p.membership).filter(Boolean) as string[]);
        return Array.from(memberships).sort();
    }, [activePeople]);

    const uniqueGenders = useMemo(() => {
        const genders = new Set(activePeople.map(p => {
            if (p.gender === 'M' || p.gender === 'Male') return 'Male';
            if (p.gender === 'F' || p.gender === 'Female') return 'Female';
            return 'Unknown';
        }));
        return Array.from(genders).sort();
    }, [activePeople]);

    const filteredPeople = useMemo(() => {
        return activePeople.filter(p => {
            const matchesName = p.name.toLowerCase().includes(nameFilter.toLowerCase());
            
            const matchesMembership = membershipFilter === 'All' || p.membership === membershipFilter;
            
            let pGender = 'Unknown';
            if (p.gender === 'M' || p.gender === 'Male') pGender = 'Male';
            else if (p.gender === 'F' || p.gender === 'Female') pGender = 'Female';
            const matchesGender = genderFilter === 'All' || pGender === genderFilter;

            const matchesRisk = riskFilter === 'All' || p.riskProfile?.category === riskFilter;
            
            const matchesEngagement = engagementFilter === 'All' || p.engagementStatus === engagementFilter;

            const matchesBirthdate = !birthdateFilter || (p.birthdate && p.birthdate.includes(birthdateFilter));

            return matchesName && matchesMembership && matchesGender && matchesRisk && matchesEngagement && matchesBirthdate;
        }).sort((a, b) => (a.riskProfile?.score || 0) - (b.riskProfile?.score || 0)); // Default sort by lowest score (highest risk)
    }, [activePeople, nameFilter, membershipFilter, genderFilter, riskFilter, engagementFilter, birthdateFilter]);

    return (
        <div className="bg-white dark:bg-slate-850 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-sm h-full flex flex-col transition-colors min-h-[500px]">
            <div className="flex justify-between items-center mb-6">
                <h4 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">People Directory</h4>
            </div>

            <div className="flex-1 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800">
                            <th className="p-3 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest min-w-[150px]">Name</th>
                            <th className="p-3 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest min-w-[120px]">Membership</th>
                            <th className="p-3 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest min-w-[100px]">Gender</th>
                            <th className="p-3 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest min-w-[100px]">Birthdate</th>
                            <th className="p-3 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest min-w-[120px]">Risk Profile</th>
                            <th className="p-3 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest min-w-[80px]">Score</th>
                            <th className="p-3 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest min-w-[120px]">Engagement</th>
                            <th className="p-3 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest text-right">Actions</th>
                        </tr>
                        {/* Filter Row */}
                        <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
                            <th className="p-2">
                                <input 
                                    type="text" 
                                    placeholder="Filter Name..." 
                                    value={nameFilter}
                                    onChange={(e) => setNameFilter(e.target.value)}
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-[10px] font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 dark:text-slate-300"
                                />
                            </th>
                            <th className="p-2">
                                <select 
                                    value={membershipFilter} 
                                    onChange={(e) => setMembershipFilter(e.target.value)}
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-[10px] font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 dark:text-slate-300"
                                >
                                    <option value="All">All</option>
                                    {uniqueMemberships.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </th>
                            <th className="p-2">
                                <select 
                                    value={genderFilter} 
                                    onChange={(e) => setGenderFilter(e.target.value)}
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-[10px] font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 dark:text-slate-300"
                                >
                                    <option value="All">All</option>
                                    {uniqueGenders.map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                            </th>
                            <th className="p-2">
                                <input 
                                    type="text" 
                                    placeholder="YYYY-MM-DD" 
                                    value={birthdateFilter}
                                    onChange={(e) => setBirthdateFilter(e.target.value)}
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-[10px] font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 dark:text-slate-300"
                                />
                            </th>
                            <th className="p-2">
                                <select 
                                    value={riskFilter} 
                                    onChange={(e) => setRiskFilter(e.target.value)}
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-[10px] font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 dark:text-slate-300"
                                >
                                    <option value="All">All</option>
                                    <option value="Healthy">Healthy</option>
                                    <option value="At Risk">At Risk</option>
                                    <option value="Disconnected">Disconnected</option>
                                </select>
                            </th>
                            <th className="p-2">
                                {/* No filter for Score currently */}
                            </th>
                            <th className="p-2">
                                <select 
                                    value={engagementFilter} 
                                    onChange={(e) => setEngagementFilter(e.target.value)}
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-[10px] font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 dark:text-slate-300"
                                >
                                    <option value="All">All</option>
                                    <option value="Core">Core</option>
                                    <option value="Regular">Regular</option>
                                    <option value="Sporadic">Sporadic</option>
                                    <option value="Inactive">Inactive</option>
                                </select>
                            </th>
                            <th className="p-2"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                        {filteredPeople.slice(0, 50).map(p => (
                            <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                <td className="p-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-black overflow-hidden">
                                            {p.avatar ? <img src={p.avatar} className="w-full h-full object-cover" alt={p.name}/> : p.name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-slate-900 dark:text-white">{p.name}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-3">
                                    {p.membership ? (
                                        <span className="text-[9px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                            {p.membership}
                                        </span>
                                    ) : (
                                        <span className="text-[9px] text-slate-300 italic">None</span>
                                    )}
                                </td>
                                <td className="p-3">
                                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                        {p.gender === 'M' || p.gender === 'Male' ? 'Male' : p.gender === 'F' || p.gender === 'Female' ? 'Female' : ''}
                                    </span>
                                </td>
                                <td className="p-3">
                                    {p.birthdate ? (
                                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                            {new Date(p.birthdate).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}
                                        </span>
                                    ) : (
                                        <span className="text-[10px] text-slate-300">-</span>
                                    )}
                                </td>
                                <td className="p-3">
                                    <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider ${
                                        p.riskProfile?.category === 'Healthy' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' :
                                        p.riskProfile?.category === 'At Risk' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' :
                                        'bg-rose-100 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'
                                    }`}>
                                        {p.riskProfile?.category || 'Unknown'}
                                    </span>
                                </td>
                                <td className="p-3">
                                    <span className={`font-bold text-xs ${
                                        (p.riskProfile?.score || 0) < 50 ? 'text-rose-500' : 'text-slate-700 dark:text-slate-300'
                                    }`}>
                                        {p.riskProfile?.score}
                                    </span>
                                </td>
                                <td className="p-3">
                                    <span className={`text-[9px] font-bold uppercase tracking-wider ${
                                        p.engagementStatus === 'Core' ? 'text-indigo-600 dark:text-indigo-400' : 
                                        p.engagementStatus === 'Inactive' ? 'text-slate-400' : 'text-slate-600 dark:text-slate-300'
                                    }`}>
                                        {p.engagementStatus}
                                    </span>
                                </td>
                                <td className="p-3 text-right">
                                    <a 
                                        href={`https://people.planningcenteronline.com/people/${p.id}`}
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-[9px] font-black uppercase text-indigo-500 hover:text-indigo-600 tracking-widest"
                                    >
                                        View
                                    </a>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Showing {Math.min(50, filteredPeople.length)} of {filteredPeople.length} people</p>
                {filteredPeople.length > 50 && <span className="text-[9px] text-indigo-500 font-bold">List truncated for performance</span>}
            </div>
        </div>
    );
};
