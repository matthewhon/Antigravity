import React, { useState, useEffect, useMemo } from 'react';
import { Send, Loader2, AlertCircle } from 'lucide-react';
import { pcoService } from '../services/pcoService';
import { EmailCampaign, Church, User, TemplateSettings, hasBroadcastAccess } from '../types';

const DEFAULT_TEMPLATE: TemplateSettings = {
  primaryColor: '#4f46e5',
  textColor: '#1f2937',
  backgroundColor: '#ffffff',
  linkColor: '#2563eb',
  fontFamily: 'sans-serif',
  header: '',
  footer: '© 2026 Church Name · Unsubscribe',
  showLogo: true,
};

export const newCampaign = (churchId: string, name: string, churchName?: string): EmailCampaign => ({
  id: `email_${Date.now()}`,
  churchId,
  name,
  status: 'draft',
  subject: name,
  blocks: [],
  templateSettings: {
    ...DEFAULT_TEMPLATE,
    header: churchName ? `<h1 style="margin: 0; color: #4f46e5; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">${churchName}</h1>` : '',
    footer: `© ${new Date().getFullYear()} ${churchName || 'Church Name'}`
  },
  createdAt: Date.now(),
  updatedAt: Date.now()
});

interface QuickSendModalProps {
  churchId: string;
  church?: Church;
  currentUser: User;
  onClose: () => void;
  onSendQuickEmail: (campaign: EmailCampaign) => Promise<void>;
}

export const QuickSendModal: React.FC<QuickSendModalProps> = ({
  churchId,
  church,
  currentUser,
  onClose,
  onSendQuickEmail,
}) => {
  const [targetType, setTargetType] = useState<'group' | 'list'>('group');
  const [targetId, setTargetId] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  
  const [pcoGroups, setPcoGroups] = useState<{ id: string; name: string; memberCount: number }[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);

  const [pcoLists, setPcoLists] = useState<{ id: string; name: string; memberCount: number }[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);

  const [pcoError, setPcoError] = useState<string | null>(null);

  const [isSending, setIsSending] = useState(false);

  const senders = useMemo(() => {
    const list: { name: string; email: string }[] = [];
    if (church?.emailSettings?.fromEmail) {
      list.push({
        name: church.emailSettings.fromName || church.name || '',
        email: church.emailSettings.fromEmail
      });
    }
    (church?.emailSettings?.additionalSenders || []).forEach(s => {
      if (s.name && s.email) list.push(s);
    });
    return list;
  }, [church]);

  const [selectedSenderStr, setSelectedSenderStr] = useState(() => 
    senders.length > 0 ? JSON.stringify(senders[0]) : ''
  );

  useEffect(() => {
    setPcoError(null);
    setLoadingGroups(true);
    setLoadingLists(true);

    pcoService.getGroups(churchId)
      .then((raw: any[]) => {
        setPcoGroups(raw.map(r => ({
          id: r.id,
          name: r.attributes?.name || 'Unnamed',
          memberCount: r.attributes?.memberships_count ?? r.attributes?.member_count ?? 0,
        })).filter(group => hasBroadcastAccess(currentUser, group.id, church)));
      })
      .catch(e => {
        console.error('Failed to load PCO groups', e);
        setPcoError(e.message || 'Failed to load PCO groups');
      })
      .finally(() => setLoadingGroups(false));

    pcoService.getPeopleLists(churchId)
      .then((raw: any[]) => {
        setPcoLists(raw.map(r => ({
          id: r.id,
          name: r.attributes?.name || 'Unnamed',
          memberCount: r.attributes?.total_people ?? 0,
        })).filter(list => hasBroadcastAccess(currentUser, list.id, church)));
      })
      .catch(e => {
        console.error('Failed to load PCO lists', e);
        setPcoError(e.message || 'Failed to load PCO lists');
      })
      .finally(() => setLoadingLists(false));
  }, [churchId, church, currentUser]);

  // Reset target ID when switching types
  useEffect(() => {
    setTargetId('');
  }, [targetType]);

  const handleSend = async () => {
    if (!targetId || !subject.trim() || !content.trim()) return alert('Please fill all fields');
    if (!church?.emailSettings?.fromEmail) {
      return alert('You must configure a From Address in Mail Settings first.');
    }
    
    setIsSending(true);
    try {
      const targetName = targetType === 'group'
        ? pcoGroups.find(g => g.id === targetId)?.name
        : pcoLists.find(l => l.id === targetId)?.name;

      const c = newCampaign(churchId, `Quick Email: ${subject}`, church?.name);
      
      if (targetType === 'group') {
        c.toGroupId = targetId;
        c.toGroupName = targetName;
      } else {
        c.toListId = targetId;
        c.toListName = targetName;
      }
      
      c.subject = subject;
      c.contentType = 'html';
      // Convert basic newlines to <br> for HTML mode to ensure it displays nicely
      c.content = content.replace(/\n/g, '<br/>');
      
      const sender = selectedSenderStr ? JSON.parse(selectedSenderStr) : {
        email: church.emailSettings.fromEmail,
        name: church.emailSettings.fromName || church.name || ''
      };
      
      c.fromEmail = sender.email;
      c.fromName = sender.name;
      
      await onSendQuickEmail(c);
      onClose();
    } catch (e: any) {
      alert(e.message || 'Failed to send quick email.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-lg mx-4 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
          <Send size={20} className="text-emerald-500" /> Quick Email
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Send a simple email message directly to a Planning Center group or list.</p>
        
        <div className="space-y-4 overflow-y-auto flex-1 pr-2">
          
          <div className="flex gap-5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="radio" 
                name="targetType" 
                value="group" 
                checked={targetType === 'group'} 
                onChange={() => setTargetType('group')} 
                className="text-emerald-500 focus:ring-emerald-500" 
              />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">PCO Group</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="radio" 
                name="targetType" 
                value="list" 
                checked={targetType === 'list'} 
                onChange={() => setTargetType('list')} 
                className="text-emerald-500 focus:ring-emerald-500" 
              />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">PCO List</span>
            </label>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Select {targetType === 'group' ? 'Group' : 'List'} <span className="text-red-500">*</span>
            </label>
            {pcoError ? (
              <div className="flex items-start gap-3 p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/50 rounded-2xl text-rose-800 dark:text-rose-200">
                <AlertCircle size={18} className="shrink-0 mt-0.5 text-rose-500" />
                <div className="flex-1 text-xs space-y-1">
                  <p className="font-bold">Planning Center Connection Failed</p>
                  <p className="opacity-90">{pcoError}</p>
                  <p className="text-[10px] text-rose-600/80 dark:text-rose-400/80 mt-1.5 font-medium">Please reconnect your Planning Center account in Settings.</p>
                </div>
              </div>
            ) : targetType === 'group' && loadingGroups ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 py-2"><Loader2 size={14} className="animate-spin" /> Loading groups...</div>
            ) : targetType === 'list' && loadingLists ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 py-2"><Loader2 size={14} className="animate-spin" /> Loading lists...</div>
            ) : (
              <select
                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={targetId}
                onChange={e => setTargetId(e.target.value)}
              >
                <option value="">— Select a Planning Center {targetType === 'group' ? 'Group' : 'List'} —</option>
                {targetType === 'group' 
                  ? pcoGroups.map(g => (
                      <option key={g.id} value={g.id}>{g.name} ({g.memberCount} members)</option>
                    ))
                  : pcoLists.map(l => (
                      <option key={l.id} value={l.id}>{l.name} ({l.memberCount} people)</option>
                    ))
                }
              </select>
            )}
          </div>
          
          {senders.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">From Address <span className="text-red-500">*</span></label>
              <select
                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={selectedSenderStr}
                onChange={e => setSelectedSenderStr(e.target.value)}
              >
                {senders.map((s, i) => (
                  <option key={i} value={JSON.stringify(s)}>{s.name} &lt;{s.email}&gt;</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Subject <span className="text-red-500">*</span></label>
            <input
              type="text"
              className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Email subject..."
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
          </div>
          
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Message Content <span className="text-red-500">*</span></label>
            <textarea
              className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-3 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[200px]"
              placeholder="Write your message here..."
              value={content}
              onChange={e => setContent(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex gap-3 pt-5 mt-2 border-t border-slate-100 dark:border-slate-700">
          <button onClick={onClose} className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition font-medium">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={isSending || !targetId || !subject.trim() || !content.trim()}
            className="flex-1 px-4 py-2.5 text-sm text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 rounded-xl transition font-semibold flex items-center justify-center gap-2"
          >
            {isSending ? <><Loader2 size={16} className="animate-spin" /> Sending to {targetType === 'group' ? 'Group' : 'List'}…</> : <><Send size={16} /> Send Email Now</>}
          </button>
        </div>
      </div>
    </div>
  );
};
