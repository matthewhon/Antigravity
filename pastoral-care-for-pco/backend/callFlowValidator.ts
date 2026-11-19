import type { DayOfWeek, VoiceFlowEdge, VoiceFlowGraph, VoiceFlowNode, VoiceNodeType } from '../types';

export const VALID_VOICE_NODE_TYPES: ReadonlySet<VoiceNodeType> = new Set([
    'inbound_trigger',
    'hours_check',
    'voice_agent',
    'extension_lookup',
    'route_user',
    'voicemail',
    'forward_number',
    'send_sms',
    'hangup',
]);

const DAYS: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function normaliseE164(phone: string): string {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return `+${digits}`;
}

function defaultSchedule() {
    return {
        sun: { enabled: false, windows: [{ start: '09:00', end: '17:00' }] },
        mon: { enabled: true, windows: [{ start: '09:00', end: '17:00' }] },
        tue: { enabled: true, windows: [{ start: '09:00', end: '17:00' }] },
        wed: { enabled: true, windows: [{ start: '09:00', end: '17:00' }] },
        thu: { enabled: true, windows: [{ start: '09:00', end: '17:00' }] },
        fri: { enabled: true, windows: [{ start: '09:00', end: '17:00' }] },
        sat: { enabled: false, windows: [{ start: '09:00', end: '17:00' }] },
    };
}

function normalizeSchedule(raw: any) {
    const base = defaultSchedule();
    if (!raw || typeof raw !== 'object') return base;
    const out: Record<string, { enabled: boolean; windows: { start: string; end: string }[] }> = {};
    for (const day of DAYS) {
        const d = raw[day];
        if (d && typeof d === 'object') {
            const windows = Array.isArray(d.windows) && d.windows.length > 0
                ? d.windows.map((w: any) => ({
                      start: String(w?.start || '09:00'),
                      end: String(w?.end || '17:00'),
                  }))
                : base[day].windows;
            out[day] = {
                enabled: typeof d.enabled === 'boolean' ? d.enabled : base[day].enabled,
                windows,
            };
        } else {
            out[day] = base[day];
        }
    }
    return out;
}

export function getAllowedOutputHandles(type: VoiceNodeType, data: Record<string, any>): string[] {
    switch (type) {
        case 'inbound_trigger':
            return ['default'];
        case 'hours_check':
            return ['open', 'closed'];
        case 'voice_agent': {
            const digits: string[] = Array.isArray(data?.menuDigits) ? data.menuDigits.map(String) : ['1', '2'];
            return [...digits.map((d) => `digit_${d}`), 'timeout', 'invalid'];
        }
        case 'extension_lookup':
            return ['invalid', 'timeout'];
        case 'route_user':
            return ['no_answer', 'unavailable'];
        case 'forward_number':
            return ['no_answer'];
        case 'send_sms':
            return ['default'];
        case 'voicemail':
        case 'hangup':
        default:
            return [];
    }
}

export interface ValidateCallFlowOptions {
    churchTimezone?: string;
    validUserIds?: Set<string>;
}

export function validateAndLayoutCallFlowGraph(
    rawGraph: Partial<VoiceFlowGraph> | null | undefined,
    options: ValidateCallFlowOptions = {}
): { graph: VoiceFlowGraph; warnings: string[] } {
    const warnings: string[] = [];
    const churchTz = options.churchTimezone || 'America/Chicago';
    const rawNodes = Array.isArray(rawGraph?.nodes) ? rawGraph!.nodes : [];
    const rawEdges = Array.isArray(rawGraph?.edges) ? rawGraph!.edges : [];

    // 1. Filter & normalize nodes
    const seenIds = new Set<string>();
    const nodes: VoiceFlowNode[] = [];

    for (const rn of rawNodes) {
        if (!rn || typeof rn !== 'object') continue;
        const type = rn.type as VoiceNodeType;
        if (!VALID_VOICE_NODE_TYPES.has(type)) {
            warnings.push(`Ignored unsupported block type "${String(rn.type)}".`);
            continue;
        }
        const id = String(rn.id || `node_${type}_${nodes.length + 1}`).trim();
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        const data: Record<string, any> = rn.data && typeof rn.data === 'object' ? { ...rn.data } : {};

        if (type === 'hours_check') {
            data.timezone = String(data.timezone || churchTz);
            data.schedule = normalizeSchedule(data.schedule);
        } else if (type === 'voice_agent') {
            data.mode = ['menu', 'hybrid', 'extension'].includes(data.mode) ? data.mode : 'menu';
            const edgeDigits = rawEdges
                .filter((e) => e?.source === id && typeof e?.sourceHandle === 'string' && e.sourceHandle.startsWith('digit_'))
                .map((e) => e.sourceHandle!.replace('digit_', ''));
            const rawDigits = Array.isArray(data.menuDigits) ? data.menuDigits.map(String) : [];
            const mergedDigits = Array.from(new Set([...rawDigits, ...edgeDigits])).filter(Boolean);
            data.menuDigits = mergedDigits.length > 0 ? mergedDigits : ['1', '2'];
            const mr = Number(data.maxRetries);
            data.maxRetries = Number.isFinite(mr) ? Math.min(5, Math.max(0, Math.round(mr))) : 2;
            if (!data.audioUrl && !String(data.ttsText || '').trim()) {
                data.ttsText = 'Thank you for calling. Please select an option.';
            }
        } else if (type === 'route_user') {
            data.strategy = ['simultaneous', 'sequential', 'round_robin'].includes(data.strategy)
                ? data.strategy
                : 'simultaneous';
            const ts = Number(data.timeoutSec);
            data.timeoutSec = Number.isFinite(ts) ? Math.min(60, Math.max(5, Math.round(ts))) : 20;
            if (Array.isArray(data.userIds)) {
                const cleaned = data.userIds.map(String).filter((uid) => {
                    if (options.validUserIds && !options.validUserIds.has(uid)) {
                        warnings.push(`Removed unknown staff user ID "${uid}" from "${rn.label || id}".`);
                        return false;
                    }
                    return true;
                });
                data.userIds = cleaned;
            }
            if ((!Array.isArray(data.userIds) || data.userIds.length === 0) && !data.role) {
                warnings.push(`"${rn.label || 'Ring Staff'}" has no staff or role assigned yet — select recipients in the node inspector.`);
            }
        } else if (type === 'forward_number') {
            const norm = normaliseE164(data.phoneNumber || '');
            data.phoneNumber = norm;
            if (!norm) {
                warnings.push(`"${rn.label || 'Forward to Phone'}" needs a valid destination phone number.`);
            }
            const ts = Number(data.timeoutSec);
            data.timeoutSec = Number.isFinite(ts) ? Math.min(60, Math.max(5, Math.round(ts))) : 20;
        } else if (type === 'voicemail') {
            data.mode = ['context_user', 'specific_user', 'church_general'].includes(data.mode)
                ? data.mode
                : 'context_user';
            const ml = Number(data.maxLengthSec);
            data.maxLengthSec = Number.isFinite(ml) ? Math.min(300, Math.max(15, Math.round(ml))) : 120;
        } else if (type === 'send_sms') {
            data.message = String(data.message || '').trim();
            if (!data.message) {
                warnings.push(`"${rn.label || 'Send SMS'}" has an empty SMS message — fill in the text to send.`);
            }
        }

        nodes.push({
            id,
            type,
            position: { x: 0, y: 0 },
            label: String(rn.label || type).trim() || type,
            data,
        });
    }

    // 2. Ensure exactly one inbound_trigger
    let triggerNode = nodes.find((n) => n.type === 'inbound_trigger');
    if (!triggerNode) {
        triggerNode = {
            id: 'node_trigger',
            type: 'inbound_trigger',
            position: { x: 0, y: 0 },
            label: 'Inbound Call',
            data: {},
        };
        nodes.unshift(triggerNode);
        if (nodes.length > 1) {
            rawEdges.unshift({
                id: 'e_auto_trigger',
                source: triggerNode.id,
                sourceHandle: 'default',
                target: nodes[1].id,
            });
        }
    }
    const entryNodeId = triggerNode.id;
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    // 3. Filter & normalize edges
    const edges: VoiceFlowEdge[] = [];
    const seenSourceHandles = new Set<string>();

    for (let i = 0; i < rawEdges.length; i++) {
        const re = rawEdges[i];
        if (!re || !re.source || !re.target) continue;
        if (re.source === re.target) continue;
        const srcNode = nodeById.get(re.source);
        const tgtNode = nodeById.get(re.target);
        if (!srcNode || !tgtNode) continue;

        const allowed = getAllowedOutputHandles(srcNode.type, srcNode.data);
        if (allowed.length === 0) continue;

        let handle = String(re.sourceHandle || allowed[0]);
        if (!allowed.includes(handle)) {
            if (srcNode.type === 'inbound_trigger') {
                handle = 'default';
            } else {
                warnings.push(`Removed invalid connection handle "${handle}" from "${srcNode.label}".`);
                continue;
            }
        }

        const key = `${srcNode.id}::${handle}`;
        if (seenSourceHandles.has(key)) continue;
        seenSourceHandles.add(key);

        edges.push({
            id: String(re.id || `e_${srcNode.id}_${handle}_${i}`),
            source: srcNode.id,
            sourceHandle: handle,
            target: tgtNode.id,
        });
    }

    // 4. Deterministic BFS layered auto-layout
    const layerOf = new Map<string, number>();
    const queue: string[] = [entryNodeId];
    layerOf.set(entryNodeId, 0);

    while (queue.length > 0) {
        const curr = queue.shift()!;
        const currLayer = layerOf.get(curr)!;
        for (const e of edges) {
            if (e.source === curr && !layerOf.has(e.target)) {
                layerOf.set(e.target, currLayer + 1);
                queue.push(e.target);
            }
        }
    }

    const maxReachedLayer = Math.max(0, ...Array.from(layerOf.values()));
    for (const n of nodes) {
        if (!layerOf.has(n.id)) {
            layerOf.set(n.id, maxReachedLayer + 1);
        }
    }

    const layers = new Map<number, VoiceFlowNode[]>();
    for (const n of nodes) {
        const l = layerOf.get(n.id)!;
        if (!layers.has(l)) layers.set(l, []);
        layers.get(l)!.push(n);
    }

    const SPACING_X = 280;
    const SPACING_Y = 190;
    const CENTER_X = 420;
    const START_Y = 40;

    for (const [layerIdx, layerNodes] of layers.entries()) {
        const totalWidth = (layerNodes.length - 1) * SPACING_X;
        const startX = CENTER_X - totalWidth / 2;
        layerNodes.forEach((n, idx) => {
            n.position = {
                x: Math.round(startX + idx * SPACING_X),
                y: START_Y + layerIdx * SPACING_Y,
            };
        });
    }

    return {
        graph: {
            entryNodeId,
            nodes,
            edges,
        },
        warnings,
    };
}
