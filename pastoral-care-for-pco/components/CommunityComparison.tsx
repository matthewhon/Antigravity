
import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
  PieChart, Pie
} from 'recharts';
import { PeopleDashboardData, CensusStats } from '../types';

interface CommunityComparisonProps {
  peopleData: PeopleDashboardData;
  censusData: CensusStats | null;
  type: 'age' | 'gender';
  currentTheme?: 'traditional' | 'dark';
}

const COLORS = {
  church: '#6366f1', // Indigo
  community: '#94a3b8' // Slate
};

const TOOLTIP_STYLE = {
    borderRadius: '12px',
    border: 'none',
    backgroundColor: '#1e293b',
    color: '#fff',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
};

export const CommunityComparison: React.FC<CommunityComparisonProps> = ({ peopleData, censusData, type, currentTheme = 'traditional' }) => {
  if (!censusData) return (
      <div className="h-full flex items-center justify-center text-center text-slate-400 dark:text-slate-500 text-xs font-bold bg-slate-50 dark:bg-slate-900 rounded-2xl p-6">
          <p>Census data unavailable for comparison.</p>
      </div>
  );

  // --- Data Preparation ---

  if (type === 'age') {
      // 1. Age Comparison
      // Normalize Church Data (Percentages)
      const churchTotal = peopleData.stats.total || 1;
      const churchAge = {
        youth: (peopleData.ageData.find(d => d.range === '0-18')?.count || 0) / churchTotal * 100,
        youngAdult: (peopleData.ageData.find(d => d.range === '19-30')?.count || 0) / churchTotal * 100,
        // Mapping Church 31-70 to Census 'Adults' (31-64 approx)
        adult: ((peopleData.ageData.find(d => d.range === '31-50')?.count || 0) + (peopleData.ageData.find(d => d.range === '51-70')?.count || 0)) / churchTotal * 100,
        senior: (peopleData.ageData.find(d => d.range === '70+')?.count || 0) / churchTotal * 100,
      };

      // Normalize Census Data (Percentages)
      const censusTotal = censusData.totalPopulation || 1;
      const censusAge = {
        youth: (censusData.age?.under18 || 0) / censusTotal * 100,
        youngAdult: (censusData.age?.youngAdults || 0) / censusTotal * 100,
        adult: (censusData.age?.adults || 0) / censusTotal * 100,
        senior: (censusData.age?.seniors || 0) / censusTotal * 100,
      };

      const ageChartData = [
        { name: 'Youth (<18)', Church: churchAge.youth, Community: censusAge.youth },
        { name: 'Young Adult (18-30)', Church: churchAge.youngAdult, Community: censusAge.youngAdult },
        { name: 'Adult (31-64)', Church: churchAge.adult, Community: censusAge.adult },
        { name: 'Senior (65+)', Church: churchAge.senior, Community: censusAge.senior },
      ];

      const gridColor = currentTheme === 'dark' ? '#334155' : '#f1f5f9';
      const axisColor = currentTheme === 'dark' ? '#94a3b8' : '#94a3b8';
      const labelColor = currentTheme === 'dark' ? '#94a3b8' : '#64748b';

      return (
        <div className="h-full w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                <BarChart data={ageChartData} barGap={0} layout="vertical" margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke={gridColor} strokeOpacity={0.2} />
                    <XAxis 
                        type="number" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fontSize: 10, fontWeight: 800, fill: axisColor}} 
                        tickFormatter={(val) => `${Math.round(val)}%`}
                    />
                    <YAxis 
                        dataKey="name" 
                        type="category" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fontSize: 10, fontWeight: 700, fill: labelColor}} 
                        width={100}
                    />
                    <Tooltip 
                        cursor={{fill: currentTheme === 'dark' ? '#334155' : '#f8fafc'}}
                        contentStyle={TOOLTIP_STYLE}
                        itemStyle={{ color: '#fff' }}
                        formatter={(val: number) => [`${val.toFixed(1)}%`]}
                    />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{fontSize: '10px', fontWeight: 'bold', color: axisColor}} />
                    <Bar dataKey="Church" fill={COLORS.church} radius={[0, 4, 4, 0]} barSize={12} />
                    <Bar dataKey="Community" fill={COLORS.community} radius={[0, 4, 4, 0]} barSize={12} />
                </BarChart>
            </ResponsiveContainer>
        </div>
      );
  }

  if (type === 'gender') {
      // 2. Gender Comparison
      // Church
      const churchMaleCount = peopleData.genderData.find(d => d.name === 'Male')?.value || 0;
      const churchFemaleCount = peopleData.genderData.find(d => d.name === 'Female')?.value || 0;
      const churchGenderTotal = churchMaleCount + churchFemaleCount || 1;
      
      // Census
      const censusMale = censusData.gender?.male || 0;
      const censusFemale = censusData.gender?.female || 0;
      const censusGenderTotal = censusMale + censusFemale || 1;

      const genderComparisonData = [
        { name: 'Male', Church: (churchMaleCount / churchGenderTotal) * 100, Community: (censusMale / censusGenderTotal) * 100 },
        { name: 'Female', Church: (churchFemaleCount / churchGenderTotal) * 100, Community: (censusFemale / censusGenderTotal) * 100 },
      ];

      return (
        <div className="h-full w-full flex flex-col justify-center">
             <div className="space-y-6">
                {genderComparisonData.map(item => (
                    <div key={item.name}>
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase">{item.name}</span>
                        </div>
                        
                        {/* Comparison Bars */}
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] font-bold text-indigo-500 dark:text-indigo-400 w-12 text-right">Church</span>
                                <div className="flex-1 bg-slate-50 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500 rounded-full" style={{width: `${item.Church}%`}}></div>
                                </div>
                                <span className="text-[9px] font-bold text-slate-700 dark:text-slate-300 w-8">{item.Church.toFixed(0)}%</span>
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] font-bold text-slate-400 w-12 text-right">Area</span>
                                <div className="flex-1 bg-slate-50 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                                    <div className="h-full bg-slate-400 rounded-full" style={{width: `${item.Community}%`}}></div>
                                </div>
                                <span className="text-[9px] font-bold text-slate-700 dark:text-slate-300 w-8">{item.Community.toFixed(0)}%</span>
                            </div>
                        </div>
                    </div>
                ))}
             </div>
             <div className="mt-6 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                 <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                     <strong>Insight:</strong> A significant deviation ({'>'}10%) from community gender ratios may indicate a need for targeted men's or women's ministry focus.
                 </p>
             </div>
        </div>
      );
  }

  return null;
};
