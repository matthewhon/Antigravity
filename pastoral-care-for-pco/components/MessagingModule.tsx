import React, { useState, useEffect } from 'react';
import { db as firebaseDb } from '../services/firebase';
import {
    collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc,
    query, where, orderBy, getDocs, setDoc
} from 'firebase/firestore';
import { SmsCampaign, Church, User } from '../types';
import {
    MessageSquare, ArrowLeft, X, Phone, Settings, Key,
    Inbox, BarChart3, Zap, Sparkles, Shield, PlusCircle,
    ChevronRight, ChevronDown, ScrollText
} from 'lucide-react';
import { BroadcastPermissionsTab } from './BroadcastPermissionsTab';
import { FileManager } from './FileManager';
import { ToolTabs } from './tool-shell';
import { VoiceDialerView } from './VoiceDialerView';
import { SmsAnalytics } from './messaging/SmsAnalytics';
import { formatPhone } from './messaging/smsUtils';
import { Toast } from './messaging/Toast';
import { SmsSetupBanner, SmsSetupWizard } from './messaging/SmsSetupWizard';
import { useTwilioNumbers, canUserSeeNumber, canUserUseFeature, NumberManager } from './messaging/NumberManager';
import { SmsAgentTab } from './messaging/SmsAgentTab';
import { CampaignComposer, CampaignList } from './messaging/CampaignsSection';
import { SmsInbox } from './messaging/SmsInbox';
import { SmsKeywordsManager } from './messaging/SmsKeywordsManager';
import { SmsWorkflowsManager } from './messaging/SmsWorkflowsManager';
export { SmsWorkflowsManager };

const API_BASE = '';

// --- Main MessagingModule -----------------------------------------------------

interface MessagingModuleProps {
    churchId: string;
    church: Church;
    currentUser: User;
    onUpdateChurch?: (updates: Partial<Church>) => void;
    /** When provided by a parent route, drives the active tab and hides the internal pill nav */
    controlledTab?: 'campaigns' | 'inbox' | 'keywords' | 'analytics' | 'workflows' | 'agent' | 'permissions' | 'files';
    /** Pre-selected phone number ID supplied by a parent (e.g. MobileSmsLayout). */
    initialNumberId?: string | null;
    /** When true the built-in number dropdown is hidden (parent owns the selector UI). */
    hideNumberSelector?: boolean;
    activeNumberId?: string | null;
    onActiveNumberIdChange?: (id: string | null) => void;
}

const MessagingModule: React.FC<MessagingModuleProps> = ({ churchId, church, currentUser, onUpdateChurch, controlledTab, initialNumberId, hideNumberSelector, activeNumberId: propActiveNumberId, onActiveNumberIdChange: propOnActiveNumberIdChange }) => {
    const smsEnabled = church.smsSettings?.smsEnabled;

    type Tab = 'campaigns' | 'inbox' | 'phone' | 'keywords' | 'analytics' | 'workflows' | 'agent' | 'permissions' | 'files';
    const [activeTab, setActiveTab] = useState<Tab>('inbox');
    const effectiveTab: Tab = controlledTab ?? activeTab;
    const [campaigns, setCampaigns] = useState<SmsCampaign[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeCampaign, setActiveCampaign] = useState<SmsCampaign | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [isSending, setIsSending] = useState(false);
    const [showSetup, setShowSetup] = useState(false);

    // -- Multi-number support ---------------------------------------------------
    const { numbers: twilioNumbers, loading: numbersLoading } = useTwilioNumbers(churchId);
    const visibleNumbers = twilioNumbers.filter(n => canUserSeeNumber(n, currentUser));
    const [localActiveNumberId, setLocalActiveNumberId] = useState<string | null>(initialNumberId ?? null);
    const activeNumberId = propActiveNumberId !== undefined ? propActiveNumberId : localActiveNumberId;
    const setActiveNumberId = (id: string | null) => {
        if (propOnActiveNumberIdChange) {
            propOnActiveNumberIdChange(id);
        } else {
            setLocalActiveNumberId(id);
        }
    };
    const [showNumberManager, setShowNumberManager] = useState(false);
    const [showAddNumber, setShowAddNumber] = useState(false);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    useEffect(() => {
        const q = query(collection(firebaseDb, 'users'), where('churchId', '==', churchId));
        getDocs(q).then(snap => setAllUsers(snap.docs.map(d => ({ ...d.data(), id: d.id } as User))));
    }, [churchId]);

    useEffect(() => {
        if (initialNumberId) setActiveNumberId(initialNumberId);
    }, [initialNumberId]);

    useEffect(() => {
        if (!activeNumberId && visibleNumbers.length > 0) {
            const defaultNum = visibleNumbers.find(n => n.isDefault) ?? visibleNumbers[0];
            setActiveNumberId(defaultNum.id);
        }
    }, [visibleNumbers.length, activeNumberId]);

    useEffect(() => {
        const legacyPhone = church.smsSettings?.twilioPhoneNumber;
        const legacyPhoneSid = church.smsSettings?.twilioPhoneSid;
        const hasRealSubAccount = !!church.smsSettings?.twilioSubAccountSid;
        if (legacyPhone && hasRealSubAccount && !numbersLoading && twilioNumbers.length === 0) {
            const migratedId = `${churchId}_migrated`;
            setDoc(doc(firebaseDb, 'twilioNumbers', migratedId), {
                id: migratedId,
                churchId,
                phoneNumber: legacyPhone,
                phoneSid: legacyPhoneSid || '',
                friendlyLabel: 'Main Line',
                isDefault: true,
                smsEnabled: true,
                allowedUserIds: [],
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }).catch(() => {});
        }
    }, [numbersLoading, twilioNumbers.length, church.smsSettings?.twilioPhoneNumber]);

    const activeNumber = visibleNumbers.find(n => n.id === activeNumberId) ?? visibleNumbers[0] ?? null;

    useEffect(() => {
        const allowedTabs: { key: Tab; perm: string }[] = ([
            { key: 'campaigns', perm: 'broadcastUserIds' },
            { key: 'workflows', perm: 'broadcastUserIds' },
            { key: 'inbox', perm: 'inboxUserIds' },
            { key: 'keywords', perm: 'keywordsUserIds' },
            { key: 'analytics', perm: 'analyticsUserIds' },
            { key: 'agent', perm: 'aiAgentUserIds' },
        ] as const).filter(t => canUserUseFeature(activeNumber, currentUser, t.perm as any)) as any;

        if (currentUser.roles?.includes('Church Admin') || currentUser.roles?.includes('System Administration')) {
            allowedTabs.push({ key: 'permissions', perm: 'broadcastUserIds' });
        }

        if (allowedTabs.length > 0 && !allowedTabs.some(t => t.key === activeTab) && !controlledTab) {
            setActiveTab(allowedTabs[0].key as Tab);
        }
    }, [activeNumber, activeTab, currentUser, controlledTab]);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    useEffect(() => {
        if (!smsEnabled) { setIsLoading(false); return; }
        const q = query(
            collection(firebaseDb, 'smsCampaigns'),
            where('churchId', '==', churchId),
            orderBy('createdAt', 'desc')
        );
        const unsub = onSnapshot(q, snap => {
            const allCampaigns = snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsCampaign));
            setCampaigns(allCampaigns);
            setIsLoading(false);
        });
        return unsub;
    }, [churchId, smsEnabled]);

    const handleCreate = async () => {
        const name = `Text Campaign ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        const now = Date.now();
        const data: Omit<SmsCampaign, 'id'> = {
            churchId, name, status: 'draft', body: '',
            toListId: null, toGroupId: null,
            createdAt: now, updatedAt: now,
            twilioNumberId: activeNumberId || null,
            sentBy: currentUser.id,
            sentByName: currentUser.name,
        };
        const ref = await addDoc(collection(firebaseDb, 'smsCampaigns'), data);
        setActiveCampaign({ id: ref.id, ...data });
    };

    const handleSave = async (updates: Partial<SmsCampaign>) => {
        if (!activeCampaign) return;
        const patch = { ...updates, updatedAt: Date.now() };
        await updateDoc(doc(firebaseDb, 'smsCampaigns', activeCampaign.id), patch);
        setActiveCampaign(prev => prev ? { ...prev, ...patch } : null);
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Delete this campaign?')) return;
        await deleteDoc(doc(firebaseDb, 'smsCampaigns', id));
        if (activeCampaign?.id === id) setActiveCampaign(null);
        showToast('Campaign deleted');
    };

    const handleDuplicate = async (c: SmsCampaign) => {
        const now = Date.now();
        const data = {
            ...c,
            name: `Copy of ${c.name}`,
            status: 'draft' as const,
            sentAt: null,
            scheduledAt: null,
            createdAt: now,
            updatedAt: now,
            twilioNumberId: activeNumberId || null,
            sentBy: currentUser.id,
            sentByName: currentUser.name,
        };
        delete (data as any).id;
        await addDoc(collection(firebaseDb, 'smsCampaigns'), data);
        showToast('Campaign duplicated');
    };

    const handleSendNow = async (campaignToSend = activeCampaign) => {
        if (!campaignToSend) return;
        setIsSending(true);
        try {
            if (currentUser.email === 'test@test.com') {
                const now = Date.now();
                const mockRecipients = 10;
                await updateDoc(doc(firebaseDb, 'smsCampaigns', campaignToSend.id), {
                    status: 'sent',
                    sentAt: now,
                    updatedAt: now,
                    recipientCount: mockRecipients,
                    deliveredCount: mockRecipients - 1,
                    failedCount: 1,
                    optOutCount: 0,
                    sentBy: currentUser.id,
                    sentByName: currentUser.name,
                });
                showToast(`Campaign sent to ${mockRecipients} recipients`);
                setActiveCampaign(null);
                return;
            }

            if (campaignToSend.channelType === 'email') {
                const res = await fetch(`${API_BASE}/api/email/send`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        churchId,
                        campaignId: campaignToSend.id,
                        sentBy: currentUser.id,
                        collectionName: 'smsCampaigns'
                    }),
                });
                const data = await res.json();
                if (!res.ok || (data.success === false && data.error)) throw new Error(data.error || 'Email send failed');
                showToast(`Email sent to ${data.recipientCount} recipients`);
            } else {
                const res = await fetch(`${API_BASE}/api/messaging/send-bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        churchId,
                        campaignId: campaignToSend.id,
                        phones: [],
                        body: campaignToSend.body,
                        mediaUrls: campaignToSend.mediaUrls || [],
                        sentBy: currentUser.id,
                        sentByName: currentUser.name,
                        resolveFromList: campaignToSend.toListId || null,
                        resolveFromGroup: campaignToSend.toGroupId || null,
                        smsNumberId: campaignToSend.twilioNumberId || null,
                        attachVcard: campaignToSend.attachVcard || false,
                    }),
                });
                const data = await res.json();
                if (!data.success && data.error && !data.sent) throw new Error(data.error);
                showToast(`Sent to ${data.sent} recipients (${data.failed} failed)`);
            }
            setActiveCampaign(null);
        } catch (e: any) {
            showToast(e.message || 'Send failed', 'error');
        } finally {
            setIsSending(false);
        }
    };

    const handleSchedule = async (campaignToSched: SmsCampaign, timeMs: number, freq?: 'daily' | 'weekly' | 'monthly') => {
        if (!campaignToSched) return;
        const patch = { ...campaignToSched, status: 'scheduled' as const, scheduledAt: timeMs, recurringFrequency: freq || null, sentHistory: [], updatedAt: Date.now() };
        delete (patch as any).id;
        await updateDoc(doc(firebaseDb, 'smsCampaigns', campaignToSched.id), patch);
        setActiveCampaign(null);
        showToast('Campaign scheduled');
    };

    const handleCancelSchedule = async () => {
        if (!activeCampaign) return;
        await updateDoc(doc(firebaseDb, 'smsCampaigns', activeCampaign.id), {
            status: 'draft',
            scheduledAt: null,
            sendAt: null,
            recurringFrequency: null,
            retryCount: 0,
            lastError: null,
            updatedAt: Date.now(),
        });
        showToast('Schedule cancelled');
        setActiveCampaign(null);
    };

    const hasCustomerProfile = !!(church.smsSettings?.twilioCustomerProfileSid);

    if (!smsEnabled && !showSetup) {
        return (
            <SmsSetupBanner
                onSetup={() => {
                    if (hasCustomerProfile) {
                        setShowSetup(true);
                    } else {
                        setShowSetup('need-profile' as any);
                    }
                }}
            />
        );
    }

    if (showSetup === ('need-profile' as any)) {
        return (
            <div className="p-6 max-w-2xl mx-auto mt-12">
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 p-8 shadow-sm">
                    <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
                        <ScrollText size={26} className="text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    </div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white text-center mb-2">
                        Complete Your Business Profile First
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6 leading-relaxed">
                        Before you can claim a phone number, Twilio requires your church's business identity
                        to be registered via a <strong>Customer Profile Bundle</strong>. This is a one-time
                        step that verifies your organization for A2P 10DLC compliance.
                    </p>

                    <div className="space-y-3 mb-6">
                        {[
                            { num: '1', title: 'Go to Settings → SMS', desc: 'Open the A2P 10DLC Registration tab and fill in your church\'s legal name, EIN, address, and authorized representative details.' },
                            { num: '2', title: 'Click "Create & Submit Profile"', desc: 'Our system will automatically create and submit your Customer Profile Bundle to Twilio TrustHub for review (same-day approval).' },
                            { num: '3', title: 'Return here for your phone number', desc: 'Once your profile is created (any status), come back to this screen and click "Get Started" to pick your local number.' },
                        ].map(step => (
                            <div key={step.num} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800">
                                <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">{step.num}</div>
                                <div>
                                    <p className="text-xs font-black text-slate-900 dark:text-white">{step.title}</p>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{step.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                        <button
                            onClick={() => setShowSetup(false)}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                        >
                            <ArrowLeft size={14} aria-hidden="true" /> Back
                        </button>
                        <button
                            onClick={() => setShowSetup(false)}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-md shadow-indigo-200 dark:shadow-indigo-900/30"
                        >
                            Open Settings → SMS <ChevronRight size={14} aria-hidden="true" />
                        </button>
                    </div>
                    <p className="text-[10px] text-slate-400 text-center mt-3">
                        Navigate to Admin → Settings → SMS → A2P 10DLC Registration tab
                    </p>
                </div>
            </div>
        );
    }

    if (showSetup) {
        return (
            <SmsSetupWizard
                churchId={churchId}
                church={church}
                onBack={() => setShowSetup(false)}
                onComplete={() => {
                    setShowSetup(false);
                    if (onUpdateChurch) onUpdateChurch({ smsSettings: { ...church.smsSettings, smsEnabled: true } });
                }}
                termsAcceptedAt={church.smsSettings?.termsAcceptedAt}
                currentUserId={currentUser.id}
            />
        );
    }

    const filteredCampaigns = activeNumberId
        ? campaigns.filter(c => !c.twilioNumberId || c.twilioNumberId === activeNumberId)
        : campaigns;

    const hasPillNav = !controlledTab;
    const hasNumberSelector = !hideNumberSelector && smsEnabled && visibleNumbers.length > 0;
    const hasFallbackBadge = !!(!activeCampaign && controlledTab && visibleNumbers.length === 0 && church.smsSettings?.twilioSubAccountSid && church.smsSettings?.twilioPhoneNumber);
    const showTopSection = !activeCampaign && (hasPillNav || hasNumberSelector || hasFallbackBadge);

    return (
        <div className="flex flex-col h-full">
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {showTopSection && (
                <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 px-4 md:px-6 pt-3 pb-3 shrink-0 ${controlledTab ? 'border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20' : ''}`}>
                    {!controlledTab && (
                        <ToolTabs
                            ariaLabel="SMS sections"
                            className="w-full md:w-auto"
                            value={effectiveTab as string}
                            onChange={key => setActiveTab(key as any)}
                            tabs={([
                                { key: 'campaigns', label: 'Broadcast', icon: MessageSquare, perm: 'broadcastUserIds' },
                                { key: 'workflows', label: 'Workflows', icon: Zap, perm: 'broadcastUserIds' },
                                { key: 'inbox', label: 'Inbox', icon: Inbox, perm: 'inboxUserIds' },
                                { key: 'keywords', label: 'Keywords', icon: Key, perm: 'keywordsUserIds' },
                                { key: 'analytics', label: 'Analytics', icon: BarChart3, perm: 'analyticsUserIds' },
                                { key: 'agent', label: 'AI Agent', icon: Sparkles, perm: 'aiAgentUserIds' },
                            ] as const)
                                .filter(t => canUserUseFeature(activeNumber, currentUser, t.perm as any))
                                .concat((Boolean(church.voiceAddOn?.enabled) || visibleNumbers.some(n => n.voiceEnabled)) ? [{ key: 'phone', label: 'Phone', icon: Phone, perm: 'inboxUserIds' } as any] : [])
                                .concat((currentUser.roles?.includes('Church Admin') || currentUser.roles?.includes('System Administration')) ? [{ key: 'permissions', label: 'Permissions', icon: Shield, perm: 'broadcastUserIds' } as any] : [])
                                .map(t => ({ value: t.key as string, label: t.label, icon: t.icon }))}
                        />
                    )}
                    {!hideNumberSelector && smsEnabled && visibleNumbers.length > 0 ? (
                        <div className="flex items-center gap-2 shrink-0">
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                                    <Phone size={12} />
                                </div>
                                <select
                                    value={activeNumberId || ''}
                                    onChange={e => setActiveNumberId(e.target.value)}
                                    title="Active Phone Number"
                                    className="appearance-none text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-8 pr-8 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                                >
                                    {visibleNumbers.map(num => (
                                        <option key={num.id} value={num.id}>
                                            {num.friendlyLabel} - {formatPhone(num.phoneNumber)} {num.isDefault ? '(Default)' : ''}
                                        </option>
                                    ))}
                                </select>
                                <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-slate-400">
                                    <ChevronDown size={12} />
                                </div>
                            </div>
                            {(currentUser.roles?.includes('Church Admin') || currentUser.roles?.includes('System Administration')) && (
                                <button
                                    onClick={() => setShowNumberManager(true)}
                                    className="p-1.5 rounded-xl text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition border border-transparent hover:border-slate-200 dark:hover:border-slate-700 bg-white dark:bg-slate-900 shadow-sm"
                                    title="Manage Numbers"
                                >
                                    <Settings size={14} />
                                </button>
                            )}
                        </div>
                    ) : (
                        !activeCampaign && controlledTab && visibleNumbers.length === 0 && church.smsSettings?.twilioSubAccountSid && church.smsSettings?.twilioPhoneNumber && (
                            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-full px-3 py-1.5 shrink-0">
                                <Phone size={12} />
                                {formatPhone(church.smsSettings.twilioPhoneNumber)}
                                <span className="text-[10px] opacity-70">• SMS Active</span>
                            </div>
                        )
                    )}
                </div>
            )}

            <div className="flex-1 overflow-hidden">
                {effectiveTab === 'campaigns' && !activeCampaign && (
                    <div className="h-full overflow-y-auto">
                        {!canUserUseFeature(activeNumber, currentUser, 'broadcastUserIds') ? (
                            <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-500">Access Restricted</div>
                        ) : (
                            <CampaignList
                                campaigns={filteredCampaigns}
                                isLoading={isLoading}
                                onOpen={c => setActiveCampaign(c)}
                                onDelete={handleDelete}
                                onDuplicate={handleDuplicate}
                                onCreate={handleCreate}
                            />
                        )}
                    </div>
                )}

                {effectiveTab === 'campaigns' && activeCampaign && (
                    <div className="h-full">
                        {!canUserUseFeature(activeNumber, currentUser, 'broadcastUserIds') ? (
                            <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-500">Access Restricted</div>
                        ) : (
                            <CampaignComposer
                                campaign={activeCampaign}
                                churchId={churchId}
                                currentUser={currentUser}
                                church={church}
                                apiBase={API_BASE}
                                onBack={() => setActiveCampaign(null)}
                                onSave={handleSave}
                                onSend={handleSendNow}
                                onSchedule={handleSchedule}
                                onCancelSchedule={handleCancelSchedule}
                                isSending={isSending}
                            />
                        )}
                    </div>
                )}

                {effectiveTab === 'inbox' && (
                    <div className="h-full flex flex-col min-h-0">
                        {!canUserUseFeature(activeNumber, currentUser, 'inboxUserIds') ? (
                            <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-500">Access Restricted</div>
                        ) : (
                            <SmsInbox
                                churchId={churchId}
                                currentUser={currentUser}
                                church={church}
                                activeNumber={activeNumber}
                                twilioNumberId={activeNumberId}
                                isDefaultNumber={activeNumber?.isDefault ?? false}
                                allowedNumberIds={visibleNumbers.map(n => n.id)}
                                defaultNumberId={twilioNumbers.find(n => n.isDefault)?.id}
                            />
                        )}
                    </div>
                )}

                {effectiveTab === 'phone' && (
                    <div className="h-full min-h-0">
                        <VoiceDialerView
                            churchId={churchId}
                            church={church}
                            activeNumber={activeNumber}
                            visibleNumbers={visibleNumbers}
                        />
                    </div>
                )}

                {effectiveTab === 'keywords' && (
                    <div className="h-full overflow-y-auto">
                        {!canUserUseFeature(activeNumber, currentUser, 'keywordsUserIds') ? (
                            <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-500">Access Restricted</div>
                        ) : (
                            <SmsKeywordsManager
                                churchId={churchId}
                                church={church}
                                currentUser={currentUser}
                                twilioNumberId={activeNumberId}
                                activeNumber={activeNumber}
                                onUpdateChurch={onUpdateChurch}
                            />
                        )}
                    </div>
                )}

                {effectiveTab === 'workflows' && (
                    <div className="h-full overflow-y-auto">
                        {!canUserUseFeature(activeNumber, currentUser, 'broadcastUserIds') ? (
                            <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-500">Access Restricted</div>
                        ) : (
                            <SmsWorkflowsManager churchId={churchId} />
                        )}
                    </div>
                )}

                {effectiveTab === 'analytics' && (
                    <div className="h-full overflow-y-auto">
                        {!canUserUseFeature(activeNumber, currentUser, 'analyticsUserIds') ? (
                            <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-500">Access Restricted</div>
                        ) : (
                            <SmsAnalytics churchId={churchId} campaigns={filteredCampaigns} smsNumberId={activeNumberId} />
                        )}
                    </div>
                )}

                {effectiveTab === 'agent' && (
                    <div className="h-full overflow-y-auto">
                        {!canUserUseFeature(activeNumber, currentUser, 'aiAgentUserIds') ? (
                            <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-500">Access Restricted</div>
                        ) : (
                            <SmsAgentTab
                                churchId={churchId}
                                church={church}
                                currentUser={currentUser}
                                onUpdateChurch={onUpdateChurch}
                                numbers={visibleNumbers}
                                activeNumberId={activeNumberId}
                            />
                        )}
                    </div>
                )}

                {effectiveTab === 'files' && (
                    <div className="h-full overflow-y-auto">
                        <FileManager
                            churchId={churchId}
                            currentUser={currentUser}
                            church={church}
                        />
                    </div>
                )}

                {effectiveTab === 'permissions' && (
                    <div className="h-full overflow-y-auto">
                        {!(currentUser.roles?.includes('Church Admin') || currentUser.roles?.includes('System Administration')) ? (
                            <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-500">Access Restricted</div>
                        ) : (
                            <BroadcastPermissionsTab
                                churchId={churchId}
                                church={church}
                                currentUser={currentUser}
                                allUsers={allUsers}
                                onUpdateChurch={onUpdateChurch}
                            />
                        )}
                    </div>
                )}
            </div>

            {showNumberManager && (
                <NumberManager
                    churchId={churchId}
                    church={church}
                    currentUser={currentUser}
                    numbers={twilioNumbers}
                    allUsers={allUsers}
                    onClose={() => setShowNumberManager(false)}
                    onAddNumber={() => { setShowNumberManager(false); setShowAddNumber(true); }}
                />
            )}

            {showAddNumber && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-2">
                                <PlusCircle size={16} className="text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
                                <h2 className="text-base font-black text-slate-900 dark:text-white">Add Phone Number</h2>
                            </div>
                            <button onClick={() => setShowAddNumber(false)} title="Close" className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition">
                                <X size={16} />
                            </button>
                        </div>
                        <SmsSetupWizard
                            churchId={churchId}
                            church={church}
                            onBack={() => setShowAddNumber(false)}
                            onComplete={() => {
                                setShowAddNumber(false);
                                setShowNumberManager(true);
                                showToast('New number added!');
                            }}
                            mode="add-number"
                            currentUserId={currentUser.id}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default MessagingModule;
