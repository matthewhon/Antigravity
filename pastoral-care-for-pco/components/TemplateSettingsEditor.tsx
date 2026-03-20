import React from 'react';
import { TemplateSettings } from '../types';

interface Props {
  settings: TemplateSettings;
  onChange: (settings: TemplateSettings) => void;
}

export const TemplateSettingsEditor: React.FC<Props> = ({ settings, onChange }) => {
  return (
    <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
      <h3 className="font-semibold text-sm text-slate-900 mb-4 uppercase tracking-wider">Template Settings</h3>
      <div className="space-y-4">
        {Object.entries(settings).map(([key, value]) => (
          <div key={key}>
            <label className="block text-xs font-medium text-slate-700 capitalize">{key}</label>
            <input 
              type={key.toLowerCase().includes('color') ? 'color' : 'text'}
              value={value} 
              onChange={(e) => onChange({ ...settings, [key]: e.target.value })}
              className={`w-full p-2 border border-slate-300 rounded-lg text-sm ${key.toLowerCase().includes('color') ? 'h-10' : ''}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
