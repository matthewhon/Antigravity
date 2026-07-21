import React, { useEffect, useState, useCallback } from 'react';
import { Drawer } from './Drawer';
import { firestore } from '../services/firestoreService';
import { pcoService } from '../services/pcoService';
import { PcoPerson, RiskChangeRecord, PastoralNote } from '../types';
import { useTenantData } from '../contexts/TenantDataContext';
import {
  Mail, Phone, Send, Loader2, CheckCircle, AlertCircle,
  NotebookPen, ChevronDown, ChevronUp, Plus, X
} from 'lucide-react';

const API_BASE = '';

const NOTE_TYPES: PastoralNote['type'][] = ['Call', 'Visit', 'Meeting', 'Note', 'Crisis', 'Hospital'];

const NOTE_TYPE_COLORS: Record<string, string> = {
  Call:     'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  Visit:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  Meeting:  'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  Note:     'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  Crisis:   'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  Hospital: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface PersonProfileDrawerProps {
  personId: string | null;
  churchId: string;
  onClose: () => void;
}

export const PersonProfileDrawer: React.FC<PersonProfileDrawerProps> = ({ personId, churchId, onClose }) => {
  const { user, church } = useTenantData();
  const pcoConnected = !!(church?.pcoAccessToken);

  const [person, setPerson] = useState<PcoPerson | null>(null);
  const [timeline, setTimeline] = useState<RiskChangeRecord[]>([]);
  const [notes, setNotes] = useState<PastoralNote[]>([]);
  const [loading, setLoading] = useState(false);

  // SMS state
  const [smsBody, setSmsBody] = useState('');
  const [sendingSms, setSendingSms] = useState(false);
  const [smsError, setSmsError] = useState('');
  const [smsSuccess, setSmsSuccess] = useState(false);

  // Note form state
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteType, setNoteType] = useState<PastoralNote['type']>('Call');
  const [noteContent, setNoteContent] = useState('');
  const [noteFollowUp, setNoteFollowUp] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaveError, setNoteSaveError] = useState('');
  const [noteSaveSuccess, setNoteSaveSuccess] = useState(false);
  const [showAllNotes, setShowAllNotes] = useState(false);

  useEffect(() => {
    if (smsSuccess) {
      const t = setTimeout(() => setSmsSuccess(false), 5000);
      return () => clearTimeout(t);
    }
  }, [smsSuccess]);

  useEffect(() => {
    if (noteSaveSuccess) {
      const t = setTimeout(() => setNoteSaveSuccess(false), 4000);
      return () => clearTimeout(t);
    }
  }, [noteSaveSuccess]);

  const handleSendSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!person?.phone || !smsBody.trim()) return;
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
      if (!res.ok || !data.success) throw new Error(data.error || `Send failed (HTTP ${res.status})`);
      setSmsSuccess(true);
      setSmsBody('');
      window.dispatchEvent(new CustomEvent('careFollowUpCompleted', { detail: person.id }));
    } catch (err: any) {
      setSmsError(err.message || 'An error occurred while sending the message.');
    } finally {
      setSendingSms(false);
    }
  };

  const handleSaveNote = useCallback(async () => {
    if (!person || !noteContent.trim()) return;
    setSavingNote(true);
    setNoteSaveError('');

    try {
      const now = new Date();
      const note: PastoralNote = {
        id: `note_${Date.now()}`,
        churchId,
        personId:   person.id,
        personName: person.name,
        authorId:   user?.id   || 'system',
        authorName: user?.name || 'Staff',
        date:       now.toISOString().split('T')[0],
        type:       noteType,
        content:    noteContent.trim(),
        followUpDate: noteFollowUp || undefined,
        isCompleted: false,
        tags: [],
      } as any;

      await firestore.savePastoralNote(note);

      // Sync to Planning Center profile if connected
      if (pcoConnected) {
        try {
          let pcoText = `[Pastoral Care: ${noteType}]\n${noteContent.trim()}`;
          if (noteFollowUp) {
            pcoText += `\n\nFollow-up needed by: ${new Date(noteFollowUp).toLocaleDateString()}`;
          }
          await pcoService.addNoteToPerson(churchId, person.id, pcoText);
        } catch (syncErr) {
          console.warn('PCO note sync failed (note was still saved locally):', syncErr);
        }
      }

      // Prepend to local notes list
      setNotes(prev => [note, ...prev]);
      setNoteContent('');
      setNoteFollowUp('');
      setNoteType('Call');
      setShowNoteForm(false);
      setNoteSaveSuccess(true);
    } catch (err: any) {
      setNoteSaveError(err.message || 'Failed to save note. Please try again.');
    } finally {
      setSavingNote(false);
    }
  }, [person, noteContent, noteType, noteFollowUp, churchId, user, pcoConnected]);

  useEffect(() => {
    if (!personId || !churchId) return;
    const loadData = async () => {
      setLoading(true);
      setPerson(null);
      setNotes([]);
      setTimeline([]);
      try {
        const [people, changes, personNotes, outreachSlots] = await Promise.all([
          firestore.getPeople(churchId),
          firestore.getPersonRiskTimeline(churchId, personId),
          firestore.getPastoralNotes(churchId, personId),
          firestore.getPersonOutreachSlots(churchId, personId),
        ]);
        const p = people.find(p => p.id === personId);
        if (p) setPerson(p);
        setTimeline(changes);

        const outreachNotes: PastoralNote[] = outreachSlots
            .filter(s => s.status === 'contacted' && !!s.notes)
            .map(s => {
                const noteStr = s.followUpNotes?.length
                  ? s.notes + '\n\n' + s.followUpNotes.map(f => `Follow-up: ${f.note}`).join('\n')
                  : s.notes;

                return {
                    id: s.id,
                    churchId: s.churchId,
                    personId: s.assignedPersonId,
                    personName: s.assignedPersonName,
                    authorId: s.volunteerPhone,
                    authorName: s.volunteerName || 'Volunteer',
                    date: new Date(s.completedAt || s.assignedAt).toISOString(),
                    type: 'Call',
                    content: noteStr,
                    isCompleted: true,
                    isOutreach: true
                } as PastoralNote;
            });

        const combined = [...personNotes, ...outreachNotes].sort((a, b) => b.date.localeCompare(a.date));
        setNotes(combined);
      } catch (e) {
        console.error('Failed to load person details', e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [personId, churchId]);

  if (!personId) return null;

  const visibleNotes = showAllNotes ? notes : notes.slice(0, 3);

  return (
    <Drawer isOpen={!!personId} onClose={onClose} title="Person Profile">
      {loading ? (
        <div className="flex justify-center p-8 text-slate-400">Loading...</div>
      ) : person ? (
        <div className="space-y-6">

          {/* ── Header ── */}
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
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  {person.membership || 'Guest'}
                </span>
              </div>
            </div>
          </div>

          {/* ── Quick Actions ── */}
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

          {/* ── Contact Details ── */}
          <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
            <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wide">Contact Information</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                {person.email ? (
                  <a href={`mailto:${person.email}`} className="text-indigo-600 dark:text-indigo-400 hover:underline break-all font-semibold">
                    {person.email}
                  </a>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500 italic">No email address</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                {person.phone ? (
                  <a href={`tel:${person.phone}`} className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold">
                    {person.phone}
                  </a>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500 italic">No phone number</span>
                )}
              </div>
            </div>
          </div>

          {/* ── Pastoral Care Notes ── */}
          <div className="p-4 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-950/10 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <NotebookPen className="w-4 h-4 text-indigo-500" />
                <h3 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wide">
                  Pastoral Care Notes
                </h3>
                {notes.length > 0 && (
                  <span className="text-[10px] font-black bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 px-2 py-0.5 rounded-full">
                    {notes.length}
                  </span>
                )}
              </div>
              {!showNoteForm && (
                <button
                  onClick={() => setShowNoteForm(true)}
                  className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add Note
                </button>
              )}
            </div>

            {/* Success banner */}
            {noteSaveSuccess && (
              <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-xl p-3">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span>Note saved{pcoConnected ? ' and synced to Planning Center' : ''}!</span>
              </div>
            )}

            {/* Add Note Form */}
            {showNoteForm && (
              <div className="bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800/50 rounded-2xl p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">New Care Note</span>
                  <button
                    onClick={() => { setShowNoteForm(false); setNoteContent(''); setNoteSaveError(''); }}
                    className="text-slate-400 hover:text-rose-500 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Type selector */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block mb-1.5">
                    Type
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {NOTE_TYPES.map(t => (
                      <button
                        key={t}
                        onClick={() => setNoteType(t)}
                        className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${
                          noteType === t
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Content */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block mb-1.5">
                    Notes <span className="text-rose-400">*</span>
                  </label>
                  <textarea
                    value={noteContent}
                    onChange={e => { setNoteContent(e.target.value); if (noteSaveError) setNoteSaveError(''); }}
                    placeholder={`What happened in this ${noteType.toLowerCase()}?`}
                    rows={4}
                    className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 p-3 outline-none resize-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-colors placeholder:text-slate-400"
                    disabled={savingNote}
                  />
                </div>

                {/* Follow-up date (optional) */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block mb-1.5">
                    Follow-up Date <span className="text-slate-300 dark:text-slate-600 font-medium normal-case tracking-normal">(optional)</span>
                  </label>
                  <input
                    type="date"
                    value={noteFollowUp}
                    onChange={e => setNoteFollowUp(e.target.value)}
                    className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 p-3 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-colors"
                    disabled={savingNote}
                  />
                </div>

                {noteSaveError && (
                  <div className="flex items-start gap-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl p-3">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{noteSaveError}</span>
                  </div>
                )}

                {pcoConnected && (
                  <p className="text-[10px] text-slate-400 font-medium">
                    ✓ This note will also be synced to this person's Planning Center profile.
                  </p>
                )}

                <button
                  onClick={handleSaveNote}
                  disabled={savingNote || !noteContent.trim()}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors text-xs"
                >
                  {savingNote ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                  ) : (
                    <><NotebookPen className="w-4 h-4" /> Save Note</>
                  )}
                </button>
              </div>
            )}

            {/* Notes list */}
            {notes.length === 0 && !showNoteForm ? (
              <p className="text-xs text-slate-400 italic text-center py-2">
                No care notes yet. Add the first one above.
              </p>
            ) : notes.length > 0 ? (
              <div className="space-y-3">
                {visibleNotes.map(note => (
                  <div key={note.id} className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-3 space-y-1.5 shadow-sm">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${NOTE_TYPE_COLORS[note.type] || NOTE_TYPE_COLORS['Note']}`}>
                        {note.type}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">{formatDate(note.date)}</span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {note.content}
                    </p>
                    {note.followUpDate && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                        ↪ Follow-up by {formatDate(note.followUpDate)}
                      </p>
                    )}
                    <p className="text-[10px] text-slate-400 font-medium">— {note.authorName}</p>
                  </div>
                ))}

                {notes.length > 3 && (
                  <button
                    onClick={() => setShowAllNotes(v => !v)}
                    className="w-full flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-indigo-500 hover:text-indigo-600 transition-colors py-1"
                  >
                    {showAllNotes ? (
                      <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
                    ) : (
                      <><ChevronDown className="w-3.5 h-3.5" /> Show {notes.length - 3} more</>
                    )}
                  </button>
                )}
              </div>
            ) : null}
          </div>

          {/* ── Send SMS ── */}
          {church?.smsSettings?.smsEnabled && (
            <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
              <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wide">Send SMS Message</h3>
              {!person.phone ? (
                <p className="text-xs text-slate-500 italic">SMS sending is unavailable because this person has no phone number.</p>
              ) : (
                <form onSubmit={handleSendSms} className="space-y-3">
                  <div>
                    <textarea
                      value={smsBody}
                      onChange={e => { setSmsBody(e.target.value); if (smsError) setSmsError(''); if (smsSuccess) setSmsSuccess(false); }}
                      placeholder={`Type a message to ${person.name}...`}
                      rows={3}
                      maxLength={1600}
                      className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 p-3 outline-none resize-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-colors"
                      disabled={sendingSms}
                    />
                    <div className="flex justify-between items-center mt-1 text-[10px] text-slate-400 font-bold uppercase tracking-wide px-1">
                      <span>{smsBody.length} characters</span>
                      <span>{Math.ceil(smsBody.length / 160) || 0} segment{Math.ceil(smsBody.length / 160) !== 1 ? 's' : ''}</span>
                    </div>
                  </div>

                  {smsError && (
                    <div className="flex items-start gap-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl p-3">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{smsError}</span>
                    </div>
                  )}
                  {smsSuccess && (
                    <div className="flex items-start gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-xl p-3">
                      <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>Message sent successfully!</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={sendingSms || !smsBody.trim()}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer disabled:cursor-not-allowed"
                  >
                    {sendingSms ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />Sending...</>
                    ) : (
                      <><Send className="w-4 h-4" />Send SMS</>
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ── Current Risk Status ── */}
          {person.riskProfile && (
            <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wide mb-3">Current Risk Profile</h3>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black ${
                  person.riskProfile.category === 'Healthy'       ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400' :
                  person.riskProfile.category === 'At Risk'       ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400' :
                  'bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
                }`}>
                  {person.riskProfile.score}
                </div>
                <div>
                  <span className={`text-sm font-black ${
                    person.riskProfile.category === 'Healthy'     ? 'text-emerald-600 dark:text-emerald-400' :
                    person.riskProfile.category === 'At Risk'     ? 'text-amber-600 dark:text-amber-400' :
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

          {/* ── Risk Timeline ── */}
          <div>
            <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wide mb-4">Risk Progression Timeline</h3>
            {timeline.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No historical risk changes recorded.</p>
            ) : (
              <div className="relative border-l-2 border-slate-200 dark:border-slate-800 ml-3 space-y-6 pb-4">
                {timeline.map(record => (
                  <div key={record.id} className="relative pl-6">
                    <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white dark:border-slate-900 ${
                      record.newCategory === 'Healthy'   ? 'bg-emerald-500' :
                      record.newCategory === 'At Risk'   ? 'bg-amber-500'   :
                      'bg-rose-500'
                    }`} />
                    <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-4 shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                          {new Date(record.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span className="text-xs font-black text-slate-600 dark:text-slate-350">
                          {record.oldCategory} ➝ <span className={
                            record.newCategory === 'Healthy'   ? 'text-emerald-600 dark:text-emerald-400' :
                            record.newCategory === 'At Risk'   ? 'text-amber-600 dark:text-amber-400'   :
                            'text-rose-600 dark:text-rose-400'
                          }>{record.newCategory}</span>
                        </span>
                      </div>
                      {record.oldScore !== undefined && record.newScore !== undefined && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-2 font-medium">
                          Score changed from {record.oldScore} to {record.newScore}
                        </div>
                      )}
                      {record.reasons && record.reasons.length > 0 && (
                        <div className="mt-3">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Triggered by:</p>
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
