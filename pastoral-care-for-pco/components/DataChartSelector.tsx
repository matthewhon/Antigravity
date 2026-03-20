import React, { useState } from 'react';

interface Props {
  onInsert: (module: string, chartType: string, filters: string) => void;
}

export const DataChartSelector: React.FC<Props> = ({ onInsert }) => {
  const [module, setModule] = useState('Giving');
  const [chartType, setChartType] = useState('Key Financial Overview');
  const [filters, setFilters] = useState('');

  const chartOptions: Record<string, string[]> = {
    'Giving': ['Key Financial Overview', 'Fund Performance'],
    'Groups': ['Attendance Trends', 'Group Growth'],
    'People': ['Demographics', 'Engagement'],
    'Metrics': ['Custom Metrics', 'Ministry Trends']
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">Module</label>
        <select 
          value={module} 
          onChange={(e) => { setModule(e.target.value); setChartType(chartOptions[e.target.value][0]); }}
          className="w-full p-2 border border-slate-300 rounded-lg"
        >
          {Object.keys(chartOptions).map(m => <option key={m}>{m}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Chart Type</label>
        <select 
          value={chartType} 
          onChange={(e) => setChartType(e.target.value)}
          className="w-full p-2 border border-slate-300 rounded-lg"
        >
          {chartOptions[module].map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Filters</label>
        <input 
          type="text" 
          value={filters} 
          onChange={(e) => setFilters(e.target.value)}
          placeholder="e.g., Last 30 days"
          className="w-full p-2 border border-slate-300 rounded-lg"
        />
      </div>
      <button 
        onClick={() => onInsert(module, chartType, filters)}
        className="w-full p-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition"
      >
        Insert Chart
      </button>
    </div>
  );
};
