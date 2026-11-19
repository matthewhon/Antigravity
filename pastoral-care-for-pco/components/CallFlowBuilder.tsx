import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    Handle,
    Position,
    addEdge,
    useNodesState,
    useEdgesState,
    type Connection,
    type Edge,
    type Node,
    type NodeProps,
    ReactFlowProvider,
    useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
    PhoneIncoming, Clock, Bot, Hash, Users, Voicemail, PhoneForwarded, PhoneOff,
    Plus, Save, Rocket, Play, Trash2, CheckCircle2, AlertTriangle, X, Sparkles, MessageSquare
} from 'lucide-react';
import {
    collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc
} from 'firebase/firestore';
import { db as firebaseDb } from '../services/firebase';
import { AudioGreetingUploader } from './AudioGreetingUploader';
import { AICallFlowModal } from './AICallFlowModal';
import type {
    DayOfWeek, TwilioPhoneNumber, User, VoiceFlow, VoiceFlowGraph, VoiceFlowNode, VoiceNodeType
} from '../types';

interface CallFlowBuilderProps {
    churchId: string;
    churchTimezone?: string;
    users: User[];
    numbers: TwilioPhoneNumber[];
    onClose?: () => void;
    onNumberFlowAssigned?: (numberId: string, flowId: string | null) => void;
}

const NODE_META: Record<VoiceNodeType, { title: string; color: string; icon: React.ReactNode; desc: string }> = {
    inbound_trigger: {
        title: 'Inbound Call',
        color: 'bg-emerald-600',
        icon: <PhoneIncoming className="w-3.5 h-3.5" />,
        desc: 'Entry point for incoming calls',
    },
    hours_check: {
        title: 'Schedule Check',
        color: 'bg-amber-600',
        icon: <Clock className="w-3.5 h-3.5" />,
        desc: 'Branch on open vs closed hours',
    },
    voice_agent: {
        title: 'Voice Agent / Menu',
        color: 'bg-indigo-600',
        icon: <Bot className="w-3.5 h-3.5" />,
        desc: 'Play recording & route by keypad',
    },
    extension_lookup: {
        title: 'Dial by Extension',
        color: 'bg-violet-600',
        icon: <Hash className="w-3.5 h-3.5" />,
        desc: 'Caller enters staff extension',
    },
    route_user: {
        title: 'Ring Staff / Group',
        color: 'bg-sky-600',
        icon: <Users className="w-3.5 h-3.5" />,
        desc: 'Ring available users (respects hours)',
    },
    voicemail: {
        title: 'Voicemail',
        color: 'bg-rose-600',
        icon: <Voicemail className="w-3.5 h-3.5" />,
        desc: 'Personal or general voicemail',
    },
    forward_number: {
        title: 'Forward to Phone',
        color: 'bg-teal-600',
        icon: <PhoneForwarded className="w-3.5 h-3.5" />,
        desc: 'Forward to external number',
    },
    send_sms: {
        title: 'Send Text / Link',
        color: 'bg-fuchsia-600',
        icon: <MessageSquare className="w-3.5 h-3.5" />,
        desc: 'Text caller a website, map, or link',
    },
    hangup: {
        title: 'Message & Hangup',
        color: 'bg-slate-700',
        icon: <PhoneOff className="w-3.5 h-3.5" />,
        desc: 'Play closing message & end',
    },
};

function getOutputHandles(type: VoiceNodeType, data: Record<string, any>): { id: string; label: string }[] {
    switch (type) {
        case 'inbound_trigger':
            return [{ id: 'default', label: 'Next' }];
        case 'hours_check':
            return [
                { id: 'open', label: 'Open' },
                { id: 'closed', label: 'Closed' },
            ];
        case 'voice_agent': {
            const digits: string[] = Array.isArray(data?.menuDigits) ? data.menuDigits : ['1', '2'];
            return [
                ...digits.map((d) => ({ id: `digit_${d}`, label: `Press ${d}` })),
                { id: 'timeout', label: 'Timeout' },
                { id: 'invalid', label: 'Invalid' },
            ];
        }
        case 'extension_lookup':
            return [
                { id: 'invalid', label: 'Not Found' },
                { id: 'timeout', label: 'Timeout' },
            ];
        case 'route_user':
            return [
                { id: 'no_answer', label: 'No Answer' },
                { id: 'unavailable', label: 'All Unavailable' },
            ];
        case 'forward_number':
            return [{ id: 'no_answer', label: 'No Answer' }];
        case 'send_sms':
            return [{ id: 'default', label: 'Next' }];
        case 'voicemail':
        case 'hangup':
        default:
            return [];
    }
}

const FlowNodeCard: React.FC<NodeProps> = ({ data, selected }) => {
    const nodeType = (data?.nodeType as VoiceNodeType) || 'voice_agent';
    const meta = NODE_META[nodeType] || NODE_META.voice_agent;
    const nodeData = (data?.nodeData as Record<string, any>) || {};
    const handles = getOutputHandles(nodeType, nodeData);
    const isSimActive = Boolean(data?.simActive);

    return (
        <div
            className={`min-w-[210px] rounded-2xl bg-white dark:bg-slate-900 border-2 shadow-md transition ${
                isSimActive
                    ? 'border-emerald-500 ring-4 ring-emerald-500/20'
                    : selected
                    ? 'border-indigo-600 shadow-indigo-500/20'
                    : 'border-slate-200 dark:border-slate-700'
            }`}
        >
            {nodeType !== 'inbound_trigger' && (
                <Handle
                    type="target"
                    position={Position.Top}
                    className="!w-3 !h-3 !bg-slate-400 !border-2 !border-white"
                />
            )}

            <div className={`${meta.color} text-white px-3 py-2 rounded-t-[14px] flex items-center gap-2`}>
                {meta.icon}
                <span className="text-xs font-black tracking-tight truncate">
                    {String(data?.label || meta.title)}
                </span>
            </div>

            <div className="p-2.5 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                <p className="font-semibold text-slate-500 dark:text-slate-400 truncate">{meta.desc}</p>
                {nodeType === 'voice_agent' && (
                    <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                        {nodeData.audioUrl ? 'Custom Audio Attached' : nodeData.ttsText ? 'TTS Prompt' : 'Needs Audio / Prompt'}
                    </p>
                )}
                {nodeType === 'route_user' && (
                    <p className="text-[10px] font-bold text-sky-600 dark:text-sky-400">
                        {(nodeData.userIds?.length || 0) > 0
                            ? `${nodeData.userIds.length} user(s) · ${nodeData.strategy || 'simultaneous'} · ${Math.round((Number(nodeData.timeoutSec) || 24) / 6)} rings`
                            : nodeData.role
                            ? `Role: ${nodeData.role} · ${Math.round((Number(nodeData.timeoutSec) || 24) / 6)} rings`
                            : 'Select staff'}
                    </p>
                )}
                {nodeType === 'voicemail' && (
                    <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                        Mode: {nodeData.mode || 'context_user'}
                    </p>
                )}
                {nodeType === 'send_sms' && (
                    <p className="text-[10px] font-bold text-fuchsia-600 dark:text-fuchsia-400 truncate">
                        {nodeData.message ? String(nodeData.message) : 'Set text message'}
                    </p>
                )}
            </div>

            {handles.length > 0 && (
                <div className="border-t border-slate-100 dark:border-slate-800 px-2 py-2 flex flex-wrap gap-1.5 justify-center bg-slate-50/70 dark:bg-slate-950/40 rounded-b-[14px]">
                    {handles.map((h) => (
                        <div key={h.id} className="relative px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-200 pb-2">
                            {h.label}
                            <Handle
                                type="source"
                                id={h.id}
                                position={Position.Bottom}
                                className="!w-2.5 !h-2.5 !bg-indigo-600 !border-2 !border-white !-bottom-1"
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const nodeTypes = { flowNode: FlowNodeCard };

function createDefaultGraph(): VoiceFlowGraph {
    return {
        entryNodeId: 'node_trigger',
        nodes: [
            {
                id: 'node_trigger',
                type: 'inbound_trigger',
                position: { x: 250, y: 40 },
                label: 'Inbound Call',
                data: {},
            },
            {
                id: 'node_agent_1',
                type: 'voice_agent',
                position: { x: 230, y: 190 },
                label: 'Main Welcome Menu',
                data: {
                    mode: 'menu',
                    ttsText: 'Thank you for calling. Press 1 for Pastoral Care, or press 2 to dial by extension.',
                    menuDigits: ['1', '2'],
                    maxRetries: 2,
                },
            },
        ],
        edges: [
            {
                id: 'e_init',
                source: 'node_trigger',
                sourceHandle: 'default',
                target: 'node_agent_1',
            },
        ],
    };
}

function toReactFlowNodes(graph: VoiceFlowGraph, simActiveNodeId?: string | null): Node[] {
    return (graph.nodes || []).map((n) => ({
        id: n.id,
        type: 'flowNode',
        position: n.position || { x: 100, y: 100 },
        data: {
            label: n.label,
            nodeType: n.type,
            nodeData: n.data || {},
            simActive: simActiveNodeId === n.id,
        },
    }));
}

function toReactFlowEdges(graph: VoiceFlowGraph): Edge[] {
    return (graph.edges || []).map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle || 'default',
        target: e.target,
        label: e.sourceHandle && e.sourceHandle !== 'default' ? e.sourceHandle.replace('digit_', 'Press ') : undefined,
        animated: true,
        style: { strokeWidth: 2 },
    }));
}

function fromReactFlow(nodes: Node[], edges: Edge[], entryNodeId: string): VoiceFlowGraph {
    return {
        entryNodeId,
        nodes: nodes.map((n) => ({
            id: n.id,
            type: (n.data?.nodeType as VoiceNodeType) || 'voice_agent',
            position: n.position,
            label: String(n.data?.label || ''),
            data: (n.data?.nodeData as Record<string, any>) || {},
        })),
        edges: edges.map((e) => ({
            id: e.id,
            source: e.source,
            sourceHandle: e.sourceHandle || 'default',
            target: e.target,
        })),
    };
}

const CallFlowBuilderInner: React.FC<CallFlowBuilderProps> = ({
    churchId,
    churchTimezone = 'America/Chicago',
    users,
    numbers,
    onClose,
    onNumberFlowAssigned,
}) => {
    const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
    const { screenToFlowPosition, fitView } = useReactFlow();

    const [flows, setFlows] = useState<VoiceFlow[]>([]);
    const [activeFlowId, setActiveFlowId] = useState<string>('');
    const [flowName, setFlowName] = useState('Main Church Line');
    const [entryNodeId, setEntryNodeId] = useState('node_trigger');

    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    const [saving, setSaving] = useState(false);
    const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

    // Simulator state
    const [simOpen, setSimOpen] = useState(false);
    const [simNodeId, setSimNodeId] = useState<string | null>(null);
    const [simLog, setSimLog] = useState<string[]>([]);
    const [simInput, setSimInput] = useState('');
    const [aiModalOpen, setAiModalOpen] = useState(false);

    useEffect(() => {
        if (!churchId) return;
        const q = query(collection(firebaseDb, 'voiceFlows'), where('churchId', '==', churchId));
        const unsub = onSnapshot(
            q,
            (snap) => {
                const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as VoiceFlow[];
                setFlows(list);
                if (!activeFlowId && list.length > 0) {
                    loadFlowIntoCanvas(list[0]);
                }
            },
            (err) => {
                console.error('[CallFlowBuilder] Failed to load voiceFlows:', err);
                setStatusMsg({ type: 'err', text: err?.message || 'Unable to load call flows.' });
            }
        );
        return () => unsub();
    }, [churchId]);

    const loadFlowIntoCanvas = (flow: VoiceFlow) => {
        setActiveFlowId(flow.id);
        setFlowName(flow.name);
        const g = flow.draftGraph || createDefaultGraph();
        setEntryNodeId(g.entryNodeId || 'node_trigger');
        setNodes(toReactFlowNodes(g));
        setEdges(toReactFlowEdges(g));
        setSelectedNodeId(null);
    };

    const handleCreateFlow = async () => {
        if (!churchId) {
            setStatusMsg({ type: 'err', text: 'Missing churchId.' });
            return;
        }
        setSaving(true);
        setStatusMsg(null);
        try {
            const g = createDefaultGraph();
            const now = Date.now();
            const newName = `Call Flow ${flows.length + 1}`;
            const docRef = await addDoc(collection(firebaseDb, 'voiceFlows'), {
                churchId,
                name: newName,
                status: 'draft',
                draftGraph: g,
                publishedGraph: null,
                createdAt: now,
                updatedAt: now,
            });
            setActiveFlowId(docRef.id);
            setFlowName(newName);
            setEntryNodeId(g.entryNodeId);
            setNodes(toReactFlowNodes(g));
            setEdges(toReactFlowEdges(g));
            setStatusMsg({ type: 'ok', text: 'New call flow created.' });
        } catch (err: any) {
            console.error('[CallFlowBuilder] handleCreateFlow error:', err);
            setStatusMsg({ type: 'err', text: err?.message || 'Failed to create call flow.' });
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteFlow = async () => {
        if (!activeFlowId) return;
        if (!window.confirm('Delete this call flow? Numbers using it will fall back to standard ringing.')) return;
        setSaving(true);
        setStatusMsg(null);
        try {
            await deleteDoc(doc(firebaseDb, 'voiceFlows', activeFlowId));
            setActiveFlowId('');
            setNodes([]);
            setEdges([]);
        } catch (err: any) {
            setStatusMsg({ type: 'err', text: err?.message || 'Failed to delete call flow.' });
        } finally {
            setSaving(false);
        }
    };

    const onConnect = useCallback(
        (params: Connection) => {
            setEdges((eds) =>
                addEdge(
                    {
                        ...params,
                        id: `e_${params.source}_${params.sourceHandle || 'default'}_${params.target}_${Date.now().toString(36)}`,
                        label:
                            params.sourceHandle && params.sourceHandle !== 'default'
                                ? params.sourceHandle.replace('digit_', 'Press ')
                                : undefined,
                        animated: true,
                        style: { strokeWidth: 2 },
                    } as Edge,
                    eds
                )
            );
        },
        [setEdges]
    );

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();
            const type = event.dataTransfer.getData('application/reactflow') as VoiceNodeType;
            if (!type || !NODE_META[type]) return;

            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });
            const id = `node_${type}_${Date.now().toString(36)}`;
            const defaultData: Record<string, any> =
                type === 'voice_agent'
                    ? { mode: 'menu', menuDigits: ['1', '2'], ttsText: 'Please select an option.', maxRetries: 2 }
                    : type === 'route_user'
                    ? { userIds: [], strategy: 'simultaneous', timeoutSec: 20 }
                    : type === 'voicemail'
                    ? { mode: 'context_user' }
                    : type === 'send_sms'
                    ? { message: '', ttsText: 'We have just texted that information to your phone.' }
                    : type === 'hours_check'
                    ? {
                          timezone: churchTimezone,
                          schedule: {
                              sun: { enabled: false, windows: [{ start: '09:00', end: '17:00' }] },
                              mon: { enabled: true, windows: [{ start: '09:00', end: '17:00' }] },
                              tue: { enabled: true, windows: [{ start: '09:00', end: '17:00' }] },
                              wed: { enabled: true, windows: [{ start: '09:00', end: '17:00' }] },
                              thu: { enabled: true, windows: [{ start: '09:00', end: '17:00' }] },
                              fri: { enabled: true, windows: [{ start: '09:00', end: '17:00' }] },
                              sat: { enabled: false, windows: [{ start: '09:00', end: '17:00' }] },
                          },
                      }
                    : {};

            const newNode: Node = {
                id,
                type: 'flowNode',
                position,
                data: {
                    label: NODE_META[type].title,
                    nodeType: type,
                    nodeData: defaultData,
                },
            };

            setNodes((nds) => nds.concat(newNode));
            setSelectedNodeId(id);
        },
        [screenToFlowPosition, setNodes, churchTimezone]
    );

    const updateSelectedNode = (patch: { label?: string; nodeData?: Record<string, any> }) => {
        if (!selectedNodeId) return;
        setNodes((nds) =>
            nds.map((n) => {
                if (n.id !== selectedNodeId) return n;
                return {
                    ...n,
                    data: {
                        ...n.data,
                        ...(patch.label !== undefined ? { label: patch.label } : {}),
                        ...(patch.nodeData !== undefined
                            ? { nodeData: { ...(n.data?.nodeData as Record<string, any>), ...patch.nodeData } }
                            : {}),
                    },
                };
            })
        );
    };

    const validateGraph = (graph: VoiceFlowGraph): string[] => {
        const errs: string[] = [];
        const entry = graph.nodes.find((n) => n.id === graph.entryNodeId);
        if (!entry) errs.push('Flow must have an Inbound Call entry node.');
        for (const n of graph.nodes) {
            if (n.type === 'voice_agent' && !n.data?.audioUrl && !String(n.data?.ttsText || '').trim()) {
                errs.push(`"${n.label}" needs an uploaded recording or TTS prompt.`);
            }
            if (n.type === 'route_user' && !(n.data?.userIds?.length > 0) && !n.data?.role) {
                errs.push(`"${n.label}" must select at least one user or role.`);
            }
            if (n.type === 'forward_number' && !String(n.data?.phoneNumber || '').trim()) {
                errs.push(`"${n.label}" requires a destination phone number.`);
            }
            if (n.type === 'send_sms' && !String(n.data?.message || '').trim()) {
                errs.push(`"${n.label}" requires a text message to send.`);
            }
        }
        return errs;
    };

    const handleSave = async (publish: boolean) => {
        if (!activeFlowId) return;
        setSaving(true);
        setStatusMsg(null);
        try {
            const graph = fromReactFlow(nodes, edges, entryNodeId);
            if (publish) {
                const errs = validateGraph(graph);
                if (errs.length > 0) {
                    throw new Error(errs[0]);
                }
            }
            const now = Date.now();
            await updateDoc(doc(firebaseDb, 'voiceFlows', activeFlowId), {
                name: flowName.trim() || 'Untitled Call Flow',
                draftGraph: graph,
                updatedAt: now,
                ...(publish ? { status: 'published', publishedGraph: graph, publishedAt: now } : {}),
            });
            setStatusMsg({
                type: 'ok',
                text: publish ? 'Call flow published and live!' : 'Draft saved.',
            });
        } catch (err: any) {
            setStatusMsg({ type: 'err', text: err?.message || 'Save failed.' });
        } finally {
            setSaving(false);
        }
    };

    const handleAssignNumber = async (numberId: string, assign: boolean) => {
        if (!activeFlowId) return;
        const nextFlowId = assign ? activeFlowId : null;
        await updateDoc(doc(firebaseDb, 'smsNumbers', numberId), {
            voiceFlowId: nextFlowId,
            updatedAt: Date.now(),
        });
        onNumberFlowAssigned?.(numberId, nextFlowId);
    };

    // Simple interactive simulator
    const startSimulation = () => {
        setSimOpen(true);
        const startId = entryNodeId;
        const firstEdge = edges.find((e) => e.source === startId);
        const targetId = firstEdge ? firstEdge.target : startId;
        setSimNodeId(targetId);
        const targetNode = nodes.find((n) => n.id === targetId);
        setSimLog([
            `Call received -> Entered "${targetNode?.data?.label || targetId}"`,
        ]);
    };

    const stepSimulation = (input: string) => {
        if (!simNodeId) return;
        const curr = nodes.find((n) => n.id === simNodeId);
        if (!curr) return;
        const type = curr.data?.nodeType as VoiceNodeType;

        if (type === 'voice_agent') {
            const handle = `digit_${input.trim()}`;
            const edge = edges.find((e) => e.source === curr.id && e.sourceHandle === handle);
            if (edge) {
                const next = nodes.find((n) => n.id === edge.target);
                setSimNodeId(edge.target);
                setSimLog((l) => [...l, `Caller pressed "${input}" -> "${next?.data?.label || edge.target}"`]);
                return;
            }
        }
        if (type === 'extension_lookup') {
            const matchedUser = users.find((u) => u.callingPreferences?.extension === input.trim());
            if (matchedUser) {
                setSimLog((l) => [...l, `Extension ${input} matched ${matchedUser.name} -> Ringing / Personal Voicemail`]);
                return;
            }
        }
        if (type === 'hours_check') {
            const edge = edges.find((e) => e.source === curr.id && e.sourceHandle === input.trim());
            if (edge) {
                const next = nodes.find((n) => n.id === edge.target);
                setSimNodeId(edge.target);
                setSimLog((l) => [...l, `Schedule "${input}" -> "${next?.data?.label || edge.target}"`]);
                return;
            }
        }

        const fallback = edges.find((e) => e.source === curr.id && (e.sourceHandle === 'no_answer' || e.sourceHandle === 'invalid' || e.sourceHandle === 'timeout'));
        if (fallback) {
            const next = nodes.find((n) => n.id === fallback.target);
            setSimNodeId(fallback.target);
            setSimLog((l) => [...l, `Fallback (${fallback.sourceHandle}) -> "${next?.data?.label || fallback.target}"`]);
        } else {
            setSimLog((l) => [...l, `No matching route for "${input}".`]);
        }
    };

    const selectedNode = nodes.find((n) => n.id === selectedNodeId);
    const selectedType = selectedNode?.data?.nodeType as VoiceNodeType | undefined;
    const selectedData = (selectedNode?.data?.nodeData as Record<string, any>) || {};

    return (
        <div className="flex flex-col h-[760px] rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xl">
            {/* Top Bar */}
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <select
                        value={activeFlowId}
                        onChange={(e) => {
                            const f = flows.find((x) => x.id === e.target.value);
                            if (f) loadFlowIntoCanvas(f);
                        }}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold"
                    >
                        {flows.length === 0 && <option value="">No flows yet</option>}
                        {flows.map((f) => (
                            <option key={f.id} value={f.id}>
                                {f.name} ({f.status})
                            </option>
                        ))}
                    </select>

                    {activeFlowId && (
                        <input
                            type="text"
                            value={flowName}
                            onChange={(e) => setFlowName(e.target.value)}
                            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold w-44"
                        />
                    )}

                    <button
                        type="button"
                        onClick={handleCreateFlow}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-100"
                    >
                        <Plus className="w-3.5 h-3.5" /> New Flow
                    </button>

                    {activeFlowId && (
                        <button
                            type="button"
                            onClick={handleDeleteFlow}
                            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            title="Delete Flow"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {statusMsg && (
                        <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg ${statusMsg.type === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                            {statusMsg.type === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                            {statusMsg.text}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => setAiModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-black shadow-sm"
                    >
                        <Sparkles className="w-3.5 h-3.5" /> Build with AI
                    </button>
                    {activeFlowId && (
                        <>
                            <button
                                type="button"
                                onClick={startSimulation}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold hover:bg-slate-100"
                            >
                                <Play className="w-3.5 h-3.5 text-emerald-600" /> Test Flow
                            </button>
                            <button
                                type="button"
                                disabled={saving}
                                onClick={() => handleSave(false)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold hover:bg-slate-100"
                            >
                                <Save className="w-3.5 h-3.5" /> Save Draft
                            </button>
                            <button
                                type="button"
                                disabled={saving}
                                onClick={() => handleSave(true)}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black"
                            >
                                <Rocket className="w-3.5 h-3.5" /> Publish
                            </button>
                        </>
                    )}
                    {onClose && (
                        <button type="button" onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Body: Palette + Canvas + Inspector */}
            <div className="flex-1 flex min-h-0">
                {/* Left Palette */}
                <div className="w-56 border-r border-slate-200 dark:border-slate-800 p-3 space-y-2 overflow-y-auto bg-slate-50/70 dark:bg-slate-900/50">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-1">
                        Drag Blocks to Canvas
                    </p>
                    {(Object.keys(NODE_META) as VoiceNodeType[])
                        .filter((t) => t !== 'inbound_trigger')
                        .map((type) => {
                            const meta = NODE_META[type];
                            return (
                                <div
                                    key={type}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('application/reactflow', type);
                                        e.dataTransfer.effectAllowed = 'move';
                                    }}
                                    className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-grab active:cursor-grabbing hover:border-indigo-400 transition shadow-sm"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className={`${meta.color} text-white p-1.5 rounded-lg`}>{meta.icon}</span>
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{meta.title}</p>
                                            <p className="text-[10px] text-slate-400 truncate">{meta.desc}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                    {activeFlowId && numbers.length > 0 && (
                        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-1">
                                Assigned Numbers
                            </p>
                            {numbers
                                .filter((n) => n.voiceEnabled)
                                .map((n) => {
                                    const attached = n.voiceFlowId === activeFlowId;
                                    return (
                                        <label key={n.id} className="flex items-center gap-2 p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={attached}
                                                onChange={(e) => handleAssignNumber(n.id, e.target.checked)}
                                                className="rounded text-indigo-600"
                                            />
                                            <span className="font-bold truncate">{n.friendlyLabel || n.phoneNumber}</span>
                                        </label>
                                    );
                                })}
                        </div>
                    )}
                </div>

                {/* Center Canvas */}
                <div ref={reactFlowWrapper} className="flex-1 relative">
                    {!activeFlowId ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8">
                            <Bot className="w-12 h-12 text-indigo-300 mb-3" />
                            <h3 className="text-base font-black text-slate-800 dark:text-white">Visual Calling Configurator</h3>
                            <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">
                                Create a drag-and-drop call flow to route incoming callers with uploaded voice recordings, keypad menus, extensions, calling hours, and personal voicemails.
                            </p>
                            <button
                                type="button"
                                disabled={saving}
                                onClick={handleCreateFlow}
                                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-700 disabled:opacity-50"
                            >
                                {saving ? 'Creating...' : 'Create First Call Flow'}
                            </button>
                        </div>
                    ) : (
                        <ReactFlow
                            nodes={nodes.map((n) => ({
                                ...n,
                                data: { ...n.data, simActive: simOpen && simNodeId === n.id },
                            }))}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={onConnect}
                            onDrop={onDrop}
                            onDragOver={onDragOver}
                            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                            nodeTypes={nodeTypes}
                            fitView
                        >
                            <Background />
                            <Controls />
                            <MiniMap />
                        </ReactFlow>
                    )}

                    {simOpen && (
                        <div className="absolute bottom-4 left-4 right-4 max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-4 z-20 space-y-2.5">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black text-emerald-600 uppercase tracking-wider">Flow Simulator</span>
                                <button type="button" onClick={() => setSimOpen(false)} className="text-slate-400 hover:text-slate-600">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="max-h-28 overflow-y-auto text-[11px] space-y-1 bg-slate-50 dark:bg-slate-950 p-2 rounded-xl font-mono">
                                {simLog.map((line, i) => (
                                    <div key={i}>{line}</div>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={simInput}
                                    onChange={(e) => setSimInput(e.target.value)}
                                    placeholder="Enter digit (1), ext (101), or open/closed"
                                    className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        stepSimulation(simInput);
                                        setSimInput('');
                                    }}
                                    className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                                >
                                    Step
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Inspector */}
                {selectedNode && selectedType && (
                    <div className="w-80 border-l border-slate-200 dark:border-slate-800 p-4 overflow-y-auto bg-slate-50/50 dark:bg-slate-900/50 space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                                {NODE_META[selectedType].title}
                            </h4>
                            {selectedType !== 'inbound_trigger' && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
                                        setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
                                        setSelectedNodeId(null);
                                    }}
                                    className="text-xs font-bold text-rose-600 hover:text-rose-700"
                                >
                                    Delete Block
                                </button>
                            )}
                        </div>

                        <div>
                            <label className="text-[11px] font-bold text-slate-500">Block Label</label>
                            <input
                                type="text"
                                value={String(selectedNode.data?.label || '')}
                                onChange={(e) => updateSelectedNode({ label: e.target.value })}
                                className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold"
                            />
                        </div>

                        {(selectedType === 'voice_agent' || selectedType === 'extension_lookup' || selectedType === 'hangup' || selectedType === 'send_sms') && (
                            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                                <AudioGreetingUploader
                                    churchId={churchId}
                                    scope="flow_prompt"
                                    currentUrl={selectedData.audioUrl}
                                    label="Uploaded / Recorded Voice Prompt"
                                    onUploaded={(url) => updateSelectedNode({ nodeData: { audioUrl: url } })}
                                    onClear={() => updateSelectedNode({ nodeData: { audioUrl: undefined } })}
                                />
                                <div>
                                    <label className="text-[11px] font-bold text-slate-500">Text-to-Speech Fallback</label>
                                    <textarea
                                        rows={2}
                                        value={selectedData.ttsText || ''}
                                        onChange={(e) => updateSelectedNode({ nodeData: { ttsText: e.target.value } })}
                                        placeholder="Spoken if no audio file is uploaded..."
                                        className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs"
                                    />
                                </div>
                            </div>
                        )}

                        {selectedType === 'voice_agent' && (
                            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                                <div>
                                    <label className="text-[11px] font-bold text-slate-500">Input Mode</label>
                                    <select
                                        value={selectedData.mode || 'menu'}
                                        onChange={(e) => updateSelectedNode({ nodeData: { mode: e.target.value } })}
                                        className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold"
                                    >
                                        <option value="menu">Single-Digit Menu (1, 2, 3...)</option>
                                        <option value="hybrid">Menu + Extension Dialing (#)</option>
                                        <option value="extension">Extension Dialing Only (#)</option>
                                    </select>
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="text-[11px] font-bold text-slate-500">Keypad Options</label>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const curr: string[] = Array.isArray(selectedData.menuDigits) ? selectedData.menuDigits : ['1', '2'];
                                                const nextDigit = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '*', '#'].find((d) => !curr.includes(d));
                                                if (nextDigit) updateSelectedNode({ nodeData: { menuDigits: [...curr, nextDigit] } });
                                            }}
                                            className="text-[11px] font-bold text-indigo-600"
                                        >
                                            + Add Key
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(Array.isArray(selectedData.menuDigits) ? selectedData.menuDigits : ['1', '2']).map((d: string) => (
                                            <span key={d} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-bold">
                                                Key {d}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const curr: string[] = selectedData.menuDigits || [];
                                                        updateSelectedNode({ nodeData: { menuDigits: curr.filter((x) => x !== d) } });
                                                    }}
                                                    className="hover:text-rose-600"
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedType === 'route_user' && (
                            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                                <div>
                                    <label className="text-[11px] font-bold text-slate-500">Ring Strategy</label>
                                    <select
                                        value={selectedData.strategy || 'simultaneous'}
                                        onChange={(e) => updateSelectedNode({ nodeData: { strategy: e.target.value } })}
                                        className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold"
                                    >
                                        <option value="simultaneous">Simultaneous (Ring All Available)</option>
                                        <option value="sequential">Sequential (One by One)</option>
                                        <option value="round_robin">Round-Robin</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="text-[11px] font-bold text-slate-500">Target Staff (Respects Calling Hours)</label>
                                    <div className="mt-1 max-h-40 overflow-y-auto space-y-1 bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
                                        {users.map((u) => {
                                            const ids: string[] = Array.isArray(selectedData.userIds) ? selectedData.userIds : [];
                                            const checked = ids.includes(u.id);
                                            return (
                                                <label key={u.id} className="flex items-center justify-between text-xs cursor-pointer py-0.5">
                                                    <span className="flex items-center gap-2 truncate">
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={(e) => {
                                                                const next = e.target.checked
                                                                    ? [...ids, u.id]
                                                                    : ids.filter((x) => x !== u.id);
                                                                updateSelectedNode({ nodeData: { userIds: next } });
                                                            }}
                                                            className="rounded text-indigo-600"
                                                        />
                                                        <span className="truncate">{u.name}</span>
                                                    </span>
                                                    {u.callingPreferences?.extension && (
                                                        <span className="text-[10px] font-bold text-slate-400">ext {u.callingPreferences.extension}</span>
                                                    )}
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>

                                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(selectedData.emergencyBypass)}
                                        onChange={(e) => updateSelectedNode({ nodeData: { emergencyBypass: e.target.checked } })}
                                        className="rounded text-indigo-600"
                                    />
                                    Urgent Branch (Allow Emergency Bypass)
                                </label>

                                <div>
                                    <label className="text-[11px] font-bold text-slate-500">Rings Before Voicemail / Next</label>
                                    <select
                                        value={Math.round((Number(selectedData.timeoutSec) || 24) / 6)}
                                        onChange={(e) => {
                                            const rings = Number(e.target.value);
                                            updateSelectedNode({ nodeData: { rings, timeoutSec: rings * 6 } });
                                        }}
                                        className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold"
                                    >
                                        {[1, 2, 3, 4, 5, 6, 8, 10].map((r) => (
                                            <option key={r} value={r}>
                                                {r} {r === 1 ? 'ring' : 'rings'} (~{r * 6}s)
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        {selectedType === 'extension_lookup' && (
                            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                                <div>
                                    <label className="text-[11px] font-bold text-slate-500">Rings Before Voicemail</label>
                                    <select
                                        value={Math.round((Number(selectedData.timeoutSec) || 24) / 6)}
                                        onChange={(e) => {
                                            const rings = Number(e.target.value);
                                            updateSelectedNode({ nodeData: { rings, timeoutSec: rings * 6 } });
                                        }}
                                        className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold"
                                    >
                                        {[1, 2, 3, 4, 5, 6, 8, 10].map((r) => (
                                            <option key={r} value={r}>
                                                {r} {r === 1 ? 'ring' : 'rings'} (~{r * 6}s)
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        {selectedType === 'voicemail' && (
                            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                                <div>
                                    <label className="text-[11px] font-bold text-slate-500">Voicemail Target</label>
                                    <select
                                        value={selectedData.mode || 'context_user'}
                                        onChange={(e) => updateSelectedNode({ nodeData: { mode: e.target.value } })}
                                        className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold"
                                    >
                                        <option value="context_user">Selected User&apos;s Personal Voicemail</option>
                                        <option value="specific_user">Specific Staff Member</option>
                                        <option value="church_general">General Church Voicemail</option>
                                    </select>
                                </div>

                                {selectedData.mode === 'specific_user' && (
                                    <select
                                        value={selectedData.userId || ''}
                                        onChange={(e) => updateSelectedNode({ nodeData: { userId: e.target.value } })}
                                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold"
                                    >
                                        <option value="">Select user...</option>
                                        {users.map((u) => (
                                            <option key={u.id} value={u.id}>{u.name}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        )}

                        {selectedType === 'send_sms' && (
                            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                                <div>
                                    <label className="text-[11px] font-bold text-slate-500">Quick Link Templates</label>
                                    <div className="mt-1 flex flex-wrap gap-1.5">
                                        {[
                                            { label: '+ Website', text: 'Visit our website: https://yourchurch.org' },
                                            { label: '+ Google Maps', text: 'Get directions here: https://maps.google.com/?q=Your+Church' },
                                            { label: '+ Facebook', text: 'Follow us on Facebook: https://facebook.com/yourchurch' },
                                        ].map((preset) => (
                                            <button
                                                key={preset.label}
                                                type="button"
                                                onClick={() => {
                                                    const curr = String(selectedData.message || '').trim();
                                                    const next = curr ? `${curr}\n${preset.text}` : preset.text;
                                                    updateSelectedNode({ nodeData: { message: next } });
                                                }}
                                                className="px-2 py-1 rounded-lg bg-fuchsia-50 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300 text-[10px] font-bold hover:bg-fuchsia-100"
                                            >
                                                {preset.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center justify-between">
                                        <label className="text-[11px] font-bold text-slate-500">Text Message to Caller</label>
                                        <span className="text-[10px] text-slate-400">{String(selectedData.message || '').length} chars</span>
                                    </div>
                                    <textarea
                                        rows={4}
                                        value={selectedData.message || ''}
                                        onChange={(e) => updateSelectedNode({ nodeData: { message: e.target.value } })}
                                        placeholder="Hi {callerName}! Here is our website: https://..."
                                        className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
                                    />
                                    <p className="text-[10px] text-slate-400 mt-1">
                                        Tip: Use <code>{'{callerName}'}</code> to personalize when the caller is in People.
                                    </p>
                                </div>
                            </div>
                        )}

                        {selectedType === 'forward_number' && (
                            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                                <div>
                                    <label className="text-[11px] font-bold text-slate-500">Phone Number (E.164)</label>
                                    <input
                                        type="tel"
                                        value={selectedData.phoneNumber || ''}
                                        onChange={(e) => updateSelectedNode({ nodeData: { phoneNumber: e.target.value } })}
                                        placeholder="+15551234567"
                                        className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-500">Rings Before Fallback</label>
                                    <select
                                        value={Math.round((Number(selectedData.timeoutSec) || 24) / 6)}
                                        onChange={(e) => {
                                            const rings = Number(e.target.value);
                                            updateSelectedNode({ nodeData: { rings, timeoutSec: rings * 6 } });
                                        }}
                                        className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold"
                                    >
                                        {[1, 2, 3, 4, 5, 6, 8, 10].map((r) => (
                                            <option key={r} value={r}>
                                                {r} {r === 1 ? 'ring' : 'rings'} (~{r * 6}s)
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(selectedData.callScreening)}
                                        onChange={(e) => updateSelectedNode({ nodeData: { callScreening: e.target.checked } })}
                                        className="rounded text-indigo-600"
                                    />
                                    Call Screening Whisper (&ldquo;Press 1 to accept&rdquo;)
                                </label>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {aiModalOpen && (
                <AICallFlowModal
                    churchId={churchId}
                    churchTimezone={churchTimezone}
                    users={users}
                    numbers={numbers}
                    hasActiveFlow={Boolean(activeFlowId)}
                    currentFlow={
                        activeFlowId && nodes.length > 0
                            ? { name: flowName, graph: fromReactFlow(nodes, edges, entryNodeId) }
                            : null
                    }
                    onClose={() => setAiModalOpen(false)}
                    onApplyToCurrentDraft={({ name, graph }) => {
                        setFlowName(name);
                        setEntryNodeId(graph.entryNodeId || 'node_trigger');
                        setNodes(toReactFlowNodes(graph));
                        setEdges(toReactFlowEdges(graph));
                        setSelectedNodeId(null);
                        setStatusMsg({ type: 'ok', text: 'AI flow applied to draft. Review & Save when ready.' });
                        setTimeout(() => fitView({ padding: 0.2 }), 50);
                    }}
                    onCreateNewFlow={async ({ name, description, graph, assignNumberId }) => {
                        const now = Date.now();
                        const newFlowPayload: Omit<VoiceFlow, 'id'> = {
                            churchId,
                            name,
                            description: description || '',
                            status: 'draft',
                            draftGraph: graph,
                            publishedGraph: null,
                            publishedAt: null,
                            createdAt: now,
                            updatedAt: now,
                        };
                        const ref = await addDoc(collection(firebaseDb, 'voiceFlows'), newFlowPayload);
                        const created: VoiceFlow = { id: ref.id, ...newFlowPayload };
                        loadFlowIntoCanvas(created);
                        if (assignNumberId) {
                            await updateDoc(doc(firebaseDb, 'smsNumbers', assignNumberId), {
                                voiceFlowId: ref.id,
                                updatedAt: now,
                            });
                            onNumberFlowAssigned?.(assignNumberId, ref.id);
                        }
                        setStatusMsg({
                            type: 'ok',
                            text: assignNumberId
                                ? 'AI flow created & assigned to number. Publish when ready.'
                                : 'AI flow created as draft. Publish when ready.',
                        });
                        setTimeout(() => fitView({ padding: 0.2 }), 50);
                    }}
                />
            )}
        </div>
    );
};

export const CallFlowBuilder: React.FC<CallFlowBuilderProps> = (props) => (
    <ReactFlowProvider>
        <CallFlowBuilderInner {...props} />
    </ReactFlowProvider>
);
