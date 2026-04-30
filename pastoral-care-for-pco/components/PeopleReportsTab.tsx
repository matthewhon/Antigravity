import React, { useMemo, useState } from 'react';
import { PeopleDashboardData } from '../types';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';

interface PeopleReportsTabProps {
  data: PeopleDashboardData;
}

type TimeFilter = '3_months' | '6_months' | '12_months' | 'all_time';

const STATUS_COLORS: Record<string, string> = {
  'Active': '#10b981',      // Emerald
  'Inactive': '#f43f5e',    // Rose
  'Pending': '#f59e0b',     // Amber
  'Unknown': '#94a3b8',     // Slate
};

const AGE_COLORS: Record<string, string> = {
  '0-18': '#38bdf8',   // Sky
  '19-30': '#a78bfa',  // Violet
  '31-50': '#fbbf24',  // Amber
  '51-70': '#fb7185',  // Rose
  '70+': '#94a3b8',    // Slate
  'Unknown': '#cbd5e1' // Light Slate
};

export const PeopleReportsTab: React.FC<PeopleReportsTabProps> = ({ data }) => {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('12_months');

  const months = useMemo(() => {
    if (!data.allPeople || data.allPeople.length === 0) return [];

    const now = new Date();
    let startDate = new Date();
    
    if (timeFilter === '3_months') {
      startDate.setMonth(now.getMonth() - 3);
    } else if (timeFilter === '6_months') {
      startDate.setMonth(now.getMonth() - 6);
    } else if (timeFilter === '12_months') {
      startDate.setMonth(now.getMonth() - 12);
    } else {
      // all_time - find the earliest person
      const earliest = data.allPeople.reduce((min, p) => {
        const d = new Date(p.createdAt);
        return d < min ? d : min;
      }, new Date());
      startDate = new Date(Math.max(earliest.getTime(), new Date('2000-01-01').getTime()));
    }

    // Set to start of month
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    const mList: { label: string; date: Date }[] = [];
    let current = new Date(startDate);
    while (current <= now) {
      mList.push({
        label: current.toLocaleDateString('default', { month: 'short', year: 'numeric' }),
        date: new Date(current)
      });
      current.setMonth(current.getMonth() + 1);
    }
    return mList;
  }, [data.allPeople, timeFilter]);

  const chartData = useMemo(() => {
    if (months.length === 0) return [];

    // Calculate cumulative totals for each month
    const result = months.map(m => {
      const monthEnd = new Date(m.date);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      monthEnd.setDate(0); // last day of month
      monthEnd.setHours(23, 59, 59, 999);

      const counts: Record<string, number> = {
        Active: 0,
        Inactive: 0,
        Pending: 0,
        Unknown: 0
      };

      data.allPeople.forEach(p => {
        const created = new Date(p.createdAt);
        if (created <= monthEnd) {
          let currentStatus = p.status || 'Unknown';
          
          // Reconstruct historical status by walking backward from today
          if (data.recentStatusChanges) {
            const futureChanges = data.recentStatusChanges.filter(
                c => c.personId === p.id && c.type === 'status' && new Date(c.date) > monthEnd
            );
            
            // Sort descending (most recent first) to revert in correct order
            futureChanges.sort((a, b) => b.timestamp - a.timestamp);
            
            for (const change of futureChanges) {
                currentStatus = change.oldValue || 'Unknown';
            }
          }

          if (counts[currentStatus] !== undefined) {
            counts[currentStatus]++;
          } else {
            counts[currentStatus] = 1;
            // Add custom colors for unexpected statuses if needed
            if (!STATUS_COLORS[currentStatus]) {
               STATUS_COLORS[currentStatus] = '#6366f1'; // default indigo
            }
          }
        }
      });

      return {
        name: m.label,
        ...counts
      };
    });

    return result;
  }, [data.allPeople, data.recentStatusChanges, months]);

  const ageChartData = useMemo(() => {
    if (months.length === 0) return [];

    return months.map(m => {
      const monthEnd = new Date(m.date);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      monthEnd.setDate(0); 
      monthEnd.setHours(23, 59, 59, 999);

      const ageBuckets: Record<string, number> = { '0-18': 0, '19-30': 0, '31-50': 0, '51-70': 0, '70+': 0, 'Unknown': 0 };

      data.allPeople.forEach(p => {
        const created = new Date(p.createdAt);
        if (created <= monthEnd) {
          let currentStatus = p.status || 'Unknown';
          
          if (data.recentStatusChanges) {
            const futureChanges = data.recentStatusChanges.filter(
                c => c.personId === p.id && c.type === 'status' && new Date(c.date) > monthEnd
            );
            futureChanges.sort((a, b) => b.timestamp - a.timestamp);
            for (const change of futureChanges) {
                currentStatus = change.oldValue || 'Unknown';
            }
          }

          // Only count Active people for demographics
          if (currentStatus === 'Active') {
            if (p.birthdate) {
                const birthYear = parseInt(p.birthdate.split('-')[0]);
                const monthEndYear = monthEnd.getFullYear();
                const age = monthEndYear - birthYear;
                if (age <= 18) ageBuckets['0-18']++;
                else if (age <= 30) ageBuckets['19-30']++;
                else if (age <= 50) ageBuckets['31-50']++;
                else if (age <= 70) ageBuckets['51-70']++;
                else ageBuckets['70+']++;
            } else {
                ageBuckets['Unknown']++;
            }
          }
        }
      });

      return {
        name: m.label,
        ...ageBuckets
      };
    });
  }, [data.allPeople, data.recentStatusChanges, months]);

  // Extract all unique status keys from the data to render Areas
  const statusKeys = useMemo(() => {
    const keys = new Set<string>();
    chartData.forEach(d => {
      Object.keys(d).forEach(k => {
        if (k !== 'name') keys.add(k);
      });
    });
    return Array.from(keys);
  }, [chartData]);

  const ageKeys = ['0-18', '19-30', '31-50', '51-70', '70+', 'Unknown'];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 lg:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h4 className="text-xl font-black text-slate-900 dark:text-white">Status Over Time</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Cumulative growth of people by their current status.</p>
          </div>
          
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm font-semibold rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
          >
            <option value="3_months">Last 3 Months</option>
            <option value="6_months">Last 6 Months</option>
            <option value="12_months">Last 12 Months</option>
            <option value="all_time">All Time</option>
          </select>
        </div>

        <div className="h-[400px] w-full">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  {statusKeys.map(key => (
                    <linearGradient key={key} id={`color${key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={STATUS_COLORS[key] || '#6366f1'} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={STATUS_COLORS[key] || '#6366f1'} stopOpacity={0}/>
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                <XAxis 
                  dataKey="name" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1e293b', 
                    border: 'none', 
                    borderRadius: '12px',
                    color: '#f8fafc',
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                  }}
                  itemStyle={{ fontSize: '13px', fontWeight: 600 }}
                />
                <Legend 
                  verticalAlign="top" 
                  height={36} 
                  iconType="circle"
                  wrapperStyle={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}
                />
                {statusKeys.map(key => (
                  <Area 
                    key={key}
                    type="monotone" 
                    dataKey={key} 
                    stackId="1"
                    stroke={STATUS_COLORS[key] || '#6366f1'} 
                    strokeWidth={2}
                    fill={`url(#color${key})`} 
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400">
              No data available for the selected time range.
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 lg:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h4 className="text-xl font-black text-slate-900 dark:text-white">Age Demographics Over Time</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Active members grouped by age bracket.</p>
          </div>
        </div>
        <div className="h-[400px] w-full">
          {ageChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={ageChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  {ageKeys.map(key => (
                    <linearGradient key={key} id={`ageColor${key.replace('+','plus')}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={AGE_COLORS[key]} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={AGE_COLORS[key]} stopOpacity={0}/>
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                <XAxis 
                  dataKey="name" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1e293b', 
                    border: 'none', 
                    borderRadius: '12px',
                    color: '#f8fafc',
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                  }}
                  itemStyle={{ fontSize: '13px', fontWeight: 600 }}
                />
                <Legend 
                  verticalAlign="top" 
                  height={36} 
                  iconType="circle"
                  wrapperStyle={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}
                />
                {ageKeys.map(key => (
                  <Area 
                    key={key}
                    type="monotone" 
                    dataKey={key} 
                    stackId="1"
                    stroke={AGE_COLORS[key]} 
                    strokeWidth={2}
                    fill={`url(#ageColor${key.replace('+','plus')})`} 
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400">
              No data available for the selected time range.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
