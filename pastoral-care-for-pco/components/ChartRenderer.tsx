import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

interface Props {
  module: string;
  chartType: string;
  filters: string;
}

const mockData = {
  'Giving': [
    { name: 'Jan', value: 4000 },
    { name: 'Feb', value: 3000 },
    { name: 'Mar', value: 5000 },
    { name: 'Apr', value: 4500 },
  ],
  'Groups': [
    { name: 'Week 1', value: 120 },
    { name: 'Week 2', value: 135 },
    { name: 'Week 3', value: 125 },
    { name: 'Week 4', value: 150 },
  ],
  'People': [
    { name: 'New', value: 20 },
    { name: 'Active', value: 150 },
    { name: 'Lapsed', value: 30 },
  ],
  'Metrics': [
    { name: 'Mon', value: 10 },
    { name: 'Tue', value: 15 },
    { name: 'Wed', value: 12 },
    { name: 'Thu', value: 18 },
  ]
};

export const ChartRenderer: React.FC<Props> = ({ module, chartType, filters }) => {
  const data = mockData[module as keyof typeof mockData] || mockData['Giving'];

  return (
    <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
      <h4 className="text-sm font-semibold text-slate-800 mb-2">{module} - {chartType}</h4>
      <p className="text-xs text-slate-500 mb-4">{filters || 'All time'}</p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          {module === 'Giving' ? (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#4f46e5" />
            </BarChart>
          ) : (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={2} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};
