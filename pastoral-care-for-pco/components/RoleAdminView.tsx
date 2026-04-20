
import React, { useState, useEffect, useRef } from 'react';
import { User, Church, RiskSettings, ChurchRiskSettings, DonorLifecycleSettings, GroupRiskSettings, CommunityLocation, UserRole } from '../types';
import { CreateUserModal } from './CreateUserModal';
import { firestore } from '../services/firestoreService';
import { auth, db as firebaseDb } from '../services/firebase';
import { setDoc, doc } from 'firebase/firestore';
import RiskSettingsView from './RiskSettingsView';
import ChurchRiskSettingsView from './ChurchRiskSettingsView';
import GroupRiskSettingsView from './GroupRiskSettingsView';
import DonorLifecycleSettingsView from './DonorLifecycleSettingsView';
import { SubscriptionSettingsView } from './SubscriptionSettingsView';
import { ALL_WIDGETS } from '../constants/widgetRegistry';
import { PLANS } from '../services/stripeService';
import { pcoService } from '../services/pcoService';

// ─── SMS Terms of Service Modal (Admin settings gate) ────────────────────────

const SmsAdminTermsModal: React.FC<{
    churchId: string;
    userId: string;
    onAccepted: (ts: number) => void;
    onCancel: () => void;
}> = ({ churchId, userId, onAccepted, onCancel }) => {
    const [checkedTos, setCheckedTos]         = React.useState(false);
    const [checkedPrivacy, setCheckedPrivacy] = React.useState(false);
    const [checkedCompliance, setCheckedCompliance] = React.useState(false);
    const [saving, setSaving]                 = React.useState(false);
    const allChecked = checkedTos && checkedPrivacy && checkedCompliance;

    const handleAccept = async () => {
        if (!allChecked) return;
        setSaving(true);
        const ts = Date.now();
        try {
            await setDoc(doc(firebaseDb, 'churches', churchId), {
                smsSettings: { termsAcceptedAt: ts, termsAcceptedByUserId: userId }
            }, { merge: true });
        } catch (e: any) {
            console.error('[SmsAdminTermsModal] Firestore write failed (continuing):', e.message);
        } finally {
            setSaving(false);
            onAccepted(ts);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onCancel}>
            <div
                className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-7 pt-7 pb-4 border-b border-slate-100 dark:border-slate-800 flex items-start gap-4 shrink-0">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                        <span className="text-2xl">📜</span>
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-slate-900 dark:text-white">SMS Service Terms of Use</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                            Please read and accept before activating your church's SMS line.
                        </p>
                    </div>
                </div>

                {/* Scrollable body */}
                <div className="overflow-y-auto flex-1 px-7 py-5 space-y-6 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    <section>
                        <h3 className="text-sm font-black text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                            <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px] font-black">1</span>
                            Terms of Service
                        </h3>
                        <div className="space-y-2">
                            <p><strong>Acceptance.</strong> By activating SMS messaging through Barnabas Software ("Platform"), your organization ("Church") agrees to these Terms of Service and all applicable laws and carrier regulations governing commercial text messaging in the United States.</p>
                            <p><strong>Permitted Use.</strong> The SMS service may only be used for legitimate pastoral, ministry, and organizational communications with individuals who have explicitly opted in to receive messages from your church. Permitted uses include service reminders, event announcements, prayer follow-ups, group updates, and pastoral care outreach.</p>
                            <p><strong>Prohibited Content.</strong> You may not use this service to send spam, unsolicited commercial messages, illegal content, harassment, or any content that violates TCPA, CTIA guidelines, or applicable carrier acceptable-use policies. Violations may result in immediate suspension of your account without refund.</p>
                            <p><strong>A2P 10DLC Compliance.</strong> Your church is required to complete Twilio's A2P 10DLC brand and campaign registration. You represent that all information submitted during registration is accurate and truthful. Submitting false information is a violation of these terms and federal law.</p>
                            <p><strong>Opt-Out Management.</strong> You must honor all STOP requests immediately and permanently. Sending messages to contacts who have opted out is a violation of TCPA and these terms.</p>
                            <p><strong>Limitation of Liability.</strong> Barnabas Software provides this service "as is" without warranty. We are not liable for carrier delivery failures, message filtering by carriers, or any damages beyond amounts paid in the 30 days prior to the claim.</p>
                        </div>
                    </section>

                    <div className="border-t border-slate-100 dark:border-slate-800" />

                    <section>
                        <h3 className="text-sm font-black text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                            <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px] font-black">2</span>
                            Privacy Policy — SMS Data
                        </h3>
                        <div className="space-y-2">
                            <p><strong>Data We Collect.</strong> To provide SMS services, we collect and process: phone numbers of message recipients, message content, delivery status events, opt-out records, and Twilio account credentials associated with your church's sub-account.</p>
                            <p><strong>How We Use Data.</strong> Recipient phone numbers and message content are used solely to deliver messages on your church's behalf. We do not sell, rent, or share this data with third parties except as required to operate the service.</p>
                            <p><strong>Twilio.</strong> Messages are routed through Twilio, Inc. By using this service, your data is also subject to Twilio's Privacy Policy. Twilio acts as a data processor on your behalf.</p>
                            <p><strong>Your Responsibilities.</strong> As the data controller for your congregation's contact information, you are responsible for maintaining a lawful basis for processing and complying with applicable privacy laws such as CCPA.</p>
                        </div>
                    </section>

                    <div className="border-t border-slate-100 dark:border-slate-800" />

                    <section>
                        <h3 className="text-sm font-black text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                            <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px] font-black">3</span>
                            A2P 10DLC Compliance Acknowledgment
                        </h3>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                            <li>You are an authorized representative of the church with authority to register for commercial texting services.</li>
                            <li>Your church will only send messages to recipients who have <strong>explicitly opted in</strong> and will honor all STOP requests immediately.</li>
                            <li>You will submit accurate legal entity information (name, EIN, physical address) during brand registration.</li>
                            <li>You understand that carrier approval is not guaranteed and may take 1–10 business days.</li>
                        </ul>
                    </section>
                </div>

                {/* Footer */}
                <div className="px-7 py-5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-700 shrink-0 space-y-3">
                    {([
                        { id: 'tos',        checked: checkedTos,        setter: setCheckedTos,        label: 'I have read and agree to the Terms of Service.' },
                        { id: 'privacy',    checked: checkedPrivacy,    setter: setCheckedPrivacy,    label: 'I have read and agree to the Privacy Policy for SMS data.' },
                        { id: 'compliance', checked: checkedCompliance, setter: setCheckedCompliance, label: 'I acknowledge the A2P 10DLC Compliance requirements and confirm I am authorized to register on behalf of this church.' },
                    ] as const).map(item => (
                        <label
                            key={item.id}
                            className="flex items-start gap-3 cursor-pointer select-none group"
                            onClick={() => item.setter(!item.checked)}
                        >
                            <div className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                                item.checked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 dark:border-slate-600 group-hover:border-indigo-400'
                            }`}>
                                {item.checked && (
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </div>
                            <span className={`text-xs leading-relaxed transition-colors ${
                                item.checked ? 'text-slate-800 dark:text-slate-200 font-semibold' : 'text-slate-600 dark:text-slate-400'
                            }`}>
                                {item.label}
                            </span>
                        </label>
                    ))}
                    <div className="flex gap-3 pt-1">
                        <button
                            onClick={onCancel}
                            className="flex-1 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleAccept}
                            disabled={!allChecked || saving}
                            className="flex-1 py-2.5 text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition shadow-md shadow-indigo-200 dark:shadow-indigo-900/30"
                        >
                            {saving ? 'Saving…' : 'I Accept — Continue →'}
                        </button>
                    </div>
                    {!allChecked && (
                        <p className="text-[10px] text-slate-400 text-center">Please check all three boxes above to continue.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── Per-area Sync Component ──────────────────────────────────────────────────

type SyncArea = {
    key: string;
    label: string;
    icon: string;
    description: string;
};

const SYNC_AREAS: SyncArea[] = [
    { key: 'people',        label: 'People',        icon: '👥', description: 'Contacts, households, addresses, field data' },
    { key: 'groups',        label: 'Groups',        icon: '🏘️', description: 'Groups, memberships, attendance history' },
    { key: 'services',      label: 'Services',      icon: '🎙️', description: 'Service plans, teams, songs, positions' },
    { key: 'giving',        label: 'Giving',        icon: '💰', description: 'Donations, funds, donor stats (last 365 days)' },
    { key: 'checkins',      label: 'Check-Ins',     icon: '✅', description: 'Headcounts, digital check-ins (last 90 days)' },
    { key: 'registrations', label: 'Registrations', icon: '📋', description: 'Full replace — clears & re-fetches all registration events from Planning Center' },
];

type AreaStatus = { state: 'idle' | 'running' | 'success' | 'error'; message?: string };

const SyncAreaButtons: React.FC<{ churchId: string; onSyncComplete: () => void }> = ({ churchId, onSyncComplete }) => {
    const [areaStatus, setAreaStatus] = React.useState<Record<string, AreaStatus>>({});

    const handleAreaSync = async (area: SyncArea) => {
        setAreaStatus(prev => ({ ...prev, [area.key]: { state: 'running' } }));
        try {
            const res = await fetch('/pco/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ churchId, area: area.key }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(err.error || `HTTP ${res.status}`);
            }
            setAreaStatus(prev => ({ ...prev, [area.key]: { state: 'success', message: 'Sync complete' } }));
            onSyncComplete();
            // Auto-clear success after 5 s
            setTimeout(() => setAreaStatus(prev => ({ ...prev, [area.key]: { state: 'idle' } })), 5000);
        } catch (e: any) {
            setAreaStatus(prev => ({ ...prev, [area.key]: { state: 'error', message: e.message } }));
        }
    };

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SYNC_AREAS.map(area => {
                const status = areaStatus[area.key] || { state: 'idle' };
                return (
                    <div
                        key={area.key}
                        className={`p-4 rounded-2xl border transition-all ${
                            status.state === 'success' ? 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-900/10' :
                            status.state === 'error'   ? 'border-rose-200 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-900/10' :
                            'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                        }`}
                    >
                        <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                                <span className="text-base">{area.icon}</span>
                                <span className="text-xs font-black text-slate-900 dark:text-white">{area.label}</span>
                            </div>
                            {status.state === 'running' && (
                                <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full shrink-0 mt-0.5"></span>
                            )}
                            {status.state === 'success' && (
                                <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 shrink-0">✓ Done</span>
                            )}
                            {status.state === 'error' && (
                                <span className="text-[9px] font-black text-rose-500 shrink-0">✕ Failed</span>
                            )}
                        </div>
                        <p className="text-[9px] text-slate-400 dark:text-slate-500 leading-snug mb-3">{area.description}</p>
                        {status.state === 'error' && status.message && (
                            <p className="text-[9px] text-rose-500 mb-2 leading-snug">{status.message}</p>
                        )}
                        <button
                            onClick={() => handleAreaSync(area)}
                            disabled={status.state === 'running'}
                            className="w-full bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:opacity-50 text-indigo-600 dark:text-indigo-400 text-[9px] font-black uppercase tracking-widest py-2 rounded-xl transition-all"
                        >
                            {status.state === 'running' ? 'Syncing…' : 'Force Sync'}
                        </button>
                    </div>
                );
            })}
        </div>
    );
};

interface RoleAdminViewProps {
  currentUser: User;
  churchId: string;
  church: Church;
  onUpdateChurch?: (updates: Partial<Church>) => void;
  onSaveRiskSettings?: (settings: RiskSettings) => void;
  initialTab?: string;
  rawPeople?: any[];
  rawGroups?: any[];
  rawDonations?: any[];
  rawTeams?: any[];
  onSync?: () => void;
}

const RoleAdminView: React.FC<RoleAdminViewProps> = ({ 
    currentUser, 
    churchId, 
    church, 
    onUpdateChurch,
    onSaveRiskSettings,
    initialTab,
    onSync
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'Team' | 'Organization' | 'Planning Center' | 'Community' | 'Widget Directory' | 'Risk Profiles' | 'Subscription' | 'Mail Settings' | 'SMS'>('Team');

  // Mail Settings state
  const [mailMode, setMailMode] = useState<'shared' | 'custom'>(church.emailSettings?.mode || 'shared');
  const [mailPrefix, setMailPrefix] = useState(church.emailSettings?.sharedPrefix || '');
  const [mailFromName, setMailFromName] = useState(church.emailSettings?.fromName || church.name || '');
  const [mailCustomDomain, setMailCustomDomain] = useState(church.emailSettings?.customDomain || '');
  const [mailCustomFromEmail, setMailCustomFromEmail] = useState(church.emailSettings?.fromEmail || '');
  const [mailCnameRecords, setMailCnameRecords] = useState<{ host: string; type: 'CNAME'; data: string }[]>(church.emailSettings?.cnameRecords || []);
  const [mailDomainAuthId, setMailDomainAuthId] = useState<string>(church.emailSettings?.domainAuthId || '');
  const [mailDomainVerified, setMailDomainVerified] = useState(church.emailSettings?.domainVerified || false);
  const [isMailSaving, setIsMailSaving] = useState(false);
  const [mailMessage, setMailMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [mailDiagEmail, setMailDiagEmail] = useState('');
  const [mailDiagChecks, setMailDiagChecks] = useState<{ label: string; status: 'pass' | 'fail' | 'warn'; detail: string }[] | null>(null);
  const [formData, setFormData] = useState<Partial<Church>>(church);

  // SMS Settings state
  const [smsSubTab, setSmsSubTab] = useState<'a2p' | 'optout' | 'numbers'>('a2p');
  const [showRep2, setShowRep2] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(() => {
    const s = church.smsSettings || {};
    if (!s.twilioSubAccountSid) return new Set([1]); // Fresh — start at step 1
    if (!s.a2pBusinessName)  return new Set([2]);    // Sub-account done, open brand
    if (!s.a2pDescription)   return new Set([3]);    // Brand done, open campaign
    return new Set<number>();                        // All complete — all collapsed
  });
  const toggleStep = (n: number) => setExpandedSteps(prev => {
    const next = new Set(prev);
    next.has(n) ? next.delete(n) : next.add(n);
    return next;
  });
  const [smsForm, setSmsForm] = useState<NonNullable<Church['smsSettings']>>(church.smsSettings || {});
  const [isSmsSaving, setIsSmsSaving] = useState(false);
  const [smsMessage, setSmsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isA2pSubmitting, setIsA2pSubmitting] = useState(false);
  const [isA2pChecking, setIsA2pChecking] = useState(false);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [isDeletingProfile, setIsDeletingProfile] = useState(false);
  const [a2pResult, setA2pResult] = useState<{ success: boolean; message: string; brandSid?: string; failureReason?: string | null; twilioStatus?: string; needsBundle?: boolean; needsPrimaryProfile?: boolean; evaluationStatus?: string } | null>(null);
  const [isRefreshingProfile, setIsRefreshingProfile] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  // 'create-profile' | 'submit-a2p' — which action to run after terms are accepted
  const [pendingTermsAction, setPendingTermsAction] = useState<'create-profile' | 'submit-a2p' | null>(null);
  // Ref that the SMS tab IIFE populates with its handler functions
  const smsActionRef = useRef<{ handleCreateProfile: () => void; handleSubmitToTwilio: () => void } | null>(null);
  // A2P pipeline step loading states
  const [isRegisteringBrand, setIsRegisteringBrand]         = useState(false);
  const [isCreatingMsgSvc, setIsCreatingMsgSvc]             = useState(false);
  const [isRegisteringCampaign, setIsRegisteringCampaign]   = useState(false);
  const [isAssigningNumbers, setIsAssigningNumbers]         = useState(false);
  const [isCheckingCampaign, setIsCheckingCampaign]         = useState(false);

  // Phone Numbers panel state (SMS → Numbers tab)
  const [twilioNumbers, setTwilioNumbers] = useState<any[]>([]);
  const [numLoading, setNumLoading] = useState(false);
  const [numError, setNumError] = useState('');
  const [numToast, setNumToast] = useState('');
  const [showAddNumber, setShowAddNumber] = useState(false);
  // Add-number wizard local state
  const [addNumStep, setAddNumStep] = useState<'search' | 'pick'>('search');
  const [addNumMode, setAddNumMode] = useState<'city-state' | 'area-code'>('city-state');
  const [addNumCity, setAddNumCity] = useState(church.city || '');
  const [addNumState, setAddNumState] = useState(church.state || '');
  const [addNumAreaCode, setAddNumAreaCode] = useState('');
  const [addNumResults, setAddNumResults] = useState<{ phoneNumber: string; friendlyName: string; locality: string; region: string }[]>([]);
  const [addNumSelected, setAddNumSelected] = useState('');
  const [addNumLabel, setAddNumLabel] = useState('');
  const [addNumSender, setAddNumSender] = useState(church.name || '');
  const [addNumBusy, setAddNumBusy] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [pendingRoles, setPendingRoles] = useState<UserRole[]>([]);
  const [isSavingRoles, setIsSavingRoles] = useState(false);

  // PCO Lists state (for regular attenders selection)
  const [pcoLists, setPcoLists] = useState<{ id: string; attributes: { name: string; total_people: number } }[]>([]);
  const [isPcoListsLoading, setIsPcoListsLoading] = useState(false);
  const [pcoListsError, setPcoListsError] = useState<string | null>(null);
  const [selectedListId, setSelectedListId] = useState(church.regularAttendersListId || '');
  const [selectedListName, setSelectedListName] = useState(church.regularAttendersListName || '');
  const [isSavingList, setIsSavingList] = useState(false);
  const [listSaveMessage, setListSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadUsers();
  }, [churchId]);

  useEffect(() => {
      setFormData(church);
      // Keep list selection in sync if church prop changes externally
      setSelectedListId(church.regularAttendersListId || '');
      setSelectedListName(church.regularAttendersListName || '');
  }, [church]);

  useEffect(() => {
      if (initialTab && ['Team', 'Organization', 'Planning Center', 'Community', 'Widget Directory', 'Risk Profiles', 'Subscription', 'Mail Settings', 'SMS'].includes(initialTab)) {
          setActiveTab(initialTab as any);
      }
  }, [initialTab]);

  // Keep SMS form in sync when church prop changes
  useEffect(() => {
      setSmsForm(church.smsSettings || {});
  }, [church.smsSettings]);

  // Load phone numbers directly from Firestore when 'numbers' sub-tab is opened.
  // Also auto-migrates the legacy smsSettings.twilioPhoneNumber into the twilioNumbers
  // collection if no docs exist yet but a real sub-account is present.
  useEffect(() => {
      if (smsSubTab !== 'numbers') return;
      setNumLoading(true);
      setNumError('');
      import('firebase/firestore').then(({ collection, query, where, orderBy, getDocs, setDoc, doc: fsDoc }) => {
          const q = query(
              collection(firebaseDb, 'twilioNumbers'),
              where('churchId', '==', churchId),
              orderBy('createdAt', 'asc')
          );
          getDocs(q)
              .then(async snap => {
                  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                  if (docs.length === 0) {
                      // Auto-migrate legacy number if church has a real provisioned sub-account
                      const legacyPhone = church.smsSettings?.twilioPhoneNumber;
                      const hasSubAccount = !!church.smsSettings?.twilioSubAccountSid;
                      if (legacyPhone && hasSubAccount) {
                          const migratedId = `${churchId}_migrated`;
                          const migratedDoc = {
                              id: migratedId,
                              churchId,
                              phoneNumber: legacyPhone,
                              phoneSid: church.smsSettings?.twilioPhoneSid || '',
                              friendlyLabel: 'Main Line',
                              isDefault: true,
                              smsEnabled: true,
                              allowedUserIds: [],
                              createdAt: Date.now(),
                              updatedAt: Date.now(),
                          };
                          await setDoc(fsDoc(firebaseDb, 'twilioNumbers', migratedId), migratedDoc)
                              .catch(() => {/* silent race */});
                          setTwilioNumbers([migratedDoc]);
                      } else {
                          setTwilioNumbers([]);
                      }
                  } else {
                      setTwilioNumbers(docs);
                  }
              })
              .catch(e => setNumError(e.message || 'Failed to load numbers'))
              .finally(() => setNumLoading(false));
      });
  }, [smsSubTab, churchId]);

  // Sync mail state when church prop changes
  useEffect(() => {
      const es = church.emailSettings;
      if (es) {
          setMailMode(es.mode || 'shared');
          setMailPrefix(es.sharedPrefix || '');
          setMailFromName(es.fromName || church.name || '');
          setMailCustomDomain(es.customDomain || '');
          setMailCustomFromEmail(es.fromEmail || '');
          setMailCnameRecords(es.cnameRecords || []);
          setMailDomainAuthId(es.domainAuthId || '');
          setMailDomainVerified(es.domainVerified || false);
      }
  }, [church.emailSettings]);

  // Clear save message automatically
  useEffect(() => {
      let timer: ReturnType<typeof setTimeout>;
      if (saveMessage) {
          timer = setTimeout(() => setSaveMessage(''), 3000);
      }
      return () => clearTimeout(timer);
  }, [saveMessage]);

  // Load PCO People Lists when Planning Center tab becomes active
  useEffect(() => {
      if (activeTab === 'Planning Center' && church.pcoConnected && pcoLists.length === 0 && !isPcoListsLoading) {
          loadPcoLists();
      }
  }, [activeTab, church.pcoConnected]);

  const loadPcoLists = async () => {
      setIsPcoListsLoading(true);
      setPcoListsError(null);
      try {
          const raw = await pcoService.getPeopleLists(churchId);
          setPcoLists(raw);
      } catch (e: any) {
          setPcoListsError(e.message || 'Failed to load lists from Planning Center.');
      } finally {
          setIsPcoListsLoading(false);
      }
  };

  const handleSaveRegularAttendersList = async () => {
      if (!onUpdateChurch) return;
      setIsSavingList(true);
      setListSaveMessage(null);
      try {
          await onUpdateChurch({
              regularAttendersListId: selectedListId || undefined,
              regularAttendersListName: selectedListName || undefined,
          });
          setListSaveMessage({ type: 'success', text: 'Regular attenders list saved.' });
      } catch (e: any) {
          setListSaveMessage({ type: 'error', text: 'Failed to save: ' + e.message });
      } finally {
          setIsSavingList(false);
          setTimeout(() => setListSaveMessage(null), 4000);
      }
  };

  const loadUsers = async () => {
    try {
      const churchUsers = await firestore.getUsersByChurch(churchId);
      setUsers(churchUsers);
    } catch (e) {
      console.error("Failed to load users", e);
    }
  };

  const handleRemoveUser = async (uid: string) => {
    if (window.confirm("Are you sure you want to remove this user?")) {
      await firestore.deleteUser(uid);
      loadUsers();
    }
  };

  const isChurchAdmin = currentUser.roles.includes('Church Admin');

  const ALL_ROLES: UserRole[] = [
    'Church Admin', 'Pastor', 'Pastor AI', 'People', 'Services',
    'Groups', 'Giving', 'Finance', 'Pastoral Care', 'Metrics', 'Messaging', 'System Administration'
  ];

  const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
    'Church Admin':          'Full access to all settings and user management',
    'Pastor':                'Full read access to pastoral data and dashboards',
    'Pastor AI':             'Access to AI-assisted pastoral insights',
    'People':                'Manage people & household records',
    'Services':              'Manage service plans, teams & check-ins',
    'Groups':                'Manage small groups & attendance',
    'Giving':                'View giving records & donor analytics',
    'Finance':               'Full financials including fund budgets',
    'Pastoral Care':         'Access to pastoral care log & prayer requests',
    'Metrics':               'View aggregated analytics & benchmarks',
    'Messaging':             'Access to SMS messaging, campaigns & inbox',
    'System Administration': 'Platform-wide system settings (super admin)',
  };

  const handleStartEditRoles = (u: User) => {
    setEditingUserId(u.id);
    setPendingRoles([...u.roles]);
  };

  const handleToggleRole = (role: UserRole) => {
    setPendingRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const handleSaveRoles = async (uid: string) => {
    if (pendingRoles.length === 0) {
      alert('A user must have at least one role.');
      return;
    }
    setIsSavingRoles(true);
    try {
      const target = users.find(u => u.id === uid);
      if (!target) return;
      await firestore.createUserProfile({ ...target, roles: pendingRoles });
      setUsers(prev => prev.map(u => u.id === uid ? { ...u, roles: pendingRoles } : u));
      setEditingUserId(null);
    } catch (e: any) {
      alert('Failed to save roles: ' + (e?.message || 'Unknown error'));
    } finally {
      setIsSavingRoles(false);
    }
  };


  // Determine Limit Variables
  const now = Date.now();
  const isTrialActive = !church.subscription?.planId && (church.trialEndsAt || 0) > now;
  const activeSubscription = church.subscription?.status === 'active';
  const planId = activeSubscription ? church.subscription?.planId : null;
  
  // Calculate Max Users
  let maxUsers = 1; // Default to Free Tier (1 User)
  let planName = 'Free';

  if (activeSubscription && planId) {
      const plan = PLANS.find(p => p.id === planId);
      if (plan) {
          maxUsers = plan.maxUsers;
          planName = plan.name;
      }
  } else if (isTrialActive) {
      // Trial users get Growth equivalent (Unlimited)
      maxUsers = 99999; 
      planName = 'Free Trial';
  }

  const handleAddMemberClick = () => {
      if (users.length >= maxUsers) {
          alert(`You have reached the user limit (${maxUsers}) for the ${planName} plan. Please upgrade your subscription to add more team members.`);
          setActiveTab('Subscription');
          return;
      }

      setIsCreateModalOpen(true);
  };

  const handleChange = (field: keyof Church, value: any) => {
      if (field === 'metricsSharingEnabled' && value === false) {
          // If turning OFF metrics sharing, automatically disable all benchmark widgets
          let currentEnabled = formData.enabledWidgets;
          
          if (!currentEnabled) {
              // Convert "All Enabled" to explicit list excluding benchmarks
              const allNonBenchmarkIds: string[] = [];
              Object.entries(ALL_WIDGETS).forEach(([category, widgets]) => {
                  widgets.forEach(w => {
                      if (!w.id.startsWith('benchmark_')) {
                          allNonBenchmarkIds.push(`${category}:${w.id}`);
                      }
                  });
              });
              setFormData(prev => ({ ...prev, [field]: value, enabledWidgets: allNonBenchmarkIds }));
          } else {
              // Filter out benchmarks from existing explicit list
              const filteredWidgets = currentEnabled.filter(id => {
                  const [_, widgetId] = id.split(':'); // category:id
                  return !widgetId?.startsWith('benchmark_');
              });
              setFormData(prev => ({ ...prev, [field]: value, enabledWidgets: filteredWidgets }));
          }
      } else {
          setFormData(prev => ({ ...prev, [field]: value }));
      }
  };

  const handleSaveOrgSettings = async () => {
      if (!onUpdateChurch) return;
      setIsSaving(true);
      setSaveMessage('');
      try {
          await onUpdateChurch(formData);
          setSaveMessage('Settings saved successfully.');
      } catch (e) {
          console.error(e);
          setSaveMessage('Failed to save settings.');
      } finally {
          setIsSaving(false);
      }
  };

  const handleFlushData = async () => {
      const confirmMessage = `WARNING: This will delete all cached data pulled from Planning Center (People, Groups, Giving, Services).\n\nIt will NOT delete your organization, user accounts, or manual settings.\n\nThis is useful if you want to force a completely fresh sync.\n\nAre you sure?`;
      
      if (window.confirm(confirmMessage)) {
          try {
              await firestore.flushSyncedData(churchId);
              alert("Data flushed successfully. You can now re-sync from the Planning Center tab.");
              if (onUpdateChurch) onUpdateChurch({ lastSyncTimestamp: null });
          } catch (e: any) {
              console.error(e);
              alert("Error flushing data: " + e.message);
          }
      }
  };

  const handleDeleteOrganization = async () => {
      const confirmMessage = `WARNING: YOU ARE ABOUT TO PERMANENTLY DELETE THIS ORGANIZATION.\n\nTenant: ${church.name}\n\nThis will delete:\n- All People & Households\n- All Donation Records\n- All Groups & Service Plans\n- All User Accounts (including yours)\n\nThis action CANNOT be undone.\n\nType "DELETE" to confirm.`;
      
      if (window.prompt(confirmMessage) === 'DELETE') {
          try {
              await firestore.deleteChurchAndData(churchId);
              // Sign out immediately as user no longer exists
              await auth.signOut();
              window.location.reload();
          } catch (e: any) {
              console.error(e);
              alert("Error deleting organization: " + e.message);
          }
      }
  };

  const handleConnectPco = async () => {
      const sys = await firestore.getSystemSettings();
      const clientId = sys.pcoClientId;
      if (!clientId) {
          alert("No Client ID configured in System Settings. Please contact an administrator.");
          return;
      }
      
      // Clear any existing (potentially stale) tokens from Firestore before redirecting.
      // This ensures that if the code exchange after redirect fails, we don't keep using
      // a token that was granted before the 'registrations' scope was added.
      try {
          await firestore.updateChurch(churchId, {
              pcoAccessToken: null,
              pcoRefreshToken: null,
              pcoTokenExpiry: 0,
              pcoConnected: false,
          });
      } catch (e) {
          console.warn('Could not clear old PCO tokens before reauth:', e);
      }
      
      const redirectUri = window.location.origin;
      const url = `https://api.planningcenteronline.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=people%20services%20giving%20groups%20check_ins%20registrations%20calendar&state=${churchId}`;
      window.location.href = url;
  };

  const handleDisconnectPco = async () => {
      if (window.confirm("Are you sure you want to disconnect? This will stop all data syncs.")) {
          const updates = { 
              pcoConnected: false, 
              pcoAccessToken: null, 
              pcoRefreshToken: null, 
              pcoTokenExpiry: 0 
          };
          setFormData(prev => ({ ...prev, ...updates }));
          if (onUpdateChurch) await onUpdateChurch(updates);
      }
  };

  // --- Widget Directory Logic ---

  const handleToggleWidget = (fullWidgetId: string) => {
      // Logic: enabledWidgets === null/undefined means ALL are enabled.
      // To disable one, we must first materialize the list of ALL widgets, then remove the target.
      
      let currentEnabled = formData.enabledWidgets;

      if (!currentEnabled) {
          // Currently in "All Enabled" mode. Switch to explicit array mode.
          const allIds: string[] = [];
          Object.entries(ALL_WIDGETS).forEach(([category, widgets]) => {
              widgets.forEach(w => allIds.push(`${category}:${w.id}`));
          });
          // Remove the one we are toggling off
          currentEnabled = allIds.filter(id => id !== fullWidgetId);
      } else {
          // Currently in explicit mode
          if (currentEnabled.includes(fullWidgetId)) {
              currentEnabled = currentEnabled.filter(id => id !== fullWidgetId);
          } else {
              currentEnabled = [...currentEnabled, fullWidgetId];
          }
      }

      setFormData(prev => ({ ...prev, enabledWidgets: currentEnabled }));
  };

  const handleEnableAllWidgets = () => {
      if (!formData.metricsSharingEnabled) {
          // If metrics sharing is disabled, we cannot enable "All" because that includes benchmarks
          // Instead, enable all EXCEPT benchmarks
          const allNonBenchmarkIds: string[] = [];
          Object.entries(ALL_WIDGETS).forEach(([category, widgets]) => {
              widgets.forEach(w => {
                  if (!w.id.startsWith('benchmark_')) {
                      allNonBenchmarkIds.push(`${category}:${w.id}`);
                  }
              });
          });
          setFormData(prev => ({ ...prev, enabledWidgets: allNonBenchmarkIds }));
      } else {
          setFormData(prev => ({ ...prev, enabledWidgets: null }));
      }
  };

  const handleDisableAllWidgets = () => {
      setFormData(prev => ({ ...prev, enabledWidgets: [] }));
  };

  const handleAddLocation = async () => {
      const name = (document.getElementById('new-loc-name') as HTMLInputElement)?.value;
      const city = (document.getElementById('new-loc-city') as HTMLInputElement)?.value;
      const state = (document.getElementById('new-loc-state') as HTMLInputElement)?.value;
      const zip = (document.getElementById('new-loc-zip') as HTMLInputElement)?.value;

      if (!name || !city || !state) {
          alert("Please provide Name, City, and State.");
          return;
      }

      const newLoc: CommunityLocation = {
          id: `loc_${Date.now()}`,
          name,
          city,
          state,
          zip,
          isDefault: (formData.communityLocations || []).length === 0
      };

      const updatedLocations = [...(formData.communityLocations || []), newLoc];
      setFormData(prev => ({ ...prev, communityLocations: updatedLocations }));
      
      if (onUpdateChurch) {
          await onUpdateChurch({ communityLocations: updatedLocations });
          setSaveMessage('Location added successfully');
      }

      // Clear inputs
      (document.getElementById('new-loc-name') as HTMLInputElement).value = '';
      (document.getElementById('new-loc-city') as HTMLInputElement).value = '';
      (document.getElementById('new-loc-state') as HTMLInputElement).value = '';
      (document.getElementById('new-loc-zip') as HTMLInputElement).value = '';
  };

  const handleRemoveLocation = async (id: string) => {
      if (!window.confirm("Are you sure you want to remove this location?")) return;

      const updatedLocations = (formData.communityLocations || []).filter(l => l.id !== id);
      
      // If we removed the default, set the first one as default if any remain
      if (updatedLocations.length > 0 && !updatedLocations.some(l => l.isDefault)) {
          updatedLocations[0].isDefault = true;
      }

      setFormData(prev => ({ ...prev, communityLocations: updatedLocations }));
      if (onUpdateChurch) {
          await onUpdateChurch({ communityLocations: updatedLocations });
          setSaveMessage('Location removed');
      }
  };

  const handleSetDefaultLocation = async (id: string) => {
      const updatedLocations = (formData.communityLocations || []).map(l => ({
          ...l,
          isDefault: l.id === id
      }));

      setFormData(prev => ({ ...prev, communityLocations: updatedLocations }));
      if (onUpdateChurch) {
          await onUpdateChurch({ communityLocations: updatedLocations });
          setSaveMessage('Default location updated');
      }
  };

  return (
    <div className="space-y-8 animate-in fade-in">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
                <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">Settings & Administration</h2>
                <p className="text-slate-400 dark:text-slate-500 font-medium uppercase text-[10px] tracking-widest mt-1">Manage Team & Configuration</p>
            </div>
            
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl gap-1 overflow-x-auto max-w-full">
                {['Team', 'Organization', 'Planning Center', 'Community', 'Mail Settings', 'SMS', 'Widget Directory', 'Risk Profiles', 'Subscription'].map(tab => (
                    <button 
                        key={tab}
                        onClick={() => setActiveTab(tab as any)}
                        className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>
        </div>

        {activeTab === 'Team' && (
            <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-sm">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="text-xl font-black text-slate-900 dark:text-white">Team Members</h3>
                    <div className="flex items-center gap-4">
                        <span className={`text-xs font-bold ${users.length >= maxUsers ? 'text-rose-500' : 'text-slate-400'}`}>
                            {users.length} / {maxUsers > 1000 ? '∞' : maxUsers} Users
                        </span>
                        <button 
                            onClick={handleAddMemberClick}
                            className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg ${
                                users.length >= maxUsers 
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200 dark:shadow-indigo-900/50'
                            }`}
                        >
                            + Add Member
                        </button>
                    </div>
                </div>

                <div className="space-y-4">
                    {users.map(u => (
                        <div key={u.id} className="bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                            {/* ── User summary row ── */}
                            <div className="flex flex-col md:flex-row items-center justify-between p-4 gap-4">
                                <div className="flex items-center gap-4 w-full md:w-auto">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-sm shrink-0">
                                        {u.name.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-900 dark:text-white text-sm">{u.name}</p>
                                        <p className="text-xs text-slate-400 dark:text-slate-500">{u.email}</p>
                                        {u.lastLogin && (
                                            <p className="text-[9px] text-slate-400 dark:text-slate-600 mt-0.5 font-medium">
                                                Last login: {new Date(u.lastLogin).toLocaleDateString()} {new Date(u.lastLogin).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2 flex-1">
                                    {u.roles.map(r => (
                                        <span key={r} className="px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                                            {r}
                                        </span>
                                    ))}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {/* Edit Roles — only Church Admins can edit other users, not themselves */}
                                    {isChurchAdmin && currentUser.id !== u.id && (
                                        editingUserId === u.id ? (
                                            <button
                                                onClick={() => setEditingUserId(null)}
                                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors px-4 py-2 text-[10px] font-black uppercase tracking-widest"
                                            >
                                                Cancel
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleStartEditRoles(u)}
                                                className="text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors px-4 py-2 text-[10px] font-black uppercase tracking-widest"
                                            >
                                                Edit Roles
                                            </button>
                                        )
                                    )}
                                    {currentUser.id !== u.id && (
                                        <button
                                            onClick={() => handleRemoveUser(u.id)}
                                            className="text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 transition-colors px-4 py-2 text-[10px] font-black uppercase tracking-widest"
                                        >
                                            Remove
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* ── Inline role editor (Church Admin only) ── */}
                            {editingUserId === u.id && (
                                <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-5 bg-white dark:bg-slate-900">
                                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Assign Roles — {u.name}</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
                                        {ALL_ROLES.map(role => {
                                            const checked = pendingRoles.includes(role);
                                            return (
                                                <label
                                                    key={role}
                                                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                                                        checked
                                                        ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-600'
                                                        : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700'
                                                    }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => handleToggleRole(role)}
                                                        className="mt-0.5 accent-indigo-600 shrink-0"
                                                    />
                                                    <div>
                                                        <p className={`text-xs font-bold ${ checked ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'}`}>{role}</p>
                                                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-snug">{ROLE_DESCRIPTIONS[role]}</p>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <button
                                            onClick={() => handleSaveRoles(u.id)}
                                            disabled={isSavingRoles}
                                            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition shadow-lg"
                                        >
                                            {isSavingRoles ? 'Saving…' : 'Save Roles'}
                                        </button>
                                        <button
                                            onClick={() => setEditingUserId(null)}
                                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-[10px] font-bold uppercase tracking-widest"
                                        >
                                            Cancel
                                        </button>
                                        {pendingRoles.length === 0 && (
                                            <p className="text-[10px] text-rose-500 font-bold">⚠ At least one role required</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

            </div>
        )}

        {activeTab === 'Organization' && (
            <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-sm transition-colors">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="text-xl font-black text-slate-900 dark:text-white">Organization Profile</h3>
                    <div className="flex items-center gap-4">
                        {saveMessage && (
                            <span className={`text-xs font-bold animate-in fade-in ${saveMessage.includes('Failed') ? 'text-rose-500' : 'text-emerald-500'}`}>
                                {saveMessage}
                            </span>
                        )}
                        <button 
                            onClick={handleSaveOrgSettings}
                            disabled={isSaving}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg disabled:opacity-50"
                        >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div className="space-y-6">
                        {/* Read-Only Tenant ID */}
                        <div>
                            <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-3">Tenant ID (Read Only)</label>
                            <div className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400 select-all transition-colors">
                                {formData.id}
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-3">Church Name</label>
                            <input 
                                type="text" 
                                value={formData.name || ''}
                                onChange={e => handleChange('name', e.target.value)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-3">Address</label>
                            <input 
                                type="text" 
                                value={formData.address || ''}
                                onChange={e => handleChange('address', e.target.value)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                                placeholder="123 Main St"
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="col-span-1">
                                <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-3">City</label>
                                <input 
                                    type="text" 
                                    value={formData.city || ''}
                                    onChange={e => handleChange('city', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                                />
                            </div>
                            <div className="col-span-1">
                                <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-3">State</label>
                                <input 
                                    type="text" 
                                    value={formData.state || ''}
                                    onChange={e => handleChange('state', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                                />
                            </div>
                            <div className="col-span-1">
                                <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-3">Zip</label>
                                <input 
                                    type="text" 
                                    value={formData.zip || ''}
                                    onChange={e => handleChange('zip', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-3">Phone</label>
                                <input 
                                    type="tel" 
                                    value={formData.phone || ''}
                                    onChange={e => handleChange('phone', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                                    placeholder="(555) 555-5555"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-3">Email</label>
                                <input 
                                    type="email" 
                                    value={formData.email || ''}
                                    onChange={e => handleChange('email', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                                    placeholder="contact@church.com"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-3">Website</label>
                            <input 
                                type="text" 
                                value={formData.website || ''}
                                onChange={e => handleChange('website', e.target.value)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                            />
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 transition-colors">
                            <h4 className="font-bold text-indigo-600 dark:text-indigo-400 mb-4 text-sm">Integrations</h4>
                            
                            <div className="mb-6">
                                <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-2">Google Maps API Key</label>
                                <input 
                                    type="text" 
                                    value={formData.googleMapsApiKey || ''}
                                    onChange={e => handleChange('googleMapsApiKey', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-400 transition-colors"
                                    placeholder="Enter your key for maps"
                                />
                            </div>

                            <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors">
                                <div>
                                    <p className="text-xs font-bold text-slate-900 dark:text-white">Share Aggregated Metrics</p>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400">Contribute anonymized stats to global benchmarks</p>
                                </div>
                                <button 
                                    title="Toggle metric sharing"
                                    onClick={() => handleChange('metricsSharingEnabled', !formData.metricsSharingEnabled)}
                                    className={`w-12 h-6 rounded-full p-1 transition-colors ${formData.metricsSharingEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                                >
                                    <div className={`w-4 h-4 bg-white rounded-full transition-transform ${formData.metricsSharingEnabled ? 'translate-x-6' : ''}`}></div>
                                </button>
                            </div>
                        </div>

                        {/* Danger Zone */}
                        <div className="bg-rose-50 dark:bg-rose-950/30 p-6 rounded-2xl border border-rose-100 dark:border-rose-900/50 transition-colors">
                            <h4 className="font-bold text-rose-600 dark:text-rose-500 mb-2 text-sm">Danger Zone</h4>
                            <p className="text-[10px] text-rose-600/70 dark:text-rose-200/60 mb-4 leading-relaxed">
                                Manage destructive actions for this organization.
                            </p>
                            <div className="space-y-3">
                                <button 
                                    onClick={handleFlushData}
                                    className="w-full bg-amber-100 dark:bg-amber-600/10 hover:bg-amber-200 dark:hover:bg-amber-600 text-amber-700 dark:text-amber-500 dark:hover:text-white border border-amber-200 dark:border-amber-600/50 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                                >
                                    Flush Synced Data
                                </button>
                                <button 
                                    onClick={handleDeleteOrganization}
                                    className="w-full bg-rose-100 dark:bg-rose-600/10 hover:bg-rose-200 dark:hover:bg-rose-600 text-rose-700 dark:text-rose-500 dark:hover:text-white border border-rose-200 dark:border-rose-600/50 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                                >
                                    Delete Organization
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'Community' && (
            <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-sm transition-colors">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white">Community Locations</h3>
                        <p className="text-xs text-slate-400 mt-1">Manage locations for census and community data analysis.</p>
                    </div>
                    {saveMessage && (
                        <span className="text-xs font-bold text-emerald-500 animate-in fade-in">
                            {saveMessage}
                        </span>
                    )}
                </div>

                <div className="space-y-6">
                    {/* Location List */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {(formData.communityLocations || []).map((loc) => (
                            <div key={loc.id} className={`p-6 rounded-3xl border transition-all ${loc.isDefault ? 'bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-200 dark:border-indigo-800' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800'}`}>
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h4 className="font-bold text-slate-900 dark:text-white">{loc.name}</h4>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">{loc.city}, {loc.state} {loc.zip}</p>
                                    </div>
                                    {loc.isDefault && (
                                        <span className="text-[8px] font-black uppercase bg-indigo-600 text-white px-2 py-0.5 rounded-full tracking-widest">Default</span>
                                    )}
                                </div>
                                
                                <div className="flex gap-2 mt-4">
                                    {!loc.isDefault && (
                                        <button 
                                            onClick={() => handleSetDefaultLocation(loc.id)}
                                            className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                                        >
                                            Set as Default
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => handleRemoveLocation(loc.id)}
                                        className="text-[10px] font-bold text-rose-500 hover:underline ml-auto"
                                    >
                                        Remove
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Add New Location Form */}
                    <div className="mt-10 pt-10 border-t border-slate-100 dark:border-slate-800">
                        <h4 className="text-sm font-black text-slate-900 dark:text-white mb-6 uppercase tracking-widest">Add New Location</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Location Name</label>
                                <input 
                                    type="text" 
                                    placeholder="Main Campus / North Side"
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                    id="new-loc-name"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">City</label>
                                <input 
                                    type="text" 
                                    placeholder="City"
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                    id="new-loc-city"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">State (2-letter)</label>
                                <input 
                                    type="text" 
                                    placeholder="ST"
                                    maxLength={2}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                    id="new-loc-state"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Zip Code</label>
                                <input 
                                    type="text" 
                                    placeholder="12345"
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                    id="new-loc-zip"
                                />
                            </div>
                        </div>
                        <button 
                            onClick={handleAddLocation}
                            className="mt-6 bg-indigo-600 text-white px-8 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
                        >
                            Add Location
                        </button>
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'Planning Center' && (
            <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-sm animate-in fade-in">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
                    <div>
                        <div className="flex items-center gap-3">
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white">Planning Center Integration</h3>
                            {formData.pcoConnected ? (
                                <span className="bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase px-2 py-1 rounded">Connected</span>
                            ) : (
                                <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase px-2 py-1 rounded">Not Connected</span>
                            )}
                        </div>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 font-medium">Manage data synchronization and API connection.</p>
                    </div>
                    {formData.pcoConnected ? (
                        <div className="flex gap-3">
                            <button 
                                onClick={() => onSync && onSync()}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg"
                            >
                                Sync Data Now
                            </button>
                            <button 
                                onClick={handleDisconnectPco}
                                className="bg-white dark:bg-slate-800 border border-rose-100 dark:border-rose-900 text-rose-500 dark:text-rose-400 px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all hover:bg-rose-50 dark:hover:bg-rose-900/20"
                            >
                                Disconnect
                            </button>
                        </div>
                    ) : (
                        <button 
                            onClick={handleConnectPco}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg flex items-center gap-3"
                        >
                            <span>🔗</span> Connect Planning Center
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-8">
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800">
                            <h4 className="font-bold text-slate-900 dark:text-white mb-6 text-sm">Automated Sync Schedule</h4>
                            <div className="flex items-center gap-4">
                                <div className="flex-1">
                                    <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-2">Daily Time</label>
                                    <input 
                                        type="time"
                                        title="Daily sync time"
                                        value={formData.scheduledSyncTime || ''}
                                        onChange={e => handleChange('scheduledSyncTime', e.target.value)}
                                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-mono text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                    />
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 leading-relaxed">
                                        The system will automatically sync all data from Planning Center at this time each day. Leave blank to disable.
                                    </p>
                                </div>
                            </div>
                            <div className="mt-4 flex items-center justify-between">
                                {formData.scheduledSyncTime ? (
                                    <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-full border border-emerald-100 dark:border-emerald-900/30">
                                        <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span></span>
                                        Auto-sync enabled
                                    </span>
                                ) : (
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Auto-sync disabled</span>
                                )}
                                <button 
                                    onClick={handleSaveOrgSettings}
                                    disabled={isSaving}
                                    className="text-indigo-600 dark:text-indigo-400 text-xs font-bold hover:underline disabled:opacity-50"
                                >
                                    {isSaving ? 'Saving…' : 'Save Schedule'}
                                </button>
                            </div>
                        </div>

                        <div className="bg-slate-50 dark:bg-slate-800/50 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800">
                            <h4 className="font-bold text-slate-900 dark:text-white mb-4 text-sm">Last Full Sync</h4>
                            {formData.lastSyncTimestamp ? (
                                <div>
                                    <p className="text-2xl font-mono font-bold text-slate-700 dark:text-slate-300">
                                        {new Date(formData.lastSyncTimestamp).toLocaleDateString()}
                                    </p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                        {new Date(formData.lastSyncTimestamp).toLocaleTimeString()}
                                    </p>
                                </div>
                            ) : (
                                <p className="text-sm text-slate-400 italic">Never synced</p>
                            )}
                        </div>
                    </div>


                    {/* Right column */}
                    <div className="space-y-8">
                        {/* Per-area Force Sync */}
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800">
                            <div className="flex justify-between items-center mb-6">
                                <h4 className="font-bold text-slate-900 dark:text-white text-sm">Force Sync by Area</h4>
                                <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Runs Immediately</span>
                            </div>
                            <SyncAreaButtons churchId={churchId} onSyncComplete={async () => { if (onSync) onSync(); }} />
                        </div>

                        {/* Regular Attenders List */}
                        <div className="bg-indigo-50 dark:bg-indigo-900/10 p-8 rounded-[2rem] border border-indigo-100 dark:border-indigo-900/30">
                            <div className="flex justify-between items-start mb-2">
                                <h4 className="font-bold text-indigo-900 dark:text-indigo-200 text-sm">Regular Attenders List</h4>
                                {selectedListId && (
                                    <span className="text-[9px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full uppercase tracking-widest">
                                        Active
                                    </span>
                                )}
                            </div>
                            <p className="text-[10px] text-indigo-700 dark:text-indigo-400 mb-6 leading-relaxed">
                                Select the Planning Center People List that represents your <strong>regular attenders</strong>.
                                This list is used across the app to identify who is considered an active, regular participant of your church.
                            </p>

                            {!church.pcoConnected ? (
                                <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl">
                                    <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400">
                                        ⚠ Connect Planning Center first to load available lists.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1">
                                            <label className="block text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-widest mb-2">
                                                PCO People List
                                            </label>
                                            {isPcoListsLoading ? (
                                                <div className="w-full bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-xl px-4 py-3 flex items-center gap-2 text-xs text-slate-400">
                                                    <span className="animate-spin inline-block w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full"></span>
                                                    Loading lists from Planning Center...
                                                </div>
                                            ) : pcoListsError ? (
                                                <div className="space-y-2">
                                                    <div className="w-full bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800 rounded-xl px-4 py-3 text-xs text-rose-600 dark:text-rose-400">
                                                        ⚠ {pcoListsError}
                                                    </div>
                                                    <button
                                                        onClick={loadPcoLists}
                                                        className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                                                    >
                                                        ↻ Retry
                                                    </button>
                                                </div>
                                            ) : (
                                                <select
                                                    id="regular-attenders-list-select"
                                                    title="Select a Planning Center list"
                                                    value={selectedListId}
                                                    onChange={e => {
                                                        const chosen = pcoLists.find(l => l.id === e.target.value);
                                                        setSelectedListId(e.target.value);
                                                        setSelectedListName(chosen?.attributes?.name || '');
                                                    }}
                                                    className="w-full bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer"
                                                >
                                                    <option value="">— Select a list —</option>
                                                    {pcoLists.map(list => (
                                                        <option key={list.id} value={list.id}>
                                                            {list.attributes?.name}
                                                            {list.attributes?.total_people != null
                                                                ? ` (${list.attributes.total_people.toLocaleString()} people)`
                                                                : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>
                                        {!isPcoListsLoading && !pcoListsError && (
                                            <button
                                                onClick={loadPcoLists}
                                                title="Refresh lists"
                                                className="mt-6 p-3 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors text-sm"
                                            >
                                                ↻
                                            </button>
                                        )}
                                    </div>

                                    {selectedListName && (
                                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                                            ✓ Selected: <span className="font-mono">{selectedListName}</span>
                                        </p>
                                    )}

                                    {listSaveMessage && (
                                        <p className={`text-[10px] font-bold animate-in fade-in ${
                                            listSaveMessage.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                                        }`}>
                                            {listSaveMessage.text}
                                        </p>
                                    )}

                                    <button
                                        onClick={handleSaveRegularAttendersList}
                                        disabled={isSavingList}
                                        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
                                    >
                                        {isSavingList ? 'Saving...' : 'Save Regular Attenders List'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'Widget Directory' && (
            <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-sm animate-in fade-in">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white">Widget Directory</h3>
                        <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mt-1">
                            Enable or Disable widgets available to your team
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={handleEnableAllWidgets}
                            className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 px-3 py-2 rounded-lg transition-colors"
                        >
                            Enable All
                        </button>
                        <button 
                            onClick={handleDisableAllWidgets}
                            className="text-[10px] font-black uppercase tracking-widest text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 px-3 py-2 rounded-lg transition-colors"
                        >
                            Disable All
                        </button>
                        <button 
                            onClick={handleSaveOrgSettings}
                            disabled={isSaving}
                            className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg ml-2"
                        >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </div>

                <div className="space-y-8">
                    {Object.entries(ALL_WIDGETS).map(([category, widgets]) => {
                        return (
                            <div key={category} className="space-y-4">
                                <div className="flex items-center gap-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                                    <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
                                        {category.replace('_', ' ').replace('pastoral', 'Pastoral')}
                                    </h4>
                                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                                        {widgets.length} Widgets
                                    </span>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {widgets.map(w => {
                                        const fullId = `${category}:${w.id}`;
                                        const isBenchmark = w.id.startsWith('benchmark_');
                                        const sharingEnabled = formData.metricsSharingEnabled;
                                        
                                        const isForceDisabled = isBenchmark && !sharingEnabled;
                                        
                                        const isEnabled = !isForceDisabled && (!formData.enabledWidgets || formData.enabledWidgets.includes(fullId));

                                        return (
                                            <div 
                                                key={fullId}
                                                onClick={() => {
                                                    if (isForceDisabled) return;
                                                    handleToggleWidget(fullId);
                                                }}
                                                className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all duration-200 group ${
                                                    isForceDisabled
                                                    ? 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-50 cursor-not-allowed grayscale'
                                                    : isEnabled 
                                                        ? 'bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-900/30' 
                                                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 opacity-60 grayscale'
                                                }`}
                                                title={isForceDisabled ? "Requires 'Share Aggregated Metrics' enabled in Organization profile" : ""}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm transition-colors ${
                                                        isEnabled && !isForceDisabled ? 'bg-white dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                                                    }`}>
                                                        {w.icon}
                                                    </div>
                                                    <div>
                                                        <p className={`text-xs font-bold ${isEnabled && !isForceDisabled ? 'text-indigo-900 dark:text-indigo-200' : 'text-slate-500 dark:text-slate-400'}`}>
                                                            {w.label}
                                                        </p>
                                                        <p className="text-[9px] text-slate-400 font-mono mt-0.5">{w.id}</p>
                                                    </div>
                                                </div>
                                                
                                                {isForceDisabled ? (
                                                    <div className="text-[8px] font-bold text-slate-400 border border-slate-300 dark:border-slate-700 px-1.5 py-0.5 rounded">
                                                        LOCKED
                                                    </div>
                                                ) : (
                                                    <div className={`w-10 h-6 rounded-full p-1 transition-colors duration-300 ${isEnabled ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                                                        <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 ${isEnabled ? 'translate-x-4' : ''}`}></div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        )}

        {activeTab === 'Mail Settings' && (() => {
            const SHARED_DOMAIN = 'pastoralcare.barnabassoftware.com';
            const sysApiUrl = (church as any)._apiBaseUrl || 'https://pastoralcare.barnabassoftware.com';

            const getApiBase = async () => {
                const s = await firestore.getSystemSettings();
                return s.apiBaseUrl || 'https://pastoralcare.barnabassoftware.com';
            };

            const emailStatusBadge = () => {
                const es = church.emailSettings;
                if (!es) return <span className="text-[9px] font-black bg-slate-100 dark:bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">Not Configured</span>;
                if (es.mode === 'custom' && es.domainVerified) return <span className="text-[9px] font-black bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">✓ Custom Domain Verified</span>;
                if (es.mode === 'custom') return <span className="text-[9px] font-black bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">Custom Domain — DNS Pending</span>;
                if (es.mode === 'shared' && es.sharedPrefix) return <span className="text-[9px] font-black bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">✓ Shared Domain Active</span>;
                return <span className="text-[9px] font-black bg-slate-100 dark:bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">Not Configured</span>;
            };

            const handleProvisionShared = async () => {
                if (!mailPrefix.trim()) { setMailMessage({ type: 'error', text: 'Please enter an email prefix.' }); return; }
                if (!mailFromName.trim()) { setMailMessage({ type: 'error', text: 'Please enter a display name.' }); return; }
                setIsMailSaving(true);
                setMailMessage(null);
                try {
                    const apiBase = await getApiBase();
                    const res = await fetch(`${apiBase}/email/provision-subuser`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ churchId, prefix: mailPrefix.trim(), fromName: mailFromName.trim() }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Provisioning failed');
                    setMailMessage({ type: 'success', text: `✓ ${data.message}` });
                    if (onUpdateChurch) {
                        const fresh = await firestore.getChurch(churchId);
                        if (fresh) onUpdateChurch(fresh);
                    }
                } catch (e: any) {
                    setMailMessage({ type: 'error', text: e.message });
                } finally {
                    setIsMailSaving(false);
                }
            };

            const handleAuthenticateDomain = async () => {
                if (!mailCustomDomain.trim()) { setMailMessage({ type: 'error', text: 'Please enter your domain.' }); return; }
                setIsMailSaving(true);
                setMailMessage(null);
                try {
                    const apiBase = await getApiBase();
                    const res = await fetch(`${apiBase}/email/authenticate-domain`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            churchId,
                            domain: mailCustomDomain.trim().toLowerCase(),
                            fromEmail: mailCustomFromEmail.trim() || undefined,
                            fromName: mailFromName.trim() || undefined,
                        }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Domain auth failed');
                    setMailCnameRecords(data.cnameRecords || []);
                    if (data.domainAuthId) setMailDomainAuthId(String(data.domainAuthId));
                    setMailMessage({ type: 'success', text: data.message });
                    if (onUpdateChurch) {
                        const fresh = await firestore.getChurch(churchId);
                        if (fresh) onUpdateChurch(fresh);
                    }
                } catch (e: any) {
                    setMailMessage({ type: 'error', text: e.message });
                } finally {
                    setIsMailSaving(false);
                }
            };

            const handleVerifyDomain = async () => {
                setIsMailSaving(true);
                setMailMessage(null);
                try {
                    const apiBase = await getApiBase();
                    const res = await fetch(`${apiBase}/email/verify-domain`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ churchId }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Verification failed');
                    setMailDomainVerified(data.verified);
                    // Also refresh CNAME records if backend returned them
                    if (data.cnameRecords && data.cnameRecords.length > 0) {
                        setMailCnameRecords(data.cnameRecords);
                    }
                    setMailMessage({ type: data.verified ? 'success' : 'error', text: data.message });
                    if (onUpdateChurch) {
                        const fresh = await firestore.getChurch(churchId);
                        if (fresh) onUpdateChurch(fresh);
                    }
                } catch (e: any) {
                    setMailMessage({ type: 'error', text: e.message });
                } finally {
                    setIsMailSaving(false);
                }
            };

            const handleDiagnose = async () => {
                if (!mailDiagEmail.trim() || !mailDiagEmail.includes('@')) {
                    setMailMessage({ type: 'error', text: 'Enter a valid email address to send the test to.' });
                    return;
                }
                setIsMailSaving(true);
                setMailDiagChecks(null);
                setMailMessage(null);
                try {
                    const apiBase = await getApiBase();
                    const res = await fetch(`${apiBase}/email/diagnose-domain`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ churchId, testEmailAddress: mailDiagEmail.trim() }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Diagnosis failed');
                    setMailDiagChecks(data.checks || []);
                    const allPass = (data.checks || []).every((c: any) => c.status !== 'fail');
                    setMailMessage({
                        type: allPass ? 'success' : 'error',
                        text: allPass
                            ? '✓ All checks passed! Test email sent. Check your inbox.'
                            : '⚠ Some checks failed. See results below for details.',
                    });
                    if (onUpdateChurch) {
                        const fresh = await firestore.getChurch(churchId);
                        if (fresh) onUpdateChurch(fresh);
                    }
                } catch (e: any) {
                    setMailMessage({ type: 'error', text: e.message });
                } finally {
                    setIsMailSaving(false);
                }
            };

            const copyToClipboard = (text: string) => navigator.clipboard.writeText(text);

            return (
                <div className="space-y-8 animate-in fade-in">

                    {/* Header */}
                    <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-sm">
                        <div className="flex flex-col lg:flex-row justify-between items-start gap-6 mb-8">
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <h3 className="text-2xl font-black text-slate-900 dark:text-white">Mail Settings</h3>
                                    {emailStatusBadge()}
                                </div>
                                <p className="text-xs text-slate-400 font-medium leading-relaxed max-w-lg">
                                    Configure how your church appears in outgoing emails. Choose between a shared address on our domain, or verify your own domain for full brand control.
                                </p>
                            </div>
                        </div>

                        {mailMessage && (
                            <div className={`mb-6 p-4 rounded-xl text-xs font-bold flex items-start gap-2 ${mailMessage.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-800'}`}>
                                <span className="shrink-0 mt-0.5">{mailMessage.type === 'success' ? '✓' : '⚠'}</span>
                                <span>{mailMessage.text}</span>
                            </div>
                        )}

                        {/* Mode Selector */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                            <button
                                onClick={() => setMailMode('shared')}
                                className={`p-6 rounded-2xl border-2 text-left transition-all ${
                                    mailMode === 'shared'
                                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/10'
                                        : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700'
                                }`}
                            >
                                <div className="flex items-center gap-3 mb-2">
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                                        mailMode === 'shared' ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300 dark:border-slate-600'
                                    }`}>
                                        {mailMode === 'shared' && <div className="w-2 h-2 bg-white rounded-full" />}
                                    </div>
                                    <span className="font-black text-sm text-slate-900 dark:text-white">Shared Subdomain</span>
                                    <span className="text-[9px] font-black bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">Fastest Setup</span>
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 ml-8 leading-relaxed">
                                    Send as <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">you@{SHARED_DOMAIN}</code>. No DNS changes required — ready in seconds.
                                </p>
                            </button>

                            <button
                                onClick={() => setMailMode('custom')}
                                className={`p-6 rounded-2xl border-2 text-left transition-all ${
                                    mailMode === 'custom'
                                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/10'
                                        : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700'
                                }`}
                            >
                                <div className="flex items-center gap-3 mb-2">
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                                        mailMode === 'custom' ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300 dark:border-slate-600'
                                    }`}>
                                        {mailMode === 'custom' && <div className="w-2 h-2 bg-white rounded-full" />}
                                    </div>
                                    <span className="font-black text-sm text-slate-900 dark:text-white">Custom Domain</span>
                                    <span className="text-[9px] font-black bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded-full">Full Brand Control</span>
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 ml-8 leading-relaxed">
                                    Send from your own domain (e.g. <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">contact@mychurch.org</code>). Requires adding 3 CNAME records to your DNS.
                                </p>
                            </button>
                        </div>

                        {/* ── Shared Mode Form ── */}
                        {mailMode === 'shared' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Email Prefix</label>
                                        <div className="flex items-center gap-0">
                                            <input
                                                type="text"
                                                value={mailPrefix}
                                                onChange={e => setMailPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                                                placeholder="grace"
                                                className="flex-1 bg-white dark:bg-slate-800 border border-r-0 border-slate-200 dark:border-slate-700 rounded-l-xl px-4 py-3 font-mono text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                            />
                                            <div className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-r-xl px-4 py-3 text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                                @{SHARED_DOMAIN}
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-slate-400 mt-1.5">
                                            This becomes your From address: <strong>{mailPrefix || 'you'}@{SHARED_DOMAIN}</strong>
                                        </p>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Display Name</label>
                                        <input
                                            type="text"
                                            value={mailFromName}
                                            onChange={e => setMailFromName(e.target.value)}
                                            placeholder="Grace Community Church"
                                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                        />
                                        <p className="text-[10px] text-slate-400 mt-1.5">Recipients see this as the sender name in their inbox.</p>
                                    </div>
                                </div>

                                <div className="bg-indigo-50 dark:bg-indigo-900/10 rounded-2xl p-5 border border-indigo-100 dark:border-indigo-900/30">
                                    <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 mb-1">Preview</p>
                                    <p className="text-sm text-slate-700 dark:text-slate-300">
                                        <span className="font-bold">{mailFromName || 'Your Church'}</span>{' '}
                                        <span className="text-slate-400">&lt;{mailPrefix || 'you'}@{SHARED_DOMAIN}&gt;</span>
                                    </p>
                                </div>

                                <div className="flex justify-end">
                                    <button
                                        onClick={handleProvisionShared}
                                        disabled={isMailSaving}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg disabled:opacity-50"
                                    >
                                        {isMailSaving ? 'Configuring…' : church.emailSettings?.sendGridSubuserId ? 'Update Email Settings' : 'Activate Shared Email'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ── Custom Domain Form ── */}
                        {mailMode === 'custom' && (
                            <div className="space-y-8">

                                    {/* Step 1: Display Name + Domain */}
                                <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                                    <div className="flex items-center gap-2 mb-4">
                                        <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">1</span>
                                        <h4 className="font-bold text-slate-900 dark:text-white text-sm">Enter Your Domain</h4>
                                        {church.emailSettings?.customDomain && (
                                            <span className="ml-auto text-[10px] font-bold text-slate-500 dark:text-slate-400 font-mono bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-lg">
                                                Currently: {church.emailSettings.customDomain}
                                                {church.emailSettings.domainAuthId ? ` · Auth #${church.emailSettings.domainAuthId}` : ''}
                                            </span>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Domain</label>
                                            <input
                                                type="text"
                                                value={mailCustomDomain}
                                                onChange={e => setMailCustomDomain(e.target.value)}
                                                placeholder="mychurch.org"
                                                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 font-mono text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">From Email</label>
                                            <input
                                                type="email"
                                                value={mailCustomFromEmail}
                                                onChange={e => setMailCustomFromEmail(e.target.value)}
                                                placeholder={`contact@${mailCustomDomain || 'mychurch.org'}`}
                                                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 font-mono text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Display Name</label>
                                            <input
                                                type="text"
                                                value={mailFromName}
                                                onChange={e => setMailFromName(e.target.value)}
                                                placeholder="Grace Community Church"
                                                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex justify-end mt-4">
                                        <button
                                            onClick={handleAuthenticateDomain}
                                            disabled={isMailSaving || !mailCustomDomain.trim()}
                                            className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg disabled:opacity-40"
                                        >
                                            {isMailSaving ? 'Requesting…' : (mailCnameRecords.length > 0 || mailDomainAuthId) ? 'Re-fetch DNS Records' : 'Get DNS Records'}
                                        </button>
                                    </div>
                                </div>

                                {/* Step 2: CNAME Records */}
                                {(mailCnameRecords.length > 0 || mailDomainAuthId) && (
                                    <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center gap-2 mb-4">
                                            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">2</span>
                                            <h4 className="font-bold text-slate-900 dark:text-white text-sm">Add These DNS Records</h4>
                                        </div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                                            Add these 3 CNAME records in your DNS provider (GoDaddy, Namecheap, Cloudflare, etc.). DNS changes can take up to 48 hours to propagate.
                                        </p>

                                        {mailCnameRecords.length > 0 ? (
                                            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                                                <table className="w-full text-xs">
                                                    <thead className="bg-slate-100 dark:bg-slate-800">
                                                        <tr>
                                                            <th className="px-4 py-2.5 text-left font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-[10px]">Type</th>
                                                            <th className="px-4 py-2.5 text-left font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-[10px]">Host / Name</th>
                                                            <th className="px-4 py-2.5 text-left font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-[10px]">Points To / Value</th>
                                                            <th className="px-4 py-2.5"></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                                                        {mailCnameRecords.map((r, i) => (
                                                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                                <td className="px-4 py-3">
                                                                    <span className="font-black text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 px-2 py-0.5 rounded text-[10px]">{r.type}</span>
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    <code className="font-mono text-slate-700 dark:text-slate-300 text-[11px] break-all">{r.host}</code>
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    <code className="font-mono text-slate-700 dark:text-slate-300 text-[11px] break-all">{r.data}</code>
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    <button
                                                                        onClick={() => copyToClipboard(`${r.host}\t${r.type}\t${r.data}`)}
                                                                        className="text-slate-400 hover:text-indigo-500 transition-colors text-sm"
                                                                        title="Copy row"
                                                                    >
                                                                        📋
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-600 dark:text-amber-400">
                                                <p className="font-bold mb-1">⚠ DNS records not cached locally</p>
                                                <p>Your domain <strong>{church.emailSettings?.customDomain}</strong> is registered in SendGrid (Auth ID: {mailDomainAuthId}), but the CNAME records are not cached here. Click <strong>"Re-fetch DNS Records"</strong> in Step 1 to reload them.</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Step 3: Verify */}
                                {(mailCnameRecords.length > 0 || mailDomainAuthId) && (
                                    <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">3</span>
                                                <div>
                                                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">Verify DNS Propagation</h4>
                                                    <p className="text-[10px] text-slate-400 mt-0.5">After adding the records, click to check if they've propagated.</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {mailDomainVerified ? (
                                                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-1.5 rounded-full">
                                                        ✓ Domain Verified
                                                    </span>
                                                ) : (
                                                    <span className="text-xs font-black text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-1.5 rounded-full">
                                                        ⏳ DNS Pending
                                                    </span>
                                                )}
                                                <button
                                                    onClick={handleVerifyDomain}
                                                    disabled={isMailSaving}
                                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg disabled:opacity-50"
                                                >
                                                    {isMailSaving ? 'Checking…' : 'Verify DNS'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Step 4: Diagnose & Test */}
                                {(mailCnameRecords.length > 0 || mailDomainAuthId) && (
                                    <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center gap-2 mb-4">
                                            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">4</span>
                                            <div>
                                                <h4 className="font-bold text-slate-900 dark:text-white text-sm">Diagnose SendGrid Setup & Send Test</h4>
                                                <p className="text-[10px] text-slate-400 mt-0.5">Checks your full SendGrid configuration and sends a real test email to confirm delivery.</p>
                                            </div>
                                        </div>

                                        <div className="flex gap-3 items-end mb-4">
                                            <div className="flex-1">
                                                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5">Send Test To</label>
                                                <input
                                                    type="email"
                                                    value={mailDiagEmail}
                                                    onChange={e => setMailDiagEmail(e.target.value)}
                                                    placeholder="yourname@example.com"
                                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 font-mono text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                                />
                                            </div>
                                            <button
                                                onClick={handleDiagnose}
                                                disabled={isMailSaving || !mailDiagEmail.trim()}
                                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg disabled:opacity-40 whitespace-nowrap"
                                            >
                                                {isMailSaving ? 'Running…' : '🔍 Run Diagnostics'}
                                            </button>
                                        </div>

                                        {mailDiagChecks && mailDiagChecks.length > 0 && (
                                            <div className="space-y-2">
                                                {mailDiagChecks.map((check, i) => (
                                                    <div
                                                        key={i}
                                                        className={`flex items-start gap-3 p-3 rounded-xl border text-xs ${
                                                            check.status === 'pass'
                                                                ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800'
                                                                : check.status === 'warn'
                                                                    ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800'
                                                                    : 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800'
                                                        }`}
                                                    >
                                                        <span className={`shrink-0 text-base mt-0.5 ${
                                                            check.status === 'pass' ? 'text-emerald-500' : check.status === 'warn' ? 'text-amber-500' : 'text-rose-500'
                                                        }`}>
                                                            {check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗'}
                                                        </span>
                                                        <div className="min-w-0">
                                                            <p className={`font-bold ${
                                                                check.status === 'pass' ? 'text-emerald-700 dark:text-emerald-300' : check.status === 'warn' ? 'text-amber-700 dark:text-amber-300' : 'text-rose-700 dark:text-rose-300'
                                                            }`}>{check.label}</p>
                                                            <p className="text-slate-500 dark:text-slate-400 mt-0.5 whitespace-pre-line break-all">{check.detail}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Info card */}
                    <div className="bg-indigo-900/10 dark:bg-indigo-900/20 p-6 rounded-2xl border border-indigo-500/20">
                        <h4 className="font-bold text-indigo-400 mb-2 text-sm">📬 How Email Delivery Works</h4>
                        <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside leading-relaxed">
                            <li>Each church gets an isolated SendGrid account (Subuser), so your reputation is separate from other tenants.</li>
                            <li>The <strong>Shared Subdomain</strong> option lets you start sending immediately — no DNS changes required.</li>
                            <li>The <strong>Custom Domain</strong> option improves deliverability by authenticating your brand with DKIM/SPF through SendGrid's domain authentication.</li>
                            <li>Individual email campaigns can still override the From name and address on a per-campaign basis.</li>
                        </ul>
                    </div>
                </div>
            );
        })()}

        {activeTab === 'SMS' && (() => {
            const A2P_STATUS_COLORS: Record<string, string> = {
                approved: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30',
                pending:  'bg-amber-500/10  text-amber-600  dark:text-amber-400  border border-amber-500/30',
                failed:   'bg-rose-500/20   text-rose-600   dark:text-rose-400   border border-rose-500/30',
                not_started: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
            };
            const PROFILE_STATUS_COLORS: Record<string, string> = {
                'twilio-approved':  'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30',
                'pending-review':   'bg-amber-500/10  text-amber-600  dark:text-amber-400  border border-amber-500/30',
                'in-review':        'bg-blue-500/10   text-blue-600   dark:text-blue-400   border border-blue-500/30',
                'twilio-rejected':  'bg-rose-500/20   text-rose-600   dark:text-rose-400   border border-rose-500/30',
                'draft':            'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
            };
            const PROFILE_STATUS_LABEL: Record<string, string> = {
                'twilio-approved': '✓ Profile Approved',
                'pending-review':  '⏳ Profile Pending',
                'in-review':       '🔍 In Review',
                'twilio-rejected': '✗ Profile Rejected',
                'draft':           'Profile Draft',
            };
            const statusLabel: Record<string, string> = {
                approved: '✓ Approved',
                pending: '⏳ Pending Review',
                failed: '✗ Failed',
                not_started: 'Not Started',
            };
            const a2pStatus      = smsForm.twilioA2pStatus           || 'not_started';
            const profileStatus  = smsForm.twilioCustomerProfileStatus || '';
            const profileSid     = smsForm.twilioCustomerProfileSid   || '';
            const evalStatus     = smsForm.twilioCustomerProfileEvaluation || '';

            const handleSmsChange = (key: keyof NonNullable<Church['smsSettings']>, value: any) => {
                setSmsForm(prev => ({ ...prev, [key]: value }));
            };

            const handleSmsSave = async () => {
                if (!onUpdateChurch) return;
                setIsSmsSaving(true);
                setSmsMessage(null);
                try {
                    await onUpdateChurch({ smsSettings: smsForm });
                    setSmsMessage({ type: 'success', text: 'SMS settings saved successfully.' });
                    setTimeout(() => setSmsMessage(null), 4000);
                } catch (e: any) {
                    setSmsMessage({ type: 'error', text: 'Failed to save: ' + e.message });
                } finally {
                    setIsSmsSaving(false);
                }
            };

            // ── Submit A2P registration to Twilio (saves first, then submits) ──
            const handleSubmitToTwilio = async () => {
                if (!onUpdateChurch) return;
                setIsA2pSubmitting(true);
                setA2pResult(null);
                try {
                    // Save form data to Firestore first so the backend reads fresh fields
                    await onUpdateChurch({ smsSettings: smsForm });
                    // Then call the A2P register endpoint
                    const res = await fetch('/api/messaging/a2p-register', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ churchId }),
                    });
                    const raw = await res.text();
                    let data: any;
                    try { data = JSON.parse(raw); } catch {
                        setA2pResult({ success: false, message: `Server error (HTTP ${res.status}): ${raw.slice(0, 200)}` });
                        return;
                    }
                    if (data.brandSid) {
                        setSmsForm(prev => ({ ...prev, twilioBrandSid: data.brandSid, twilioA2pStatus: 'pending' }));
                    }
                    // Detect the "needs Customer Profile Bundle" path
                    const needsBundle = !data.success && data.status === 'pending' && !data.brandSid;
                    setA2pResult({
                        success: data.success,
                        message: data.message || (data.error || 'Unknown response'),
                        brandSid: data.brandSid,
                        twilioStatus: data.status,
                        needsBundle,
                    });
                } catch (e: any) {
                    setA2pResult({ success: false, message: e.message || 'Submission failed' });
                } finally {
                    setIsA2pSubmitting(false);
                }
            };

            // ── Check live A2P status from Twilio ──────────────────────────────
            const handleCheckA2pStatus = async () => {
                setIsA2pChecking(true);
                setA2pResult(null);
                try {
                    const res = await fetch(`/api/messaging/a2p-status?churchId=${encodeURIComponent(churchId)}`);
                    const data = await res.json();
                    if (data.status) {
                        setSmsForm(prev => ({ ...prev, twilioA2pStatus: data.status as any }));
                    }
                    setA2pResult({
                        success: data.success ?? true,
                        message: data.failureReason
                            ? `Twilio status: ${data.twilioStatus}. Reason: ${data.failureReason}`
                            : `Twilio status: ${data.twilioStatus || data.status}. Checked at ${new Date(data.checkedAt || Date.now()).toLocaleTimeString()}.`,
                        brandSid: data.brandSid,
                        twilioStatus: data.twilioStatus || data.status,
                        failureReason: data.failureReason,
                    });
                } catch (e: any) {
                    setA2pResult({ success: false, message: e.message || 'Status check failed' });
                } finally {
                    setIsA2pChecking(false);
                }
            };

            // ── Programmatically create Twilio Customer Profile Bundle ──────────
            const handleCreateProfile = async () => {
                if (!onUpdateChurch) return;
                setIsCreatingProfile(true);
                setA2pResult(null);
                try {
                    // Save the form first so the backend reads fresh values
                    await onUpdateChurch({ smsSettings: smsForm });
                    const res = await fetch('/api/messaging/create-customer-profile', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ churchId }),
                    });
                    const cpRaw = await res.text();
                    let data: any;
                    try { data = JSON.parse(cpRaw); } catch {
                        setA2pResult({ success: false, message: `Server error (HTTP ${res.status}): ${cpRaw.slice(0, 200)}`, needsBundle: true });
                        return;
                    }
                    if (data.profileSid) {
                        setSmsForm(prev => ({
                            ...prev,
                            twilioCustomerProfileSid:        data.profileSid,
                            twilioCustomerProfileStatus:     'pending-review',
                            twilioCustomerProfileEvaluation: data.evaluationStatus || '',
                        }));
                    }
                    setA2pResult({
                        success: !!data.success,
                        message: data.success
                            ? data.message
                            : (data.error || 'Profile creation failed'),
                        needsBundle: !data.success,
                        needsPrimaryProfile: !!data.needsPrimaryProfile,
                        evaluationStatus: data.evaluationStatus || '',
                    });
                } catch (e: any) {
                    setA2pResult({ success: false, message: e.message || 'Profile creation failed', needsBundle: true });
                } finally {
                    setIsCreatingProfile(false);
                }
            };

            // ── Programmatically DELETE Twilio Customer Profile Bundle ─────────
            const handleDeleteProfile = async () => {
                const canDelete = profileStatus === 'draft' || profileStatus === 'twilio-rejected' || !profileStatus;
                if (!canDelete) {
                    alert(`This profile is in "${profileStatus}" status and cannot be deleted via the API.\n\nOnly draft or rejected profiles can be deleted programmatically. To remove an approved or pending profile, please contact Twilio Support.`);
                    return;
                }
                if (!window.confirm('Delete this Customer Profile Bundle from Twilio? This will also delete the associated EndUsers, Address, and SupportingDocument. This cannot be undone.')) return;
                setIsDeletingProfile(true);
                setA2pResult(null);
                try {
                    const res = await fetch('/api/messaging/customer-profile', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ churchId }),
                    });
                    const raw = await res.text();
                    let data: any;
                    try { data = JSON.parse(raw); } catch {
                        setA2pResult({ success: false, message: `Server error (HTTP ${res.status}): ${raw.slice(0, 200)}` });
                        return;
                    }
                    if (data.success) {
                        setSmsForm(prev => ({
                            ...prev,
                            twilioCustomerProfileSid:        undefined,
                            twilioCustomerProfileStatus:     undefined,
                            twilioCustomerProfileEvaluation: undefined,
                            twilioEndUserSid:                undefined,
                            twilioRepEndUserSid:             undefined,
                            twilioRep2EndUserSid:            undefined,
                            twilioAddressSid:                undefined,
                            twilioSupportingDocSid:          undefined,
                        } as any));
                        setA2pResult({ success: true, message: data.message || 'Customer Profile deleted successfully.' });
                    } else {
                        setA2pResult({ success: false, message: data.error || 'Delete failed' });
                    }
                } catch (e: any) {
                    setA2pResult({ success: false, message: e.message || 'Delete failed' });
                } finally {
                    setIsDeletingProfile(false);
                }
            };

            const handleRefreshProfileStatus = async () => {
                if (!smsForm.twilioCustomerProfileSid) return;
                setIsRefreshingProfile(true);
                setA2pResult(null);
                try {
                    const res = await fetch(`/api/messaging/customer-profile-status?churchId=${encodeURIComponent(churchId)}`);
                    const data = await res.json();
                    if (data.success) {
                        const liveStatus = data.status || 'unknown';
                        setSmsForm(prev => ({ ...prev, twilioCustomerProfileStatus: liveStatus }));
                        setA2pResult({ success: true, message: `Profile status refreshed from Twilio: ${liveStatus.toUpperCase()}` });
                    } else {
                        setA2pResult({ success: false, message: data.error || 'Refresh failed' });
                    }
                } catch (e: any) {
                    setA2pResult({ success: false, message: e.message || 'Refresh failed' });
                } finally {
                    setIsRefreshingProfile(false);
                }
            };

            // ── Step 4: Submit Brand Registration ────────────────────────────────
            const handleRegisterBrand = async () => {
                setIsRegisteringBrand(true);
                setA2pResult(null);
                try {
                    const res  = await fetch('/api/messaging/register-brand', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ churchId }),
                    });
                    const data = await res.json();
                    if (!res.ok) { setA2pResult({ success: false, message: data.error || 'Brand registration failed' }); return; }
                    if (data.brandSid) setSmsForm(prev => ({ ...prev, twilioBrandSid: data.brandSid, twilioA2pStatus: data.status }));
                    setA2pResult({ success: true, message: data.message || 'Brand submitted!' });
                } catch (e: any) {
                    setA2pResult({ success: false, message: e.message || 'Brand registration failed' });
                } finally { setIsRegisteringBrand(false); }
            };

            // ── Step 5: Create Messaging Service ─────────────────────────────────
            const handleCreateMessagingService = async () => {
                setIsCreatingMsgSvc(true);
                setA2pResult(null);
                try {
                    const res  = await fetch('/api/messaging/create-messaging-service', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ churchId }),
                    });
                    const data = await res.json();
                    if (!res.ok) { setA2pResult({ success: false, message: data.error || 'Failed to create Messaging Service' }); return; }
                    if (data.messagingServiceSid) setSmsForm(prev => ({ ...prev, twilioMessagingServiceSid: data.messagingServiceSid }));
                    setA2pResult({ success: true, message: data.message || 'Messaging Service created!' });
                } catch (e: any) {
                    setA2pResult({ success: false, message: e.message || 'Failed to create Messaging Service' });
                } finally { setIsCreatingMsgSvc(false); }
            };

            // ── Step 6: Register A2P Campaign ────────────────────────────────────
            const handleRegisterCampaign = async () => {
                setIsRegisteringCampaign(true);
                setA2pResult(null);
                try {
                    const res  = await fetch('/api/messaging/register-campaign', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ churchId }),
                    });
                    const data = await res.json();
                    if (!res.ok) { setA2pResult({ success: false, message: data.error || 'Campaign registration failed' }); return; }
                    if (data.usAppToPersonSid) setSmsForm(prev => ({ ...prev, twilioUsAppToPersonSid: data.usAppToPersonSid, twilioA2pCampaignStatus: 'pending' } as any));
                    setA2pResult({ success: true, message: data.message || 'Campaign registered!' });
                } catch (e: any) {
                    setA2pResult({ success: false, message: e.message || 'Campaign registration failed' });
                } finally { setIsRegisteringCampaign(false); }
            };

            // ── Step 7: Assign Numbers to Messaging Service ───────────────────────
            const handleAssignNumbers = async () => {
                setIsAssigningNumbers(true);
                setA2pResult(null);
                try {
                    const res  = await fetch('/api/messaging/assign-numbers-to-service', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ churchId }),
                    });
                    const data = await res.json();
                    if (!res.ok) { setA2pResult({ success: false, message: data.error || 'Failed to link numbers' }); return; }
                    if (data.success) setSmsForm(prev => ({ ...prev, twilioNumbersLinked: true } as any));
                    setA2pResult({ success: data.success, message: data.message || 'Numbers linked!' });
                } catch (e: any) {
                    setA2pResult({ success: false, message: e.message || 'Failed to link numbers' });
                } finally { setIsAssigningNumbers(false); }
            };

            // ── Poll live campaign status ─────────────────────────────────────────
            const handleCheckCampaignStatus = async () => {
                setIsCheckingCampaign(true);
                setA2pResult(null);
                try {
                    const res  = await fetch(`/api/messaging/campaign-status?churchId=${encodeURIComponent(churchId)}`);
                    const data = await res.json();
                    if (data.status) setSmsForm(prev => ({ ...prev, twilioA2pCampaignStatus: data.status } as any));
                    setA2pResult({ success: true, message: `Campaign status: ${data.twilioStatus || data.status || 'unknown'}` });
                } catch (e: any) {
                    setA2pResult({ success: false, message: e.message || 'Status check failed' });
                } finally { setIsCheckingCampaign(false); }
            };

            const inputCn = 'w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors';
            const labelCn = 'block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-2';

            // Expose handlers to the top-level terms modal via ref
            smsActionRef.current = { handleCreateProfile, handleSubmitToTwilio };


            return (
                <div className="space-y-6">
                    {/* Header */}
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                            <div>
                                <h3 className="text-xl font-black text-slate-900 dark:text-white">SMS Settings</h3>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-1">
                                    A2P 10DLC Registration &amp; Messaging Compliance
                                </p>
                            </div>
                            <div className="flex items-center gap-3 flex-wrap">
                                <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full ${A2P_STATUS_COLORS[a2pStatus]}`}>
                                    A2P: {statusLabel[a2pStatus]}
                                </span>
                                {/* Terms badge */}
                                {smsForm.termsAcceptedAt ? (
                                    <span className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25" title={`Terms accepted on ${new Date(smsForm.termsAcceptedAt).toLocaleString()}`}>
                                        ✓ ToS Accepted
                                    </span>
                                ) : (
                                    <button
                                        onClick={() => { setPendingTermsAction(null); setShowTermsModal(true); }}
                                        className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/25 hover:bg-amber-500/20 transition"
                                    >
                                        ⚠ ToS Not Accepted — Click to Review
                                    </button>
                                )}
                                {profileSid && (
                                    <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full ${
                                        PROFILE_STATUS_COLORS[profileStatus] || 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                    }`}>
                                        {PROFILE_STATUS_LABEL[profileStatus] || `Profile: ${profileStatus || 'unknown'}`}
                                    </span>
                                )}
                                {profileSid && evalStatus && (
                                    <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full ${
                                        evalStatus === 'compliant'
                                            ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                    }`}>
                                        Eval: {evalStatus}
                                    </span>
                                )}
                                {/* Refresh Profile Status — quick pull from Twilio */}
                                {profileSid && (
                                    <button
                                        onClick={handleRefreshProfileStatus}
                                        disabled={isRefreshingProfile}
                                        title="Pull latest Customer Profile & A2P status from Twilio"
                                        className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border transition-all disabled:opacity-50 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
                                    >
                                        {isRefreshingProfile ? '⏳ Refreshing…' : '🔄 Refresh Status'}
                                    </button>
                                )}
                                {/* Delete Profile button — only shown when profile exists */}
                                {profileSid && (() => {
                                    const canDelete = profileStatus === 'draft' || profileStatus === 'twilio-rejected' || !profileStatus;
                                    return (
                                        <button
                                            onClick={handleDeleteProfile}
                                            disabled={isDeletingProfile || !canDelete}
                                            title={canDelete ? 'Delete Customer Profile Bundle from Twilio' : `Profile in "${profileStatus}" status — contact Twilio Support to remove`}
                                            className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border transition-all disabled:cursor-not-allowed ${
                                                canDelete
                                                    ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/40'
                                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700'
                                            }`}
                                        >
                                            {isDeletingProfile ? '🗑 Deleting…' : canDelete ? '🗑 Delete Profile' : '🔒 Cannot Delete'}
                                        </button>
                                    );
                                })()}
                                {smsForm.twilioBrandSid && (
                                    <button
                                        onClick={handleCheckA2pStatus}
                                        disabled={isA2pChecking}
                                        className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-700 transition-all disabled:opacity-50"
                                    >
                                        {isA2pChecking ? '⏳ Checking…' : '🔄 Check Status'}
                                    </button>
                                )}
                                {smsForm.twilioPhoneNumber && smsForm.twilioSubAccountSid && twilioNumbers.length === 0 && (
                                    // Legacy field shown only if number AND sub-account are both provisioned
                                    <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-full border border-emerald-100 dark:border-emerald-900/30">
                                        📱 {smsForm.twilioPhoneNumber}
                                    </span>
                                )}
                                {twilioNumbers.length > 0 && (
                                    // Prefer showing the default number from the new twilioNumbers collection
                                    <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-full border border-emerald-100 dark:border-emerald-900/30">
                                        📱 {(twilioNumbers.find(n => n.isDefault) || twilioNumbers[0])?.phoneNumber}
                                        {twilioNumbers.length > 1 && <span className="ml-1 text-[9px]">+{twilioNumbers.length - 1} more</span>}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Sub-tab switcher */}
                        <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl gap-1 w-fit">
                            {(['a2p', 'optout', 'numbers'] as const).map(st => (
                                <button
                                    key={st}
                                    onClick={() => setSmsSubTab(st)}
                                    className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                                        smsSubTab === st
                                            ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-300'
                                            : 'text-slate-500 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50'
                                    }`}
                                >
                                    {st === 'a2p' ? '📋 A2P 10DLC Registration' : st === 'optout' ? '🔕 Opt-Out & Sender ID' : '📱 Phone Numbers'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── A2P 10DLC Sub-tab ─────────────────────────────────────────── */}
                    {smsSubTab === 'a2p' && (
                        <div className="space-y-6">

                            {/* Step 0: What is A2P 10DLC */}
                            <div className="bg-indigo-900/10 dark:bg-indigo-900/20 p-6 rounded-2xl border border-indigo-500/20">
                                <h4 className="font-bold text-indigo-400 mb-3 text-sm">📡 What is A2P 10DLC?</h4>
                                <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside leading-relaxed">
                                    <li><strong>A2P</strong> = Application-to-Person messaging. This is how your church texts members from software.</li>
                                    <li><strong>10DLC</strong> = 10-Digit Long Code. These are standard US phone numbers (not shortcodes) registered for A2P use.</li>
                                    <li>The FCC and US carriers require that every A2P sender register a <strong>Brand</strong> (your organization) and a <strong>Campaign</strong> (your use case) through The Campaign Registry (TCR).</li>
                                    <li>Without registration, carriers will <strong>filter or block</strong> your messages at scale.</li>
                                    <li>Approval typically takes <strong>1–5 business days</strong> after all information is submitted.</li>
                                </ul>
                            </div>

                            {/* Step 1: Twilio Sub-Account & Phone */}
                            {(() => {
                                const isComplete = !!(smsForm.twilioSubAccountSid && smsForm.twilioPhoneNumber);
                                const isOpen = expandedSteps.has(1);
                                return (
                                <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-slate-800 overflow-hidden">
                                    <button type="button" onClick={() => toggleStep(1)}
                                        className="w-full flex items-center gap-3 p-6 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                                    >
                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${isComplete ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'}`}>
                                            {isComplete ? '✓' : '1'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-black text-slate-900 dark:text-white">Twilio Sub-Account &amp; Phone</h4>
                                            {isComplete && !isOpen && <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓ Configured</p>}
                                        </div>
                                        <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                                    </button>
                                    {isOpen && <div className="px-8 pb-8 pt-6 border-t border-slate-100 dark:border-slate-800">
                                {/* Admin-editable warning */}
                                <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3 mb-5">
                                    <span className="text-amber-500 text-base shrink-0 mt-0.5">⚠️</span>
                                    <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed">
                                        <strong>Global Admin only.</strong> These fields are auto-provisioned. Editing them manually overrides what the platform set.
                                        Use <strong>Force Re-Provision</strong> below to clear stale credentials and let the system create a fresh sub-account.
                                    </p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelCn}>Sub-Account SID <span className="normal-case font-normal text-slate-400">(editable)</span></label>
                                        <input type="text"
                                            value={smsForm.twilioSubAccountSid || ''}
                                            onChange={e => handleSmsChange('twilioSubAccountSid', e.target.value.trim())}
                                            className={inputCn}
                                            placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                        />
                                        <p className="text-[9px] text-slate-400 mt-1">Twilio Sub-Account SID. Starts with <code>AC</code>. Found in Twilio Console → Sub-accounts.</p>
                                    </div>
                                    <div>
                                        <label className={labelCn}>Assigned Phone Number <span className="normal-case font-normal text-slate-400">(editable)</span></label>
                                        <input type="text"
                                            value={smsForm.twilioPhoneNumber || ''}
                                            onChange={e => handleSmsChange('twilioPhoneNumber', e.target.value.trim())}
                                            className={inputCn}
                                            placeholder="+1xxxxxxxxxx"
                                        />
                                        <p className="text-[9px] text-slate-400 mt-1">E.164 format, e.g. <code>+14695551234</code>. Must be a number provisioned in the sub-account above.</p>
                                    </div>
                                    <div>
                                        <label className={labelCn}>Messaging Service SID</label>
                                        <input type="text" value={smsForm.twilioMessagingServiceSid || ''}
                                            onChange={e => handleSmsChange('twilioMessagingServiceSid', e.target.value)}
                                            className={inputCn}
                                            placeholder="MG... (enter after creating in Twilio Console)"
                                        />
                                        <p className="text-[9px] text-slate-400 mt-1.5">Create in <a href="https://console.twilio.com/us1/develop/sms/services" target="_blank" rel="noopener noreferrer" className="underline text-indigo-400 hover:text-indigo-300">Twilio Console → Messaging → Services</a>. Attach your phone number to this service.</p>
                                    </div>
                                    <div>
                                        <label className={labelCn}>A2P Brand SID</label>
                                        <input type="text" value={smsForm.twilioBrandSid || ''}
                                            onChange={e => handleSmsChange('twilioBrandSid', e.target.value)}
                                            className={inputCn}
                                            placeholder="BN... (auto-filled after submission)"
                                        />
                                        <p className="text-[9px] text-slate-400 mt-1.5">Returned by Twilio after brand registration. Auto-populated when you use &quot;Submit to Twilio&quot; below.</p>
                                    </div>
                                    <div>
                                        <label className={labelCn}>A2P Campaign SID</label>
                                        <input type="text" value={smsForm.twilioCampaignSid || ''}
                                            onChange={e => handleSmsChange('twilioCampaignSid', e.target.value)}
                                            className={inputCn}
                                            placeholder="QE..."
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className={labelCn}>Customer Profile Bundle SID</label>
                                        <div className="flex items-center gap-2">
                                            <input type="text" value={smsForm.twilioCustomerProfileSid || ''} readOnly
                                                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400 cursor-default"
                                                placeholder="BU... (auto-filled after profile creation)"
                                            />
                                            {smsForm.twilioCustomerProfileSid && (() => {
                                                const st = smsForm.twilioCustomerProfileStatus || '';
                                                const canDel = st === 'draft' || st === 'twilio-rejected' || !st;
                                                return (
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            onClick={handleRefreshProfileStatus}
                                                            disabled={isRefreshingProfile}
                                                            title="Pull current status from Twilio"
                                                            className="shrink-0 px-3 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition disabled:cursor-not-allowed bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100"
                                                        >
                                                            {isRefreshingProfile ? '⏳…' : '🔄 Refresh'}
                                                        </button>
                                                        <button
                                                            onClick={handleDeleteProfile}
                                                            disabled={isDeletingProfile || !canDel}
                                                            title={canDel ? 'Delete this Customer Profile from Twilio' : `Cannot delete — profile is "${st}". Contact Twilio Support.`}
                                                            className={`shrink-0 px-3 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition disabled:cursor-not-allowed ${
                                                                canDel
                                                                    ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800 hover:bg-rose-100'
                                                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-400 border-slate-200 dark:border-slate-600'
                                                            }`}
                                                        >
                                                            {isDeletingProfile ? 'Deleting…' : canDel ? '🗑 Delete' : '🔒 Locked'}
                                                        </button>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                        <p className="text-[9px] text-slate-400 mt-1.5">
                                            TrustHub bundle SID (BU…). Auto-filled when you click &quot;Create &amp; Submit Profile&quot;. Only deletable when status is <em>draft</em> or <em>rejected</em>.
                                        </p>
                                    </div>
                                    {/* Live A2P Status — read from Firestore / Twilio, not a manual dropdown */}
                                    <div>
                                        <label className={labelCn}>A2P Registration Status</label>
                                        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${
                                            a2pStatus === 'approved'   ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' :
                                            a2pStatus === 'pending'    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' :
                                            a2pStatus === 'failed'     ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800' :
                                            'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                                        }`}>
                                            <span className={`text-sm ${
                                                a2pStatus === 'approved' ? '✅' :
                                                a2pStatus === 'pending'  ? '⏳' :
                                                a2pStatus === 'failed'   ? '❌' : ''
                                            }`}>
                                                {a2pStatus === 'approved' ? '✅' : a2pStatus === 'pending' ? '⏳' : a2pStatus === 'failed' ? '❌' : '⬜'}
                                            </span>
                                            <span className={`text-xs font-black ${
                                                a2pStatus === 'approved'   ? 'text-emerald-700 dark:text-emerald-300' :
                                                a2pStatus === 'pending'    ? 'text-amber-700 dark:text-amber-300' :
                                                a2pStatus === 'failed'     ? 'text-rose-700 dark:text-rose-300' :
                                                'text-slate-500 dark:text-slate-400'
                                            }`}>
                                                {statusLabel[a2pStatus]}
                                            </span>
                                            <span className="text-[9px] text-slate-400 dark:text-slate-500 ml-auto">
                                                {a2pStatus === 'not_started' ? 'Submit to Twilio to begin' :
                                                 a2pStatus === 'pending'     ? 'Awaiting Twilio review (1–5 days)' :
                                                 a2pStatus === 'approved'    ? 'Registration complete ✓' :
                                                 'Check failure reason below'}
                                            </span>
                                        </div>
                                        <p className="text-[9px] text-slate-400 mt-1.5">Status is synced from Twilio. Click <strong>Check Status</strong> in the header to refresh.</p>
                                    </div>
                                </div>
                                    </div>}
                                </div>
                                );
                            })()}

                            {/* Step 2: Brand Registration */}
                            {(() => {
                                const isComplete = !!(smsForm.a2pBusinessName && smsForm.a2pEin && smsForm.a2pContactFirstName);
                                const isOpen = expandedSteps.has(2);
                                return (
                                <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-slate-800 overflow-hidden">
                                    <button type="button" onClick={() => toggleStep(2)}
                                        className="w-full flex items-center gap-3 p-6 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                                    >
                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${isComplete ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'}`}>
                                            {isComplete ? '✓' : '2'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-black text-slate-900 dark:text-white">Brand Registration (TCR)</h4>
                                            {isComplete && !isOpen && <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓ Filled in</p>}
                                            {!isComplete && !isOpen && <p className="text-[10px] text-slate-400 mt-0.5">Register your organization with The Campaign Registry.</p>}
                                        </div>
                                        <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                                    </button>
                                    {isOpen && <div className="px-8 pb-8 pt-6 border-t border-slate-100 dark:border-slate-800">

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div className="md:col-span-2">
                                        <label className={labelCn}>Legal Business Name <span className="text-rose-500">*</span></label>
                                        <input type="text" value={smsForm.a2pBusinessName || ''}
                                            onChange={e => handleSmsChange('a2pBusinessName', e.target.value)}
                                            className={inputCn} placeholder="Grace Community Church"
                                        />
                                        <p className="text-[9px] text-slate-400 mt-1.5">Must match your IRS EIN registration exactly. Churches are typically registered as non-profit corporations.</p>
                                    </div>
                                    <div>
                                        <label className={labelCn}>Federal EIN <span className="text-rose-500">*</span></label>
                                        <input type="text" value={smsForm.a2pEin || ''}
                                            onChange={e => handleSmsChange('a2pEin', e.target.value)}
                                            className={inputCn} placeholder="12-3456789"
                                        />
                                        <p className="text-[9px] text-slate-400 mt-1.5">Your church's Employer Identification Number. Find it on your IRS determination letter or Form 990.</p>
                                    </div>
                                    <div>
                                        <label className={labelCn}>Business Type <span className="text-rose-500">*</span></label>
                                        <select value={smsForm.a2pBusinessType || ''}
                                            onChange={e => handleSmsChange('a2pBusinessType', e.target.value as any)}
                                            title="Business Type"
                                            className={inputCn}
                                        >
                                            <option value="">— Select —</option>
                                            <option value="Non-profit Corporation">Non-profit Corporation ✝ (most churches)</option>
                                            <option value="Corporation">Corporation</option>
                                            <option value="Limited Liability Corporation">Limited Liability Corporation (LLC)</option>
                                            <option value="Partnership">Partnership</option>
                                            <option value="Sole Proprietorship">Sole Proprietorship</option>
                                            <option value="Co-operative">Co-operative</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelCn}>Industry Vertical <span className="text-rose-500">*</span></label>
                                        <select value={smsForm.a2pVertical || ''}
                                            onChange={e => handleSmsChange('a2pVertical', e.target.value)}
                                            title="Industry Vertical"
                                            className={inputCn}
                                        >
                                            <option value="">— Select —</option>
                                            <option value="RELIGION">Religion ✝ (most churches)</option>
                                            <option value="NOT_FOR_PROFIT">Not For Profit / NGO</option>
                                            <option value="EDUCATION">Education</option>
                                            <option value="HEALTHCARE">Healthcare</option>
                                            <option value="GOVERNMENT">Government</option>
                                            <option value="CONSUMER">Consumer</option>
                                            <option value="ONLINE">Online / Digital</option>
                                            <option value="MEDIA">Media / Entertainment</option>
                                            <option value="TECHNOLOGY">Technology</option>
                                            <option value="FINANCIAL">Financial Services</option>
                                            <option value="RETAIL">Retail</option>
                                            <option value="MANUFACTURING">Manufacturing</option>
                                            <option value="HOSPITALITY">Hospitality</option>
                                            <option value="REAL_ESTATE">Real Estate</option>
                                            <option value="TRANSPORTATION">Transportation</option>
                                            <option value="AGRICULTURE">Agriculture</option>
                                            <option value="AUTOMOTIVE">Automotive</option>
                                            <option value="BANKING">Banking</option>
                                            <option value="INSURANCE">Insurance</option>
                                            <option value="LEGAL">Legal</option>
                                        </select>
                                        <p className="text-[9px] text-slate-400 mt-1.5">Exact Twilio category. Churches use <strong>Religion</strong>.</p>
                                    </div>
                                    <div>
                                        <label className={labelCn}>Church Website <span className="text-rose-500">*</span></label>
                                        <input type="url" value={smsForm.a2pWebsite || ''}
                                            onChange={e => handleSmsChange('a2pWebsite', e.target.value)}
                                            className={inputCn} placeholder="https://www.mychurch.org"
                                        />
                                    </div>
                                </div>

                                {/* Address */}
                                <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800">
                                    <label className="block text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-3">Registered Address</label>
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div className="md:col-span-4">
                                            <label className={labelCn}>Street Address</label>
                                            <input type="text" value={smsForm.a2pAddress || ''}
                                                onChange={e => handleSmsChange('a2pAddress', e.target.value)}
                                                className={inputCn} placeholder="123 Main St"
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className={labelCn}>City</label>
                                            <input type="text" value={smsForm.a2pCity || ''}
                                                onChange={e => handleSmsChange('a2pCity', e.target.value)}
                                                className={inputCn} placeholder="Nashville"
                                            />
                                        </div>
                                        <div>
                                            <label className={labelCn}>State</label>
                                            <input type="text" value={smsForm.a2pState || ''}
                                                onChange={e => handleSmsChange('a2pState', e.target.value)}
                                                className={inputCn} placeholder="TN" maxLength={2}
                                            />
                                        </div>
                                        <div>
                                            <label className={labelCn}>ZIP</label>
                                            <input type="text" value={smsForm.a2pZip || ''}
                                                onChange={e => handleSmsChange('a2pZip', e.target.value)}
                                                className={inputCn} placeholder="37201"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Contact / Authorized Rep 1 */}
                                <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800">
                                    <label className="block text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-3">Authorized Representative 1</label>
                                    <p className="text-[10px] text-slate-400 mb-4">Primary point-of-contact. An executive at the organization (e.g., Senior Pastor, Executive Director) is preferred.</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className={labelCn}>First Name</label>
                                            <input type="text" value={smsForm.a2pContactFirstName || ''}
                                                onChange={e => handleSmsChange('a2pContactFirstName', e.target.value)}
                                                className={inputCn} placeholder="John"
                                            />
                                        </div>
                                        <div>
                                            <label className={labelCn}>Last Name</label>
                                            <input type="text" value={smsForm.a2pContactLastName || ''}
                                                onChange={e => handleSmsChange('a2pContactLastName', e.target.value)}
                                                className={inputCn} placeholder="Smith"
                                            />
                                        </div>
                                        <div>
                                            <label className={labelCn}>Email</label>
                                            <input type="email" value={smsForm.a2pContactEmail || ''}
                                                onChange={e => handleSmsChange('a2pContactEmail', e.target.value)}
                                                className={inputCn} placeholder="pastor@mychurch.org"
                                            />
                                        </div>
                                        <div>
                                            <label className={labelCn}>Phone</label>
                                            <input type="tel" value={smsForm.a2pContactPhone || ''}
                                                onChange={e => handleSmsChange('a2pContactPhone', e.target.value)}
                                                className={inputCn} placeholder="+16155551234"
                                            />
                                        </div>
                                        <div>
                                            <label className={labelCn}>Job Title <span className="text-rose-500">*</span></label>
                                            <input type="text" value={smsForm.a2pContactJobTitle || ''}
                                                onChange={e => handleSmsChange('a2pContactJobTitle', e.target.value)}
                                                className={inputCn} placeholder="Senior Pastor, Executive Director…"
                                            />
                                            <p className="text-[9px] text-slate-400 mt-1.5">Your specific title within the organization (e.g. "Senior Pastor").</p>
                                        </div>
                                        <div>
                                            <label className={labelCn}>Job Level <span className="text-rose-500">*</span></label>
                                            <select value={smsForm.a2pContactJobPosition || ''}
                                                onChange={e => handleSmsChange('a2pContactJobPosition', e.target.value)}
                                                title="Job Level (Rep 1)"
                                                className={inputCn}
                                            >
                                                <option value="">— Select —</option>
                                                <option value="Director">Director (most pastors / ministry leads)</option>
                                                <option value="VP">VP / Vice President</option>
                                                <option value="GM">GM / General Manager</option>
                                                <option value="CEO">CEO / President</option>
                                                <option value="CFO">CFO</option>
                                                <option value="General Counsel">General Counsel</option>
                                            </select>
                                            <p className="text-[9px] text-slate-400 mt-1.5">Closest executive-level equivalent. Twilio requires one of these values.</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Authorized Rep 2 — optional, collapsed by default */}
                                <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800">
                                    {(() => {
                                        const hasRep2Data = !!(smsForm.a2pRep2FirstName || smsForm.a2pRep2LastName || smsForm.a2pRep2Email);
                                        const isExpanded  = showRep2 || hasRep2Data;
                                        return isExpanded ? (
                                            <>
                                                <div className="flex items-center justify-between mb-3">
                                                    <label className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
                                                        Authorized Representative 2 <span className="normal-case font-normal text-slate-400 text-[9px]">(optional)</span>
                                                    </label>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setShowRep2(false);
                                                            // Clear Rep 2 data
                                                            (['a2pRep2FirstName','a2pRep2LastName','a2pRep2Email','a2pRep2Phone','a2pRep2JobTitle','a2pRep2JobPosition'] as any[]).forEach(k => handleSmsChange(k, ''));
                                                        }}
                                                        className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors px-2 py-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20"
                                                    >
                                                        ✕ Remove
                                                    </button>
                                                </div>
                                                <p className="text-[10px] text-slate-400 mb-4">A second senior staff member. Twilio TrustHub may require this for Secondary Customer Profiles.</p>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className={labelCn}>First Name</label>
                                                        <input type="text" value={smsForm.a2pRep2FirstName || ''}
                                                            onChange={e => handleSmsChange('a2pRep2FirstName' as any, e.target.value)}
                                                            className={inputCn} placeholder="Jane"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className={labelCn}>Last Name</label>
                                                        <input type="text" value={smsForm.a2pRep2LastName || ''}
                                                            onChange={e => handleSmsChange('a2pRep2LastName' as any, e.target.value)}
                                                            className={inputCn} placeholder="Doe"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className={labelCn}>Email</label>
                                                        <input type="email" value={smsForm.a2pRep2Email || ''}
                                                            onChange={e => handleSmsChange('a2pRep2Email' as any, e.target.value)}
                                                            className={inputCn} placeholder="admin@mychurch.org"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className={labelCn}>Phone</label>
                                                        <input type="tel" value={smsForm.a2pRep2Phone || ''}
                                                            onChange={e => handleSmsChange('a2pRep2Phone' as any, e.target.value)}
                                                            className={inputCn} placeholder="+16155559876"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className={labelCn}>Job Title</label>
                                                        <input type="text" value={smsForm.a2pRep2JobTitle || ''}
                                                            onChange={e => handleSmsChange('a2pRep2JobTitle' as any, e.target.value)}
                                                            className={inputCn} placeholder="Church Administrator, Operations Director…"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className={labelCn}>Job Level</label>
                                                        <select value={smsForm.a2pRep2JobPosition || ''}
                                                            onChange={e => handleSmsChange('a2pRep2JobPosition' as any, e.target.value)}
                                                            title="Job Level (Rep 2)"
                                                            className={inputCn}
                                                        >
                                                            <option value="">— Select —</option>
                                                            <option value="Director">Director</option>
                                                            <option value="VP">VP / Vice President</option>
                                                            <option value="GM">GM / General Manager</option>
                                                            <option value="CEO">CEO / President</option>
                                                            <option value="CFO">CFO</option>
                                                            <option value="General Counsel">General Counsel</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setShowRep2(true)}
                                                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 px-4 py-2.5 rounded-xl border border-dashed border-indigo-200 dark:border-indigo-800 hover:border-indigo-400 dark:hover:border-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all w-full justify-center"
                                            >
                                                <span className="text-base leading-none">+</span>
                                                Add Representative 2 <span className="normal-case font-normal text-slate-400">(optional)</span>
                                            </button>
                                        );
                                    })()}
                                </div>
                                    </div>}
                                </div>
                                );
                            })()}

                            {/* Step 3: Campaign Registration */}
                            {(() => {
                                const isComplete = !!(smsForm.a2pDescription && smsForm.a2pSampleMessage1);
                                const isOpen = expandedSteps.has(3);
                                return (
                                <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-slate-800 overflow-hidden">
                                    <button type="button" onClick={() => toggleStep(3)}
                                        className="w-full flex items-center gap-3 p-6 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                                    >
                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${isComplete ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'}`}>
                                            {isComplete ? '✓' : '3'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-black text-slate-900 dark:text-white">Campaign Registration (Use Case)</h4>
                                            {isComplete && !isOpen && <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓ Filled in</p>}
                                            {!isComplete && !isOpen && <p className="text-[10px] text-slate-400 mt-0.5">Tell carriers what types of messages you'll send and how recipients opt in.</p>}
                                        </div>
                                        <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                                    </button>
                                    {isOpen && <div className="px-8 pb-8 pt-6 border-t border-slate-100 dark:border-slate-800">

                                <div className="space-y-5">
                                    <div>
                                        <label className={labelCn}>Use Case Category <span className="text-rose-500">*</span></label>
                                        <select value={smsForm.a2pUseCaseCategory || ''}
                                            onChange={e => handleSmsChange('a2pUseCaseCategory', e.target.value)}
                                            title="Use Case Category"
                                            className={inputCn}
                                        >
                                            <option value="">— Select —</option>
                                            <option value="MIXED">Mixed — General church communications (recommended for most churches)</option>
                                            <option value="MARKETING">Marketing — Event announcements, seasonal campaigns</option>
                                            <option value="PUBLIC_SERVICE_ANNOUNCEMENT">Public Service Announcement — Community alerts</option>
                                            <option value="CUSTOMER_CARE">Customer Care — Pastoral follow-up &amp; support</option>
                                            <option value="POLLING_VOTING">Polling / Voting — Member polls</option>
                                            <option value="2FA">2FA — Authentication codes only</option>
                                        </select>
                                        <p className="text-[9px] text-slate-400 mt-1.5"><strong>MIXED</strong> is the most common choice for churches — it covers service reminders, event invites, prayer requests, and pastoral care in one campaign.</p>
                                    </div>

                                    <div>
                                        <label className={labelCn}>Campaign Description <span className="text-rose-500">*</span> <span className="normal-case font-normal">({(smsForm.a2pDescription || '').length}/400 chars)</span></label>
                                        <textarea
                                            value={smsForm.a2pDescription || ''}
                                            onChange={e => handleSmsChange('a2pDescription', e.target.value)}
                                            rows={3}
                                            maxLength={400}
                                            className={inputCn + ' resize-none'}
                                            placeholder="{Church Name} uses SMS to send weekly service reminders, event announcements, prayer requests, and pastoral follow-ups to congregation members who have opted in."
                                        />
                                        <p className="text-[9px] text-slate-400 mt-1.5">Be specific. Mention all message types. Carriers reject vague descriptions.</p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <div>
                                            <label className={labelCn}>Sample Message 1 <span className="text-rose-500">*</span></label>
                                            <textarea
                                                value={smsForm.a2pSampleMessage1 || ''}
                                                onChange={e => handleSmsChange('a2pSampleMessage1', e.target.value)}
                                                rows={3}
                                                className={inputCn + ' resize-none'}
                                                placeholder="Hi [First Name], Sunday service at Grace Church starts at 10 AM. We can't wait to worship with you! Reply STOP to unsubscribe."
                                            />
                                        </div>
                                        <div>
                                            <label className={labelCn}>Sample Message 2 <span className="text-rose-500">*</span></label>
                                            <textarea
                                                value={smsForm.a2pSampleMessage2 || ''}
                                                onChange={e => handleSmsChange('a2pSampleMessage2', e.target.value)}
                                                rows={3}
                                                className={inputCn + ' resize-none'}
                                                placeholder="Grace Church: Don't miss our Fall Festival this Saturday at 3 PM. Bring the family! Details: gracechurch.com/events. Reply STOP to opt out."
                                            />
                                        </div>
                                    </div>
                                    <p className="text-[9px] text-slate-400">Sample messages must include a compliant opt-out instruction (e.g., "Reply STOP to unsubscribe").</p>

                                    {/* Opt-In Methods */}
                                    <div className="pt-5 border-t border-slate-100 dark:border-slate-800">
                                        <label className="block text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-3">Opt-In Methods</label>
                                        <p className="text-[10px] text-slate-400 mb-4">Select all ways members can opt in to receive your messages. You must honestly represent how consent is collected.</p>
                                        <div className="space-y-3">
                                            {[
                                                { key: 'a2pOptInWebForm' as const, label: 'Online Web Form', desc: 'Subscribers check a box or submit a form on your website agreeing to receive texts.' },
                                                { key: 'a2pOptInSmsKeyword' as const, label: 'Text-to-Join Keyword', desc: 'Subscribers text a keyword (e.g., "JOIN") to your number to opt in.' },
                                                { key: 'a2pOptInPaperVoice' as const, label: 'Paper Form / Verbal', desc: 'Contact cards, connection cards, or verbal opt-in collected at services/events.' },
                                            ].map(({ key, label, desc }) => (
                                                <div key={key} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer"
                                                    onClick={() => handleSmsChange(key, !smsForm[key])}
                                                >
                                                    <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                                                        smsForm[key] ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 dark:border-slate-600'
                                                    }`}>
                                                        {smsForm[key] && <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-900 dark:text-white">{label}</p>
                                                        <p className="text-[10px] text-slate-400 mt-0.5">{desc}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-4">
                                            <label className={labelCn}>Opt-In Process Description</label>
                                            <textarea
                                                value={smsForm.a2pOptInDescription || ''}
                                                onChange={e => handleSmsChange('a2pOptInDescription', e.target.value)}
                                                rows={2}
                                                className={inputCn + ' resize-none'}
                                                placeholder="Members fill out a connection card at Sunday services or sign up on our website at mychurch.org/connect. They explicitly check a box to receive text updates."
                                            />
                                        </div>
                                    </div>
                                </div>
                                    </div>}
                                </div>
                                );
                            })()}

                            {/* Compliance checklist */}
                            <div className="bg-amber-50 dark:bg-amber-900/10 p-6 rounded-2xl border border-amber-200 dark:border-amber-800">
                                <h4 className="font-bold text-amber-800 dark:text-amber-400 mb-3 text-sm">⚠ Compliance Checklist Before Submitting</h4>
                                <ul className="text-xs text-amber-900 dark:text-amber-300 space-y-1.5 list-disc list-inside leading-relaxed">
                                    <li>Business name matches your IRS EIN records exactly.</li>
                                    <li>EIN is valid and active (Form 990 / IRS determination letter on file).</li>
                                    <li>All sample messages include an opt-out instruction ("Reply STOP to unsubscribe").</li>
                                    <li>Only message types that match your campaign description will be sent.</li>
                                    <li>You have documented consent from all recipients before sending.</li>
                                    <li>Your website privacy policy discloses that you send SMS messages.</li>
                                    <li>The Messaging Service SID has your phone number attached in the Twilio Console.</li>
                                </ul>
                            </div>

                            {/* ── Submit to Twilio Action ────────────────────────────────── */}
                            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800">
                                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
                                    <div>
                                        <h4 className="text-sm font-black text-slate-900 dark:text-white mb-1">Submit A2P Registration to Twilio</h4>
                                        <p className="text-[10px] text-slate-400 leading-relaxed max-w-lg">
                                            Clicking <strong>Submit to Twilio</strong> will save your settings and submit your brand
                                            registration directly to Twilio / The Campaign Registry (TCR). You will receive a Brand SID
                                            and status will change to <em>Pending Review</em>. Approval takes 1–5 business days.
                                        </p>
                                        {a2pStatus === 'approved' && (
                                            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-2">✅ Your registration is already approved — no action needed.</p>
                                        )}
                                    </div>
                                    <div className="flex flex-col items-end gap-3 shrink-0">
                                        <button
                                            onClick={() => {
                                                if (!smsForm.termsAcceptedAt) {
                                                    setPendingTermsAction('submit-a2p');
                                                    setShowTermsModal(true);
                                                } else {
                                                    handleSubmitToTwilio();
                                                }
                                            }}
                                            disabled={isA2pSubmitting || isSmsSaving || a2pStatus === 'approved'}
                                            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-8 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30 whitespace-nowrap"
                                        >
                                            {isA2pSubmitting ? '📡 Submitting to Twilio…' : a2pStatus === 'pending' ? '🔄 Re-Submit to Twilio' : '📡 Submit to Twilio'}
                                        </button>
                                        <p className="text-[9px] text-slate-400">Settings are saved first, then submitted.</p>
                                    </div>
                                </div>

                                {/* Result feedback */}
                                {a2pResult && (
                                    a2pResult.needsBundle ? (
                                        // ── Customer Profile Bundle Required ─────────────────────────────
                                        a2pResult.needsPrimaryProfile ? (
                                            // ── Platform-level one-time setup required ────────────────────
                                            <div className="mt-5 space-y-4">
                                                <div className="p-5 rounded-xl border bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800">
                                                    <div className="flex items-start gap-3">
                                                        <span className="shrink-0 text-xl mt-0.5">🏗️</span>
                                                        <div>
                                                            <p className="text-xs font-black text-rose-800 dark:text-rose-300 mb-1">
                                                                Platform setup required (one-time, done by you)
                                                            </p>
                                                            <p className="text-[10px] text-rose-700 dark:text-rose-400 leading-relaxed">
                                                                Twilio requires the <strong>master Twilio account</strong> (Barnabas Software) to have an approved{' '}
                                                                <strong>Primary Customer Profile</strong> before any church Secondary Profiles can be created. This is a
                                                                one-time platform setup — not something each church does.
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="p-5 rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 space-y-4">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                                                        ↓ Complete this one-time platform setup in the Twilio Console
                                                    </p>

                                                    {([
                                                        {
                                                            step: '1',
                                                            title: 'Log into the MASTER Twilio account',
                                                            desc: 'Go to console.twilio.com and sign in as the platform owner. Make sure you are on the root/master account — NOT a sub-account.',
                                                            link: 'https://console.twilio.com',
                                                            linkLabel: 'Open Twilio Console →',
                                                        },
                                                        {
                                                            step: '2',
                                                            title: 'Open Trust Hub → Customer Profiles',
                                                            desc: 'In the left sidebar: Messaging → Regulatory Compliance → Customer Profiles. This section manages business identity for the platform.',
                                                            link: 'https://console.twilio.com/us1/develop/sms/regulatory-compliance/customer-profiles',
                                                            linkLabel: 'Open Customer Profiles →',
                                                        },
                                                        {
                                                            step: '3',
                                                            title: 'Create a Primary Business Profile for Barnabas Software',
                                                            desc: 'Click "Create new" → Business → fill in your platform company details (Barnabas Software legal name, EIN, website, address, authorized rep). Submit for Twilio review.',
                                                            link: null,
                                                            linkLabel: null,
                                                        },
                                                        {
                                                            step: '4',
                                                            title: 'Wait for Twilio approval (same-day)',
                                                            desc: 'Once the Primary Profile status shows TWILIO_APPROVED, come back here and click "🪄 Create & Submit Profile" again. Church Secondary Profiles will then work.',
                                                            link: null,
                                                            linkLabel: null,
                                                        },
                                                    ] as { step: string; title: string; desc: string; link: string | null; linkLabel: string | null }[]).map(({ step, title, desc, link, linkLabel }) => (
                                                        <div key={step} className="flex items-start gap-3">
                                                            <div className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-[10px] shrink-0 mt-0.5">{step}</div>
                                                            <div className="min-w-0">
                                                                <p className="text-xs font-bold text-slate-900 dark:text-white">{title}</p>
                                                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{desc}</p>
                                                                {link && linkLabel && (
                                                                    <a href={link} target="_blank" rel="noopener noreferrer"
                                                                        className="inline-block mt-1.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 underline hover:text-indigo-800 dark:hover:text-indigo-200 transition">
                                                                        {linkLabel}
                                                                    </a>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                                                        <button
                                                            onClick={handleCreateProfile}
                                                            disabled={isCreatingProfile}
                                                            title="Retry profile creation after Twilio approval"
                                                            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition whitespace-nowrap"
                                                        >
                                                            {isCreatingProfile ? '📡 Retrying…' : '🔄 Retry After Approval'}
                                                        </button>
                                                        <p className="text-[9px] text-slate-400 mt-1.5">Click after your Primary Profile is approved in Twilio Console.</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="mt-5 space-y-4">
                                            {/* Explanation banner */}
                                            <div className="p-4 rounded-xl border bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                                                <div className="flex items-start gap-2">
                                                    <span className="shrink-0 text-lg mt-0.5">📋</span>
                                                    <div>
                                                        <p className="text-xs font-black text-amber-800 dark:text-amber-300 mb-1">
                                                            One more step: Customer Profile Bundle required
                                                        </p>
                                                        <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed">
                                                            Twilio requires a verified <strong>Customer Profile Bundle</strong> (business identity) before it can submit
                                                            your brand to The Campaign Registry. We can create this automatically using the information
                                                            you already entered above — no Twilio Console needed.
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Automatic creation */}
                                            <div className="p-5 rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                                                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                                    <div>
                                                        <p className="text-xs font-black text-slate-900 dark:text-white mb-1">
                                                            🪄 Create Profile Automatically
                                                        </p>
                                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
                                                            Clicking <strong>Create &amp; Submit Profile</strong> will use your business info from Steps 2 &amp; 3 above to
                                                            create the Customer Profile Bundle in Twilio, submit it for review, then automatically re-run
                                                            brand registration once it's ready. Approval is typically <strong>same-day</strong>.
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            if (!smsForm.termsAcceptedAt) {
                                                                setPendingTermsAction('create-profile');
                                                                setShowTermsModal(true);
                                                            } else {
                                                                handleCreateProfile();
                                                            }
                                                        }}
                                                        disabled={isCreatingProfile}
                                                        className="shrink-0 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30 whitespace-nowrap"
                                                    >
                                                        {isCreatingProfile ? '📡 Creating Profile…' : '🪤 Create & Submit Profile'}
                                                    </button>
                                                </div>

                                                {/* Manual fallback — paste BU SID if they get it from Console */}
                                                <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800">
                                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                                                        Or paste an existing Bundle SID
                                                    </p>
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="text"
                                                            value={smsForm.twilioCustomerProfileSid || ''}
                                                            onChange={e => handleSmsChange('twilioCustomerProfileSid', e.target.value)}
                                                            placeholder="BU…"
                                                            className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                                                        />
                                                        <button
                                                            onClick={handleSubmitToTwilio}
                                                            disabled={!smsForm.twilioCustomerProfileSid || isA2pSubmitting}
                                                            className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition whitespace-nowrap"
                                                        >
                                                            {isA2pSubmitting ? '📡 Submitting…' : '🔄 Re-Submit'}
                                                        </button>
                                                    </div>
                                                    <p className="text-[9px] text-slate-400 mt-1.5">
                                                        If you already created a profile in Twilio Console, paste the <strong>BU…</strong> SID here and click Re-Submit.
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Error detail if creation failed */}
                                            {a2pResult.message && !a2pResult.success && (
                                                <div className="p-3 rounded-xl border bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-[10px] text-rose-700 dark:text-rose-300">
                                                    <strong>Error:</strong> {a2pResult.message}
                                                </div>
                                            )}
                                        </div>
                                        )
                                    ) : (
                                        // ── Standard success / error feedback ─────────────────────────────
                                        <div className={`mt-5 p-4 rounded-xl border text-xs ${
                                            a2pResult.success
                                                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                                                : 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                                        }`}>
                                            <div className="flex items-start gap-2">
                                                <span className="shrink-0 text-base mt-0.5">{a2pResult.success ? '✅' : '❌'}</span>
                                                <div className="min-w-0">
                                                    <p className="font-bold mb-1">{a2pResult.message}</p>
                                                    {a2pResult.brandSid && (
                                                        <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                                                            Brand SID: <strong>{a2pResult.brandSid}</strong>
                                                        </p>
                                                    )}
                                                    {a2pResult.evaluationStatus && (
                                                        <p className={`text-[10px] mt-0.5 font-bold ${
                                                            a2pResult.evaluationStatus === 'compliant'
                                                                ? 'text-emerald-600 dark:text-emerald-400'
                                                                : 'text-amber-600 dark:text-amber-400'
                                                        }`}>
                                                            Evaluation: {a2pResult.evaluationStatus}
                                                        </p>
                                                    )}
                                                    {a2pResult.twilioStatus && (
                                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                                                            Twilio status: <strong>{a2pResult.twilioStatus}</strong>
                                                        </p>
                                                    )}
                                                    {a2pResult.failureReason && (
                                                        <p className="text-[10px] text-rose-500 dark:text-rose-400 mt-0.5 font-bold">
                                                            Failure reason: {a2pResult.failureReason}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>

                            {/* ── Step 4: Brand Registration ─────────────────────────────── */}
                            {(() => {
                                const brandStatus  = smsForm.twilioA2pStatus || 'not_started';
                                const brandDone    = brandStatus === 'approved';
                                const brandFailed  = brandStatus === 'failed';
                                const hasBrand     = !!smsForm.twilioBrandSid;
                                const hasProfile   = !!smsForm.twilioCustomerProfileSid;
                                const s4Colors = brandDone   ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                               : brandFailed ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                                               : hasBrand    ? 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                               :               'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700';
                                const s4Label = brandDone   ? '✅ Approved'
                                              : brandFailed ? '❌ Failed'
                                              : hasBrand    ? '⏳ Pending Review'
                                              :               '🔲 Not Started';
                                return (
                                    <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800">
                                        <div className="flex items-center justify-between gap-4 mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm ${brandDone ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'}`}>4</div>
                                                <div>
                                                    <h4 className="text-sm font-black text-slate-900 dark:text-white">Brand Registration</h4>
                                                    <p className="text-[10px] text-slate-400 mt-0.5">Submit your organization to The Campaign Registry (TCR) via Twilio.</p>
                                                </div>
                                            </div>
                                            <span className={`shrink-0 text-[10px] font-black px-3 py-1.5 rounded-full border ${s4Colors}`}>{s4Label}</span>
                                        </div>
                                        {smsForm.twilioBrandSid && (
                                            <p className="text-[10px] font-mono text-slate-400 mb-4">Brand SID: <strong className="text-slate-600 dark:text-slate-300">{smsForm.twilioBrandSid}</strong></p>
                                        )}
                                        {!hasProfile && (
                                            <p className="text-[10px] text-amber-600 dark:text-amber-400 mb-4">⚠ Complete the Customer Profile Bundle (above) before submitting a brand.</p>
                                        )}
                                        <button
                                            id="btn-register-brand"
                                            onClick={handleRegisterBrand}
                                            disabled={isRegisteringBrand || !hasProfile || brandDone}
                                            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30 whitespace-nowrap"
                                        >
                                            {isRegisteringBrand ? '📡 Submitting...' : hasBrand ? '🔄 Re-check Brand Status' : '🚀 Submit Brand to Twilio'}
                                        </button>
                                    </div>
                                );
                            })()}

                            {/* ── Step 5: Messaging Service ───────────────────────────────── */}
                            {(() => {
                                const hasMgSvc      = !!smsForm.twilioMessagingServiceSid;
                                const brandApproved = smsForm.twilioA2pStatus === 'approved';
                                return (
                                    <div className={`bg-white dark:bg-slate-900 p-8 rounded-[2rem] border transition-all ${!brandApproved ? 'opacity-60' : ''} border-slate-100 dark:border-slate-800`}>
                                        <div className="flex items-center justify-between gap-4 mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm ${hasMgSvc ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'}`}>5</div>
                                                <div>
                                                    <h4 className="text-sm font-black text-slate-900 dark:text-white">Create Messaging Service</h4>
                                                    <p className="text-[10px] text-slate-400 mt-0.5">Creates the MG... SID that links your phone number to the A2P campaign.</p>
                                                </div>
                                            </div>
                                            <span className={`shrink-0 text-[10px] font-black px-3 py-1.5 rounded-full border ${hasMgSvc ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'}`}>
                                                {hasMgSvc ? '✅ Created' : brandApproved ? '🔲 Not Created' : '🔒 Waiting for Brand Approval'}
                                            </span>
                                        </div>
                                        {smsForm.twilioMessagingServiceSid && (
                                            <p className="text-[10px] font-mono text-slate-400 mb-4">Messaging Service SID: <strong className="text-slate-600 dark:text-slate-300">{smsForm.twilioMessagingServiceSid}</strong></p>
                                        )}
                                        <button
                                            id="btn-create-messaging-service"
                                            onClick={handleCreateMessagingService}
                                            disabled={isCreatingMsgSvc || !brandApproved || hasMgSvc}
                                            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30 whitespace-nowrap"
                                        >
                                            {isCreatingMsgSvc ? '📡 Creating...' : hasMgSvc ? '✅ Already Created' : '⚡ Create Messaging Service'}
                                        </button>
                                    </div>
                                );
                            })()}

                            {/* ── Step 6: Register A2P Campaign ──────────────────────────── */}
                            {(() => {
                                const hasCampaign      = !!(smsForm as any).twilioUsAppToPersonSid;
                                const hasMgSvc         = !!smsForm.twilioMessagingServiceSid;
                                const brandApproved    = smsForm.twilioA2pStatus === 'approved';
                                const campaignStatus   = (smsForm as any).twilioA2pCampaignStatus || '';
                                const campaignApproved = campaignStatus === 'approved';
                                const campaignFailed   = campaignStatus === 'failed';
                                const canRegister      = hasMgSvc && brandApproved;
                                const s6Label = campaignApproved ? '✅ Verified'
                                              : campaignFailed   ? '❌ Failed'
                                              : hasCampaign      ? '⏳ Pending'
                                              : canRegister      ? '🔲 Not Registered'
                                              :                    '🔒 Prerequisites Missing';
                                const s6Colors = campaignApproved ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                               : campaignFailed   ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                                               : hasCampaign      ? 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                               :                    'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700';
                                return (
                                    <div className={`bg-white dark:bg-slate-900 p-8 rounded-[2rem] border transition-all ${!canRegister ? 'opacity-60' : ''} border-slate-100 dark:border-slate-800`}>
                                        <div className="flex items-center justify-between gap-4 mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm ${campaignApproved ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'}`}>6</div>
                                                <div>
                                                    <h4 className="text-sm font-black text-slate-900 dark:text-white">Register A2P Campaign</h4>
                                                    <p className="text-[10px] text-slate-400 mt-0.5">Registers your use case with US carriers. Requires Brand APPROVED + sample messages in Step 3.</p>
                                                </div>
                                            </div>
                                            <span className={`shrink-0 text-[10px] font-black px-3 py-1.5 rounded-full border ${s6Colors}`}>{s6Label}</span>
                                        </div>
                                        {(smsForm as any).twilioUsAppToPersonSid && (
                                            <p className="text-[10px] font-mono text-slate-400 mb-4">Campaign SID: <strong className="text-slate-600 dark:text-slate-300">{(smsForm as any).twilioUsAppToPersonSid}</strong></p>
                                        )}
                                        {!canRegister && (
                                            <p className="text-[10px] text-amber-600 dark:text-amber-400 mb-4">
                                                {!brandApproved ? 'Brand must be APPROVED by Twilio before you can register a campaign (1-5 business days).' : 'Create the Messaging Service (Step 5) first.'}
                                            </p>
                                        )}
                                        <div className="flex flex-wrap gap-3">
                                            <button
                                                id="btn-register-campaign"
                                                onClick={handleRegisterCampaign}
                                                disabled={isRegisteringCampaign || !canRegister || (hasCampaign && campaignApproved)}
                                                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30 whitespace-nowrap"
                                            >
                                                {isRegisteringCampaign ? '📡 Registering...' : campaignApproved ? '✅ Verified' : hasCampaign ? '🔄 Already Registered' : '📋 Register Campaign'}
                                            </button>
                                            {hasCampaign && !campaignApproved && (
                                                <button
                                                    onClick={handleCheckCampaignStatus}
                                                    disabled={isCheckingCampaign}
                                                    className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-300 px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap"
                                                >
                                                    {isCheckingCampaign ? '...' : '🔄 Check Campaign Status'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* ── Step 7: Link Phone Numbers to Service ───────────────────── */}
                            {(() => {
                                const hasMgSvc  = !!smsForm.twilioMessagingServiceSid;
                                const hasPhone  = !!(smsForm.twilioPhoneNumber || smsForm.twilioPhoneSid);
                                const numLinked = !!(smsForm as any).twilioNumbersLinked;
                                const canLink   = hasMgSvc && hasPhone;
                                return (
                                    <div className={`bg-white dark:bg-slate-900 p-8 rounded-[2rem] border transition-all ${numLinked ? 'border-emerald-200 dark:border-emerald-800/50' : 'border-slate-100 dark:border-slate-800'} ${!canLink ? 'opacity-60' : ''}`}>
                                        <div className="flex items-center justify-between gap-4 mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm ${numLinked ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'}`}>7</div>
                                                <div>
                                                    <h4 className="text-sm font-black text-slate-900 dark:text-white">Link Phone Numbers to Service</h4>
                                                    <p className="text-[10px] text-slate-400 mt-0.5">Assigns your provisioned number(s) to the Messaging Service for A2P compliance routing.</p>
                                                </div>
                                            </div>
                                            <span className={`shrink-0 text-[10px] font-black px-3 py-1.5 rounded-full border ${numLinked ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'}`}>
                                                {numLinked ? '✅ Linked' : canLink ? '🔲 Not Linked' : '🔒 Waiting for Messaging Service'}
                                            </span>
                                        </div>
                                        {smsForm.twilioPhoneNumber && (
                                            <p className="text-[10px] font-mono text-slate-400 mb-4">Number: <strong className="text-slate-600 dark:text-slate-300">{smsForm.twilioPhoneNumber}</strong></p>
                                        )}
                                        <button
                                            id="btn-assign-numbers"
                                            onClick={handleAssignNumbers}
                                            disabled={isAssigningNumbers || !canLink}
                                            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30 whitespace-nowrap"
                                        >
                                            {isAssigningNumbers ? '📡 Linking...' : numLinked ? '🔄 Re-Link Numbers' : '🔗 Link Numbers to Service'}
                                        </button>
                                        {numLinked && (
                                            <div className="mt-4 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                                                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">🎉 A2P 10DLC Setup Complete!</p>
                                                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">Your phone number is linked to the Messaging Service and routing through your registered A2P campaign. Messages will be delivered with full carrier compliance.</p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* ── Pipeline Result Panel ──────────────────────────────────── */}
                            {a2pResult && (
                                <div className={`p-4 rounded-xl border text-xs ${a2pResult.success ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'}`}>
                                    <div className="flex items-start gap-2">
                                        <span className="shrink-0 text-base mt-0.5">{a2pResult.success ? '✅' : '❌'}</span>
                                        <div className="min-w-0">
                                            <p className="font-bold">{a2pResult.message}</p>
                                            {a2pResult.brandSid && <p className="font-mono text-[10px] mt-0.5">Brand SID: <strong>{a2pResult.brandSid}</strong></p>}
                                            {(a2pResult as any).twilioCode && <p className="text-[10px] mt-0.5 opacity-70">Twilio error code: {(a2pResult as any).twilioCode}</p>}
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                    )}


                    {/* ── Opt-Out & Sender ID Sub-tab ───────────────────────────────────── */}
                    {smsSubTab === 'optout' && (
                        <div className="space-y-6">

                            {/* Sender Identity */}
                            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800">
                                <h4 className="text-sm font-black text-slate-900 dark:text-white mb-1">Sender Identity</h4>
                                <p className="text-[10px] text-slate-400 mb-6 leading-relaxed">Controls how your church identifies itself in outbound messages.</p>

                                <div className="space-y-5">
                                    <div>
                                        <label className={labelCn}>Sender / Display Name</label>
                                        <input type="text" value={smsForm.senderName || ''}
                                            onChange={e => handleSmsChange('senderName', e.target.value)}
                                            className={inputCn} placeholder="Grace Church"
                                        />
                                        <p className="text-[9px] text-slate-400 mt-1.5">Used in the app to identify who sent the message. On carrier-delivered SMS, recipients see your phone number — carriers do not pass a display name.</p>
                                    </div>

                                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                                        <div>
                                            <p className="text-xs font-bold text-slate-900 dark:text-white">Prefix Messages with Church Name</p>
                                            <p className="text-[10px] text-slate-400 mt-0.5">Automatically prepend &quot;&#123;Church Name&#125;:&quot; to the start of every outbound SMS. Helps recipients immediately recognize who is texting them.</p>
                                        </div>
                                        <button
                                            onClick={() => handleSmsChange('prefixMessagesWithName', !smsForm.prefixMessagesWithName)}
                                            className={`ml-4 shrink-0 w-12 h-6 rounded-full p-1 transition-colors ${smsForm.prefixMessagesWithName ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                                        >
                                            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${smsForm.prefixMessagesWithName ? 'translate-x-6' : ''}`} />
                                        </button>
                                    </div>

                                    <div>
                                        <label className={labelCn}>Message Footer <span className="normal-case font-normal text-slate-400">(appended to every message)</span></label>
                                        <input type="text" value={smsForm.messageFooter || ''}
                                            onChange={e => handleSmsChange('messageFooter', e.target.value)}
                                            className={inputCn} placeholder="Reply STOP to unsubscribe"
                                        />
                                        <p className="text-[9px] text-slate-400 mt-1.5">If set, this text is automatically appended to every outbound message. The TCPA requires opt-out instructions on marketing messages. Leave blank to manage manually.</p>
                                    </div>
                                </div>
                            </div>

                            {/* Auto-Reply Messages */}
                            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800">
                                <h4 className="text-sm font-black text-slate-900 dark:text-white mb-1">Keyword Auto-Replies</h4>
                                <p className="text-[10px] text-slate-400 mb-2 leading-relaxed">
                                    Twilio automatically handles STOP, START, and HELP keywords per CTIA guidelines. You can customize the response messages below.
                                    If left blank, Twilio sends its default carrier-compliant responses.
                                </p>
                                <div className="p-3 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 rounded-xl mb-6">
                                    <p className="text-[10px] text-indigo-700 dark:text-indigo-400">
                                        <strong>Important:</strong> Your STOP response must include your organization name and confirmation of opt-out.
                                        Your START response must confirm re-enrollment. Your HELP response must include a contact method.
                                        These are <strong>CTIA-mandated</strong> requirements.
                                    </p>
                                </div>

                                <div className="space-y-6">
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">STOP</span>
                                            <label className={labelCn + ' mb-0'}>Opt-Out Confirmation Message</label>
                                        </div>
                                        <textarea
                                            value={smsForm.optOutMessage || ''}
                                            onChange={e => handleSmsChange('optOutMessage', e.target.value)}
                                            rows={3}
                                            className={inputCn + ' resize-none'}
                                            placeholder={`${smsForm.senderName || church.name || 'Grace Church'}: You have been unsubscribed and will receive no further messages. Reply START to re-subscribe.`}
                                        />
                                        <p className="text-[9px] text-slate-400 mt-1.5">Sent when a contact replies STOP. Must include your church name and confirmation of opt-out. Max 160 chars recommended.</p>
                                    </div>

                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">START</span>
                                            <label className={labelCn + ' mb-0'}>Opt-In Confirmation Message</label>
                                        </div>
                                        <textarea
                                            value={smsForm.optInMessage || ''}
                                            onChange={e => handleSmsChange('optInMessage', e.target.value)}
                                            rows={3}
                                            className={inputCn + ' resize-none'}
                                            placeholder={`${smsForm.senderName || church.name || 'Grace Church'}: Welcome back! You're subscribed again and will receive messages from us. Reply STOP at any time to unsubscribe.`}
                                        />
                                        <p className="text-[9px] text-slate-400 mt-1.5">Sent when a contact replies START after previously opting out. Must confirm re-enrollment.</p>
                                    </div>

                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">HELP</span>
                                            <label className={labelCn + ' mb-0'}>Help Response Message</label>
                                        </div>
                                        <textarea
                                            value={smsForm.helpMessage || ''}
                                            onChange={e => handleSmsChange('helpMessage', e.target.value)}
                                            rows={3}
                                            className={inputCn + ' resize-none'}
                                            placeholder={`${smsForm.senderName || church.name || 'Grace Church'}: For help, call us at ${church.phone || '(555) 555-5555'} or visit ${church.website || 'www.mychurch.org'}. Reply STOP to unsubscribe.`}
                                        />
                                        <p className="text-[9px] text-slate-400 mt-1.5">Sent when a contact replies HELP. Must include a contact method (phone, email, or website).</p>
                                    </div>
                                </div>
                            </div>

                            {/* TCPA / CTIA guidance */}
                            <div className="bg-indigo-900/10 dark:bg-indigo-900/20 p-6 rounded-2xl border border-indigo-500/20">
                                <h4 className="font-bold text-indigo-400 mb-3 text-sm">⚖️ TCPA & CTIA Compliance Notes</h4>
                                <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside leading-relaxed">
                                    <li>Always honor STOP requests immediately and do not send further messages.</li>
                                    <li>Maintain a record of all opt-outs. Our system automatically tracks these.</li>
                                    <li>You must obtain prior express written consent before sending marketing messages.</li>
                                    <li>Include your church name and opt-out instructions in every marketing message.</li>
                                    <li>HELP and STOP must always work, even after opting out.</li>
                                    <li>Under TCPA, violations can carry fines of $500–$1,500 per message — compliance is critical.</li>
                                    <li>Consult legal counsel for advice specific to your ministry context.</li>
                                </ul>
                            </div>

                        </div>
                    )}

                    {/* ── Phone Numbers Sub-tab ────────────────────────────────────────── */}
                    {smsSubTab === 'numbers' && (() => {
                        const US_STATES = [
                            ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
                            ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],
                            ['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],
                            ['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
                            ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],
                            ['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],
                            ['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],
                            ['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
                            ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],
                            ['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
                        ];

                        const handleSearch = async () => {
                            setNumError('');
                            setAddNumBusy(true);
                            try {
                                let url = `/api/messaging/available-numbers?churchId=${encodeURIComponent(churchId)}`;
                                if (addNumMode === 'area-code') {
                                    if (!addNumAreaCode || addNumAreaCode.length < 3) { setNumError('Enter a 3-digit area code.'); return; }
                                    url += `&areaCode=${encodeURIComponent(addNumAreaCode)}`;
                                } else {
                                    if (!addNumState) { setNumError('Select a state.'); return; }
                                    if (addNumCity.trim()) url += `&city=${encodeURIComponent(addNumCity.trim())}`;
                                    url += `&state=${encodeURIComponent(addNumState)}`;
                                }
                                const res = await fetch(url);
                                const raw = await res.text();
                                let data: any;
                                try { data = JSON.parse(raw); } catch {
                                    throw new Error(`Server returned unexpected response (HTTP ${res.status}): ${raw.slice(0, 200)}`);
                                }
                                if (!data.success) throw new Error(data.error || 'Search failed');
                                setAddNumResults(data.numbers || []);
                                setAddNumStep('pick');
                            } catch (e: any) {
                                setNumError(e.message || 'Search failed');
                            } finally {
                                setAddNumBusy(false);
                            }
                        };

                        const handleClaimNumber = async () => {
                            if (!addNumSelected) { setNumError('Select a number first.'); return; }
                            setNumError('');
                            setAddNumBusy(true);
                            try {
                                const res = await fetch('/api/messaging/add-number', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        churchId,
                                        phoneNumber: addNumSelected,
                                        senderName: addNumSender,
                                        friendlyLabel: addNumLabel || 'New Line',
                                    }),
                                });
                                const raw = await res.text();
                                let data: any;
                                try { data = JSON.parse(raw); } catch {
                                    throw new Error(`Server returned unexpected response (HTTP ${res.status}): ${raw.slice(0, 300)}`);
                                }
                                if (!data.success) throw new Error(data.error || 'Failed to claim number');
                                setNumToast('✓ Number added successfully!');
                                setShowAddNumber(false);
                                setAddNumStep('search');
                                setAddNumResults([]);
                                setAddNumSelected('');
                                setAddNumLabel('');
                                // Reload numbers list
                                setNumLoading(true);
                                import('firebase/firestore').then(({ collection, query, where, orderBy, getDocs }) => {
                                    const q = query(
                                        collection(firebaseDb, 'twilioNumbers'),
                                        where('churchId', '==', churchId),
                                        orderBy('createdAt', 'asc')
                                    );
                                    getDocs(q)
                                        .then(snap => setTwilioNumbers(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
                                        .finally(() => setNumLoading(false));
                                });
                                setTimeout(() => setNumToast(''), 4000);
                            } catch (e: any) {
                                setNumError(e.message || 'Failed to add number');
                            } finally {
                                setAddNumBusy(false);
                            }
                        };

                        const handleSetDefault = async (numId: string) => {
                            setNumError('');
                            try {
                                const res = await fetch('/api/messaging/set-default-number', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ churchId, twilioNumberId: numId }),
                                });
                                const data = await res.json();
                                if (!data.success) throw new Error(data.error || 'Failed');
                                setNumToast('✓ Default number updated.');
                                setTwilioNumbers(prev => prev.map(n => ({ ...n, isDefault: n.id === numId })));
                                setTimeout(() => setNumToast(''), 3000);
                            } catch (e: any) {
                                setNumError(e.message || 'Failed to set default');
                            }
                        };

                        const profileApproved =
                            (smsForm.twilioCustomerProfileStatus || '').toLowerCase() === 'twilio-approved';

                        const handleReleaseNumber = async (num: any) => {
                            const confirmed = window.confirm(
                                `Release ${num.phoneNumber} ("${num.friendlyLabel || num.senderName || 'this number'}")? \n\nThis will permanently release the number back to Twilio and cannot be undone.`
                            );
                            if (!confirmed) return;
                            setNumError('');
                            try {
                                const res = await fetch('/api/messaging/release-number', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ churchId, twilioNumberId: num.id }),
                                });
                                const raw = await res.text();
                                let data: any;
                                try { data = JSON.parse(raw); } catch { data = { error: raw.slice(0, 200) }; }
                                if (!data.success) throw new Error(data.error || 'Release failed');
                                setNumToast(`✓ ${num.phoneNumber} released.`);
                                setTwilioNumbers(prev => prev.filter(n => n.id !== num.id));
                                setTimeout(() => setNumToast(''), 4000);
                            } catch (e: any) {
                                setNumError(e.message || 'Failed to release number');
                            }
                        };

                        return (
                            <div className="space-y-6">

                                {/* Header row */}
                                <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <h4 className="text-sm font-black text-slate-900 dark:text-white">Provisioned Phone Numbers</h4>
                                            <p className="text-[10px] text-slate-400 mt-0.5">All Twilio numbers associated with this church. The default number is used for outbound replies when no inbox is specified.</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                if (!profileApproved) return;
                                                setShowAddNumber(true); setAddNumStep('search'); setAddNumResults([]); setNumError('');
                                            }}
                                            disabled={!profileApproved}
                                            title={!profileApproved ? 'A Twilio-approved Customer Profile is required before requesting a phone number.' : 'Request a new phone number'}
                                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
                                                profileApproved
                                                    ? 'bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-200 dark:shadow-violet-900/30'
                                                    : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                                            }`}
                                        >
                                            <span className="text-sm leading-none">{profileApproved ? '+' : '🔒'}</span>
                                            {profileApproved ? 'Request a Number' : 'Profile Required'}
                                        </button>
                                    </div>

                                    {!profileApproved && (
                                        <div className="mb-4 flex items-start gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                                            <span className="text-lg shrink-0">⚠️</span>
                                            <div>
                                                <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Customer Profile approval required</p>
                                                <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
                                                    You cannot provision phone numbers until your Twilio Customer Profile (A2P 10DLC) has been approved.
                                                    Complete the A2P Registration tab first, then return here once Twilio approves it.
                                                    {smsForm.twilioCustomerProfileSid && (
                                                        <> Current status: <strong>{smsForm.twilioCustomerProfileStatus || 'pending-review'}</strong>.</>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Toast */}
                                    {numToast && (
                                        <div className="mb-4 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                            {numToast}
                                        </div>
                                    )}
                                    {numError && (
                                        <div className="mb-4 px-4 py-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-300">
                                            {numError}
                                        </div>
                                    )}

                                    {/* Numbers list */}
                                    {numLoading ? (
                                        <p className="text-xs text-slate-400 py-4 text-center">Loading numbers…</p>
                                    ) : twilioNumbers.length === 0 ? (
                                        <div className="py-10 text-center">
                                            <p className="text-3xl mb-3">📱</p>
                                            <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">No Numbers Provisioned</p>
                                            <p className="text-xs text-slate-400">
                                                {profileApproved
                                                    ? 'Use "Request a Number" to add your first Twilio number.'
                                                    : 'Complete A2P Registration and get your Customer Profile approved first.'}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {twilioNumbers.map((num: any) => (
                                                <div
                                                    key={num.id}
                                                    className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                                                        num.isDefault
                                                            ? 'bg-violet-50 dark:bg-violet-900/10 border-violet-200 dark:border-violet-800'
                                                            : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                                                    }`}
                                                >
                                                    {/* Number info */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">{num.phoneNumber}</span>
                                                            {num.friendlyLabel && (
                                                                <span className="text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full">
                                                                    {num.friendlyLabel}
                                                                </span>
                                                            )}
                                                            {num.isDefault && (
                                                                <span className="text-[9px] font-black uppercase tracking-widest bg-violet-600 text-white px-2 py-0.5 rounded-full">
                                                                    Default
                                                                </span>
                                                            )}
                                                        </div>
                                                        {num.senderName && (
                                                            <p className="text-[10px] text-slate-400 mt-0.5">Sender: {num.senderName}</p>
                                                        )}
                                                    </div>
                                                    {/* Actions */}
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {!num.isDefault && (
                                                            <button
                                                                onClick={() => handleSetDefault(num.id)}
                                                                className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-400 transition-all"
                                                            >
                                                                Set Default
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleReleaseNumber(num)}
                                                            disabled={num.isDefault && twilioNumbers.length > 1}
                                                            title={num.isDefault && twilioNumbers.length > 1
                                                                ? 'Set another number as default before releasing this one'
                                                                : `Release ${num.phoneNumber}`}
                                                            className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border transition-all disabled:cursor-not-allowed disabled:opacity-40 border-rose-200 dark:border-rose-800 text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:border-rose-400"
                                                        >
                                                            {num.isDefault && twilioNumbers.length > 1 ? '🔒 Release' : '🗑 Release'}
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* ── Add Number Inline Wizard ─────────────────────────── */}
                                {showAddNumber && (
                                    <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border-2 border-violet-300 dark:border-violet-700 shadow-xl shadow-violet-100 dark:shadow-violet-900/20">
                                        <div className="flex items-center justify-between mb-6">
                                            <div>
                                                <h4 className="text-sm font-black text-slate-900 dark:text-white">Request Additional Number</h4>
                                                <p className="text-[10px] text-slate-400 mt-0.5">Search Twilio for an available number and add it to this church's account.</p>
                                            </div>
                                            <button
                                                onClick={() => { setShowAddNumber(false); setAddNumStep('search'); setAddNumResults([]); setNumError(''); }}
                                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg font-bold leading-none"
                                                title="Close"
                                            >
                                                ✕
                                            </button>
                                        </div>

                                        {addNumStep === 'search' && (
                                            <div className="space-y-5">
                                                {/* Mode toggle */}
                                                <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 w-fit">
                                                    {(['city-state', 'area-code'] as const).map(m => (
                                                        <button
                                                            key={m}
                                                            onClick={() => setAddNumMode(m)}
                                                            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                                                                addNumMode === m
                                                                    ? 'bg-violet-600 text-white'
                                                                    : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50'
                                                            }`}
                                                        >
                                                            {m === 'city-state' ? 'City / State' : 'Area Code'}
                                                        </button>
                                                    ))}
                                                </div>

                                                {addNumMode === 'city-state' ? (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div>
                                                            <label className={labelCn}>City (optional)</label>
                                                            <input type="text" value={addNumCity} onChange={e => setAddNumCity(e.target.value)}
                                                                className={inputCn} placeholder="Nashville" />
                                                        </div>
                                                        <div>
                                                            <label className={labelCn}>State <span className="text-rose-500">*</span></label>
                                                            <select value={addNumState} onChange={e => setAddNumState(e.target.value)} title="State" className={inputCn}>
                                                                <option value="">— Select state —</option>
                                                                {US_STATES.map(([abbr, name]) => (
                                                                    <option key={abbr} value={abbr}>{name}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <label className={labelCn}>Area Code <span className="text-rose-500">*</span></label>
                                                        <input type="text" value={addNumAreaCode}
                                                            onChange={e => setAddNumAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                                                            className={inputCn + ' font-mono'} placeholder="615" maxLength={3} />
                                                    </div>
                                                )}

                                                <button
                                                    onClick={handleSearch}
                                                    disabled={addNumBusy}
                                                    className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                                                >
                                                    {addNumBusy ? 'Searching…' : 'Search Available Numbers'}
                                                </button>
                                            </div>
                                        )}

                                        {addNumStep === 'pick' && (
                                            <div className="space-y-5">
                                                <div>
                                                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3">
                                                        {addNumResults.length} number{addNumResults.length !== 1 ? 's' : ''} found — pick one:
                                                    </p>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                                                        {addNumResults.map(n => (
                                                            <button
                                                                key={n.phoneNumber}
                                                                onClick={() => setAddNumSelected(n.phoneNumber)}
                                                                className={`text-left p-3 rounded-xl border transition-all ${
                                                                    addNumSelected === n.phoneNumber
                                                                        ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-400 dark:border-violet-600'
                                                                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-violet-300'
                                                                }`}
                                                            >
                                                                <p className="font-mono font-bold text-sm text-slate-900 dark:text-white">{n.friendlyName}</p>
                                                                <p className="text-[10px] text-slate-400">{n.locality ? `${n.locality}, ` : ''}{n.region}</p>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {addNumResults.length > 0 && (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div>
                                                            <label className={labelCn}>Inbox Label</label>
                                                            <input type="text" value={addNumLabel}
                                                                onChange={e => setAddNumLabel(e.target.value)}
                                                                className={inputCn} placeholder="Youth Ministry" />
                                                            <p className="text-[9px] text-slate-400 mt-1">Displayed in the inbox switcher.</p>
                                                        </div>
                                                        <div>
                                                            <label className={labelCn}>Sender Name</label>
                                                            <input type="text" value={addNumSender}
                                                                onChange={e => setAddNumSender(e.target.value)}
                                                                className={inputCn} placeholder={church.name} />
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="flex gap-3">
                                                    <button
                                                        onClick={() => { setAddNumStep('search'); setAddNumResults([]); setAddNumSelected(''); }}
                                                        className="px-5 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 transition"
                                                    >
                                                        ← Search Again
                                                    </button>
                                                    <button
                                                        onClick={handleClaimNumber}
                                                        disabled={addNumBusy || !addNumSelected}
                                                        className="flex-1 py-2.5 text-sm font-black bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl transition flex items-center justify-center gap-2"
                                                    >
                                                        {addNumBusy ? 'Claiming…' : 'Claim Number →'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Info callout */}
                                <div className="bg-violet-900/10 dark:bg-violet-900/20 p-6 rounded-2xl border border-violet-500/20">
                                    <h4 className="font-bold text-violet-400 mb-3 text-sm">📱 Multi-Number Inboxes</h4>
                                    <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside leading-relaxed">
                                        <li>Each number gets its own inbox in the SMS tool. You can restrict which users see each inbox.</li>
                                        <li>The <strong>default</strong> number handles inbound replies when the conversation has no assigned inbox.</li>
                                        <li>New numbers use the same Twilio sub-account as your primary — no extra A2P registration needed.</li>
                                        <li>To restrict inbox access per user, use the <strong>Manage Numbers</strong> panel inside the SMS tool.</li>
                                    </ul>
                                </div>

                            </div>
                        );
                    })()}

                    {smsMessage && (
                        <div className={`p-4 rounded-xl text-xs font-bold flex items-center gap-2 ${
                            smsMessage.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400'
                        }`}>
                            <span>{smsMessage.type === 'success' ? '✓' : '⚠️'}</span>
                            {smsMessage.text}
                        </div>
                    )}

                    <div className="flex justify-end">
                        <button
                            onClick={handleSmsSave}
                            disabled={isSmsSaving}
                            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30"
                        >
                            {isSmsSaving ? 'Saving…' : 'Save SMS Settings'}
                        </button>
                    </div>
                </div>
            );
        })()}

        {activeTab === 'Risk Profiles' && (
            <div className="space-y-12">
                <RiskSettingsView 
                    settings={church.riskSettings} 
                    onSave={(s) => onUpdateChurch && onUpdateChurch({ riskSettings: s })} 
                />
                
                <GroupRiskSettingsView 
                    settings={church.groupRiskSettings}
                    onSave={(s) => onUpdateChurch && onUpdateChurch({ groupRiskSettings: s })}
                />

                <ChurchRiskSettingsView 
                    settings={church.churchRiskSettings} 
                    onSave={(s) => onUpdateChurch && onUpdateChurch({ churchRiskSettings: s })} 
                />
                <DonorLifecycleSettingsView 
                    settings={church.donorLifecycleSettings} 
                    onSave={(s) => onUpdateChurch && onUpdateChurch({ donorLifecycleSettings: s })} 
                />
            </div>
        )}

        {activeTab === 'Subscription' && (
            <SubscriptionSettingsView church={church} onUpdateChurch={(u) => onUpdateChurch && onUpdateChurch(u)} />
        )}

        {isCreateModalOpen && (
            <CreateUserModal 
                churchId={churchId} 
                onClose={() => setIsCreateModalOpen(false)} 
                onSuccess={() => { setIsCreateModalOpen(false); loadUsers(); }} 
            />
        )}

        {/* ─── SMS Terms of Service Modal ──────────────────────────────────── */}
        {showTermsModal && (
            <SmsAdminTermsModal
                churchId={churchId}
                userId={currentUser.id}
                onAccepted={async (ts: number) => {
                    setSmsForm((prev: any) => ({ ...prev, termsAcceptedAt: ts, termsAcceptedByUserId: currentUser.id }));
                    if (onUpdateChurch) await onUpdateChurch({ smsSettings: { ...smsForm, termsAcceptedAt: ts, termsAcceptedByUserId: currentUser.id } });
                    setShowTermsModal(false);
                    // Use the ref to call handlers that live inside the SMS IIFE
                    if (pendingTermsAction === 'create-profile') smsActionRef.current?.handleCreateProfile();
                    if (pendingTermsAction === 'submit-a2p') smsActionRef.current?.handleSubmitToTwilio();
                    setPendingTermsAction(null);
                }}
                onCancel={() => { setShowTermsModal(false); setPendingTermsAction(null); }}
            />
        )}
    </div>
  );
};

export default RoleAdminView;
