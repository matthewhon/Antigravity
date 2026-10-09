import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Sparkles, X, Loader2, Wand2, Check } from 'lucide-react';
import { db } from '../services/firebase';
import { firestore } from '../services/firestoreService';
import { learnChurchVoice } from '../services/geminiService';
import { stripHtml } from '../services/readability';
import { ChurchVoice } from '../types';

interface Props {
  churchId: string;
  userId?: string;
  onClose: () => void;
  onSaved?: (voice: ChurchVoice) => void;
}

const toList = (s: string): string[] =>
  s.split(/\n|,(?![^"]*")/).map(x => x.trim()).filter(Boolean);
const fromList = (a?: string[]) => (a || []).join('\n');

/** Plain text of a sent campaign (blocks or raw content). */
const campaignText = (c: any): string => {
  const parts: string[] = [];
  const walk = (blocks: any[]) => {
    for (const b of blocks || []) {
      const t = b?.content?.text || b?.content?.html;
      if (typeof t === 'string') parts.push(stripHtml(t));
      if (Array.isArray(b?.content?.blocks)) walk(b.content.blocks);
    }
  };
  if (Array.isArray(c?.blocks)) walk(c.blocks);
  if (typeof c?.content === 'string') parts.push(stripHtml(c.content));
  return parts.join('\n').trim();
};

/**
 * Per-church AI writing voice editor. Saved to churchVoice/{churchId} and used
 * automatically by the AI campaign writer for email, SMS and bulletins.
 */
export const ChurchVoiceEditor: React.FC<Props> = ({ churchId, userId, onClose, onSaved }) => {
  const [loading, setLoading] = useState(true);
  const [learning, setLearning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [adjectives, setAdjectives] = useState('');
  const [wordsToUse, setWordsToUse] = useState('');
  const [wordsToAvoid, setWordsToAvoid] = useState('');
  const [signOffs, setSignOffs] = useState('');
  const [samples, setSamples] = useState('');
  const [notes, setNotes] = useState('');
  const [targetGrade, setTargetGrade] = useState(8);
  const [allowEmoji, setAllowEmoji] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'churchVoice', churchId));
        if (!cancelled && snap.exists()) {
          const v = snap.data() as ChurchVoice;
          setAdjectives(fromList(v.adjectives));
          setWordsToUse(fromList(v.wordsToUse));
          setWordsToAvoid(fromList(v.wordsToAvoid));
          setSignOffs(fromList(v.signOffs));
          setSamples((v.sampleMessages || []).join('\n---\n'));
          setNotes(v.notes || '');
          setTargetGrade(v.targetGrade || 8);
          setAllowEmoji(!!v.allowEmoji);
        }
      } catch (e) {
        console.error('[ChurchVoiceEditor] load failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [churchId]);

  const handleLearn = async () => {
    setError(null);
    setInfo(null);
    setLearning(true);
    try {
      const campaigns = await firestore.getEmailCampaigns(churchId);
      const texts = campaigns
        .filter(c => c.status === 'sent')
        .slice(0, 12)
        .map(campaignText)
        .filter(t => t.length > 40);
      if (texts.length < 2) {
        setError('Send at least 2 email campaigns with text content first, or fill the voice in by hand.');
        return;
      }
      const p = await learnChurchVoice(texts);
      setAdjectives(fromList(p.adjectives));
      setWordsToUse(fromList(p.wordsToUse));
      setWordsToAvoid(fromList(p.wordsToAvoid));
      setSignOffs(fromList(p.signOffs));
      setSamples(p.sampleMessages.join('\n---\n'));
      setTargetGrade(p.targetGrade);
      setAllowEmoji(p.allowEmoji);
      setInfo(`Proposed from your last ${texts.length} sent emails. Review and edit, then save.`);
    } catch (e: any) {
      setError(e?.message || 'Something went wrong.');
    } finally {
      setLearning(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const voice: ChurchVoice = {
        id: churchId,
        churchId,
        adjectives: toList(adjectives).slice(0, 8),
        wordsToUse: toList(wordsToUse).slice(0, 20),
        wordsToAvoid: toList(wordsToAvoid).slice(0, 20),
        signOffs: toList(signOffs).slice(0, 5),
        sampleMessages: samples.split(/\n-{3,}\n/).map(s => s.trim()).filter(Boolean).slice(0, 5).map(s => s.slice(0, 600)),
        targetGrade,
        allowEmoji,
        notes: notes.trim().slice(0, 500),
        updatedAt: Date.now(),
        updatedBy: userId,
      };
      await setDoc(doc(db, 'churchVoice', churchId), JSON.parse(JSON.stringify(voice)));
      setSaved(true);
      onSaved?.(voice);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e?.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const label = 'block text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1';
  const input = 'w-full text-xs rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Church voice">
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700 rounded-t-2xl bg-gradient-to-r from-indigo-600 to-violet-600">
          <div className="flex items-center gap-2 text-white">
            <Sparkles size={16} />
            <span className="text-sm font-bold">Church Voice</span>
          </div>
          <button onClick={onClose} title="Close" className="p-1 rounded text-white/70 hover:text-white hover:bg-white/10"><X size={15} /></button>
        </div>

        {loading ? (
          <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-indigo-500" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tell the AI how your church sounds. It is applied to every email, text and bulletin it drafts.
            </p>

            <button
              onClick={handleLearn}
              disabled={learning}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-indigo-300 text-indigo-600 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition disabled:opacity-60"
            >
              {learning ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
              Learn from my past emails
            </button>
            {info && <p className="text-[11px] text-emerald-600">{info}</p>}

            <div>
              <label className={label} htmlFor="cv-adj">Style (one per line)</label>
              <textarea id="cv-adj" rows={2} className={input} value={adjectives} onChange={e => setAdjectives(e.target.value)} placeholder={'warm\ndirect\nencouraging'} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label} htmlFor="cv-use">Words to use</label>
                <textarea id="cv-use" rows={3} className={input} value={wordsToUse} onChange={e => setWordsToUse(e.target.value)} placeholder={'church family\njoin us'} />
              </div>
              <div>
                <label className={label} htmlFor="cv-avoid">Words to avoid</label>
                <textarea id="cv-avoid" rows={3} className={input} value={wordsToAvoid} onChange={e => setWordsToAvoid(e.target.value)} placeholder={'guys\nsynergy'} />
              </div>
            </div>
            <div>
              <label className={label} htmlFor="cv-sign">Sign-offs (one per line)</label>
              <textarea id="cv-sign" rows={2} className={input} value={signOffs} onChange={e => setSignOffs(e.target.value)} placeholder="Grace & peace, Pastor Dan" />
            </div>
            <div>
              <label className={label} htmlFor="cv-samples">Sample messages you like (separate with a line of ---)</label>
              <textarea id="cv-samples" rows={4} className={input} value={samples} onChange={e => setSamples(e.target.value)} />
            </div>
            <div>
              <label className={label} htmlFor="cv-notes">Anything else</label>
              <textarea id="cv-notes" rows={2} maxLength={500} className={input} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. We call Sunday gatherings 'worship services', never 'church events'." />
            </div>
            <div className="flex items-center gap-3">
              <label htmlFor="cv-grade" className={label + ' mb-0'}>Reading grade</label>
              <input id="cv-grade" type="range" min={5} max={12} value={targetGrade} onChange={e => setTargetGrade(Number(e.target.value))} className="flex-1 accent-indigo-600" />
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 w-4 text-right">{targetGrade}</span>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={allowEmoji} onChange={e => setAllowEmoji(e.target.checked)} className="accent-indigo-600" />
              Allow an occasional emoji in texts (switches SMS to shorter 70-character segments)
            </label>

            {error && <p className="text-[11px] text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2">{error}</p>}
          </div>
        )}

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-100 dark:border-slate-700">
          <button onClick={onClose} className="text-xs font-semibold px-3 py-1.5 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Close</button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-1.5 text-xs font-bold px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <Check size={12} /> : null}
            {saved ? 'Saved' : 'Save voice'}
          </button>
        </div>
      </div>
    </div>
  );
};
