import React, { useState } from 'react';
import {
    Sparkles, X, Send, Loader2, CheckCircle2, AlertTriangle, Phone, ArrowRight, RotateCcw
} from 'lucide-react';
import type { TwilioPhoneNumber, User, VoiceFlowGraph } from '../types';

interface ArchitectQuestion {
    id: string;
    question: string;
    options?: string[];
    multiSelect?: boolean;
}

interface ArchitectMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface GeneratedResult {
    flowName: string;
    flowDescription: string;
    assistantMessage: string;
    graph: VoiceFlowGraph;
    warnings: string[];
}

interface AICallFlowModalProps {
    churchId: string;
    churchTimezone: string;
    users: User[];
    numbers: TwilioPhoneNumber[];
    hasActiveFlow: boolean;
    onClose: () => void;
    onApplyToCurrentDraft: (payload: { name: string; description?: string; graph: VoiceFlowGraph }) => void;
    onCreateNewFlow: (payload: {
        name: string;
        description?: string;
        graph: VoiceFlowGraph;
        assignNumberId?: string | null;
    }) => Promise<void>;
}

export const AICallFlowModal: React.FC<AICallFlowModalProps> = ({
    churchId,
    churchTimezone,
    users,
    numbers,
    hasActiveFlow,
    onClose,
    onApplyToCurrentDraft,
    onCreateNewFlow,
}) => {
    const [selectedNumberId, setSelectedNumberId] = useState<string>(numbers[0]?.id || '');
    const [initialGoal, setInitialGoal] = useState<string>('');
    const [started, setStarted] = useState(false);

    const [messages, setMessages] = useState<ArchitectMessage[]>([]);
    const [assistantPrompt, setAssistantPrompt] = useState<string>('');
    const [questions, setQuestions] = useState<ArchitectQuestion[]>([]);
    const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
    const [customReply, setCustomReply] = useState<string>('');

    const [loading, setLoading] = useState(false);
    const [applying, setApplying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<GeneratedResult | null>(null);
    const [assignToNumber, setAssignToNumber] = useState<boolean>(true);

    const selectedNumber = numbers.find((n) => n.id === selectedNumberId) || null;

    const callArchitect = async (nextMessages: ArchitectMessage[], forceBuild = false) => {
        setLoading(true);
        setError(null);
        try {
            const resp = await fetch('/ai/call-flow-architect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    churchId,
                    messages: nextMessages,
                    forceBuild,
                    context: {
                        churchTimezone,
                        selectedNumber: selectedNumber
                            ? {
                                  id: selectedNumber.id,
                                  friendlyLabel: selectedNumber.friendlyLabel,
                                  phoneNumber: selectedNumber.phoneNumber,
                              }
                            : null,
                        numbers: numbers.map((n) => ({
                            id: n.id,
                            friendlyLabel: n.friendlyLabel,
                            phoneNumber: n.phoneNumber,
                        })),
                        users: users.map((u) => ({
                            id: u.id,
                            name: u.name,
                            roles: u.roles || [],
                            extension: u.callingPreferences?.extension || undefined,
                        })),
                    },
                }),
            });
            const data = await resp.json();
            if (!resp.ok) {
                throw new Error(data?.error || 'Failed to run AI Call Flow Architect');
            }

            if (data.status === 'ready' && data.graph) {
                setResult({
                    flowName: data.flowName || selectedNumber?.friendlyLabel || 'AI Call Flow',
                    flowDescription: data.flowDescription || '',
                    assistantMessage: data.assistantMessage || 'Your call flow is ready.',
                    graph: data.graph,
                    warnings: Array.isArray(data.warnings) ? data.warnings : [],
                });
                setQuestions([]);
            } else {
                const msg = data.assistantMessage || 'A few quick questions to design your call flow:';
                setAssistantPrompt(msg);
                setQuestions(Array.isArray(data.questions) ? data.questions : []);
                setSelectedOptions({});
                setMessages([...nextMessages, { role: 'assistant', content: msg }]);
            }
        } catch (e: any) {
            setError(e?.message || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    };

    const handleStart = async () => {
        setStarted(true);
        const intro = initialGoal.trim()
            ? initialGoal.trim()
            : selectedNumber
            ? `Help me build a call flow for "${selectedNumber.friendlyLabel || selectedNumber.phoneNumber}".`
            : 'Help me build a new church call flow.';
        const initMessages: ArchitectMessage[] = [{ role: 'user', content: intro }];
        setMessages(initMessages);
        await callArchitect(initMessages, false);
    };

    const toggleOption = (q: ArchitectQuestion, opt: string) => {
        setSelectedOptions((prev) => {
            const current = prev[q.id] || [];
            if (q.multiSelect) {
                const exists = current.includes(opt);
                return {
                    ...prev,
                    [q.id]: exists ? current.filter((x) => x !== opt) : [...current, opt],
                };
            }
            return { ...prev, [q.id]: current[0] === opt ? [] : [opt] };
        });
    };

    const buildUserAnswerText = (): string => {
        const parts: string[] = [];
        for (const q of questions) {
            const chosen = selectedOptions[q.id];
            if (chosen && chosen.length > 0) {
                parts.push(`${q.question}: ${chosen.join(', ')}`);
            }
        }
        if (customReply.trim()) {
            parts.push(customReply.trim());
        }
        return parts.join('\n');
    };

    const handleSubmitAnswers = async (forceBuild = false) => {
        const answerText = buildUserAnswerText();
        if (!answerText && !forceBuild) return;
        const nextMessages: ArchitectMessage[] = answerText
            ? [...messages, { role: 'user', content: answerText }]
            : messages;
        setMessages(nextMessages);
        setCustomReply('');
        await callArchitect(nextMessages, forceBuild);
    };

    const handleReset = () => {
        setStarted(false);
        setMessages([]);
        setAssistantPrompt('');
        setQuestions([]);
        setSelectedOptions({});
        setCustomReply('');
        setResult(null);
        setError(null);
    };

    const handleCreateNew = async () => {
        if (!result) return;
        setApplying(true);
        setError(null);
        try {
            await onCreateNewFlow({
                name: result.flowName,
                description: result.flowDescription,
                graph: result.graph,
                assignNumberId: assignToNumber && selectedNumberId ? selectedNumberId : null,
            });
            onClose();
        } catch (e: any) {
            setError(e?.message || 'Failed to create flow.');
        } finally {
            setApplying(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-indigo-600/10 to-violet-600/10">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                            <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-900 dark:text-white">
                                AI Call Flow Architect
                            </h3>
                            <p className="text-xs text-slate-500">
                                Answer a few key questions and I&apos;ll build your call routing graph.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {error && (
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    {!started && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                    Which phone number is this flow for?
                                </label>
                                <select
                                    value={selectedNumberId}
                                    onChange={(e) => setSelectedNumberId(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                                >
                                    <option value="">General / Unassigned Flow</option>
                                    {numbers.map((n) => (
                                        <option key={n.id} value={n.id}>
                                            {n.friendlyLabel || 'Phone Line'} ({n.phoneNumber})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                    What should happen when someone calls this number? (optional)
                                </label>
                                <textarea
                                    rows={3}
                                    value={initialGoal}
                                    onChange={(e) => setInitialGoal(e.target.value)}
                                    placeholder="e.g. During office hours play a menu for Pastoral Care, Youth, or Staff Extensions. After hours send to general voicemail."
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm resize-none"
                                />
                            </div>

                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={handleStart}
                                    disabled={loading}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                    Ask Key Questions
                                </button>
                            </div>
                        </div>
                    )}

                    {started && loading && !result && (
                        <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-500">
                            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                            <p className="text-xs font-semibold">Designing your call flow...</p>
                        </div>
                    )}

                    {started && !loading && !result && (
                        <div className="space-y-4">
                            {assistantPrompt && (
                                <p className="text-sm text-slate-700 dark:text-slate-200 font-medium">
                                    {assistantPrompt}
                                </p>
                            )}

                            {questions.map((q) => {
                                const chosen = selectedOptions[q.id] || [];
                                return (
                                    <div
                                        key={q.id}
                                        className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2.5"
                                    >
                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                                            {q.question}
                                        </p>
                                        {Array.isArray(q.options) && q.options.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {q.options.map((opt) => {
                                                    const active = chosen.includes(opt);
                                                    return (
                                                        <button
                                                            key={opt}
                                                            type="button"
                                                            onClick={() => toggleOption(q, opt)}
                                                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
                                                                active
                                                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                                                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                                                            }`}
                                                        >
                                                            {opt}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                                    Additional details or custom answers
                                </label>
                                <textarea
                                    rows={2}
                                    value={customReply}
                                    onChange={(e) => setCustomReply(e.target.value)}
                                    placeholder="Add specific hours, staff names, menu options, or forwarding numbers..."
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm resize-none"
                                />
                            </div>
                        </div>
                    )}

                    {result && (
                        <div className="space-y-4">
                            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-1">
                                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 text-xs font-black">
                                    <CheckCircle2 className="w-4 h-4" />
                                    Ready: {result.flowName}
                                </div>
                                <p className="text-xs text-slate-700 dark:text-slate-300">
                                    {result.assistantMessage}
                                </p>
                            </div>

                            {result.warnings.length > 0 && (
                                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-1">
                                    <p className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                                        <AlertTriangle className="w-3.5 h-3.5" /> Review after applying:
                                    </p>
                                    <ul className="list-disc list-inside text-xs text-amber-700 dark:text-amber-200 space-y-0.5">
                                        {result.warnings.map((w, idx) => (
                                            <li key={idx}>{w}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                                    Generated Blocks ({result.graph.nodes.length})
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {result.graph.nodes.map((n) => (
                                        <div
                                            key={n.id}
                                            className="px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs"
                                        >
                                            <span className="font-bold text-slate-800 dark:text-slate-100 truncate">
                                                {n.label}
                                            </span>
                                            <span className="text-[10px] font-mono text-slate-400 ml-2 shrink-0">
                                                {n.type}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {selectedNumber && (
                                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={assignToNumber}
                                        onChange={(e) => setAssignToNumber(e.target.checked)}
                                        className="rounded border-slate-300 text-indigo-600"
                                    />
                                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                                    Assign new flow to {selectedNumber.friendlyLabel || selectedNumber.phoneNumber}
                                </label>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {started && (
                    <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80">
                        <button
                            type="button"
                            onClick={handleReset}
                            disabled={loading || applying}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            <RotateCcw className="w-3.5 h-3.5" /> Start Over
                        </button>

                        {!result ? (
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={loading}
                                    onClick={() => handleSubmitAnswers(true)}
                                    className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold hover:bg-slate-100"
                                >
                                    Build Flow Now
                                </button>
                                <button
                                    type="button"
                                    disabled={loading || !buildUserAnswerText()}
                                    onClick={() => handleSubmitAnswers(false)}
                                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black"
                                >
                                    <Send className="w-3.5 h-3.5" /> Continue
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                {hasActiveFlow && (
                                    <button
                                        type="button"
                                        disabled={applying}
                                        onClick={() => {
                                            onApplyToCurrentDraft({
                                                name: result.flowName,
                                                description: result.flowDescription,
                                                graph: result.graph,
                                            });
                                            onClose();
                                        }}
                                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold hover:bg-slate-100"
                                    >
                                        Apply to Current Draft
                                    </button>
                                )}
                                <button
                                    type="button"
                                    disabled={applying}
                                    onClick={handleCreateNew}
                                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black"
                                >
                                    {applying ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <ArrowRight className="w-3.5 h-3.5" />
                                    )}
                                    Create New Flow
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
