import React, { useState, useEffect } from 'react';
import { PcoPerson, User, PastoralNote } from '../types';
import { firestore } from '../services/firestoreService';
import { 
  Phone, MessageSquare, MapPin, Calendar, 
  Plus, X, Mail, Loader2, Sparkles, CalendarCheck 
} from 'lucide-react';

interface PersonProfileViewProps {
  person: PcoPerson;
  onClose: () => void;
  churchId: string;
  currentUser: User;
  onAddNote?: (note: PastoralNote) => void;
}

export const PersonProfileView: React.FC<PersonProfileViewProps> = ({ 
  person, onClose, churchId, currentUser, onAddNote
}) => {
  const [notes, setNotes] = useState<PastoralNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState<PastoralNote['type']>('Note');
  const [followUpDate, setFollowUpDate] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Load notes on mount/change
  useEffect(() => {
    const fetchNotes = async () => {
      setLoadingNotes(true);
      try {
        const list = await firestore.getPastoralNotes(churchId, person.id);
        setNotes(list);
      } catch (e) {
        console.error("Failed to load notes:", e);
      } finally {
        setLoadingNotes(false);
      }
    };
    fetchNotes();
  }, [churchId, person.id]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim() || savingNote) return;

    setSavingNote(true);
    const newNote: PastoralNote = {
      id: `${churchId}_note_${Date.now()}`,
      churchId,
      personId: person.id,
      personName: person.name,
      authorId: currentUser.id,
      authorName: currentUser.name || 'Staff',
      date: new Date().toISOString(),
      type: noteType,
      content: noteContent.trim(),
      followUpDate: followUpDate || undefined,
      isCompleted: false
    };

    try {
      await firestore.savePastoralNote(newNote);
      setNotes(prev => [newNote, ...prev]);
      if (onAddNote) {
        onAddNote(newNote);
      }
      setNoteContent('');
      setFollowUpDate('');
      setNoteType('Note');
      alert("Note successfully added!");
    } catch (e) {
      console.error("Failed to save note:", e);
      alert("Error saving note.");
    } finally {
      setSavingNote(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .slice(0, 2)
      .map(part => part[0])
      .join('')
      .toUpperCase();
  };

  const formatPhone = (phoneNum?: string) => {
    if (!phoneNum) return '';
    const digits = phoneNum.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return phoneNum;
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full h-[90vh] bg-slate-50 dark:bg-zinc-950 rounded-t-[2.5rem] p-6 shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-250">
        {/* Grab Bar */}
        <div className="w-12 h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-full mx-auto mb-5 shrink-0" />

        {/* Profile Header */}
        <div className="flex justify-between items-start mb-6 shrink-0">
          <div className="flex items-center gap-3">
            {person.avatar ? (
              <img
                src={person.avatar}
                alt={person.name}
                className="w-14 h-14 rounded-full object-cover bg-slate-100 border-2 border-white shadow-md"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-base shadow-sm border border-indigo-100 dark:border-indigo-900/30">
                {getInitials(person.name)}
              </div>
            )}
            <div>
              <h2 className="text-lg font-black tracking-tight">{person.name}</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/20">
                  {person.membership || person.status || 'Contact'}
                </span>
                {person.gender && (
                  <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-bold">• {person.gender}</span>
                )}
                {person.age != null && (
                  <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-bold">• Age {person.age}</span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-700"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-6 pb-6">
          
          {/* Key details box */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-slate-200/50 dark:border-zinc-800 space-y-3 shadow-sm">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Key Profile Data</h3>
            
            {person.phone && (
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Phone size={14} className="text-indigo-500 shrink-0" />
                  <a href={`tel:${person.phone}`} className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline truncate">
                    {formatPhone(person.phone)}
                  </a>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <a
                    href={`tel:${person.phone}`}
                    className="px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100/10 text-[9px] font-black tracking-widest text-emerald-600 dark:text-emerald-400 uppercase rounded-lg active:scale-95 transition"
                  >
                    Call
                  </a>
                  <a
                    href={`sms:${person.phone}`}
                    className="px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100/10 text-[9px] font-black tracking-widest text-indigo-600 dark:text-indigo-400 uppercase rounded-lg active:scale-95 transition"
                  >
                    Text
                  </a>
                </div>
              </div>
            )}

            {person.email && (
              <div className="flex items-center gap-2.5 text-xs min-w-0">
                <Mail size={14} className="text-indigo-500 shrink-0" />
                <a href={`mailto:${person.email}`} className="font-bold text-slate-700 dark:text-zinc-300 hover:underline truncate">
                  {person.email}
                </a>
              </div>
            )}

            {person.addresses && person.addresses[0] && (
              <div className="flex items-start justify-between gap-2 text-xs">
                <div className="flex items-start gap-2.5 min-w-0">
                  <MapPin size={14} className="text-indigo-500 shrink-0 mt-0.5" />
                  <div className="font-medium text-slate-500 dark:text-zinc-400">
                    <p>{person.addresses[0].street}</p>
                    <p>{person.addresses[0].city}, {person.addresses[0].state} {person.addresses[0].zip}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const addr = person.addresses![0];
                    const lat = addr.lat;
                    const lng = addr.lng;
                    const queryStr = encodeURIComponent(`${addr.street || ''}, ${addr.city || ''}, ${addr.state || ''} ${addr.zip || ''}`);
                    const url = (lat != null && lng != null)
                      ? `https://maps.apple.com/?daddr=${lat},${lng}`
                      : `https://maps.apple.com/?daddr=${queryStr}`;
                    window.open(url, '_system');
                  }}
                  className="px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100/10 text-[9px] font-black tracking-widest text-emerald-600 dark:text-emerald-400 uppercase rounded-lg active:scale-95 transition shrink-0 self-center"
                >
                  Navigate
                </button>
              </div>
            )}

            {(person.birthdate || person.anniversary) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs pt-1 border-t border-slate-100 dark:border-zinc-800">
                {person.birthdate && (
                  <p className="font-semibold text-slate-500 dark:text-zinc-400">
                    🎂 Bday: <span className="font-bold text-slate-800 dark:text-zinc-200">{person.birthdate}</span>
                  </p>
                )}
                {person.anniversary && (
                  <p className="font-semibold text-slate-500 dark:text-zinc-400">
                    💍 Anniv: <span className="font-bold text-slate-800 dark:text-zinc-200">{person.anniversary}</span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Add Care Note */}
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-slate-200/50 dark:border-zinc-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Compose Care Note</h3>
              <Sparkles size={14} className="text-indigo-500 animate-pulse" />
            </div>

            <form onSubmit={handleAddNote} className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {(['Note', 'Call', 'Visit', 'Meeting', 'Crisis', 'Hospital'] as PastoralNote['type'][]).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setNoteType(type)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wider uppercase transition ${noteType === type ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400'}`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              <div>
                <textarea
                  value={noteContent}
                  onChange={e => setNoteContent(e.target.value)}
                  placeholder={`Enter notes regarding this ${noteType.toLowerCase()}...`}
                  required
                  rows={3}
                  className="w-full p-3 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400/50 text-xs font-bold text-slate-800 dark:text-zinc-100 placeholder:font-medium placeholder:text-slate-400 resize-none transition"
                />
              </div>

              <div className="flex flex-col min-[350px]:flex-row justify-between items-start min-[350px]:items-center gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 dark:text-zinc-500">
                  <CalendarCheck size={14} className="text-indigo-500" />
                  <span>SCHEDULE FOLLOW-UP:</span>
                </div>
                <input
                  type="date"
                  value={followUpDate}
                  onChange={e => setFollowUpDate(e.target.value)}
                  className="text-xs p-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-bold text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={savingNote || !noteContent.trim()}
                className="w-full flex items-center justify-center gap-1.5 p-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-100 dark:shadow-none transition active:scale-[0.98]"
              >
                {savingNote ? 'Saving Entry...' : (
                  <>
                    <Plus size={14} /> Add Care Note
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Historical Logs */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none mb-2 px-1">Historical Logs</h3>
            
            {loadingNotes ? (
              <div className="flex justify-center items-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : notes.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 border border-slate-200/50 dark:border-zinc-800 rounded-2xl p-6 text-center text-slate-400 text-xs">
                No historical logs recorded.
              </div>
            ) : (
              <div className="space-y-3">
                {notes.map(n => (
                  <div 
                    key={n.id}
                    className="bg-white dark:bg-zinc-900 border border-slate-200/50 dark:border-zinc-800 rounded-2xl p-4 shadow-sm relative overflow-hidden"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                        n.type === 'Crisis' ? 'bg-rose-100 dark:bg-rose-950/40 text-rose-600' :
                        n.type === 'Hospital' ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-600' :
                        n.type === 'Call' ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600' :
                        'bg-slate-100 dark:bg-zinc-800 text-slate-500'
                      }`}>
                        {n.type}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-bold">
                        {new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 dark:text-zinc-300 font-medium whitespace-pre-line leading-relaxed">
                      {n.content}
                    </p>

                    <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-slate-100 dark:border-zinc-800/60 text-[10px] text-slate-400 dark:text-zinc-500 font-bold">
                      <p>Logged by: <span className="text-slate-500 dark:text-zinc-400">{n.authorName}</span></p>
                      {n.followUpDate && (
                        <p className="text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                          <Calendar size={10} /> Follow-up: {n.followUpDate}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
