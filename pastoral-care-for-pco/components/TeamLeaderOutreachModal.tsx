import React, { useState, useEffect } from 'react';
import { X, Send, MessageSquare, Mail, Phone, User as UserIcon, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import { ServicesTeam, PcoPerson, TeamCandidateSuggestion, TeamFitReallocation, User } from '../types';
import { buildLeaderRecommendationTemplate } from '../services/teamAssessmentMatcherService';

interface TeamLeaderOutreachModalProps {
  isOpen: boolean;
  onClose: () => void;
  churchId: string;
  team: ServicesTeam | null;
  leaderOptions: PcoPerson[];
  candidate: TeamCandidateSuggestion | TeamFitReallocation | null;
  isReallocation?: boolean;
  currentTeamName?: string;
  user?: User | null;
}

export const TeamLeaderOutreachModal: React.FC<TeamLeaderOutreachModalProps> = ({
  isOpen,
  onClose,
  churchId,
  team,
  leaderOptions,
  candidate,
  isReallocation = false,
  currentTeamName,
  user
}) => {
  const [selectedLeaderId, setSelectedLeaderId] = useState<string>('');
  const [channel, setChannel] = useState<'sms' | 'email'>('sms');
  const [customPhone, setCustomPhone] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Set default selected leader when modal opens
  useEffect(() => {
    if (isOpen) {
      const initialLeader = leaderOptions[0];
      if (initialLeader) {
        setSelectedLeaderId(initialLeader.id);
        setCustomPhone(initialLeader.e164Phone || initialLeader.phone || '');
        setCustomEmail(initialLeader.email || '');
      } else {
        setSelectedLeaderId('');
        setCustomPhone('');
        setCustomEmail('');
      }
      setToast(null);
    }
  }, [isOpen, leaderOptions]);

  // Update recipient phone/email when leader selection changes
  const handleLeaderChange = (leaderId: string) => {
    setSelectedLeaderId(leaderId);
    const leader = leaderOptions.find(l => l.id === leaderId);
    if (leader) {
      setCustomPhone(leader.e164Phone || leader.phone || '');
      setCustomEmail(leader.email || '');
    }
  };

  // Re-generate pre-filled message whenever context changes
  useEffect(() => {
    if (!team || !candidate) return;

    const leader = leaderOptions.find(l => l.id === selectedLeaderId);
    const leaderName = leader?.name || 'Team Leader';

    const candidateGift = candidate.primaryGift;
    const candidateDisc = candidate.discStyle;
    const candidateMbti = candidate.mbtiType;
    const candidatePhone = candidate.phone;
    const candidateEmail = candidate.email;

    let matchingRationale = '';
    if ('matchingReasons' in candidate && candidate.matchingReasons.length > 0) {
      matchingRationale = candidate.matchingReasons.join(' ');
    } else if ('recommendedFitReason' in candidate) {
      matchingRationale = candidate.recommendedFitReason;
    }

    const template = buildLeaderRecommendationTemplate({
      teamName: team.name,
      leaderName,
      candidateName: candidate.personName,
      candidateGift,
      candidateDisc,
      candidateMbti,
      candidatePhone,
      candidateEmail,
      matchingRationale,
      isReallocation,
      currentTeamName: currentTeamName || ('currentTeamName' in candidate ? candidate.currentTeamName : undefined),
      channel
    });

    setSubject(template.subject);
    setMessageBody(template.body);
  }, [team, candidate, selectedLeaderId, channel, isReallocation, currentTeamName, leaderOptions]);

  if (!isOpen || !team || !candidate) return null;

  const handleSend = async () => {
    if (channel === 'sms' && !customPhone.trim()) {
      setToast({ type: 'error', message: 'Please provide a valid recipient phone number.' });
      return;
    }
    if (channel === 'email' && !customEmail.trim()) {
      setToast({ type: 'error', message: 'Please provide a valid recipient email address.' });
      return;
    }
    if (!messageBody.trim()) {
      setToast({ type: 'error', message: 'Message body cannot be empty.' });
      return;
    }

    setIsSending(true);
    setToast(null);

    const leader = leaderOptions.find(l => l.id === selectedLeaderId);
    const recipientName = leader?.name || 'Team Leader';

    try {
      if (channel === 'sms') {
        const payload = {
          churchId,
          toPhone: customPhone.replace(/[^\d+]/g, ''),
          body: messageBody.trim(),
          sentBy: user?.id || 'pastoral_care_system',
          sentByName: user?.name || 'Ministry Team',
          personId: selectedLeaderId || null,
          personName: recipientName
        };

        const res = await fetch('/api/messaging/send-individual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to dispatch SMS to team leader.');
        }

        setToast({ type: 'success', message: `SMS recommendation sent to ${recipientName} (${customPhone})!` });
      } else {
        // Email Channel
        const payload = {
          churchId,
          to: customEmail.trim(),
          toName: recipientName,
          subject: subject.trim(),
          message: messageBody.trim(),
          sentBy: user?.id || 'pastoral_care_system',
          sentByName: user?.name || 'Ministry Team'
        };

        const res = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to dispatch email to team leader.');
        }

        setToast({ type: 'success', message: `Email recommendation sent to ${recipientName} (${customEmail})!` });
      }

      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Error sending message.' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-850/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Recommend Volunteer to Team Leader
              </h3>
              <p className="text-xs text-slate-400">
                {team.name} • Candidate: <span className="font-bold text-indigo-600 dark:text-indigo-400">{candidate.personName}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Form */}
        <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
          {toast && (
            <div
              className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                toast.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
              }`}
            >
              {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{toast.message}</span>
            </div>
          )}

          {/* Channel Selector */}
          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
              Outreach Channel
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setChannel('sms')}
                className={`py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                  channel === 'sms'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Text Message (SMS)</span>
              </button>

              <button
                type="button"
                onClick={() => setChannel('email')}
                className={`py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                  channel === 'email'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Direct Email</span>
              </button>
            </div>
          </div>

          {/* Team Leader Recipient Selector */}
          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
              Team Leader Recipient
            </label>
            {leaderOptions.length > 0 ? (
              <select
                value={selectedLeaderId}
                onChange={(e) => handleLeaderChange(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {leaderOptions.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.name} {channel === 'sms' ? (l.phone || l.e164Phone ? `(${l.phone || l.e164Phone})` : '(No phone)') : (l.email ? `(${l.email})` : '(No email)')}
                  </option>
                ))}
              </select>
            ) : (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-700 dark:text-amber-300 mb-2">
                No leader assigned to this team in Services. Please enter contact details manually below.
              </div>
            )}
          </div>

          {/* Recipient Contact override */}
          {channel === 'sms' ? (
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Leader Phone Number
              </label>
              <input
                type="tel"
                value={customPhone}
                onChange={(e) => setCustomPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  Leader Email Address
                </label>
                <input
                  type="email"
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  placeholder="leader@church.org"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  Email Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </>
          )}

          {/* Message Body */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400">
                Message Body
              </label>
              {channel === 'sms' && (
                <span className="text-[10px] text-slate-400 font-mono">
                  {messageBody.length} characters
                </span>
              )}
            </div>
            <textarea
              rows={channel === 'sms' ? 4 : 8}
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed font-sans"
              placeholder="Enter message for the team leader..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-850/50">
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSend}
            disabled={isSending}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50"
          >
            {isSending ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Send {channel === 'sms' ? 'SMS' : 'Email'} to Leader</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
