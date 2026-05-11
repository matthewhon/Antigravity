import React, { useEffect, useState } from 'react';
import { Drawer } from './Drawer';
import { firestore } from '../services/firestoreService';
import { PcoPerson, RiskChangeRecord } from '../types';

interface PersonProfileDrawerProps {
  personId: string | null;
  churchId: string;
  onClose: () => void;
}

export const PersonProfileDrawer: React.FC<PersonProfileDrawerProps> = ({ personId, churchId, onClose }) => {
  const [person, setPerson] = useState<PcoPerson | null>(null);
  const [timeline, setTimeline] = useState<RiskChangeRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!personId || !churchId) return;

    const loadData = async () => {
      setLoading(true);
      try {
        // Fetch person
        const people = await firestore.getPeople(churchId);
        const p = people.find(p => p.id === personId);
        if (p) setPerson(p);

        // Fetch timeline
        const changes = await firestore.getPersonRiskTimeline(churchId, personId);
        setTimeline(changes);
      } catch (e) {
        console.error("Failed to load person details", e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [personId, churchId]);

  if (!personId) return null;

  return (
    <Drawer isOpen={!!personId} onClose={onClose} title="Person Profile">
      {loading ? (
        <div className="flex justify-center p-8 text-slate-400">Loading...</div>
      ) : person ? (
        <div className="space-y-6">
          {/* Header Info */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-200 flex-shrink-0">
              {person.avatar ? (
                <img src={person.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-black text-slate-400 text-xl">
                  {person.name.charAt(0)}
                </div>
              )}
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">{person.name}</h2>
              <div className="flex gap-2 mt-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {person.membership || 'Guest'}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2">
            <a 
              href={`https://people.planningcenteronline.com/people/${person.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 rounded-xl text-center transition-colors"
            >
              View in PCO
            </a>
          </div>

          {/* Current Risk Status */}
          {person.riskProfile && (
            <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-3">Current Risk Profile</h3>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black \${
                  person.riskProfile.category === 'Healthy' ? 'bg-emerald-100 text-emerald-600' :
                  person.riskProfile.category === 'At Risk' ? 'bg-amber-100 text-amber-600' :
                  'bg-rose-100 text-rose-600'
                }`}>
                  {person.riskProfile.score}
                </div>
                <div>
                  <span className={`text-sm font-black \${
                    person.riskProfile.category === 'Healthy' ? 'text-emerald-600' :
                    person.riskProfile.category === 'At Risk' ? 'text-amber-600' :
                    'text-rose-600'
                  }`}>
                    {person.riskProfile.category}
                  </span>
                </div>
              </div>
              {person.riskProfile.factors && person.riskProfile.factors.length > 0 && (
                <ul className="space-y-1">
                  {person.riskProfile.factors.map((f, i) => (
                    <li key={i} className="text-xs text-slate-600 flex gap-2">
                      <span className="text-rose-500">•</span> {f}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Timeline Widget */}
          <div>
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-4">Risk Progression Timeline</h3>
            {timeline.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No historical risk changes recorded.</p>
            ) : (
              <div className="relative border-l-2 border-slate-200 ml-3 space-y-6 pb-4">
                {timeline.map((record) => (
                  <div key={record.id} className="relative pl-6">
                    {/* Timeline Dot */}
                    <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white \${
                      record.newCategory === 'Healthy' ? 'bg-emerald-500' :
                      record.newCategory === 'At Risk' ? 'bg-amber-500' :
                      'bg-rose-500'
                    }`} />
                    
                    {/* Content */}
                    <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          {new Date(record.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span className="text-xs font-black text-slate-600">
                          {record.oldCategory} ➝ <span className={`\${
                            record.newCategory === 'Healthy' ? 'text-emerald-600' :
                            record.newCategory === 'At Risk' ? 'text-amber-600' :
                            'text-rose-600'
                          }`}>{record.newCategory}</span>
                        </span>
                      </div>
                      
                      {record.oldScore !== undefined && record.newScore !== undefined && (
                        <div className="text-xs text-slate-500 mb-2 font-medium">
                          Score changed from {record.oldScore} to {record.newScore}
                        </div>
                      )}

                      {record.reasons && record.reasons.length > 0 && (
                        <div className="mt-3">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Triggered by:</p>
                          <ul className="space-y-1">
                            {record.reasons.map((r, i) => (
                              <li key={i} className="text-xs text-slate-600">• {r}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-sm text-slate-500">Person not found.</div>
      )}
    </Drawer>
  );
};
