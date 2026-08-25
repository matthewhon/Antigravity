import React from 'react';
import { Sparkles, Award, ArrowUpRight, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { AssessmentAggregates } from '../../services/assessmentAnalyticsService';

interface SpiritualGiftsDistWidgetProps {
  analytics: AssessmentAggregates | null;
  onNavigateToGifts?: () => void;
}

export const SpiritualGiftsDistWidget: React.FC<SpiritualGiftsDistWidgetProps> = ({
  analytics,
  onNavigateToGifts
}) => {
  if (!analytics || analytics.giftsCount === 0) {
    return (
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between h-full space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-black text-slate-900 dark:text-white">Spiritual Gifts Profile</h4>
              <p className="text-[11px] text-slate-400">Romans 12:6-8 Distribution</p>
            </div>
          </div>
        </div>
        <div className="text-center py-6 space-y-2">
          <Award className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">No Spiritual Gifts assessments completed yet.</p>
          {onNavigateToGifts && (
            <button
              type="button"
              onClick={onNavigateToGifts}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Launch Assessment Campaign</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    );
  }

  const { gifts, giftsCount } = analytics;
  const chartData = gifts.distribution.map(d => ({
    name: d.gift,
    count: d.count,
    percent: d.percent,
    color: d.color
  }));

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between h-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-black text-slate-900 dark:text-white">Spiritual Gifts Profile</h4>
            <p className="text-[11px] text-slate-400">{giftsCount} Assessment{giftsCount === 1 ? '' : 's'} Completed</p>
          </div>
        </div>

        {onNavigateToGifts && (
          <button
            type="button"
            onClick={onNavigateToGifts}
            className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Manage</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Top & Scarce Callouts */}
      <div className="grid grid-cols-2 gap-2">
        {gifts.topGift && (
          <div className="p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-800/40 space-y-0.5">
            <span className="text-[9px] font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-wider">Top Gift</span>
            <div className="text-xs font-black text-slate-900 dark:text-white flex items-center justify-between">
              <span>{gifts.topGift.gift}</span>
              <span className="text-indigo-600 dark:text-indigo-400">{gifts.topGift.percent}%</span>
            </div>
          </div>
        )}

        {gifts.scarceGift && (
          <div className="p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-800/40 space-y-0.5">
            <span className="text-[9px] font-black uppercase text-amber-700 dark:text-amber-400 tracking-wider">Growth Area</span>
            <div className="text-xs font-black text-slate-900 dark:text-white flex items-center justify-between">
              <span>{gifts.scarceGift.gift}</span>
              <span className="text-amber-700 dark:text-amber-400">{gifts.scarceGift.percent}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Bar Chart */}
      <div className="h-36 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="p-2 rounded-xl bg-slate-900 text-white text-xs border border-slate-800 shadow-lg">
                      <span className="font-bold">{data.name}</span>: {data.count} people ({data.percent}%)
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
