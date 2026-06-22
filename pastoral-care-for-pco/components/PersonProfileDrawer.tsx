import React, { useEffect, useState } from 'react';
import { Drawer } from './Drawer';
import { firestore } from '../services/firestoreService';
import { PcoPerson, RiskChangeRecord } from '../types';
import { useTenantData } from '../contexts/TenantDataContext';
import { Mail, Phone, Send, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

const API_BASE = '';

interface PersonProfileDrawerProps {
  personId: string | null;
  churchId: string;
  onClose: () => void;
}

export const PersonProfileDrawer: React.FC<PersonProfileDrawerProps> = ({ personId, churchId, onClose }) => {
  const { user, church } = useTenantData();
  const [person, setPerson] = useState<PcoPerson | null>(null);
  const [timeline, setTimeline] = useState<RiskChangeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [smsBody, setSmsBody] = useState('');
  const [sendingSms, setSendingSms] = useState(false);
  const [smsError, setSmsError] = useState('');
  const [smsSuccess, setSmsSuccess] = useState(false);

  useEffect(() => {
    if (smsSuccess) {
      const timer = setTimeout(() => setSmsSuccess(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [smsSuccess]);

  const handleSendSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!person || !person.phone) return;
    if (!smsBody.trim()) return;

    setSendingSms(true);
    setSmsError('');
    setSmsSuccess(false);

    try {
      const cleanedPhone = person.phone.replace(/[^\d+]/g, '');
      const res = await fetch(`${API_BASE}/api/messaging/send-individual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          churchId,
          toPhone: cleanedPhone,
          body: smsBody.trim(),
          sentBy: user?.id || null,
          sentByName: user?.name || null,
          personId: person.id,
          personName: person.name,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Send failed (HTTP ${res.status})`);
      }

      setSmsSuccess(true);
      setSmsBody('');
      // Notify the Recommended Follow-Ups widget that this person was contacted
      window.dispatchEvent(new CustomEvent('careFollowUpCompleted', { detail: person.id }));
    } catch (err: any) {
      console.error('Failed to send SMS', err);
      setSmsError(err.message || 'An error occurred while sending the message.');
    } finally {
      setSendingSms(false);
    }
  };

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
                <img src={person.avatar} alt="" width="64" height="64" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-black text-slate-400 text-xl">
                  {person.name.charAt(0)}
                </div>
              )}
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">{person.name}</h2>
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
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 text-xs font-bold py-2 rounded-xl text-center transition-colors"
            >
              View in PCO
            </a>
          </div>

          {/* Contact Details */}
          <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">Contact Information</h3>
            <div className="space-y-2">
              {/* Email */}
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                {person.email ? (
                  <a 
                    href={`mailto:${person.email}`} 
                    className="text-indigo-600 dark:text-indigo-400 hover:underline break-all font-semibold"
                  >
                    {person.email}
                  </a>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500 italic">No email address</span>
                )}
              </div>
              
              {/* Phone */}
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                {person.phone ? (
                  <a 
                    href={`tel:${person.phone}`} 
                    className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                  >
                    {person.phone}
                  </a>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500 italic">No phone number</span>
                )}
              </div>
            </div>
          </div>

          {/* Send SMS Section */}
          {church?.smsSettings?.smsEnabled && (
            <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">Send SMS Message</h3>
              
              {!person.phone ? (
                <p className="text-xs text-slate-500 italic">SMS sending is unavailable because this person has no phone number.</p>
              ) : (
                <form onSubmit={handleSendSms} className="space-y-3">
                  <div>
                    <textarea
                      value={smsBody}
                      onChange={(e) => {
                        setSmsBody(e.target.value);
                        if (smsError) setSmsError('');
                        if (smsSuccess) setSmsSuccess(false);
                      }}
                      placeholder={`Type a message to ${person.name}...`}
                      rows={3}
                      maxLength={1600}
                      className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 p-3 outline-none resize-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-colors"
                      disabled={sendingSms}
                    />
                    <div className="flex justify-between items-center mt-1 text-[10px] text-slate-400 font-bold uppercase tracking-widest px-1">
                      <span>{smsBody.length} characters</span>
                      <span>{Math.ceil(smsBody.length / 160) || 0} segment{Math.ceil(smsBody.length / 160) !== 1 ? 's' : ''}</span>
                    </div>
                  </div>

                  {smsError && (
                    <div className="flex items-start gap-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl p-3">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{smsError}</span>
                    </div>
                  )}

                  {smsSuccess && (
                    <div className="flex items-start gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-xl p-3">
                      <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>Message sent successfully!</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={sendingSms || !smsBody.trim()}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer disabled:cursor-not-allowed"
                  >
                    {sendingSms ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Send SMS
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Current Risk Status */}
          {person.riskProfile && (
            <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-3">Current Risk Profile</h3>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black ${
                  person.riskProfile.category === 'Healthy' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400' :
                  person.riskProfile.category === 'At Risk' ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400' :
                  'bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
                }`}>
                  {person.riskProfile.score}
                </div>
                <div>
                  <span className={`text-sm font-black ${
                    person.riskProfile.category === 'Healthy' ? 'text-emerald-600 dark:text-emerald-400' :
                    person.riskProfile.category === 'At Risk' ? 'text-amber-600 dark:text-amber-400' :
                    'text-rose-600 dark:text-rose-400'
                  }`}>
                    {person.riskProfile.category}
                  </span>
                </div>
              </div>
              {person.riskProfile.factors && person.riskProfile.factors.length > 0 && (
                <ul className="space-y-1">
                  {person.riskProfile.factors.map((f, i) => (
                    <li key={i} className="text-xs text-slate-600 dark:text-slate-300 flex gap-2">
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
              <div className="relative border-l-2 border-slate-200 dark:border-slate-800 ml-3 space-y-6 pb-4">
                {timeline.map((record) => (
                  <div key={record.id} className="relative pl-6">
                    {/* Timeline Dot */}
                    <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white dark:border-slate-900 ${
                      record.newCategory === 'Healthy' ? 'bg-emerald-500' :
                      record.newCategory === 'At Risk' ? 'bg-amber-500' :
                      'bg-rose-500'
                    }`} />
                    
                    {/* Content */}
                    <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-4 shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          {new Date(record.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span className="text-xs font-black text-slate-600 dark:text-slate-350">
                          {record.oldCategory} ➝ <span className={`${
                            record.newCategory === 'Healthy' ? 'text-emerald-600 dark:text-emerald-400' :
                            record.newCategory === 'At Risk' ? 'text-amber-600 dark:text-amber-400' :
                            'text-rose-600 dark:text-rose-400'
                          }`}>{record.newCategory}</span>
                        </span>
                      </div>
                      
                      {record.oldScore !== undefined && record.newScore !== undefined && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-2 font-medium">
                          Score changed from {record.oldScore} to {record.newScore}
                        </div>
                      )}

                      {record.reasons && record.reasons.length > 0 && (
                        <div className="mt-3">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Triggered by:</p>
                          <ul className="space-y-1">
                            {record.reasons.map((r, i) => (
                              <li key={i} className="text-xs text-slate-600 dark:text-slate-300">• {r}</li>
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
