
import React from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie
} from 'recharts';
import { AttendanceData, GivingData, DemographicData } from '../types';

interface HealthIndicator {
    label: string;
    value: number; // Percentage 0-100
    color: string;
    weight: number; // Configured weight from Risk Profile
}

interface ChartProps {
  attendance: AttendanceData[];
  giving: GivingData[];
  demographics: DemographicData[];
  healthIndicators: HealthIndicator[];
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#10b981'];

const TOOLTIP_STYLE = {
    borderRadius: '12px',
    border: 'none',
    backgroundColor: '#1e293b',
    color: '#fff',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
};

export const DashboardCharts: React.FC<ChartProps> = ({ attendance, giving, demographics, healthIndicators }) => {
  const totalPeople = demographics.reduce((acc, curr) => acc + curr.value, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
      {/* Attendance Trend */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-slate-800 font-semibold mb-6 flex justify-between items-center">
          Attendance Trends
          <span className="text-xs text-slate-400 font-normal">Last 7 Services</span>
        </h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
            <AreaChart data={attendance}>
              <defs>
                <linearGradient id="colorAttend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="date" 
                axisLine={false} 
                tickLine={false} 
                tick={{fontSize: 12, fill: '#94a3b8'}}
                tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}
              />
              <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
              <Tooltip 
                contentStyle={TOOLTIP_STYLE}
                itemStyle={{ color: '#fff' }}
              />
              <Area 
                type="monotone" 
                dataKey="attendance" 
                stroke="#6366f1" 
                fillOpacity={1} 
                fill="url(#colorAttend)" 
                strokeWidth={3}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Giving */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-slate-800 font-semibold mb-6 flex justify-between items-center">
          Monthly Giving
          <span className="text-xs text-slate-400 font-normal">Last 6 Months</span>
        </h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
            <BarChart data={giving}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="month" 
                axisLine={false} 
                tickLine={false} 
                tick={{fontSize: 12, fill: '#94a3b8'}} 
                tickFormatter={(value) => {
                  const [year, month] = value.split('-');
                  const date = new Date(parseInt(year), parseInt(month) - 1);
                  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                }}
              />
              <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
              <Tooltip 
                contentStyle={TOOLTIP_STYLE}
                itemStyle={{ color: '#fff' }}
                formatter={(value: number) => `$${value.toLocaleString()}`}
                labelFormatter={(value) => {
                  const [year, month] = value.split('-');
                  const date = new Date(parseInt(year), parseInt(month) - 1);
                  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                }}
              />
              <Bar dataKey="amount" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Demographics */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-slate-800 font-semibold mb-6">Age Demographics for Church</h3>
        <div className="h-64 w-full flex items-center">
          {demographics && demographics.length > 0 ? (
            <>
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                    <PieChart>
                    <Pie
                        data={demographics}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                    >
                        {demographics.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip 
                        contentStyle={TOOLTIP_STYLE}
                        itemStyle={{ color: '#fff' }}
                        formatter={(val: number) => [
                            `${val} (${totalPeople > 0 ? ((val / totalPeople) * 100).toFixed(1) : 0}%)`, 
                            'People'
                        ]} 
                    />
                    </PieChart>
                </ResponsiveContainer>
                <div className="w-1/3 space-y-2">
                    {demographics.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        <span className="text-xs text-slate-600">{entry.name}</span>
                        <span className="text-xs font-bold ml-auto">
                            {totalPeople > 0 ? ((entry.value / totalPeople) * 100).toFixed(0) : 0}%
                        </span>
                    </div>
                    ))}
                </div>
            </>
          ) : (
              <div className="w-full flex items-center justify-center text-slate-400 text-xs font-bold">
                  No demographic data available.
              </div>
          )}
        </div>
      </div>

      {/* Health Metrics based on Risk Profile */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex justify-between items-center mb-6">
            <h3 className="text-slate-800 font-semibold">Health Indicators</h3>
            <span className="text-[10px] uppercase font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded">Based on Risk Config</span>
        </div>
        <div className="space-y-5">
            {healthIndicators.map((indicator, idx) => {
                // Determine style based on color prop
                let bgClass = 'bg-slate-50 border-slate-100';
                let textClass = 'text-slate-700';
                let barClass = 'bg-slate-500';
                
                if (indicator.color === 'indigo') {
                    bgClass = 'bg-indigo-50 border-indigo-100';
                    textClass = 'text-indigo-700';
                    barClass = 'bg-indigo-600';
                } else if (indicator.color === 'emerald') {
                    bgClass = 'bg-emerald-50 border-emerald-100';
                    textClass = 'text-emerald-700';
                    barClass = 'bg-emerald-600';
                } else if (indicator.color === 'amber') {
                    bgClass = 'bg-amber-50 border-amber-100';
                    textClass = 'text-amber-700';
                    barClass = 'bg-amber-600';
                } else if (indicator.color === 'rose') {
                    bgClass = 'bg-rose-50 border-rose-100';
                    textClass = 'text-rose-700';
                    barClass = 'bg-rose-600';
                } else if (indicator.color === 'violet') {
                    bgClass = 'bg-violet-50 border-violet-100';
                    textClass = 'text-violet-700';
                    barClass = 'bg-violet-600';
                }

                return (
                    <div key={idx} className={`p-4 rounded-lg border ${bgClass}`}>
                        <div className="flex justify-between items-center mb-1">
                            <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold ${textClass}`}>{indicator.label}</span>
                                <span className="text-[9px] font-bold opacity-60 uppercase bg-white/50 px-1.5 rounded text-slate-500">Weight: {indicator.weight}</span>
                            </div>
                            <span className={`text-sm font-black ${textClass}`}>{indicator.value.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-white/50 rounded-full h-2 overflow-hidden">
                            <div className={`${barClass} h-2 rounded-full transition-all duration-1000 ease-out`} style={{ width: `${Math.min(100, indicator.value)}%` }} />
                        </div>
                    </div>
                );
            })}
            {healthIndicators.length === 0 && (
                <div className="text-center text-slate-400 text-xs py-8">
                    No risk factors configured with weight {'>'} 0.
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
