
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, Church, RiskSettings, ChurchRiskSettings, DonorLifecycleSettings, GroupRiskSettings, CommunityLocation, UserRole, PortingRequest } from '../types';
import { CreateUserModal } from './CreateUserModal';
import { firestore } from '../services/firestoreService';
import { auth, db as firebaseDb, storage } from '../services/firebase';
import { setDoc, doc, collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import RiskSettingsView from './RiskSettingsView';
import ChurchRiskSettingsView from './ChurchRiskSettingsView';
import GroupRiskSettingsView from './GroupRiskSettingsView';
import DonorLifecycleSettingsView from './DonorLifecycleSettingsView';
import { SubscriptionSettingsView } from './SubscriptionSettingsView';
import { ALL_WIDGETS } from '../constants/widgetRegistry';
import { PLANS } from '../services/stripeService';
import { pcoService } from '../services/pcoService';

// ─── Pastoral Care Tab Setup Wizard ──────────────────────────────────────────
//
// Guides a church admin through the one-time manual steps required to enable
// the "Pastoral Care" tab in Planning Center People. Polls the PCO API via the
// backend proxy to detect when each step is complete, updating status badges live.
//
const API_BASE = process.env.NODE_ENV === 'production'
    ? 'https://pastoralcare.barnabassoftware.com'
    : 'http://localhost:8080';

type StepStatus = 'pending' | 'checking' | 'done' | 'error';

const PastoralCareTabSetupWizard: React.FC<{
    churchId: string;
    church: Church;
    onFieldConfigSaved?: () => void;
}> = ({ churchId, church, onFieldConfigSaved }) => {
    const [tabStatus,   setTabStatus]   = React.useState<StepStatus>('pending');
    const [fieldStatus, setFieldStatus] = React.useState<StepStatus>('pending');
    const [isExpanded,  setIsExpanded]  = React.useState(false);
    const [isChecking,  setIsChecking]  = React.useState(false);
    const [lastChecked, setLastChecked] = React.useState<number | null>(null);
    const [checkError,  setCheckError]  = React.useState<string | null>(null);

    // Overall status derived from tab + field
    const isFullyReady = tabStatus === 'done' && fieldStatus === 'done';
    const isPartiallyDone = tabStatus === 'done' || fieldStatus === 'done';

    // Read previously cached field config from Firestore
    useEffect(() => {
        const cfg = (church as any).pcoFieldConfig || {};
        if (cfg.smsSubscriptionsFieldId) {
            setTabStatus('done');
            setFieldStatus('done');
        }
    }, [church]);

    const handleCheck = React.useCallback(async () => {
        if (isChecking) return;
        setIsChecking(true);
        setCheckError(null);
        try {
            // Call the backend proxy — it has the PCO OAuth token
            const res = await fetch(`${API_BASE}/api/pco/check-pastoral-care-tab`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ churchId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Status ${res.status}`);

            setTabStatus(data.tabFound   ? 'done' : 'error');
            setFieldStatus(data.fieldFound ? 'done' : 'error');
            setLastChecked(Date.now());

            // If both found and field ID returned, persist to Firestore so future checks skip discovery
            if (data.tabFound && data.fieldFound && data.smsFieldDefId) {
                await firestore.updateChurch(churchId, {
                    'pcoFieldConfig.smsSubscriptionsFieldId': data.smsFieldDefId,
                    ...(data.dateFieldDefId ? { 'pcoFieldConfig.lastKeywordMatchFieldId': data.dateFieldDefId } : {}),
                } as any);
                onFieldConfigSaved?.();
            }
        } catch (e: any) {
            setCheckError(e.message || 'Check failed');
            setTabStatus('error');
            setFieldStatus('error');
        } finally {
            setIsChecking(false);
        }
    }, [churchId, isChecking, onFieldConfigSaved]);

    const StatusBadge: React.FC<{ status: StepStatus; label: string }> = ({ status, label }) => {
        const configs = {
            pending: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-500 dark:text-slate-400', dot: 'bg-slate-300', label: 'Not checked' },
            checking:{ bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-400', label: 'Checking…' },
            done:    { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500', label: 'Found ✓' },
            error:   { bg: 'bg-rose-50 dark:bg-rose-900/20', text: 'text-rose-700 dark:text-rose-400', dot: 'bg-rose-400', label: 'Not found' },
        };
        const c = configs[status];
        return (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl ${c.bg}`}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot} ${status === 'checking' ? 'animate-pulse' : ''}`} />
                <span className={`text-[10px] font-black uppercase tracking-widest ${c.text}`}>{label}</span>
                <span className={`text-[10px] font-semibold ${c.text} ml-1`}>{c.label}</span>
            </div>
        );
    };

    return (
        <div className={`mt-8 rounded-[2rem] border-2 transition-all ${
            isFullyReady
                ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10'
                : 'border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-900/10'
        }`}>
            {/* Header */}
            <button
                onClick={() => setIsExpanded(v => !v)}
                className="w-full flex items-center gap-4 p-6 text-left"
            >
                {/* Icon */}
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 ${
                    isFullyReady ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-violet-100 dark:bg-violet-900/40'
                }`}>
                    {isFullyReady ? '✅' : '🏷️'}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-black text-slate-900 dark:text-white">
                            Pastoral Care Tab Setup
                        </p>
                        {isFullyReady ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                                ✓ Ready
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-violet-600 text-white">
                                {isPartiallyDone ? '⚠ Partial' : 'Setup Required'}
                            </span>
                        )}
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                        {isFullyReady
                            ? 'SMS keyword subscriptions will automatically update PCO profiles.'
                            : 'One-time setup in Planning Center — creates the checkbox field for SMS subscriptions.'}
                    </p>
                </div>

                <svg
                    className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Expanded content */}
            {isExpanded && (
                <div className="px-6 pb-6 border-t border-violet-100 dark:border-violet-900/40">

                    {/* Step list */}
                    <div className="mt-5 space-y-4">

                        {/* Step 1 */}
                        <div className="flex gap-4 items-start">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 mt-0.5 ${
                                tabStatus === 'done' ? 'bg-emerald-500 text-white' : 'bg-violet-200 dark:bg-violet-800 text-violet-700 dark:text-violet-300'
                            }`}>{tabStatus === 'done' ? '✓' : '1'}</div>
                            <div className="flex-1">
                                <p className="text-sm font-bold text-slate-900 dark:text-white">Create the "Pastoral Care" tab</p>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                    In Planning Center → <strong>People</strong> → click the <strong>⚙ gear icon</strong> (top right) → <strong>Customize Fields</strong> → click <strong>+ Add Tab</strong> and name it exactly:
                                </p>
                                <code className="inline-block mt-2 px-3 py-1.5 bg-slate-900 text-emerald-400 text-xs font-mono rounded-xl">Pastoral Care</code>
                                <div className="mt-2">
                                    <StatusBadge status={tabStatus} label="Tab" />
                                </div>
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="flex items-center gap-3 pl-3.5">
                            <div className="w-px h-6 bg-violet-200 dark:bg-violet-800 ml-3" />
                        </div>

                        {/* Step 2 */}
                        <div className="flex gap-4 items-start">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 mt-0.5 ${
                                fieldStatus === 'done' ? 'bg-emerald-500 text-white' : 'bg-violet-200 dark:bg-violet-800 text-violet-700 dark:text-violet-300'
                            }`}>{fieldStatus === 'done' ? '✓' : '2'}</div>
                            <div className="flex-1">
                                <p className="text-sm font-bold text-slate-900 dark:text-white">Add the "SMS Subscriptions" checkbox field</p>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                    Under the <strong>Pastoral Care</strong> tab → click <strong>+ Add Field</strong> → choose type <strong>Checkboxes</strong> → name it exactly:
                                </p>
                                <code className="inline-block mt-2 px-3 py-1.5 bg-slate-900 text-emerald-400 text-xs font-mono rounded-xl">SMS Subscriptions</code>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 leading-relaxed">
                                    Leave the checkbox options blank — the app creates them automatically when keywords match.
                                </p>
                                <div className="mt-2">
                                    <StatusBadge status={fieldStatus} label="Field" />
                                </div>
                            </div>
                        </div>

                        {/* Step 3 — Optional date field */}
                        <div className="flex items-center gap-3 pl-3.5">
                            <div className="w-px h-6 bg-violet-200 dark:bg-violet-800 ml-3" />
                        </div>
                        <div className="flex gap-4 items-start">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 mt-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500">
                                3
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-bold text-slate-900 dark:text-white">
                                    (Optional) Add a "Last Keyword Match" date field
                                </p>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                    Same tab → <strong>+ Add Field</strong> → type <strong>Date</strong> → name it exactly:
                                </p>
                                <code className="inline-block mt-2 px-3 py-1.5 bg-slate-900 text-emerald-400 text-xs font-mono rounded-xl">Last Keyword Match</code>
                                <p className="text-[10px] text-slate-400 mt-1.5">Tracks when this person last texted a keyword — useful for filtering in PCO.</p>
                            </div>
                        </div>
                    </div>

                    {/* PCO deep link */}
                    <div className="mt-6 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-violet-100 dark:border-violet-800 flex items-center gap-3">
                        <div className="text-xl">🔗</div>
                        <div className="flex-1">
                            <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Open Planning Center People Settings</p>
                            <p className="text-[9px] text-slate-400">Navigate there, then follow Steps 1 and 2 above.</p>
                        </div>
                        <a
                            href="https://people.planningcenteronline.com/field_definitions"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-black rounded-xl transition uppercase tracking-widest"
                        >
                            Open PCO
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                        </a>
                    </div>

                    {/* Check button + feedback */}
                    <div className="mt-5 flex items-center gap-3 flex-wrap">
                        <button
                            onClick={handleCheck}
                            disabled={isChecking || !church.pcoConnected}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition"
                        >
                            {isChecking ? (
                                <>
                                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                    </svg>
                                    Checking…
                                </>
                            ) : (
                                <>
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Check Status
                                </>
                            )}
                        </button>

                        {!church.pcoConnected && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                                ⚠ Connect Planning Center first to verify status.
                            </span>
                        )}

                        {lastChecked && !isChecking && (
                            <span className="text-[10px] text-slate-400">
                                Last checked: {new Date(lastChecked).toLocaleTimeString()}
                            </span>
                        )}

                        {checkError && (
                            <span className="text-[10px] text-rose-500 font-bold">
                                ⚠ {checkError}
                            </span>
                        )}
                    </div>

                    {/* Success banner */}
                    {isFullyReady && (
                        <div className="mt-5 flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl">
                            <div className="text-2xl">🎉</div>
                            <div>
                                <p className="text-sm font-black text-emerald-700 dark:text-emerald-300">All set! Pastoral Care tab is live.</p>
                                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                                    SMS keyword matches will now automatically check the box on each person's PCO profile.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

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
                            <p><strong>Carrier Compliance.</strong> Your church is responsible for sending only to recipients who have opted in to receive messages. Barnabas Software routes SMS through SignalWire under its platform account. You represent that your use complies with TCPA and all applicable carrier requirements.</p>
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
                            <p><strong>Data We Collect.</strong> To provide SMS services, we collect and process: phone numbers of message recipients, message content, delivery status events, and opt-out records.</p>
                            <p><strong>How We Use Data.</strong> Recipient phone numbers and message content are used solely to deliver messages on your church's behalf. We do not sell, rent, or share this data with third parties except as required to operate the service.</p>
                            <p><strong>SignalWire.</strong> Messages are routed through SignalWire, Inc. By using this service, your data is also subject to SignalWire's Privacy Policy. SignalWire acts as a data processor on your behalf.</p>
                            <p><strong>Your Responsibilities.</strong> As the data controller for your congregation's contact information, you are responsible for maintaining a lawful basis for processing and complying with applicable privacy laws such as CCPA.</p>
                        </div>
                    </section>

                    <div className="border-t border-slate-100 dark:border-slate-800" />

                    <section>
                        <h3 className="text-sm font-black text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                            <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px] font-black">3</span>
                            Messaging Compliance Acknowledgment
                        </h3>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                            <li>You are an authorized representative of the church with authority to activate commercial texting services.</li>
                            <li>Your church will only send messages to recipients who have <strong>explicitly opted in</strong> and will honor all STOP requests immediately.</li>
                            <li>You understand that carrier delivery is not guaranteed and message filtering may occur.</li>
                            <li>You will promptly remove opted-out contacts and maintain accurate opt-in records.</li>
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

// ─── Port-In Request Modal ────────────────────────────────────────────────────

type PortInFormData = Omit<PortingRequest, 'id' | 'churchId' | 'submittedByUserId' | 'submittedByName' | 'submittedAt' | 'status' | 'destinationProjectId' | 'attachmentUrls'>;

const EMPTY_FORM: PortInFormData = {
    contactName: '',
    contactEmail: '',
    numbersToPort: '',
    servicesToPort: 'voice_and_messaging',
    providerName: '',
    providerAccountNumber: '',
    accountType: 'Business',
    campaignId: '',
    authorizedName: '',
    billingPhone: '',
    endUserName: '',
    serviceAddress: '',
    pin: '',
};

const PortInRequestModal: React.FC<{
    churchId: string;
    church: Church;
    currentUser: User;
    onClose: () => void;
}> = ({ churchId, church, currentUser, onClose }) => {
    const [step, setStep]                         = useState<1 | 2 | 3 | 4>(1);
    const [form, setForm]                         = useState<PortInFormData>(EMPTY_FORM);
    const [files, setFiles]                       = useState<File[]>([]);
    const [destProjectId, setDestProjectId]       = useState('');
    const [submitting, setSubmitting]             = useState(false);
    const [submitted, setSubmitted]               = useState(false);
    const [error, setError]                       = useState<string | null>(null);
    const [uploadProgress, setUploadProgress]     = useState<number>(0);
    const fileInputRef                            = useRef<HTMLInputElement>(null);

    // Auto-load SignalWire project ID from system settings
    useEffect(() => {
        firestore.getSystemSettings().then(s => {
            setDestProjectId((s as any).signalwireProjectId || '');
        }).catch(() => {});
    }, []);

    const set = (key: keyof PortInFormData, value: string) =>
        setForm(prev => ({ ...prev, [key]: value }));

    const addFiles = (incoming: FileList | null) => {
        if (!incoming) return;
        const allowed = ['application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg', 'image/jpg', 'image/png'];
        const valid = Array.from(incoming).filter(f => {
            if (f.size > 20 * 1024 * 1024) { alert(`"${f.name}" exceeds the 20 MB limit.`); return false; }
            if (!allowed.includes(f.type))  { alert(`"${f.name}" is not a supported format. Use PDF, DOC, DOCX, JPG, or PNG.`); return false; }
            return true;
        });
        setFiles(prev => [...prev, ...valid]);
    };

    const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));

    // Step validation
    const step1Valid = form.contactName.trim() && form.contactEmail.trim() && form.numbersToPort.trim();
    const step2Valid = form.providerName.trim() && form.providerAccountNumber.trim() && form.accountType && form.campaignId.trim();
    const step3Valid = form.authorizedName.trim() && form.billingPhone.trim() && form.endUserName.trim() && form.serviceAddress.trim() && form.pin.trim();
    const step4Valid = files.length > 0;

    const handleSubmit = async () => {
        if (!step4Valid) { setError('Please upload at least one document (LOA and/or recent bill copy).'); return; }
        setSubmitting(true);
        setError(null);
        try {
            const requestId = `${churchId}_${Date.now()}`;

            // Upload files to Firebase Storage
            const attachmentUrls: string[] = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const filePath = `porting-requests/${churchId}/${requestId}/${file.name}`;
                const storageRef = ref(storage, filePath);
                await uploadBytes(storageRef, file);
                const url = await getDownloadURL(storageRef);
                attachmentUrls.push(url);
                setUploadProgress(Math.round(((i + 1) / files.length) * 100));
            }

            // Write Firestore document
            const payload: Omit<PortingRequest, 'id'> = {
                churchId,
                submittedByUserId: currentUser.id,
                submittedByName: currentUser.name || currentUser.email || 'Unknown',
                submittedAt: Date.now(),
                status: 'pending',
                ...form,
                destinationProjectId: destProjectId,
                attachmentUrls,
            };
            await addDoc(collection(firebaseDb, 'portingRequests'), payload);
            setSubmitted(true);
        } catch (e: any) {
            setError(e.message || 'Submission failed. Please try again.');
        } finally {
            setSubmitting(false);
            setUploadProgress(0);
        }
    };

    // Shared styles
    const inputCn  = 'w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors';
    const labelCn  = 'block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-1.5';
    const sectionCn = 'space-y-5';

    const STEPS = ['Contact & Numbers', 'Current Provider', 'Account Details', 'Documents & Submit'];

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-8 pt-8 pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <div>
                        <h2 className="text-xl font-black text-slate-900 dark:text-white">📲 Port a Phone Number</h2>
                        <p className="text-[11px] text-slate-400 mt-1">Submit a porting request to transfer your existing number to our service.</p>
                    </div>
                    {!submitting && (
                        <button onClick={onClose} title="Close" className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    )}
                </div>

                {/* Progress steps */}
                {!submitted && (
                    <div className="px-8 py-4 flex items-center gap-1 shrink-0">
                        {STEPS.map((label, i) => {
                            const n = i + 1;
                            const isActive = n === step;
                            const isDone   = n < step;
                            return (
                                <React.Fragment key={n}>
                                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black transition-all ${
                                        isActive ? 'bg-indigo-600 text-white' :
                                        isDone   ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300' :
                                                   'bg-slate-100 dark:bg-slate-800 text-slate-400'
                                    }`}>
                                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black ${
                                            isActive ? 'bg-white/30 text-white' :
                                            isDone   ? 'bg-indigo-200 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-200' :
                                                       'bg-slate-200 dark:bg-slate-700 text-slate-500'
                                        }`}>{isDone ? '✓' : n}</span>
                                        <span className="hidden sm:inline">{label}</span>
                                    </div>
                                    {i < STEPS.length - 1 && <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />}
                                </React.Fragment>
                            );
                        })}
                    </div>
                )}

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-8 py-4">

                    {/* ── Success screen ── */}
                    {submitted && (
                        <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
                            <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-4xl">✅</div>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white">Request Submitted!</h3>
                            <p className="text-sm text-slate-500 max-w-md">Your number porting request has been received. Our team will review it and follow up with you by email within 2–5 business days.</p>
                            <button onClick={onClose} className="mt-4 px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black rounded-2xl transition">Done</button>
                        </div>
                    )}

                    {/* ── Step 1: Contact & Numbers ── */}
                    {!submitted && step === 1 && (
                        <div className={sectionCn}>
                            <div>
                                <label className={labelCn}>Contact Name <span className="text-rose-500">*</span></label>
                                <input type="text" value={form.contactName} onChange={e => set('contactName', e.target.value)}
                                    className={inputCn} placeholder="Jane Smith" />
                                <p className="text-[10px] text-slate-400 mt-1.5">Person at your church requesting this port-in.</p>
                            </div>
                            <div>
                                <label className={labelCn}>Contact Email <span className="text-rose-500">*</span></label>
                                <input type="email" value={form.contactEmail} onChange={e => set('contactEmail', e.target.value)}
                                    className={inputCn} placeholder="jane@church.org" />
                            </div>
                            <div>
                                <label className={labelCn}>Numbers to Port <span className="text-rose-500">*</span></label>
                                <textarea value={form.numbersToPort} onChange={e => set('numbersToPort', e.target.value)}
                                    rows={4} className={inputCn} placeholder="+15551234567&#10;+15559876543" />
                                <p className="text-[10px] text-slate-400 mt-1.5">Enter one number per line or separate with commas. Include the country code (+1 for US).</p>
                            </div>
                            <div>
                                <label className={labelCn}>Services to Port <span className="text-rose-500">*</span></label>
                                <select value={form.servicesToPort} onChange={e => set('servicesToPort', e.target.value as any)} className={inputCn} title="Services to port">
                                    <option value="voice_and_messaging">Voice &amp; Messaging</option>
                                    <option value="messaging_only">Messaging Only</option>
                                    <option value="voice_only">Voice Only</option>
                                </select>
                                <p className="text-[10px] text-slate-400 mt-1.5">⚠ Toll-free numbers default to Voice Only unless messaging verification is provided. Mobile numbers cannot have messaging split from their carrier.</p>
                            </div>
                        </div>
                    )}

                    {/* ── Step 2: Current Provider ── */}
                    {!submitted && step === 2 && (
                        <div className={sectionCn}>
                            {/* TextInChurch tip — always shown */}
                            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-5">
                                <div className="flex items-start gap-3">
                                    <span className="text-xl shrink-0">📋</span>
                                    <div className="space-y-2">
                                        <p className="text-[11px] font-black text-amber-900 dark:text-amber-200 uppercase tracking-widest">Coming from TextInChurch?</p>
                                        <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                                            TextInChurch uses Twilio as their carrier backend. To port your number, you'll need to <strong>contact TextInChurch support</strong> and request your <strong>Customer Service Record (CSR)</strong>. They can provide your Account Number, PIN, and the service address on file.
                                        </p>
                                        <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed">
                                            <strong>Twilio's address on file (for reference):</strong><br />
                                            Twilio Inc · 548 Market St #14510 · San Francisco, CA 94104<br />
                                            PIN: 4-digit number set on your Twilio sub-account
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className={labelCn}>Current Provider Name <span className="text-rose-500">*</span></label>
                                <input type="text" value={form.providerName} onChange={e => set('providerName', e.target.value)}
                                    className={inputCn} placeholder="e.g. TextInChurch, Verizon, AT&T" />
                            </div>
                            <div>
                                <label className={labelCn}>Current Provider Account Number <span className="text-rose-500">*</span></label>
                                <input type="text" value={form.providerAccountNumber} onChange={e => set('providerAccountNumber', e.target.value)}
                                    className={inputCn} placeholder="Enter account number or N/A" />
                                <p className="text-[10px] text-slate-400 mt-1.5">Some carriers require the account number when accepting port requests. Enter "N/A" if not available.</p>
                            </div>
                            <div>
                                <label className={labelCn}>Account Type <span className="text-rose-500">*</span></label>
                                <select value={form.accountType} onChange={e => set('accountType', e.target.value as any)} className={inputCn} title="Account type">
                                    <option value="Business">Business</option>
                                    <option value="Residential">Residential</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelCn}>10DLC Campaign ID <span className="text-rose-500">*</span></label>
                                <input type="text" value={form.campaignId} onChange={e => set('campaignId', e.target.value)}
                                    className={inputCn} placeholder="e.g. CXXXXXX or N/A" />
                                <p className="text-[10px] text-slate-400 mt-1.5">Required for messaging services. Enter "N/A" if not applicable.</p>
                            </div>
                        </div>
                    )}

                    {/* ── Step 3: Account Details ── */}
                    {!submitted && step === 3 && (
                        <div className={sectionCn}>
                            <div>
                                <label className={labelCn}>Authorized Name on Account <span className="text-rose-500">*</span></label>
                                <input type="text" value={form.authorizedName} onChange={e => set('authorizedName', e.target.value)}
                                    className={inputCn} placeholder="Legal first and last name" />
                                <p className="text-[10px] text-slate-400 mt-1.5">Must be the legal first and last name — not a business or corporation name.</p>
                            </div>
                            <div>
                                <label className={labelCn}>Billing Phone Number <span className="text-rose-500">*</span></label>
                                <input type="text" value={form.billingPhone} onChange={e => set('billingPhone', e.target.value)}
                                    className={inputCn} placeholder="+15551234567" />
                                <p className="text-[10px] text-slate-400 mt-1.5">Primary contact phone on record with your current provider.</p>
                            </div>
                            <div>
                                <label className={labelCn}>End User / Business Name <span className="text-rose-500">*</span></label>
                                <input type="text" value={form.endUserName} onChange={e => set('endUserName', e.target.value)}
                                    className={inputCn} placeholder="Grace Community Church" />
                                <p className="text-[10px] text-slate-400 mt-1.5">The business name associated with this number at your current provider.</p>
                            </div>
                            <div>
                                <label className={labelCn}>Phone Service Address <span className="text-rose-500">*</span></label>
                                <textarea value={form.serviceAddress} onChange={e => set('serviceAddress', e.target.value)}
                                    rows={3} className={inputCn} placeholder="123 Main St, City, State, ZIP" />
                                <p className="text-[10px] text-slate-400 mt-1.5">Location where phone calls take place — may differ from your billing address. If unsure, request a CSR from your provider. Only one service address per port order.</p>
                            </div>
                            <div>
                                <label className={labelCn}>PIN <span className="text-rose-500">*</span></label>
                                <input type="text" value={form.pin} onChange={e => set('pin', e.target.value)}
                                    className={inputCn} placeholder="4-digit PIN or N/A" maxLength={20} />
                                <p className="text-[10px] text-slate-400 mt-1.5">Required for Twilio, Verizon Wireless, MagicJack, and other carriers. Enter "N/A" if not applicable.</p>
                            </div>
                        </div>
                    )}

                    {/* ── Step 4: Documents & Submit ── */}
                    {!submitted && step === 4 && (
                        <div className={sectionCn}>
                            {/* Destination Project ID (read-only) */}
                            <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-5">
                                <label className={labelCn + ' text-indigo-600 dark:text-indigo-400'}>Destination Project ID (auto-filled)</label>
                                <div className="flex items-center gap-2">
                                    <input type="text" readOnly value={destProjectId || 'Loading…'}
                                        className="flex-1 bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-700 rounded-xl px-4 py-2.5 text-sm font-mono text-slate-700 dark:text-slate-300 outline-none cursor-default select-all"
                                        title="SignalWire Destination Project ID" />
                                    <button
                                        type="button"
                                        title="Copy project ID"
                                        onClick={() => { if (destProjectId) navigator.clipboard.writeText(destProjectId); }}
                                        className="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-900/60 transition"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                    </button>
                                </div>
                                <p className="text-[10px] text-indigo-600/70 dark:text-indigo-400/70 mt-1.5">This is your shared SignalWire project — automatically included in your request.</p>
                            </div>

                            {/* LOA / Bill Upload */}
                            <div>
                                <label className={labelCn}>Upload LOA &amp; Recent Bill Copy <span className="text-rose-500">*</span></label>
                                <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
                                    A signed <strong>Letter of Authorization (LOA)</strong> dated within the past 30 days is required. A <strong>recent bill copy</strong> from your current provider is also required to prevent unauthorized porting.
                                </p>

                                {/* Drop zone */}
                                <div
                                    className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-2xl p-8 flex flex-col items-center gap-3 text-center cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-all"
                                    onClick={() => fileInputRef.current?.click()}
                                    onDragOver={e => e.preventDefault()}
                                    onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
                                >
                                    <svg className="w-10 h-10 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                    <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Click to upload or drag &amp; drop</p>
                                    <p className="text-[10px] text-slate-400">PDF, DOC, DOCX, JPG, PNG — max 20 MB per file</p>
                                </div>
                                <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden"
                                    onChange={e => addFiles(e.target.files)} />

                                {/* File list */}
                                {files.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                        {files.map((f, i) => (
                                            <div key={i} className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                                                <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                <span className="flex-1 text-[11px] text-slate-700 dark:text-slate-300 truncate">{f.name} <span className="text-slate-400">({(f.size / 1024 / 1024).toFixed(1)} MB)</span></span>
                                                <button type="button" onClick={() => removeFile(i)} title="Remove file" className="text-slate-400 hover:text-rose-500 transition">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Upload progress */}
                                {submitting && uploadProgress > 0 && (
                                    <div className="mt-3">
                                        <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                                            <span>Uploading files…</span>
                                            <span>{uploadProgress}%</span>
                                        </div>
                                        <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                            <div className="h-full bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Error message */}
                            {error && (
                                <div className="p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl text-[11px] font-semibold text-rose-700 dark:text-rose-400 flex items-start gap-2">
                                    <span className="shrink-0">⚠️</span> {error}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {!submitted && (
                    <div className="px-8 py-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
                        <button
                            onClick={() => step > 1 ? setStep((step - 1) as any) : onClose()}
                            disabled={submitting}
                            className="px-6 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition disabled:opacity-50"
                        >
                            {step === 1 ? 'Cancel' : '← Back'}
                        </button>

                        {step < 4 ? (
                            <button
                                onClick={() => setStep((step + 1) as any)}
                                disabled={
                                    (step === 1 && !step1Valid) ||
                                    (step === 2 && !step2Valid) ||
                                    (step === 3 && !step3Valid)
                                }
                                className="px-8 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-black transition"
                            >
                                Next →
                            </button>
                        ) : (
                            <button
                                onClick={handleSubmit}
                                disabled={submitting || !step4Valid}
                                className="px-8 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-black transition flex items-center gap-2"
                            >
                                {submitting ? (
                                    <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Submitting…</>
                                ) : '✓ Submit Request'}
                            </button>
                        )}
                    </div>
                )}
            </div>
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
  const [activeTab, setActiveTab] = useState<'Team' | 'Organization' | 'Planning Center' | 'Community' | 'Widget Directory' | 'Risk Profiles' | 'Subscription' | 'Mail Settings' | 'SMS' | 'Grow Integration'>('Team');

  // Delete Organization modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Mail Settings state
  const [mailWizardProvider, setMailWizardProvider] = useState<'sendgrid' | 'postmark'>('postmark');
  const [mailMode, setMailMode] = useState<'shared' | 'custom'>(church.emailSettings?.mode || 'shared');
  const [mailPrefix, setMailPrefix] = useState(church.emailSettings?.sharedPrefix || '');
  const [mailFromName, setMailFromName] = useState(church.emailSettings?.fromName || church.name || '');
  const [mailCustomDomain, setMailCustomDomain] = useState(church.emailSettings?.customDomain || '');
  const [mailCustomFromEmail, setMailCustomFromEmail] = useState(church.emailSettings?.fromEmail || '');
  const [mailCnameRecords, setMailCnameRecords] = useState<{ host: string; type: 'CNAME'; data: string }[]>(church.emailSettings?.cnameRecords || []);
  const [mailDnsRecords, setMailDnsRecords] = useState<{ host: string; type: 'CNAME' | 'TXT'; data: string; label?: string }[]>(church.emailSettings?.dnsRecords || []);
  const [mailDomainAuthId, setMailDomainAuthId] = useState<string>(church.emailSettings?.domainAuthId || '');
  const [mailDomainVerified, setMailDomainVerified] = useState(church.emailSettings?.domainVerified || false);
  const [mailAdditionalSenders, setMailAdditionalSenders] = useState<{name: string, email: string}[]>(church.emailSettings?.additionalSenders || []);
  const [isMailSaving, setIsMailSaving] = useState(false);
  const [mailMessage, setMailMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [mailDiagEmail, setMailDiagEmail] = useState('');
  const [mailDiagChecks, setMailDiagChecks] = useState<{ label: string; status: 'pass' | 'fail' | 'warn'; detail: string }[] | null>(null);
  const [formData, setFormData] = useState<Partial<Church>>(church);

  // SMS Settings state
  const [smsSubTab, setSmsSubTab] = useState<'setup' | 'compliance' | 'numbers'>('setup');
  const [showPortInModal, setShowPortInModal] = useState(false);
  const [showRep2, setShowRep2] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set([1]));
  const toggleStep = (n: number) => setExpandedSteps(prev => {
    const next = new Set(prev);
    next.has(n) ? next.delete(n) : next.add(n);
    return next;
  });
  const [smsForm, setSmsForm] = useState<NonNullable<Church['smsSettings']>>(church.smsSettings || {});
  const [isSmsSaving, setIsSmsSaving] = useState(false);
  const [smsMessage, setSmsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);

  // SignalWire Compliance Wizard State
  const [brandForm, setBrandForm] = useState({
      legalName: church.name || '',
      ein: '',
      legalEntityType: 'NON_PROFIT',
      contactEmail: church.email || '',
      contactPhone: church.phone || '',
      website: church.website || '',
      address: church.address || '',
      city: church.city || '',
      state: church.state || '',
      zip: church.zip || ''
  });
  const [campaignForm, setCampaignForm] = useState({
      name: `${church.name || 'Church'} SMS`,
      usecase: 'MIXED',
      subUsecases: [] as string[],
      description: 'Sending updates, announcements, prayer requests, and volunteer scheduling to congregation members.',
      sample1: `Hi [Name], just a reminder that service times this Sunday are at 9am and 11am! - ${church.name || 'Church'}`,
      sample2: `We are looking for volunteers for the upcoming food drive. Reply YES if you can help! - ${church.name || 'Church'}`,
      sample3: '',
      sample4: '',
      sample5: '',
      messageFlow: `Members opt-in by filling out a physical or digital connect card explicitly agreeing to receive SMS updates, or by texting a keyword to the church's phone number.`,
      optOutMessage: church.smsSettings?.optOutMessage || 'Reply STOP to unsubscribe. Reply HELP for help.',
      optInMessage: church.smsSettings?.optInMessage || `Welcome back! You're subscribed again and will receive messages from us. Reply STOP at any time to unsubscribe.`,
      helpMessage: church.smsSettings?.helpMessage || `For assistance contact ${church.name || 'us'}. Reply STOP to unsubscribe.`,
      consentFormUrl: ''
  });
  const [isUploadingConsent, setIsUploadingConsent] = useState(false);
  const [regStatus, setRegStatus] = useState<any>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [isSubmittingBrand, setIsSubmittingBrand] = useState(false);
  const [isSubmittingCampaign, setIsSubmittingCampaign] = useState(false);
  const [complianceMessage, setComplianceMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [showBrandFormOverride, setShowBrandFormOverride] = useState(false);
  const [showCampaignFormOverride, setShowCampaignFormOverride] = useState(false);

  // Phone Numbers panel state (SMS → Numbers tab)
  const [smsNumbers, setSmsNumbers] = useState<any[]>([]);
  const [numLoading, setNumLoading] = useState(false);
  const [numError, setNumError] = useState('');
  const [numToast, setNumToast] = useState('');
  const [showAddNumber, setShowAddNumber] = useState(false);
  // Add-number wizard local state
  const [addNumStep, setAddNumStep] = useState<'search' | 'pick'>('search');
  const [addNumMode, setAddNumMode] = useState<'city-state' | 'area-code' | 'ported'>('city-state');
  const [addNumCity, setAddNumCity] = useState(church.city || '');
  const [addNumState, setAddNumState] = useState(church.state || '');
  const [addNumAreaCode, setAddNumAreaCode] = useState('');
  const [addNumPorted, setAddNumPorted] = useState('');
  const [addNumResults, setAddNumResults] = useState<{ phoneNumber: string; friendlyName: string; locality: string; region: string }[]>([]);
  const [addNumSelected, setAddNumSelected] = useState('');
  const [addNumLabel, setAddNumLabel] = useState('');
  const [addNumSender, setAddNumSender] = useState(church.name || '');
  const [addNumBusy, setAddNumBusy] = useState(false);
  // Per-number access management panel
  const [expandedNumId, setExpandedNumId] = useState<string | null>(null);
  const [numPermSaving, setNumPermSaving] = useState(false);
  const [numPermToast, setNumPermToast] = useState<{id: string; text: string} | null>(null);
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
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeMessage, setGeocodeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Grow Integration tab state (must be at top-level — cannot be inside an IIFE)
  const [growApproving, setGrowApproving] = useState(false);
  const [growMsg, setGrowMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
  useEffect(() => {
      if (smsSubTab !== 'numbers') return;
      setNumLoading(true);
      setNumError('');
      
      let unsubscribe: () => void;
      
      import('firebase/firestore').then(({ collection, query, where, orderBy, onSnapshot }) => {
          const q = query(
              collection(firebaseDb, 'smsNumbers'),
              where('churchId', '==', churchId),
              orderBy('createdAt', 'asc')
          );
          
          unsubscribe = onSnapshot(q, (snap) => {
              setSmsNumbers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
              setNumLoading(false);
          }, (e) => {
              setNumError(e.message || 'Failed to load numbers');
              setNumLoading(false);
          });
      });
      
      return () => {
          if (unsubscribe) unsubscribe();
      };
  }, [smsSubTab, churchId]);

  // Check A2P 10DLC Compliance status automatically when entering the SMS tab
  useEffect(() => {
      if (activeTab !== 'SMS') return;
      if (regStatus !== null) return; // Only fetch if we haven't yet

      const checkStatus = async () => {
          setIsCheckingStatus(true);
          setComplianceMessage(null);
          try {
              const res = await fetch(`/api/messaging/registration-status?churchId=${encodeURIComponent(churchId)}`);
              const data = await res.json();
              if (data.success) {
                  setRegStatus(data);
              } else {
                  setComplianceMessage({ type: 'error', text: data.error || 'Failed to get status' });
              }
          } catch (e: any) {
              setComplianceMessage({ type: 'error', text: e.message || 'Status check failed' });
          } finally {
              setIsCheckingStatus(false);
          }
      };
      
      checkStatus();
  }, [activeTab, churchId, regStatus]);


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
          setMailDnsRecords(es.dnsRecords || []);
          setMailDomainAuthId(es.domainAuthId || '');
          setMailDomainVerified(es.domainVerified || false);
          setMailAdditionalSenders(es.additionalSenders || []);
      }
  }, [church.emailSettings]);

  // Auto-fetch Postmark DNS records if they are missing but domain is registered
  useEffect(() => {
      const es = church.emailSettings;
      if (
          es &&
          es.mode === 'custom' &&
          es.postmarkDomainId &&
          (!es.dnsRecords || es.dnsRecords.length === 0) &&
          es.customDomain &&
          !isMailSaving
      ) {
          const autoFetch = async () => {
              setIsMailSaving(true);
              try {
                  const s = await firestore.getSystemSettings();
                  const apiBase = s.apiBaseUrl || 'https://pastoralcare.barnabassoftware.com';
                  const res = await fetch(`${apiBase}/email/authenticate-domain`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                          churchId,
                          domain: es.customDomain.trim().toLowerCase(),
                          fromEmail: es.fromEmail?.trim() || undefined,
                          fromName: es.fromName?.trim() || undefined,
                          provider: 'postmark',
                      }),
                  });
                  const data = await res.json();
                  if (res.ok) {
                      setMailDnsRecords(data.dnsRecords || data.cnameRecords || []);
                      if (onUpdateChurch) {
                          const fresh = await firestore.getChurch(churchId);
                          if (fresh) onUpdateChurch(fresh);
                      }
                  }
              } catch (e) {
                  console.error('Auto-fetching Postmark DNS records failed:', e);
              } finally {
                  setIsMailSaving(false);
              }
          };
          autoFetch();
      }
  }, [church.emailSettings, churchId, isMailSaving, onUpdateChurch]);

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
    'Groups', 'Giving', 'Finance', 'Pastoral Care', 'Metrics', 'Messaging',
    'Email', 'Polls', 'Workflows', 'Notes'
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
    'Email':                 'Access to the Email Editor and Campaigns',
    'Polls':                 'Create and manage interactive Polls',
    'Workflows':             'Configure automated Workflows',
    'Notes':                 'Access and manage pastoral Notes',
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
      if (deleteConfirmText !== 'DELETE') return;
      setIsDeleting(true);
      setDeleteError(null);
      try {
          const res = await fetch('/tenant/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ churchId, confirmationText: 'DELETE' }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Deletion failed');
          // Sign out immediately — auth user is gone
          await auth.signOut();
          window.location.href = '/';
      } catch (e: any) {
          console.error(e);
          setDeleteError(e.message || 'An unexpected error occurred.');
          setIsDeleting(false);
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

  // ── Grow Integration handlers (component-level so hooks are valid) ──────────
  const handleGrowApprove = async () => {
      if (!onUpdateChurch) return;
      const pendingRequest = church.growSettings?.growPendingRequest;
      setGrowApproving(true);
      setGrowMsg(null);
      try {
          const array = new Uint8Array(32);
          crypto.getRandomValues(array);
          const secret = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
          await onUpdateChurch({
              growSettings: {
                  ...church.growSettings,
                  growIntegrationSecret: secret,
                  growPendingRequest: { ...(pendingRequest as any), status: 'approved' },
              },
          });
          setGrowMsg({ type: 'success', text: 'Access approved! The Grow App will automatically receive the secret when it polls /api/integrations/grow/status.' });
      } catch (e: any) {
          setGrowMsg({ type: 'error', text: 'Failed to approve: ' + e.message });
      } finally {
          setGrowApproving(false);
      }
  };

  const handleGrowReject = async () => {
      if (!onUpdateChurch || !window.confirm('Reject the Grow App access request? The requesting app will be told it was rejected.')) return;
      const pendingRequest = church.growSettings?.growPendingRequest;
      await onUpdateChurch({
          growSettings: {
              ...church.growSettings,
              growPendingRequest: { ...(pendingRequest as any), status: 'rejected' },
          },
      });
  };

  const handleGrowRevoke = async () => {
      if (!onUpdateChurch || !window.confirm('Revoke Grow App access? The integration will stop working immediately.')) return;
      await onUpdateChurch({
          growSettings: {
              ...church.growSettings,
              growIntegrationSecret: undefined,
              growPendingRequest: null,
          },
      });
      setGrowMsg({ type: 'success', text: 'Access revoked. The Grow App can re-request access if needed.' });
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 animate-in fade-in">
        {/* Sidebar Navigation */}
        <div className="w-full lg:w-64 shrink-0 lg:sticky lg:top-24 h-fit space-y-8">
            <div>
                <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">Settings</h2>
                <p className="text-slate-400 dark:text-slate-500 font-medium uppercase text-[10px] tracking-widest mt-1">Manage & Configure</p>
            </div>
            
            <div className="flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-4 lg:pb-0 no-scrollbar border-b lg:border-b-0 border-slate-200 dark:border-slate-800">
                {['Team', 'Organization', 'Planning Center', 'Community', 'Mail Settings', 'SMS', 'Grow Integration', 'Widget Directory', 'Risk Profiles', 'Subscription'].map(tab => (
                    <button 
                        key={tab}
                        onClick={() => setActiveTab(tab as any)}
                        className={`text-left px-5 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                            activeTab === tab 
                            ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/30' 
                            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                        }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0 space-y-8">
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
                                aria-label="Church Name"
                                placeholder="First Baptist Church"
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
                                    aria-label="City"
                                    placeholder="Nashville"
                                    value={formData.city || ''}
                                    onChange={e => handleChange('city', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                                />
                            </div>
                            <div className="col-span-1">
                                <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-3">State</label>
                                <input 
                                    type="text" 
                                    aria-label="State"
                                    placeholder="TN"
                                    value={formData.state || ''}
                                    onChange={e => handleChange('state', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                                />
                            </div>
                            <div className="col-span-1">
                                <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-3">Zip</label>
                                <input 
                                    type="text" 
                                    aria-label="Zip Code"
                                    placeholder="37201"
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
                                aria-label="Website"
                                placeholder="https://www.mychurch.org"
                                value={formData.website || ''}
                                onChange={e => handleChange('website', e.target.value)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                            />
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 transition-colors">
                            <h4 className="font-bold text-indigo-600 dark:text-indigo-400 mb-4 text-sm">Integrations</h4>
                            
                            {/* Geocode Addresses */}
                            <div className="mb-6 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                                <p className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest mb-1">Member Heatmap</p>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-3 leading-relaxed">
                                    Geocode member addresses to power the cluster map on the Pastoral Care Membership tab.
                                    Only processes addresses that haven't been geocoded yet.
                                </p>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <button
                                        onClick={async () => {
                                            setIsGeocoding(true);
                                            setGeocodeMessage(null);
                                            try {
                                                const res = await fetch('/geocode/run', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ churchId }),
                                                });
                                                const data = await res.json();
                                                if (res.ok) {
                                                    setGeocodeMessage({ type: 'success', text: 'Geocoding complete. Reload the heatmap to see results.' });
                                                } else {
                                                    setGeocodeMessage({ type: 'error', text: data.error || 'Geocoding failed.' });
                                                }
                                            } catch (e: any) {
                                                setGeocodeMessage({ type: 'error', text: e.message || 'Network error.' });
                                            } finally {
                                                setIsGeocoding(false);
                                                setTimeout(() => setGeocodeMessage(null), 6000);
                                            }
                                        }}
                                        disabled={isGeocoding}
                                        className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md shadow-indigo-200 dark:shadow-none"
                                    >
                                        {isGeocoding ? (
                                            <>
                                                <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                                </svg>
                                                Geocoding…
                                            </>
                                        ) : '📍 Geocode Addresses'}
                                    </button>
                                    {geocodeMessage && (
                                        <span className={`text-[10px] font-bold animate-in fade-in ${
                                            geocodeMessage.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                                        }`}>
                                            {geocodeMessage.text}
                                        </span>
                                    )}
                                </div>
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
                                    onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(''); setDeleteError(null); }}
                                    className="w-full bg-rose-100 dark:bg-rose-600/10 hover:bg-rose-200 dark:hover:bg-rose-600 text-rose-700 dark:text-rose-500 dark:hover:text-white border border-rose-200 dark:border-rose-600/50 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                                >
                                    Delete Organization
                                </button>
                            </div>
                        </div>

                        {/* Delete Confirmation Modal */}
                        {showDeleteModal && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="delete-org-title">
                                {/* Backdrop */}
                                <div
                                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                                    onClick={() => !isDeleting && setShowDeleteModal(false)}
                                />
                                {/* Panel */}
                                <div className="relative bg-white dark:bg-slate-900 rounded-3xl border border-rose-200 dark:border-rose-800 shadow-2xl shadow-rose-900/20 p-8 w-full max-w-md animate-in zoom-in-95 fade-in duration-200">
                                    {/* Icon */}
                                    <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center mb-6 mx-auto">
                                        <svg className="w-7 h-7 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                        </svg>
                                    </div>

                                    <h2 id="delete-org-title" className="text-xl font-black text-slate-900 dark:text-white text-center mb-2">
                                        Delete Organization
                                    </h2>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 text-center mb-6 leading-relaxed">
                                        You are about to permanently delete <strong className="text-rose-600 dark:text-rose-400">{church.name}</strong> and all associated data.
                                        This includes all people, donations, groups, campaigns, and <strong>all user accounts</strong>.
                                        <br /><br />
                                        <span className="font-black text-rose-600 dark:text-rose-400">This action cannot be undone.</span>
                                    </p>

                                    <div className="bg-rose-50 dark:bg-rose-950/40 rounded-2xl border border-rose-200 dark:border-rose-800 p-4 mb-6">
                                        <p className="text-[10px] font-black text-rose-700 dark:text-rose-400 uppercase tracking-widest mb-3">What will be deleted:</p>
                                        <ul className="space-y-1">
                                            {['All People & Households', 'All Donation Records', 'All Groups & Service Plans', 'All Email & SMS Campaigns', 'All User Accounts (Firebase Auth)', 'Organization Settings & Configuration'].map(item => (
                                                <li key={item} className="flex items-center gap-2 text-[11px] text-rose-700 dark:text-rose-300">
                                                    <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                                    {item}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>

                                    <label className="block text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest mb-2">
                                        Type <span className="text-rose-600 font-mono">DELETE</span> to confirm
                                    </label>
                                    <input
                                        id="delete-org-confirm-input"
                                        type="text"
                                        value={deleteConfirmText}
                                        onChange={e => setDeleteConfirmText(e.target.value)}
                                        placeholder="DELETE"
                                        disabled={isDeleting}
                                        className="w-full bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 focus:border-rose-500 dark:focus:border-rose-500 rounded-xl px-4 py-3 font-mono text-sm text-slate-900 dark:text-white outline-none transition-colors mb-4 disabled:opacity-50"
                                    />

                                    {deleteError && (
                                        <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl">
                                            <p className="text-[11px] text-rose-600 dark:text-rose-400 font-bold">⚠ {deleteError}</p>
                                        </div>
                                    )}

                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setShowDeleteModal(false)}
                                            disabled={isDeleting}
                                            className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-50"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            id="delete-org-confirm-btn"
                                            onClick={handleDeleteOrganization}
                                            disabled={deleteConfirmText !== 'DELETE' || isDeleting}
                                            className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 dark:disabled:bg-rose-900 disabled:cursor-not-allowed text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                        >
                                            {isDeleting ? (
                                                <>
                                                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                                    </svg>
                                                    Deleting…
                                                </>
                                            ) : 'Delete Forever'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
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
                                    <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-2">Daily Time <span className="text-amber-500">(UTC)</span></label>
                                    <input 
                                        type="time"
                                        title="Daily sync time (UTC)"
                                        value={formData.scheduledSyncTime || ''}
                                        onChange={e => handleChange('scheduledSyncTime', e.target.value)}
                                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-mono text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                    />
                                    {/* Live UTC → Local time conversion hint */}
                                    {formData.scheduledSyncTime && (() => {
                                        try {
                                            const [hh, mm] = formData.scheduledSyncTime.split(':').map(Number);
                                            const now = new Date();
                                            const utcDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm));
                                            const localStr = utcDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
                                            return (
                                                <p className="text-[10px] mt-1.5 text-indigo-600 dark:text-indigo-400 font-semibold">
                                                    ⏰ {formData.scheduledSyncTime} UTC = <span className="font-mono">{localStr}</span> your local time
                                                </p>
                                            );
                                        } catch { return null; }
                                    })()}
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 leading-relaxed">
                                        The system syncs daily at this time. <strong className="text-amber-600 dark:text-amber-400">Enter UTC time</strong> — the server runs in UTC.
                                        For example, for 2 AM Central (UTC−5), enter <span className="font-mono">07:00</span>.
                                    </p>
                                </div>
                            </div>
                            <div className="mt-4 flex items-center justify-between">
                                {formData.scheduledSyncTime ? (
                                    <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-full border border-emerald-100 dark:border-emerald-900/30">
                                        <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span></span>
                                        Auto-sync enabled · {formData.scheduledSyncTime} UTC
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
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="font-bold text-slate-900 dark:text-white text-sm">Last Full Sync</h4>
                                {formData.lastSyncTimestamp && (() => {
                                    const hoursSince = (Date.now() - formData.lastSyncTimestamp) / 3_600_000;
                                    return hoursSince > 25
                                        ? <span className="text-[9px] font-black bg-rose-100 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-full border border-rose-200 dark:border-rose-800">⚠ Overdue ({Math.floor(hoursSince)}h ago)</span>
                                        : <span className="text-[9px] font-black bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">✓ Recent</span>;
                                })()}
                            </div>
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

                {/* PCO Display Preferences */}
                <div className="mt-8 bg-slate-50 dark:bg-slate-800/50 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 space-y-4">
                    <div>
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm mb-1">Display Preferences</h4>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
                            Control how archived and inactive data from Planning Center is shown across the application. Changes save immediately.
                        </p>
                    </div>
                    <div className="flex items-start justify-between gap-4 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <div className="flex-1">
                            <p className="text-xs font-bold text-slate-900 dark:text-white">Hide Archived Items</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                                When enabled, archived groups, registrations, and check-in events are hidden and excluded from all widget counts.
                            </p>
                        </div>
                        <button
                            title="Toggle archived items visibility"
                            onClick={async () => {
                                const next = !formData.pcoSettings?.hideArchivedItems;
                                const updated = { ...formData.pcoSettings, hideArchivedItems: next };
                                setFormData(prev => ({ ...prev, pcoSettings: updated }));
                                if (onUpdateChurch) await onUpdateChurch({ pcoSettings: updated });
                            }}
                            className={`shrink-0 w-12 h-6 rounded-full p-1 transition-colors ${formData.pcoSettings?.hideArchivedItems ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                        >
                            <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${formData.pcoSettings?.hideArchivedItems ? 'translate-x-6' : ''}`} />
                        </button>
                    </div>
                    <div className="flex items-start justify-between gap-4 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <div className="flex-1">
                            <p className="text-xs font-bold text-slate-900 dark:text-white">Hide Inactive Members</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                                When enabled, people whose status in Planning Center is Inactive are hidden from people lists, dashboards, and pastoral views.
                            </p>
                        </div>
                        <button
                            title="Toggle inactive member visibility"
                            onClick={async () => {
                                const next = !formData.pcoSettings?.hideInactiveMembers;
                                const updated = { ...formData.pcoSettings, hideInactiveMembers: next };
                                setFormData(prev => ({ ...prev, pcoSettings: updated }));
                                if (onUpdateChurch) await onUpdateChurch({ pcoSettings: updated });
                            }}
                            className={`shrink-0 w-12 h-6 rounded-full p-1 transition-colors ${formData.pcoSettings?.hideInactiveMembers ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                        >
                            <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${formData.pcoSettings?.hideInactiveMembers ? 'translate-x-6' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* ─── Pastoral Care Tab Setup Wizard ─── */}
                {church.pcoConnected && (
                    <PastoralCareTabSetupWizard
                        churchId={churchId}
                        church={church}
                        onFieldConfigSaved={() => {
                            // church data will re-render via the parent listener
                        }}
                    />
                )}
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
            const SHARED_DOMAIN = mailWizardProvider === 'postmark' ? 'barnabassoftware.com' : 'pastoralcare.barnabassoftware.com';
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
                        body: JSON.stringify({ churchId, prefix: mailPrefix.trim(), fromName: mailFromName.trim(), provider: mailWizardProvider }),
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
                            provider: mailWizardProvider,
                        }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Domain auth failed');
                    setMailCnameRecords(data.cnameRecords || []);
                    setMailDnsRecords(data.dnsRecords || data.cnameRecords || []);
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
                        body: JSON.stringify({ churchId, provider: mailWizardProvider }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Verification failed');
                    setMailDomainVerified(data.verified);
                    if (data.cnameRecords && data.cnameRecords.length > 0) {
                        setMailCnameRecords(data.cnameRecords);
                    }
                    if (data.dnsRecords && data.dnsRecords.length > 0) {
                        setMailDnsRecords(data.dnsRecords);
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
                        body: JSON.stringify({ churchId, testEmailAddress: mailDiagEmail.trim(), provider: mailWizardProvider }),
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

            const activeRecords = mailWizardProvider === 'postmark' ? mailDnsRecords : mailCnameRecords;
            const hasRecords = activeRecords.length > 0;
            const activeDomainId = mailWizardProvider === 'postmark' 
                ? (church.emailSettings?.postmarkDomainId ? String(church.emailSettings.postmarkDomainId) : '') 
                : (church.emailSettings?.domainAuthId || mailDomainAuthId);

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
                                    {mailWizardProvider === 'postmark'
                                        ? <>Send from your own domain (e.g. <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">contact@mychurch.org</code>). Requires adding 2 DNS records (DKIM TXT + Return-Path CNAME) to your DNS.</>
                                        : <>Send from your own domain (e.g. <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">contact@mychurch.org</code>). Requires adding 3 CNAME records to your DNS.</>
                                    }
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
                                        {isMailSaving ? 'Configuring…' : (church.emailSettings?.sendGridSubuserId || church.emailSettings?.postmarkServerToken) ? 'Update Email Settings' : 'Activate Shared Email'}
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
                                                {mailWizardProvider === 'postmark'
                                                    ? (church.emailSettings.postmarkDomainId ? ` · Postmark ID #${church.emailSettings.postmarkDomainId}` : '')
                                                    : (church.emailSettings.domainAuthId ? ` · SendGrid ID #${church.emailSettings.domainAuthId}` : '')
                                                }
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
                                            {isMailSaving ? 'Requesting…' : (hasRecords || activeDomainId) ? 'Re-fetch DNS Records' : 'Get DNS Records'}
                                        </button>
                                    </div>
                                </div>

                                {/* Step 2: CNAME / DNS Records */}
                                {(hasRecords || activeDomainId) && (
                                    <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center gap-2 mb-4">
                                            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">2</span>
                                            <h4 className="font-bold text-slate-900 dark:text-white text-sm">Add These DNS Records</h4>
                                        </div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                                            Add these DNS records in your DNS provider (GoDaddy, Namecheap, Cloudflare, etc.). DNS changes can take up to 48 hours to propagate.
                                        </p>

                                        {hasRecords ? (
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
                                                        {activeRecords.map((r, i) => (
                                                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                                <td className="px-4 py-3">
                                                                    <span className="font-black text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 px-2 py-0.5 rounded text-[10px]">
                                                                        {r.type}{r.label ? ` (${r.label})` : ''}
                                                                    </span>
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
                                                <p>Your domain <strong>{church.emailSettings?.customDomain}</strong> is registered with the email provider, but the DNS records are not cached here. Click <strong>"Re-fetch DNS Records"</strong> in Step 1 to reload them.</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Step 3: Verify */}
                                {(hasRecords || activeDomainId) && (
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
                                {(hasRecords || activeDomainId) && (
                                    <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center gap-2 mb-4">
                                            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">4</span>
                                            <div>
                                                <h4 className="font-bold text-slate-900 dark:text-white text-sm">Diagnose {mailWizardProvider === 'postmark' ? 'Postmark' : 'SendGrid'} Setup & Send Test</h4>
                                                <p className="text-[10px] text-slate-400 mt-0.5">Checks your full email provider configuration and sends a real test email to confirm delivery.</p>
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

                        {/* ── Additional Senders ── */}
                        <div className="space-y-4 mt-8 pt-8 border-t border-slate-100 dark:border-slate-800">
                            <div>
                                <h4 className="font-bold text-slate-900 dark:text-white text-sm">Additional "From" Addresses</h4>
                                <p className="text-[10px] text-slate-400 mt-0.5">Add other sender identities (like Pastors or Ministry Leaders) that can be selected when sending Quick Send Emails.</p>
                            </div>
                            
                            <div className="space-y-3">
                                {mailAdditionalSenders.map((sender, index) => (
                                    <div key={index} className="flex items-center gap-3">
                                        <input
                                            type="text"
                                            value={sender.name}
                                            onChange={e => {
                                                const newSenders = [...mailAdditionalSenders];
                                                newSenders[index] = { ...newSenders[index], name: e.target.value };
                                                setMailAdditionalSenders(newSenders);
                                            }}
                                            placeholder="Display Name"
                                            className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                        <input
                                            type="email"
                                            value={sender.email}
                                            onChange={e => {
                                                const newSenders = [...mailAdditionalSenders];
                                                newSenders[index] = { ...newSenders[index], email: e.target.value };
                                                setMailAdditionalSenders(newSenders);
                                            }}
                                            placeholder={`email@${church.emailSettings?.customDomain || SHARED_DOMAIN}`}
                                            className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                        <button
                                            onClick={() => {
                                                setMailAdditionalSenders(mailAdditionalSenders.filter((_, i) => i !== index));
                                            }}
                                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                                
                                <div className="flex justify-between items-center mt-4">
                                    <button
                                        type="button"
                                        onClick={() => setMailAdditionalSenders([...mailAdditionalSenders, { name: '', email: '' }])}
                                        className="text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center gap-1 hover:underline"
                                    >
                                        <span>+ Add Address</span>
                                    </button>
                                    
                                    <button
                                        type="button"
                                        onClick={async (e) => {
                                            e.preventDefault();
                                            if (!onUpdateChurch) return;
                                            setIsMailSaving(true);
                                            try {
                                                await onUpdateChurch({
                                                    emailSettings: {
                                                        ...(church.emailSettings as any),
                                                        additionalSenders: mailAdditionalSenders.filter(s => s.name.trim() && s.email.trim())
                                                    }
                                                });
                                                setMailMessage({ type: 'success', text: 'Additional senders saved successfully.' });
                                                // Local visual feedback on the button itself
                                                const btn = e.currentTarget;
                                                const originalText = btn.innerText;
                                                btn.innerText = 'Saved!';
                                                btn.classList.add('bg-emerald-600', 'text-white', 'dark:bg-emerald-600', 'dark:text-white');
                                                btn.classList.remove('bg-slate-900', 'dark:bg-white', 'text-white', 'dark:text-slate-900');
                                                setTimeout(() => {
                                                    btn.innerText = 'Save Additional Addresses';
                                                    btn.classList.remove('bg-emerald-600', 'text-white', 'dark:bg-emerald-600', 'dark:text-white');
                                                    btn.classList.add('bg-slate-900', 'dark:bg-white', 'text-white', 'dark:text-slate-900');
                                                }, 2000);
                                            } catch (err: any) {
                                                setMailMessage({ type: 'error', text: err.message });
                                            } finally {
                                                setIsMailSaving(false);
                                            }
                                        }}
                                        disabled={isMailSaving}
                                        className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-5 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg disabled:opacity-50"
                                    >
                                        {isMailSaving ? 'Saving...' : 'Save Additional Addresses'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Info card */}
                    <div className="bg-indigo-900/10 dark:bg-indigo-900/20 p-6 rounded-2xl border border-indigo-500/20">
                        <h4 className="font-bold text-indigo-400 mb-2 text-sm">📬 How Email Delivery Works</h4>
                        {mailWizardProvider === 'postmark' ? (
                            <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside leading-relaxed">
                                <li>Each church gets an isolated Postmark Server, so your reputation is separate from other tenants.</li>
                                <li>The <strong>Shared Subdomain</strong> option lets you start sending immediately — no DNS changes required.</li>
                                <li>The <strong>Custom Domain</strong> option improves deliverability by authenticating your brand with DKIM/Return-Path through Postmark's domain authentication.</li>
                                <li>Individual email campaigns can still override the From name and address on a per-campaign basis.</li>
                            </ul>
                        ) : (
                            <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside leading-relaxed">
                                <li>Each church gets an isolated SendGrid account (Subuser), so your reputation is separate from other tenants.</li>
                                <li>The <strong>Shared Subdomain</strong> option lets you start sending immediately — no DNS changes required.</li>
                                <li>The <strong>Custom Domain</strong> option improves deliverability by authenticating your brand with DKIM/SPF through SendGrid's domain authentication.</li>
                                <li>Individual email campaigns can still override the From name and address on a per-campaign basis.</li>
                            </ul>
                        )}
                    </div>
                </div>
            );
        })()}

        {activeTab === 'SMS' && (() => {
            const handleSmsChange = (key: string, value: any) => {
                setSmsForm((prev: any) => ({ ...prev, [key]: value }));
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

            const handleCheckRegistrationStatus = async () => {
                setIsCheckingStatus(true);
                setComplianceMessage(null);
                try {
                    const res = await fetch(`/api/messaging/registration-status?churchId=${encodeURIComponent(churchId)}`);
                    const data = await res.json();
                    if (data.success) {
                        setRegStatus(data);
                        setComplianceMessage({ type: 'success', text: 'Status retrieved successfully.' });
                    } else {
                        setComplianceMessage({ type: 'error', text: data.error || 'Failed to get status' });
                    }
                } catch (e: any) {
                    setComplianceMessage({ type: 'error', text: e.message || 'Status check failed' });
                } finally {
                    setIsCheckingStatus(false);
                }
            };

            const handleSubmitBrand = async () => {
                setIsSubmittingBrand(true);
                setComplianceMessage(null);
                try {
                    const res = await fetch('/api/messaging/register-brand', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ churchId, ...brandForm }),
                    });
                    const data = await res.json();
                    if (!data.success) throw new Error(data.error || 'Brand registration failed');
                    setComplianceMessage({ type: 'success', text: data.message });
                    handleCheckRegistrationStatus();
                } catch (e: any) {
                    setComplianceMessage({ type: 'error', text: e.message || 'Brand registration failed' });
                } finally {
                    setIsSubmittingBrand(false);
                }
            };

            const handleSubmitCampaign = async () => {
                setIsSubmittingCampaign(true);
                setComplianceMessage(null);
                try {
                    const res = await fetch('/api/messaging/register-campaign', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ churchId, ...campaignForm }),
                    });
                    const data = await res.json();
                    if (!data.success) throw new Error(data.error || 'Campaign registration failed');
                    setComplianceMessage({ type: 'success', text: data.message });
                    handleCheckRegistrationStatus();
                } catch (e: any) {
                    setComplianceMessage({ type: 'error', text: e.message || 'Campaign registration failed' });
                } finally {
                    setIsSubmittingCampaign(false);
                }
            };

            const inputCn = 'w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors';
            const labelCn = 'block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-2';

            return (
                <div className="space-y-6">
                    {/* Header */}
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                            <div>
                                <h3 className="text-xl font-black text-slate-900 dark:text-white">SMS Settings</h3>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-1">
                                    Messaging Compliance &amp; Setup
                                </p>
                            </div>
                            <div className="flex items-center gap-3 flex-wrap">
                                {/* Terms badge */}
                                {smsForm.termsAcceptedAt ? (
                                    <span className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25" title={`Terms accepted on ${new Date(smsForm.termsAcceptedAt).toLocaleString()}`}>
                                        ✓ ToS Accepted
                                    </span>
                                ) : (
                                    <button
                                        onClick={() => setShowTermsModal(true)}
                                        className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/25 hover:bg-amber-500/20 transition"
                                    >
                                        ⚠ ToS Not Accepted — Click to Review
                                    </button>
                                )}
                                {smsNumbers.length > 0 && (
                                    <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-full border border-emerald-100 dark:border-emerald-900/30">
                                        📱 {(smsNumbers.find((n: any) => n.isDefault) || smsNumbers[0])?.phoneNumber}
                                        {smsNumbers.length > 1 && <span className="ml-1 text-[9px]">+{smsNumbers.length - 1} more</span>}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Sub-tab switcher */}
                        <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl gap-1 w-fit flex-wrap">
                            {(['setup', 'compliance', 'numbers'] as const).map(st => (
                                <button
                                    key={st}
                                    onClick={() => setSmsSubTab(st as any)}
                                    className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                                        smsSubTab === st
                                            ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-300'
                                            : 'text-slate-500 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50'
                                    }`}
                                >
                                    {st === 'setup' ? '⚡ SMS Setup' : st === 'compliance' ? '⚖️ Compliance & Sender' : '📱 Phone Numbers'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── SMS Setup Sub-tab ─────────────────────────────────────────── */}
                    {(smsSubTab === 'setup' || smsSubTab === 'a2p') && (
                        <div className="space-y-6">

                            {/* Enable SMS */}
                            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="text-sm font-black text-slate-900 dark:text-white">SMS Messaging</h4>
                                        <p className="text-[11px] text-slate-400 mt-1 max-w-lg">
                                            Enable SMS for this church. Numbers are provisioned from the shared Barnabas Software SignalWire project — tenants do not need their own SignalWire account.
                                        </p>
                                    </div>
                                    <button
                                        title="Enable SMS Messaging"
                                        aria-label="Enable SMS Messaging"
                                        onClick={() => handleSmsChange('smsEnabled', !smsForm.smsEnabled)}
                                        className={`relative w-12 h-6 rounded-full transition-all duration-300 focus:outline-none ${
                                            smsForm.smsEnabled ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'
                                        }`}
                                    >
                                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-300 ${
                                            smsForm.smsEnabled ? 'translate-x-6' : 'translate-x-0'
                                        }`} />
                                    </button>
                                </div>
                            </div>

                            {/* Sender Name */}
                            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 space-y-5">
                                <div>
                                    <h4 className="text-sm font-black text-slate-900 dark:text-white mb-1">Sender Display Name</h4>
                                    <p className="text-[11px] text-slate-400">Shown as the sender name in outbound message logs. Does not change the phone number displayed to recipients.</p>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5">Church / Sender Name</label>
                                    <input
                                        type="text"
                                        value={(smsForm as any).senderName || ''}
                                        onChange={e => handleSmsChange('senderName', e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                        placeholder="Grace Community Church"
                                    />
                                </div>
                            </div>

                            {/* How it works */}
                            <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 p-8 rounded-[2rem]">
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-xl shrink-0">📡</div>
                                    <div>
                                        <h4 className="text-sm font-black text-indigo-900 dark:text-indigo-100 mb-2">How SMS Works for Tenants</h4>
                                        <ul className="space-y-2 text-[11px] text-indigo-800 dark:text-indigo-200 leading-relaxed">
                                            <li>✓ <strong>No SignalWire account needed</strong> — your church is provisioned under the Barnabas Software project.</li>
                                            <li>✓ <strong>Provision a number</strong> in the Phone Numbers tab below — search by area code or city/state.</li>
                                            <li>✓ <strong>Inbound messages</strong> are routed to your inbox automatically via the shared webhook.</li>
                                            <li>✓ <strong>Outbound messages</strong> send from your provisioned number with your sender name.</li>
                                            <li>✓ <strong>STOP / START</strong> compliance is handled automatically at the carrier level.</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>


                            {/* ── Port a Number card (Church Admin only) ─────────────────────── */}
                            {isChurchAdmin && (
                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-2xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center text-xl shrink-0">📲</div>
                                        <div>
                                            <h4 className="text-sm font-black text-slate-900 dark:text-white">Port Your Existing Number</h4>
                                            <p className="text-[11px] text-slate-400 mt-1 max-w-md leading-relaxed">
                                                Already have a phone number with another provider? Submit a porting request to bring it to our service. Porting typically takes 5–10 business days.
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowPortInModal(true)}
                                        className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-black uppercase tracking-widest transition-all shadow-lg shadow-violet-200 dark:shadow-violet-900/30 whitespace-nowrap"
                                    >
                                        Request Number Port →
                                    </button>
                                </div>
                            )}

                            {/* Save button */}
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
                    )}


                    {/* placeholder so closing brace below still resolves — DO NOT REMOVE */}

                    {/* ── Compliance Sub-tab ─────────────────────────────────────────── */}
                    {smsSubTab === 'compliance' && (
                        <div className="space-y-6">
                            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h4 className="text-xl font-black text-slate-900 dark:text-white">A2P 10DLC Compliance</h4>
                                        <p className="text-[11px] text-slate-400 mt-1 max-w-2xl leading-relaxed">
                                            To send outbound messages, carriers require businesses to register a Brand (who you are) and a Campaign (what you are sending).
                                            Registration typically takes a few minutes to hours.
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleCheckRegistrationStatus}
                                        disabled={isCheckingStatus}
                                        className="text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full border transition-all disabled:opacity-50 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
                                    >
                                        {isCheckingStatus ? '⏳ Checking…' : '🔄 Check Status'}
                                    </button>
                                </div>

                                {complianceMessage && (
                                    <div className={`mb-6 p-4 rounded-xl text-sm font-bold border ${
                                        complianceMessage.type === 'success' 
                                            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                                            : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800'
                                    }`}>
                                        {complianceMessage.text}
                                    </div>
                                )}

                                {/* Status View */}
                                {regStatus && (
                                    <div className="flex flex-col gap-4 mb-8 bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700/50">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1">Brand Status</p>
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${
                                                        (regStatus.brand?.status || '').toUpperCase() === 'APPROVED' || (regStatus.brand?.status || '').toUpperCase() === 'VERIFIED' || (regStatus.brand?.status || '').toUpperCase() === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' :
                                                        (regStatus.brand?.status || '').toUpperCase() === 'PENDING' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' :
                                                        regStatus.brand?.status ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20' :
                                                        'bg-slate-200 text-slate-500 border border-slate-300'
                                                    }`}>
                                                        {regStatus.brand?.status || 'NOT SUBMITTED'}
                                                    </span>
                                                    {regStatus.brand?.legalName && <span className="text-xs text-slate-500 font-bold">{regStatus.brand.legalName}</span>}
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1">Campaign Status</p>
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${
                                                        (regStatus.campaign?.status || '').toUpperCase() === 'APPROVED' || (regStatus.campaign?.status || '').toUpperCase() === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' :
                                                        (regStatus.campaign?.status || '').toUpperCase() === 'PENDING' || (regStatus.campaign?.status || '').includes('DCA') ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' :
                                                        regStatus.campaign?.status ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20' :
                                                        'bg-slate-200 text-slate-500 border border-slate-300'
                                                    }`}>
                                                        {regStatus.campaign?.status || 'NOT SUBMITTED'}
                                                    </span>
                                                    {regStatus.campaign?.id && <span className="text-[10px] text-slate-400 font-mono">{regStatus.campaign.id}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Brand Form */}
                                    {['APPROVED', 'VERIFIED', 'COMPLETED'].includes((regStatus?.brand?.status || '').toUpperCase()) && !showBrandFormOverride ? (
                                        <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/50 p-6 rounded-2xl flex flex-col justify-start h-full">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-black">✓</div>
                                                <h5 className="font-bold text-emerald-800 dark:text-emerald-400">1. Brand Registered</h5>
                                            </div>
                                            <p className="text-xs text-slate-500 mb-4">Your brand identity has been verified.</p>
                                            <button onClick={() => setShowBrandFormOverride(true)} className="text-xs font-bold text-slate-400 hover:text-slate-600 self-start mt-auto">Edit Details</button>
                                        </div>
                                    ) : (
                                    <div className={`space-y-4 ${(regStatus?.brand?.status || '').toUpperCase() === 'PENDING' ? 'opacity-60 pointer-events-none select-none relative' : ''}`}>
                                        { (regStatus?.brand?.status || '').toUpperCase() === 'PENDING' && (
                                            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-auto">
                                                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm px-4 py-2 rounded-full border border-amber-200 dark:border-amber-800 shadow-sm">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">
                                                        ⏳ Brand Registration Pending — Editing Disabled
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 mb-4">
                                            <div className="w-6 h-6 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-xs font-black">1</div>
                                            <h5 className="font-bold text-slate-800 dark:text-slate-200">Register Brand</h5>
                                        </div>
                                        
                                        <div>
                                            <label className={labelCn}>Legal Entity Name</label>
                                            <input className={inputCn} value={brandForm.legalName} onChange={e => setBrandForm({...brandForm, legalName: e.target.value})} placeholder="Exact name on tax docs" />
                                        </div>
                                        <div>
                                            <label className={labelCn}>EIN (Tax ID)</label>
                                            <input className={inputCn} value={brandForm.ein} onChange={e => setBrandForm({...brandForm, ein: e.target.value})} placeholder="xx-xxxxxxx" />
                                        </div>
                                        <div>
                                            <label className={labelCn}>Entity Type</label>
                                            <select title="Entity Type" aria-label="Entity Type" className={inputCn} value={brandForm.legalEntityType} onChange={e => setBrandForm({...brandForm, legalEntityType: e.target.value})}>
                                                <option value="NON_PROFIT">Non-Profit (501c3)</option>
                                                <option value="PRIVATE_PROFIT">Private Company</option>
                                                <option value="PUBLIC_PROFIT">Public Company</option>
                                                <option value="GOVERNMENT">Government</option>
                                                <option value="SOLE_PROPRIETOR">Sole Proprietor</option>
                                            </select>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className={labelCn}>Contact Email</label>
                                                <input className={inputCn} value={brandForm.contactEmail} onChange={e => setBrandForm({...brandForm, contactEmail: e.target.value})} placeholder="admin@..." />
                                            </div>
                                            <div>
                                                <label className={labelCn}>Contact Phone</label>
                                                <input className={inputCn} value={brandForm.contactPhone} onChange={e => setBrandForm({...brandForm, contactPhone: e.target.value})} placeholder="+1234567890" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className={labelCn}>Website</label>
                                            <input className={inputCn} value={brandForm.website} onChange={e => setBrandForm({...brandForm, website: e.target.value})} placeholder="https://..." />
                                        </div>
                                        <div>
                                            <label className={labelCn}>Address</label>
                                            <input className={inputCn} value={brandForm.address} onChange={e => setBrandForm({...brandForm, address: e.target.value})} placeholder="123 Main St" />
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="col-span-1">
                                                <label className={labelCn}>City</label>
                                                <input title="City" placeholder="City" className={inputCn} value={brandForm.city} onChange={e => setBrandForm({...brandForm, city: e.target.value})} />
                                            </div>
                                            <div className="col-span-1">
                                                <label className={labelCn}>State</label>
                                                <input className={inputCn} value={brandForm.state} onChange={e => setBrandForm({...brandForm, state: e.target.value})} placeholder="CA" />
                                            </div>
                                            <div className="col-span-1">
                                                <label className={labelCn}>Zip</label>
                                                <input title="Zip Code" placeholder="Zip Code" className={inputCn} value={brandForm.zip} onChange={e => setBrandForm({...brandForm, zip: e.target.value})} />
                                            </div>
                                        </div>
                                        
                                        <button
                                            onClick={handleSubmitBrand}
                                            disabled={isSubmittingBrand || (regStatus?.brand?.status || '').toUpperCase() === 'PENDING'}
                                            className="w-full mt-4 bg-violet-600 hover:bg-violet-700 text-white font-black text-xs uppercase tracking-widest py-3 rounded-xl transition-all disabled:opacity-50"
                                        >
                                            {isSubmittingBrand ? 'Submitting...' : (regStatus?.brand?.status || '').toUpperCase() === 'PENDING' ? 'Registration Pending' : 'Submit Brand'}
                                        </button>
                                        {['APPROVED', 'VERIFIED', 'COMPLETED'].includes((regStatus?.brand?.status || '').toUpperCase()) && (
                                            <button onClick={() => setShowBrandFormOverride(false)} className="w-full mt-2 text-xs font-bold text-slate-500">Cancel Edit</button>
                                        )}
                                    </div>
                                    )}

                                    {/* Campaign Form */}
                                    {['APPROVED', 'ACTIVE'].includes((regStatus?.campaign?.status || '').toUpperCase()) && !showCampaignFormOverride ? (
                                        <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/50 p-6 rounded-2xl flex flex-col justify-start h-full">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-black">✓</div>
                                                <h5 className="font-bold text-emerald-800 dark:text-emerald-400">2. Campaign Registered</h5>
                                            </div>
                                            <p className="text-xs text-slate-500 mb-4">Your messaging campaign is active and approved.</p>
                                            <button onClick={() => setShowCampaignFormOverride(true)} className="text-xs font-bold text-slate-400 hover:text-slate-600 self-start mt-auto">Edit Details</button>
                                        </div>
                                    ) : (
                                    <div className={`space-y-4 ${(regStatus?.campaign?.status || '').toUpperCase() === 'PENDING' ? 'opacity-60 pointer-events-none select-none relative' : ''}`}>
                                        { (regStatus?.campaign?.status || '').toUpperCase() === 'PENDING' && (
                                            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-auto">
                                                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm px-4 py-2 rounded-full border border-amber-200 dark:border-amber-800 shadow-sm">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">
                                                        ⏳ Campaign Registration Pending — Editing Disabled
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-xs font-black">2</div>
                                                <h5 className="font-bold text-slate-800 dark:text-slate-200">Register Campaign</h5>
                                            </div>
                                            {regStatus?.brand?.id && (
                                                <span className="text-[9px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-400 px-2 py-0.5 rounded" title="Brand ID to be associated">
                                                    Brand: {regStatus.brand.id.slice(0,8)}...
                                                </span>
                                            )}
                                        </div>
                                        
                                        <div>
                                            <label className={labelCn}>Campaign Name</label>
                                            <input title="Campaign Name" placeholder="Campaign Name" className={inputCn} value={campaignForm.name} onChange={e => setCampaignForm({...campaignForm, name: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className={labelCn}>Use Case</label>
                                            <select title="Use Case" aria-label="Use Case" className={inputCn} value={campaignForm.usecase} onChange={e => setCampaignForm({...campaignForm, usecase: e.target.value, subUsecases: []})}>
                                                <option value="MIXED">Mixed / General (Recommended)</option>
                                                <option value="LOW_VOLUME">Low Volume</option>
                                                <option value="2FA">Two-Factor Authentication</option>
                                                <option value="ACCOUNT_NOTIFICATION">Account Notifications</option>
                                                <option value="CUSTOMER_CARE">Customer Care</option>
                                                <option value="DELIVERY_NOTIFICATION">Delivery Notifications</option>
                                                <option value="FRAUD_ALERT">Fraud Alerts</option>
                                                <option value="HIGHER_EDUCATION">Higher Education</option>
                                                <option value="MARKETING">Marketing</option>
                                                <option value="POLLING_VOTING">Polling and Voting</option>
                                                <option value="PUBLIC_SERVICE_ANNOUNCEMENT">Public Service Announcement</option>
                                                <option value="SECURITY_ALERT">Security Alerts</option>
                                                <option value="CHARITY">Charity / 501c3 (Requires status)</option>
                                                <option value="EMERGENCY">Emergency</option>
                                                <option value="K12_EDUCATION">K-12 Education</option>
                                                <option value="POLITICAL">Political</option>
                                                <option value="SOCIAL">Social</option>
                                                <option value="SWEEPSTAKE">Sweepstakes</option>
                                            </select>
                                        </div>
                                        {(campaignForm.usecase === 'MIXED' || campaignForm.usecase === 'LOW_VOLUME') && (
                                            <div>
                                                <label className={labelCn}>Sub Use Cases (Select 1 to 5)</label>
                                                <div className="grid grid-cols-2 gap-2 mt-2">
                                                    {[
                                                        { id: '2FA', label: '2FA' },
                                                        { id: 'ACCOUNT_NOTIFICATION', label: 'Account Notifications' },
                                                        { id: 'CUSTOMER_CARE', label: 'Customer Care' },
                                                        { id: 'DELIVERY_NOTIFICATION', label: 'Delivery Notifications' },
                                                        { id: 'FRAUD_ALERT', label: 'Fraud Alerts' },
                                                        { id: 'MARKETING', label: 'Marketing' },
                                                        { id: 'POLLING_VOTING', label: 'Polling & Voting' },
                                                        { id: 'PUBLIC_SERVICE_ANNOUNCEMENT', label: 'Public Service Announcement' },
                                                        { id: 'SECURITY_ALERT', label: 'Security Alerts' }
                                                    ].map(sc => (
                                                        <label key={sc.id} className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300">
                                                            <input 
                                                                type="checkbox" 
                                                                className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                                                checked={campaignForm.subUsecases.includes(sc.id)}
                                                                onChange={e => {
                                                                    const current = campaignForm.subUsecases;
                                                                    if (e.target.checked) {
                                                                        if (current.length >= 5) return; // Max 5 sub-usecases
                                                                        setCampaignForm({...campaignForm, subUsecases: [...current, sc.id]});
                                                                    } else {
                                                                        setCampaignForm({...campaignForm, subUsecases: current.filter(id => id !== sc.id)});
                                                                    }
                                                                }}
                                                            />
                                                            {sc.label}
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <div>
                                            <label className={labelCn}>Campaign Description</label>
                                            <textarea rows={2} className={inputCn} value={campaignForm.description} onChange={e => setCampaignForm({...campaignForm, description: e.target.value})} placeholder="Sending transactional and informational text messages to church members..." />
                                        </div>
                                        <div>
                                            <label className={labelCn}>Opt-In Flow Description</label>
                                            <textarea rows={2} className={inputCn} value={campaignForm.messageFlow} onChange={e => setCampaignForm({...campaignForm, messageFlow: e.target.value})} placeholder="Users opt-in by filling out a contact card at the church or checking a box on our website..." />
                                        </div>
                                        <div>
                                            <label className={labelCn}>Sample Message 1</label>
                                            <textarea rows={2} className={inputCn} value={campaignForm.sample1} onChange={e => setCampaignForm({...campaignForm, sample1: e.target.value})} placeholder="Hi [Name], just a reminder that service starts at 9am tomorrow. Reply STOP to unsubscribe." />
                                        </div>
                                        <div>
                                            <label className={labelCn}>Sample Message 2</label>
                                            <textarea rows={2} className={inputCn} value={campaignForm.sample2} onChange={e => setCampaignForm({...campaignForm, sample2: e.target.value})} placeholder="Thank you for visiting! To get connected, fill out this link: ..." />
                                        </div>
                                        <div>
                                            <label className={labelCn}>Sample Message 3 (Optional)</label>
                                            <textarea rows={2} className={inputCn} value={campaignForm.sample3} onChange={e => setCampaignForm({...campaignForm, sample3: e.target.value})} placeholder="Optional sample message..." />
                                        </div>
                                        <div>
                                            <label className={labelCn}>Sample Message 4 (Optional)</label>
                                            <textarea rows={2} className={inputCn} value={campaignForm.sample4} onChange={e => setCampaignForm({...campaignForm, sample4: e.target.value})} placeholder="Optional sample message..." />
                                        </div>
                                        <div>
                                            <label className={labelCn}>Sample Message 5 (Optional)</label>
                                            <textarea rows={2} className={inputCn} value={campaignForm.sample5} onChange={e => setCampaignForm({...campaignForm, sample5: e.target.value})} placeholder="Optional sample message..." />
                                        </div>
                                        
                                        <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                                            <h6 className="font-bold text-slate-800 dark:text-slate-200 text-sm mb-4">Keyword Auto-Replies</h6>
                                            <div className="space-y-4">
                                                <div>
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">STOP</span>
                                                        <label className={labelCn + ' mb-0'}>Opt-Out Confirmation Message</label>
                                                    </div>
                                                    <textarea
                                                        title="Opt-Out Confirmation Message"
                                                        placeholder="Opt-Out Confirmation Message"
                                                        value={campaignForm.optOutMessage}
                                                        onChange={e => setCampaignForm({...campaignForm, optOutMessage: e.target.value})}
                                                        rows={2}
                                                        className={inputCn + ' resize-none'}
                                                    />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">START</span>
                                                        <label className={labelCn + ' mb-0'}>Opt-In Confirmation Message</label>
                                                    </div>
                                                    <textarea
                                                        title="Opt-In Confirmation Message"
                                                        placeholder="Opt-In Confirmation Message"
                                                        value={campaignForm.optInMessage}
                                                        onChange={e => setCampaignForm({...campaignForm, optInMessage: e.target.value})}
                                                        rows={2}
                                                        className={inputCn + ' resize-none'}
                                                    />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">HELP</span>
                                                        <label className={labelCn + ' mb-0'}>Help Response Message</label>
                                                    </div>
                                                    <textarea
                                                        title="Help Response Message"
                                                        placeholder="Help Response Message"
                                                        value={campaignForm.helpMessage}
                                                        onChange={e => setCampaignForm({...campaignForm, helpMessage: e.target.value})}
                                                        rows={2}
                                                        className={inputCn + ' resize-none'}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                                            <h6 className="font-bold text-slate-800 dark:text-slate-200 text-sm mb-4">Consent Form Evidence</h6>
                                            <p className="text-[10px] text-slate-500 mb-3">Upload an image or screenshot of your digital/physical consent form that people fill out to opt-in to SMS messages.</p>
                                            
                                            <div className="flex flex-col gap-3">
                                                {campaignForm.consentFormUrl ? (
                                                    <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                                                        <a href={campaignForm.consentFormUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 font-bold hover:underline truncate flex-1">
                                                            View Uploaded Form
                                                        </a>
                                                        <button 
                                                            onClick={() => setCampaignForm({...campaignForm, consentFormUrl: ''})}
                                                            className="text-[10px] text-rose-500 font-bold uppercase tracking-widest hover:text-rose-600 px-2 py-1 bg-white dark:bg-slate-900 rounded shadow-sm border border-slate-200 dark:border-slate-700"
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="relative group">
                                                        <input 
                                                            type="file" 
                                                            title="Upload Consent Form"
                                                            aria-label="Upload Consent Form"
                                                            accept="image/*,.pdf"
                                                            disabled={isUploadingConsent}
                                                            onChange={async (e) => {
                                                                const file = e.target.files?.[0];
                                                                if (!file) return;
                                                                setIsUploadingConsent(true);
                                                                try {
                                                                    const path = `churches/${churchId}/consent_forms/${Date.now()}_${file.name}`;
                                                                    const storageRef = ref(storage, path);
                                                                    await uploadBytes(storageRef, file);
                                                                    const url = await getDownloadURL(storageRef);
                                                                    setCampaignForm({...campaignForm, consentFormUrl: url});
                                                                } catch (err: any) {
                                                                    alert('Failed to upload consent form: ' + err.message);
                                                                } finally {
                                                                    setIsUploadingConsent(false);
                                                                }
                                                            }}
                                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
                                                        />
                                                        <div className={`w-full border-2 border-dashed rounded-xl p-6 text-center transition-all ${isUploadingConsent ? 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700' : 'bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-300 dark:border-slate-700 group-hover:border-indigo-400'}`}>
                                                            {isUploadingConsent ? (
                                                                <span className="text-xs font-bold text-slate-500 flex items-center justify-center gap-2">
                                                                    <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>
                                                                    Uploading...
                                                                </span>
                                                            ) : (
                                                                <span className="text-xs font-bold text-slate-500">
                                                                    Click or drag file to upload
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        
                                        {regStatus?.brand?.status?.toLowerCase() !== 'verified' && regStatus?.brand?.status?.toLowerCase() !== 'approved' && regStatus?.brand?.status?.toLowerCase() !== 'completed' ? (
                                            <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl">
                                                <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 leading-relaxed">
                                                    🔒 Campaign registration is locked until your Brand status is <strong>VERIFIED</strong>. 
                                                    Carriers require a verified identity before they will accept new message campaigns.
                                                </p>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={handleSubmitCampaign}
                                                disabled={isSubmittingCampaign || (regStatus?.campaign?.status || '').toUpperCase() === 'PENDING'}
                                                className="w-full mt-4 bg-violet-600 hover:bg-violet-700 text-white font-black text-xs uppercase tracking-widest py-3 rounded-xl transition-all disabled:opacity-50"
                                            >
                                                {isSubmittingCampaign ? 'Submitting...' : (regStatus?.campaign?.status || '').toUpperCase() === 'PENDING' ? 'Registration Pending' : 'Submit Campaign'}
                                            </button>
                                        )}
                                        {['APPROVED', 'ACTIVE'].includes((regStatus?.campaign?.status || '').toUpperCase()) && (
                                            <button onClick={() => setShowCampaignFormOverride(false)} className="w-full mt-2 text-xs font-bold text-slate-500">Cancel Edit</button>
                                        )}
                                    </div>
                                    )}
                                </div>
                            </div>

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
                                            role="switch"
                                            aria-checked={smsForm.prefixMessagesWithName ? 'true' : 'false'}
                                            aria-label="Prefix Messages with Church Name"
                                            title="Prefix Messages with Church Name"
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

                        const formatPhone = (phone: string): string => {
                            const digits = phone.replace(/\D/g, '');
                            if (digits.length === 10) {
                                return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
                            }
                            if (digits.length === 11 && digits.startsWith('1')) {
                                return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
                            }
                            return phone;
                        };

                        const handleSearch = async () => {
                            setNumError('');
                            setAddNumBusy(true);
                            try {
                                if (addNumMode === 'ported') {
                                    const rawNum = addNumPorted.trim();
                                    let cleanNum = rawNum.replace(/[^\d+]/g, '');
                                    if (cleanNum.length === 10) {
                                        cleanNum = `+1${cleanNum}`;
                                    } else if (cleanNum.length === 11 && cleanNum.startsWith('1')) {
                                        cleanNum = `+${cleanNum}`;
                                    } else if (!cleanNum.startsWith('+')) {
                                        cleanNum = `+${cleanNum}`;
                                    }
                                    if (!cleanNum.match(/^\+[1-9]\d{10,14}$/)) {
                                        throw new Error('Enter a valid phone number in E.164 format (e.g. +16155550100).');
                                    }
                                    setAddNumResults([{
                                        phoneNumber: cleanNum,
                                        friendlyName: formatPhone(cleanNum),
                                        locality: 'Ported Number',
                                        region: 'SignalWire'
                                    }]);
                                    setAddNumSelected(cleanNum);
                                    setAddNumStep('pick');
                                    return;
                                }

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
                                        collection(firebaseDb, 'smsNumbers'),
                                        where('churchId', '==', churchId),
                                        orderBy('createdAt', 'asc')
                                    );
                                    getDocs(q)
                                        .then(snap => setSmsNumbers(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
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
                                    body: JSON.stringify({ churchId, smsNumberId: numId }),
                                });
                                const data = await res.json();
                                if (!data.success) throw new Error(data.error || 'Failed');
                                setNumToast('✓ Default number updated.');
                                setSmsNumbers(prev => prev.map(n => ({ ...n, isDefault: n.id === numId })));
                                setTimeout(() => setNumToast(''), 3000);
                            } catch (e: any) {
                                setNumError(e.message || 'Failed to set default');
                            }
                        };

                        // SignalWire flat-project model: no A2P pre-approval gate needed
                        const profileApproved = true;

                        const handleReleaseNumber = async (num: any) => {
                            const confirmed = window.confirm(
                                `Release ${num.phoneNumber} ("${num.friendlyLabel || num.senderName || 'this number'}")? \n\nThis will permanently release the number back to SignalWire and cannot be undone.`
                            );
                            if (!confirmed) return;
                            setNumError('');
                            try {
                                const res = await fetch('/api/messaging/release-number', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ churchId, smsNumberId: num.id }),
                                });
                                const raw = await res.text();
                                let data: any;
                                try { data = JSON.parse(raw); } catch { data = { error: raw.slice(0, 200) }; }
                                if (!data.success) throw new Error(data.error || 'Release failed');
                                setNumToast(`✓ ${num.phoneNumber} released.`);
                                setSmsNumbers(prev => prev.filter(n => n.id !== num.id));
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
                                            <p className="text-[10px] text-slate-400 mt-0.5">SignalWire numbers assigned to this church. The default number is used for outbound replies when no inbox is specified.</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={handleCheckRegistrationStatus}
                                                disabled={isCheckingStatus}
                                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                                                title="Check and refresh assignment status"
                                            >
                                                {isCheckingStatus ? '↻ Syncing...' : '↻ Refresh Status'}
                                            </button>
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
                                    </div>

                                    {/* No approval gate needed with SignalWire flat-project model */}

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
                                    ) : smsNumbers.length === 0 ? (
                                        <div className="py-10 text-center">
                                            <p className="text-3xl mb-3">📱</p>
                                            <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">No Numbers Provisioned</p>
                                            <p className="text-xs text-slate-400">Use "Request a Number" to provision a SignalWire number for this church.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {smsNumbers.map((num: any) => {
                                                const isExpanded = expandedNumId === num.id;
                                                const perms = num.permissions || {};
                                                const allUserIds = users.map((u: any) => u.id);

                                                // Restricted access: if allowedUserIds is non-empty, only those users can see the number
                                                const restrictedToIds: string[] = (num.allowedUserIds || []).filter((id: string) => id !== '_none_');
                                                const isRestricted = (num.allowedUserIds || []).length > 0;

                                                const FEATURES = [
                                                    { key: 'inboxUserIds',     label: 'Inbox',     icon: '💬', desc: 'Can read and reply to conversations' },
                                                    { key: 'broadcastUserIds', label: 'Broadcast',  icon: '📣', desc: 'Can send broadcast campaigns' },
                                                    { key: 'analyticsUserIds', label: 'Analytics',  icon: '📊', desc: 'Can view SMS analytics' },
                                                    { key: 'keywordsUserIds',  label: 'Keywords',   icon: '🔑', desc: 'Can manage keywords' },
                                                    { key: 'aiAgentUserIds',   label: 'AI Agent',   icon: '🤖', desc: 'Can use the AI Agent' },
                                                ] as const;

                                                const handleSavePermissions = async (updatedNum: any) => {
                                                    setNumPermSaving(true);
                                                    try {
                                                        const { doc, updateDoc } = await import('firebase/firestore');
                                                        await updateDoc(doc(firebaseDb, 'smsNumbers', updatedNum.id), {
                                                            allowedUserIds: updatedNum.allowedUserIds,
                                                            permissions: updatedNum.permissions || {},
                                                            updatedAt: Date.now(),
                                                        });
                                                        setNumPermToast({ id: updatedNum.id, text: '✓ Access settings saved.' });
                                                        setTimeout(() => setNumPermToast(null), 3000);
                                                    } catch (e: any) {
                                                        setNumPermToast({ id: updatedNum.id, text: '⚠ Save failed: ' + e.message });
                                                    } finally {
                                                        setNumPermSaving(false);
                                                    }
                                                };

                                                const toggleAllowedUser = (userId: string) => {
                                                    const current: string[] = num.allowedUserIds || [];
                                                    let next: string[];
                                                    if (current.length === 0) {
                                                        // It was unrestricted. Restrict to all eligible users except this one.
                                                        next = users.map((u: any) => u.id).filter(id => id !== userId);
                                                        if (next.length === 0) {
                                                            next = ['_none_'];
                                                        }
                                                    } else {
                                                        // It was restricted.
                                                        const cleaned = current.filter(id => id !== '_none_');
                                                        if (cleaned.includes(userId)) {
                                                            next = cleaned.filter((id: string) => id !== userId);
                                                            if (next.length === 0) {
                                                                next = ['_none_'];
                                                            }
                                                        } else {
                                                            next = [...cleaned, userId];
                                                        }
                                                    }
                                                    setSmsNumbers((prev: any[]) => prev.map(n => n.id === num.id ? { ...n, allowedUserIds: next } : n));
                                                };

                                                const toggleFeatureUser = (featureKey: string, userId: string) => {
                                                    const currentPerms = num.permissions || {};
                                                    const current: string[] = currentPerms[featureKey] || [];
                                                    let next: string[];
                                                    if (current.length === 0) {
                                                        // It was unrestricted. Restrict to all eligible users except this one.
                                                        next = eligibleUsers.map(u => u.id).filter(id => id !== userId);
                                                        if (next.length === 0) {
                                                            next = ['_none_'];
                                                        }
                                                    } else {
                                                        const cleaned = current.filter(id => id !== '_none_');
                                                        if (cleaned.includes(userId)) {
                                                            next = cleaned.filter((id: string) => id !== userId);
                                                            if (next.length === 0) {
                                                                next = ['_none_'];
                                                            }
                                                        } else {
                                                            next = [...cleaned, userId];
                                                        }
                                                    }
                                                    setSmsNumbers((prev: any[]) => prev.map(n => n.id === num.id
                                                        ? { ...n, permissions: { ...n.permissions, [featureKey]: next } }
                                                        : n
                                                    ));
                                                };

                                                const setAllFeatureUsers = (featureKey: string, userIds: string[]) => {
                                                    setSmsNumbers((prev: any[]) => prev.map(n => n.id === num.id
                                                        ? { ...n, permissions: { ...n.permissions, [featureKey]: userIds } }
                                                        : n
                                                    ));
                                                };

                                                // Users eligible for feature permissions = those on the allowedUserIds list (or all if no restriction)
                                                const eligibleUsers = users.filter((u: any) =>
                                                    !isRestricted || restrictedToIds.includes(u.id)
                                                );

                                                return (
                                                    <div
                                                        key={num.id}
                                                        className={`rounded-2xl border transition-all ${
                                                            num.isDefault
                                                                ? 'bg-violet-50 dark:bg-violet-900/10 border-violet-200 dark:border-violet-800'
                                                                : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                                                        }`}
                                                    >
                                                        {/* Main row */}
                                                        <div className="flex items-center gap-4 p-4">
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
                                                                    {isRestricted && (
                                                                        <span className="text-[9px] font-black uppercase tracking-widest bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full">
                                                                            🔒 {restrictedToIds.length} user{restrictedToIds.length !== 1 ? 's' : ''}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {num.senderName && (
                                                                    <p className="text-[10px] text-slate-400 mt-0.5">Sender: {num.senderName}</p>
                                                                )}
                                                                {/* Campaign / TCR status */}
                                                                {(() => {
                                                                    const status = num.campaignAssignmentStatus as string | undefined;
                                                                    if (!status || status === 'not_configured') return (
                                                                        <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                                                                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                                                            Campaign not configured — contact Barnabas Software support to enable outbound SMS
                                                                        </p>
                                                                    );
                                                                    if (status === 'pending') return (
                                                                        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-2 flex-wrap">
                                                                            <span className="flex items-center gap-1">
                                                                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                                                                                Number assignment to campaign pending carrier approval — SMS enabled within 24h
                                                                            </span>
                                                                            <button
                                                                                onClick={async () => {
                                                                                    if (!window.confirm('SignalWire shows this assignment is complete? Click OK to mark this number as active now.')) return;
                                                                                    try {
                                                                                        const r = await fetch('/api/messaging/mark-number-active', {
                                                                                            method: 'POST',
                                                                                            headers: { 'Content-Type': 'application/json' },
                                                                                            body: JSON.stringify({ churchId, smsNumberId: num.id }),
                                                                                        });
                                                                                        const d = await r.json();
                                                                                        if (d.success) {
                                                                                            setSmsNumbers((prev: any[]) => prev.map(n => n.id === num.id ? { ...n, campaignAssignmentStatus: 'active', campaignAssigned: true } : n));
                                                                                            setNumToast('✓ Number marked as active.');
                                                                                            setTimeout(() => setNumToast(''), 4000);
                                                                                        } else {
                                                                                            setNumError(d.error || 'Failed');
                                                                                        }
                                                                                    } catch { setNumError('Request failed'); }
                                                                                }}
                                                                                className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition"
                                                                            >
                                                                                Mark Active ✓
                                                                            </button>
                                                                        </p>
                                                                    );
                                                                    if (status === 'active' || status === 'completed' || status === 'successful' || num.campaignAssigned) return (
                                                                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                                                                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                                            Campaign approved — outbound SMS active
                                                                        </p>
                                                                    );
                                                                    if (status === 'error') return (
                                                                        <p className="text-[10px] text-rose-500 mt-1 flex items-center gap-1" title={num.campaignAssignmentError}>
                                                                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                                                            Campaign assignment error — contact support
                                                                        </p>
                                                                    );
                                                                    return null;
                                                                })()}
                                                            </div>
                                                            {/* Actions */}
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <button
                                                                    onClick={() => setExpandedNumId(isExpanded ? null : num.id)}
                                                                    className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border transition-all ${
                                                                        isExpanded
                                                                            ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400'
                                                                            : 'border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400'
                                                                    }`}
                                                                >
                                                                    {isExpanded ? '▲ Access' : '▼ Manage Access'}
                                                                </button>
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
                                                                    disabled={num.isDefault && smsNumbers.length > 1}
                                                                    title={num.isDefault && smsNumbers.length > 1
                                                                        ? 'Set another number as default before releasing this one'
                                                                        : `Release ${num.phoneNumber}`}
                                                                    className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border transition-all disabled:cursor-not-allowed disabled:opacity-40 border-rose-200 dark:border-rose-800 text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:border-rose-400"
                                                                >
                                                                    {num.isDefault && smsNumbers.length > 1 ? '🔒 Release' : '🗑 Release'}
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* ── Access Management Panel ─────────────────────────── */}
                                                        {isExpanded && (
                                                            <div className="border-t border-slate-200 dark:border-slate-700 mx-4 mb-4 pt-5 space-y-6">

                                                                {/* Section 1: Who can see this number */}
                                                                <div>
                                                                    <div className="flex items-center justify-between mb-3">
                                                                        <div>
                                                                            <h5 className="text-xs font-black text-slate-800 dark:text-white">Number Visibility</h5>
                                                                            <p className="text-[10px] text-slate-400 mt-0.5">Restrict which users can see this phone number in the SMS module. Leave all unchecked for unrestricted access.</p>
                                                                        </div>
                                                                         <div className="flex gap-2 shrink-0">
                                                                             <button
                                                                                 onClick={() => setSmsNumbers((prev: any[]) => prev.map(n => n.id === num.id ? { ...n, allowedUserIds: [] } : n))}
                                                                                 className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 transition"
                                                                             >Select All</button>
                                                                             <button
                                                                                 onClick={() => setSmsNumbers((prev: any[]) => prev.map(n => n.id === num.id ? { ...n, allowedUserIds: ['_none_'] } : n))}
                                                                                 className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-600 transition"
                                                                             >Clear</button>
                                                                         </div>
                                                                     </div>
                                                                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                                         {users.map((u: any) => {
                                                                             const isActuallyRestricted = (num.allowedUserIds || []).length > 0;
                                                                             const isChecked = !isActuallyRestricted || (num.allowedUserIds || []).includes(u.id);
                                                                             return (
                                                                                 <label key={u.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 transition-all group">
                                                                                     <div
                                                                                         onClick={() => toggleAllowedUser(u.id)}
                                                                                         className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                                                                                             isChecked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 dark:border-slate-600 group-hover:border-indigo-400'
                                                                                         }`}
                                                                                     >
                                                                                         {isChecked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                                                                     </div>
                                                                                     <div className="min-w-0 flex-1" onClick={() => toggleAllowedUser(u.id)}>
                                                                                         <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{u.name}</p>
                                                                                         <p className="text-[9px] text-slate-400 truncate">{u.email}</p>
                                                                                     </div>
                                                                                 </label>
                                                                             );
                                                                         })}
                                                                         {users.length === 0 && (
                                                                             <p className="text-[10px] text-slate-400 col-span-2">No users found.</p>
                                                                         )}
                                                                     </div>
                                                                     <p className="text-[9px] text-slate-400 mt-2">Restrict visibility for any user by unchecking them above.</p>
                                                                 </div>
 
                                                                 {/* Section 2: Feature-level permissions */}
                                                                 <div>
                                                                     <h5 className="text-xs font-black text-slate-800 dark:text-white mb-1">Feature Permissions</h5>
                                                                     <p className="text-[10px] text-slate-400 mb-4">For each feature, control which users have access. Leave a feature's column fully unchecked to allow all visible users.</p>
 
                                                                     {eligibleUsers.length === 0 ? (
                                                                         <p className="text-[10px] text-slate-400">Add users to the visibility list above to configure feature permissions.</p>
                                                                     ) : (
                                                                         <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                                                                             <table className="w-full text-xs">
                                                                                 <thead className="bg-slate-50 dark:bg-slate-800">
                                                                                     <tr>
                                                                                         <th className="px-4 py-3 text-left font-black text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-widest">User</th>
                                                                                         {FEATURES.map(f => (
                                                                                             <th key={f.key} className="px-3 py-3 text-center font-black text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-widest whitespace-nowrap" title={f.desc}>
                                                                                                 <span className="mr-1">{f.icon}</span>{f.label}
                                                                                             </th>
                                                                                         ))}
                                                                                     </tr>
                                                                                     <tr className="border-t border-slate-200 dark:border-slate-700 bg-slate-100/50 dark:bg-slate-800/80">
                                                                                         <td className="px-4 py-1.5">
                                                                                             <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Toggle All</span>
                                                                                         </td>
                                                                                         {FEATURES.map(f => {
                                                                                             const featureIds: string[] = (num.permissions || {})[f.key] || [];
                                                                                             const allSelected = featureIds.length === 0 || (eligibleUsers.length > 0 && eligibleUsers.every((u: any) => featureIds.includes(u.id)));
                                                                                             return (
                                                                                                 <td key={f.key} className="px-3 py-1.5 text-center">
                                                                                                     <button
                                                                                                         onClick={() => setAllFeatureUsers(f.key, allSelected ? ['_none_'] : [])}
                                                                                                         className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border transition-all ${
                                                                                                             allSelected
                                                                                                                 ? 'bg-indigo-100 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400'
                                                                                                                 : 'border-slate-300 dark:border-slate-600 text-slate-400 hover:border-indigo-300 hover:text-indigo-500'
                                                                                                         }`}
                                                                                                     >
                                                                                                         {allSelected ? 'All ✓' : 'All'}
                                                                                                     </button>
                                                                                                 </td>
                                                                                             );
                                                                                         })}
                                                                                     </tr>
                                                                                </thead>
                                                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                                                                                    {eligibleUsers.map((u: any) => (
                                                                                        <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                                                            <td className="px-4 py-3">
                                                                                                <p className="font-bold text-slate-800 dark:text-white text-xs">{u.name}</p>
                                                                                                <p className="text-[9px] text-slate-400 truncate max-w-[160px]">{u.email}</p>
                                                                                            </td>
                                                                                            {FEATURES.map(f => {
                                                                                                const featureIds: string[] = (num.permissions || {})[f.key] || [];
                                                                                                const hasNoRestriction = featureIds.length === 0;
                                                                                                const hasAccess = hasNoRestriction || featureIds.includes(u.id);
                                                                                                return (
                                                                                                    <td key={f.key} className="px-3 py-3 text-center">
                                                                                                        <button
                                                                                                            onClick={() => toggleFeatureUser(f.key, u.id)}
                                                                                                            title={hasNoRestriction ? `All users have ${f.label} access. Click to restrict to specific users.` : (hasAccess ? `Remove ${f.label} access` : `Grant ${f.label} access`)}
                                                                                                            className={`w-5 h-5 rounded border-2 flex items-center justify-center mx-auto transition-all ${
                                                                                                                hasAccess
                                                                                                                    ? hasNoRestriction
                                                                                                                        ? 'bg-emerald-100 dark:bg-emerald-900/20 border-emerald-400 dark:border-emerald-600'
                                                                                                                        : 'bg-indigo-600 border-indigo-600'
                                                                                                                    : 'border-slate-300 dark:border-slate-600 hover:border-indigo-400'
                                                                                                            }`}
                                                                                                        >
                                                                                                            {hasAccess && (
                                                                                                                hasNoRestriction
                                                                                                                    ? <svg className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                                                                                                    : <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                                                                                            )}
                                                                                                        </button>
                                                                                                    </td>
                                                                                                );
                                                                                            })}
                                                                                        </tr>
                                                                                    ))}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    )}
                                                                    <p className="text-[9px] text-slate-400 mt-2">
                                                                        <span className="inline-flex items-center gap-1 mr-3"><span className="w-3 h-3 rounded border-2 bg-emerald-100 border-emerald-400 inline-block align-middle"></span> Green = all users allowed (no restriction set)</span>
                                                                        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded border-2 bg-indigo-600 border-indigo-600 inline-block align-middle"></span> Indigo = explicitly granted</span>
                                                                    </p>
                                                                </div>

                                                                {/* Save row */}
                                                                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                                                                    {numPermToast?.id === num.id && (
                                                                        <span className={`text-xs font-bold ${numPermToast.text.startsWith('⚠') ? 'text-rose-600' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                                            {numPermToast.text}
                                                                        </span>
                                                                    )}
                                                                    <div className="ml-auto flex gap-2">
                                                                        <button
                                                                            onClick={() => setExpandedNumId(null)}
                                                                            className="px-4 py-2 text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleSavePermissions(num)}
                                                                            disabled={numPermSaving}
                                                                            className="px-5 py-2 text-xs font-black uppercase tracking-widest bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition-all shadow-sm"
                                                                        >
                                                                            {numPermSaving ? 'Saving…' : 'Save Access'}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
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
                                                    {(['city-state', 'area-code', 'ported'] as const).map(m => (
                                                        <button
                                                            key={m}
                                                            onClick={() => { setAddNumMode(m); setNumError(''); }}
                                                            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                                                                addNumMode === m
                                                                    ? 'bg-violet-600 text-white'
                                                                    : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50'
                                                            }`}
                                                        >
                                                            {m === 'city-state' ? 'City / State' : m === 'area-code' ? 'Area Code' : 'Ported Number'}
                                                        </button>
                                                    ))}
                                                </div>

                                                {addNumMode === 'city-state' && (
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
                                                )}

                                                {addNumMode === 'area-code' && (
                                                    <div>
                                                        <label className={labelCn}>Area Code <span className="text-rose-500">*</span></label>
                                                        <input type="text" value={addNumAreaCode}
                                                            onChange={e => setAddNumAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                                                            className={inputCn + ' font-mono'} placeholder="615" maxLength={3} />
                                                    </div>
                                                )}

                                                {addNumMode === 'ported' && (
                                                    <div>
                                                        <label className={labelCn}>Ported Phone Number <span className="text-rose-500">*</span></label>
                                                        <input type="tel" value={addNumPorted}
                                                            onChange={e => setAddNumPorted(e.target.value)}
                                                            className={inputCn} placeholder="e.g. +16155550100" />
                                                        <p className="text-[10px] text-slate-400 mt-1">Enter the phone number that was ported into SignalWire.</p>
                                                    </div>
                                                )}

                                                <button
                                                    onClick={handleSearch}
                                                    disabled={addNumBusy}
                                                    className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                                                >
                                                    {addNumBusy ? 'Searching…' : addNumMode === 'ported' ? 'Verify Ported Number' : 'Search Available Numbers'}
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

                    {/* ── Port-In Request Modal overlay ───────────────────── */}
                    {showPortInModal && (
                        <PortInRequestModal
                            churchId={churchId}
                            church={church}
                            currentUser={currentUser}
                            onClose={() => setShowPortInModal(false)}
                        />
                    )}

                </div>
            );
        })()}

        {activeTab === 'Grow Integration' && (() => {
            const pendingRequest = church.growSettings?.growPendingRequest;
            const isConnected = !!church.growSettings?.growIntegrationSecret;

            return (
                <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-sm">
                    <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
                        <div>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tighter">Grow Integration</h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Discipleship app email sending</p>
                        </div>
                        {isConnected && (
                            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-1.5 rounded-full">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                Connected
                            </span>
                        )}
                    </div>

                    <div className="space-y-6">

                        {/* ── Pending Request Banner ─────────────────────────── */}
                        {pendingRequest && pendingRequest.status === 'pending' && (
                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-2xl p-6">
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-800/40 flex items-center justify-center text-xl shrink-0">🔔</div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-amber-900 dark:text-amber-300">Access Request from Grow App</p>
                                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                                            <strong>{pendingRequest.appName}</strong> is requesting permission to send emails through this Pastoral Care account.
                                        </p>
                                        <p className="text-[10px] text-amber-600/70 dark:text-amber-500/70 mt-1 font-mono">
                                            Requested: {new Date(pendingRequest.requestedAt).toLocaleString()}
                                        </p>
                                        {growMsg && (
                                            <p className={`text-xs mt-2 font-bold ${growMsg.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                {growMsg.text}
                                            </p>
                                        )}
                                        <div className="flex gap-3 mt-4">
                                            <button
                                                onClick={handleGrowApprove}
                                                disabled={growApproving}
                                                className="bg-emerald-600 text-white px-5 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-50 shadow-sm"
                                            >
                                                {growApproving ? 'Approving…' : '✓ Approve'}
                                            </button>
                                            <button
                                                onClick={handleGrowReject}
                                                className="bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 px-5 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all"
                                            >
                                                ✕ Reject
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {pendingRequest?.status === 'rejected' && (
                            <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-2xl p-4 text-xs text-rose-700 dark:text-rose-300 font-bold">
                                ✕ The last access request from <strong>{pendingRequest.appName}</strong> was rejected.
                                <button onClick={() => onUpdateChurch && onUpdateChurch({ growSettings: { ...church.growSettings, growPendingRequest: null } })}
                                    className="ml-3 underline text-rose-500 font-normal">Clear</button>
                            </div>
                        )}

                        {pendingRequest?.status === 'approved' && growMsg && (
                            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4 text-xs text-emerald-700 dark:text-emerald-300 font-bold">
                                ✅ {growMsg.text}
                            </div>
                        )}

                        {/* ── API Connection Details ─────────────────────────── */}
                        <div className="flex flex-col p-6 bg-indigo-50 dark:bg-indigo-900/10 rounded-2xl border border-indigo-200 dark:border-indigo-800">
                            <div className="mb-4">
                                <p className="text-sm font-black text-indigo-900 dark:text-indigo-300">API Connection Details</p>
                                <p className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-1">
                                    Use these details to connect your Grow application to this Pastoral Care tenant.
                                    The Grow App can also request access automatically — see the instructions below.
                                </p>
                            </div>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[10px] font-bold text-indigo-900/70 dark:text-indigo-300/70 mb-1 uppercase tracking-widest">Your Tenant ID (Church ID)</label>
                                    <div className="flex items-center gap-2">
                                        <code className="px-3 py-2 bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-800 rounded-lg text-xs font-mono text-slate-700 dark:text-slate-300 flex-1 truncate">{churchId}</code>
                                        <button onClick={() => navigator.clipboard.writeText(churchId)} className="shrink-0 px-3 py-2 bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-800 dark:hover:bg-indigo-700 text-indigo-700 dark:text-indigo-300 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors">Copy</button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-indigo-900/70 dark:text-indigo-300/70 mb-1 uppercase tracking-widest">Daily Email Endpoint</label>
                                    <div className="flex items-center gap-2">
                                        <code className="px-3 py-2 bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-800 rounded-lg text-xs font-mono text-slate-700 dark:text-slate-300 flex-1 truncate">https://pastoralcare.barnabassoftware.com/api/integrations/grow/daily-email</code>
                                        <button onClick={() => navigator.clipboard.writeText('https://pastoralcare.barnabassoftware.com/api/integrations/grow/daily-email')} className="shrink-0 px-3 py-2 bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-800 dark:hover:bg-indigo-700 text-indigo-700 dark:text-indigo-300 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors">Copy</button>
                                    </div>
                                </div>
                                {isConnected && (
                                    <div>
                                        <label className="block text-[10px] font-bold text-indigo-900/70 dark:text-indigo-300/70 mb-1 uppercase tracking-widest">PASTORAL_CARE_API_SECRET</label>
                                        <div className="flex items-center gap-2">
                                            <code className="px-3 py-2 bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-800 rounded-lg text-xs font-mono text-slate-700 dark:text-slate-300 flex-1 truncate">{'•'.repeat(32)}</code>
                                            <button onClick={() => navigator.clipboard.writeText(church.growSettings?.growIntegrationSecret || '')} className="shrink-0 px-3 py-2 bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-800 dark:hover:bg-indigo-700 text-indigo-700 dark:text-indigo-300 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors">Copy</button>
                                        </div>
                                        <p className="text-[9px] text-indigo-500 dark:text-indigo-400 mt-1">Secret is masked for security. Use the Copy button to paste it into the Grow App.</p>
                                    </div>
                                )}
                                {isConnected && (
                                    <div className="pt-2 border-t border-indigo-200 dark:border-indigo-800">
                                        <button onClick={handleGrowRevoke} className="text-[10px] font-bold text-rose-500 hover:text-rose-700 uppercase tracking-widest transition-colors">
                                            ⚠ Revoke Access
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── Auto-Connect Instructions ─────────────────────── */}
                        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
                            <p className="text-xs font-black text-slate-900 dark:text-white mb-3">🔌 Automatic Connection Flow (for Grow App developers)</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                                The Grow App can request permission automatically without manual secret sharing.
                                Configure the Grow App with the two endpoints below — no secret is needed upfront.
                            </p>
                            <ol className="text-[11px] text-slate-600 dark:text-slate-300 space-y-3 list-decimal list-inside leading-relaxed">
                                <li>
                                    In Grow App settings, set <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">PASTORAL_CARE_CHURCH_ID</code> = <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">{churchId}</code>
                                </li>
                                <li>
                                    Call <strong>POST</strong>{' '}
                                    <button onClick={() => navigator.clipboard.writeText('https://pastoralcare.barnabassoftware.com/api/integrations/grow/request-access')} className="font-mono text-indigo-600 dark:text-indigo-400 underline hover:no-underline">
                                        /api/integrations/grow/request-access
                                    </button>{' '}
                                    with body <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">{'{"churchId":"...",'} "appName":"Grow"{'}'}</code>
                                </li>
                                <li>
                                    Poll <strong>GET</strong>{' '}
                                    <button onClick={() => navigator.clipboard.writeText(`https://pastoralcare.barnabassoftware.com/api/integrations/grow/status?churchId=${churchId}`)} className="font-mono text-indigo-600 dark:text-indigo-400 underline hover:no-underline">
                                        /api/integrations/grow/status?churchId={churchId}
                                    </button>{' '}
                                    every 30–60 seconds.
                                </li>
                                <li>When the tenant admin approves (from this page), the status changes to <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">"approved"</code> and the response includes the <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">secret</code> field.</li>
                                <li>Store the secret as <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">PASTORAL_CARE_API_SECRET</code> and begin sending emails via the daily-email endpoint.</li>
                            </ol>
                        </div>

                        {/* ── Feature Toggles ───────────────────────────────── */}
                        <div className="space-y-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Feature Toggles</p>
                            {([
                                { key: 'growTracksEnabled', label: 'Grow Tracks', desc: 'Enable structured growth tracks for members.' },
                                { key: 'bibleStudiesEnabled', label: 'Bible Studies', desc: 'Allow creation and participation in Bible studies.' },
                                { key: 'dailyEmailsEnabled', label: 'Daily Devotional Emails', desc: 'Enable automated daily spiritual growth emails for users who opt in.' },
                                { key: 'collectionsEnabled', label: 'Collections', desc: 'Enable collections functionality for users to save and organize content.' },
                            ] as const).map(({ key, label, desc }) => (
                                <div key={key} className="flex items-center justify-between p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                                    <div>
                                        <p className="text-sm font-black text-slate-900 dark:text-white">{label}</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">{desc}</p>
                                    </div>
                                    <button
                                        role="switch"
                                        aria-checked={(church.growSettings as any)?.[key] ? 'true' : 'false'}
                                        aria-label={label}
                                        title={label}
                                        onClick={() => onUpdateChurch && onUpdateChurch({ growSettings: { ...church.growSettings, [key]: !(church.growSettings as any)?.[key] } })}
                                        className={`ml-4 shrink-0 w-12 h-6 rounded-full p-1 transition-colors ${(church.growSettings as any)?.[key] ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                                    >
                                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${(church.growSettings as any)?.[key] ? 'translate-x-6' : ''}`} />
                                    </button>
                                </div>
                            ))}
                        </div>
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
                }}
                onCancel={() => setShowTermsModal(false)}
            />
        )}
        </div>
    </div>
  );
};

export default RoleAdminView;
