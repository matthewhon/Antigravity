import { FieldValue } from 'firebase-admin/firestore';
import { evaluateScheduleAvailability, evaluateUserAvailability } from './voiceAvailability';
import type { VoiceFlowEdge, VoiceFlowGraph, VoiceFlowNode } from '../types';

export function escapeXml(str: string): string {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export function normaliseE164(phone: string): string {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return `+${digits}`;
}

export function sendLaml(res: any, innerXml: string): void {
    res.set('Content-Type', 'application/xml');
    res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response>${innerXml}</Response>`);
}

function findNode(graph: VoiceFlowGraph, nodeId: string): VoiceFlowNode | undefined {
    return graph.nodes.find((n) => n.id === nodeId);
}

function findNextNodeId(graph: VoiceFlowGraph, sourceId: string, sourceHandle?: string): string | null {
    const edges: VoiceFlowEdge[] = graph.edges || [];
    if (sourceHandle) {
        const exact = edges.find((e) => e.source === sourceId && e.sourceHandle === sourceHandle);
        if (exact) return exact.target;
    }
    const fallback = edges.find((e) => e.source === sourceId && (!e.sourceHandle || e.sourceHandle === 'default'));
    return fallback ? fallback.target : null;
}

function buildStepUrl(baseUrl: string, params: Record<string, string | number | undefined | null>): string {
    const qs = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
    return `${baseUrl}/api/voice/flow-step?${qs}`;
}

function renderPromptXml(data: Record<string, any>, fallbackText: string): string {
    if (data?.audioUrl) {
        return `<Play>${escapeXml(data.audioUrl)}</Play>`;
    }
    const text = String(data?.ttsText || fallbackText || '').trim();
    return text ? `<Say>${escapeXml(text)}</Say>` : '';
}

export interface FlowExecutionContext {
    db: any;
    churchId: string;
    churchTimezone: string;
    smsNumberId: string;
    numData: any;
    flowId: string;
    graph: VoiceFlowGraph;
    callSid: string;
    fromPhone: string;
    toPhone: string;
    callerName?: string | null;
    baseUrl: string;
    pushDispatcher: (targetUids: string[]) => Promise<void>;
    smsSender?: (message: string) => Promise<void>;
}

export async function renderUserVoicemailLaml(params: {
    db: any;
    churchId: string;
    targetUserId?: string | null;
    numData: any;
    baseUrl: string;
    customNodeData?: Record<string, any>;
}): Promise<string> {
    const { db, targetUserId, numData, baseUrl, customNodeData } = params;

    let promptXml = '';
    let maxLength = 120;

    if (targetUserId) {
        const uSnap = await db.collection('users').doc(targetUserId).get();
        const uData = uSnap.data() || {};
        const vm = uData.callingPreferences?.voicemail;
        if (vm && vm.enabled === false) {
            return `<Say>${escapeXml(uData.name || 'This user')} is currently unavailable and does not have voicemail enabled. Goodbye.</Say><Hangup/>`;
        }
        if (vm) {
            maxLength = Number(vm.maxLengthSec || 120);
            if (vm.greetingType === 'audio' && vm.greetingAudioUrl) {
                promptXml = `<Play>${escapeXml(vm.greetingAudioUrl)}</Play>`;
            } else if (vm.greetingText) {
                promptXml = `<Say>${escapeXml(vm.greetingText)}</Say>`;
            }
        }
        if (!promptXml) {
            promptXml = `<Say>You have reached the voicemail for ${escapeXml(uData.name || 'our staff')}. Please leave a message after the tone.</Say>`;
        }
    } else if (customNodeData) {
        maxLength = Number(customNodeData.maxLengthSec || 120);
        if (customNodeData.greetingType === 'audio' && customNodeData.greetingAudioUrl) {
            promptXml = `<Play>${escapeXml(customNodeData.greetingAudioUrl)}</Play>`;
        } else {
            promptXml = `<Say>${escapeXml(customNodeData.greetingText || numData.voicemailGreetingText || 'No one is available to take your call. Please leave a message after the tone.')}</Say>`;
        }
    } else if (numData.voicemailEnabled) {
        promptXml = `<Say>${escapeXml(numData.voicemailGreetingText || 'No one is available to take your call. Please leave a message after the tone.')}</Say>`;
    } else {
        return '<Say>No one is available to take your call. Goodbye.</Say><Hangup/>';
    }

    const recCb = baseUrl
        ? ` recordingStatusCallback="${escapeXml(
              `${baseUrl}/api/voice/recording-status?isVoicemail=1${targetUserId ? `&targetUserId=${encodeURIComponent(targetUserId)}` : ''}`
          )}"`
        : '';

    return `${promptXml}<Record maxLength="${maxLength}" playBeep="true"${recCb}/><Say>Thank you for your message. Goodbye.</Say><Hangup/>`;
}

async function appendRoutingPath(db: any, callSid: string, label: string): Promise<void> {
    if (!callSid || !label) return;
    await db
        .collection('voiceCalls')
        .doc(callSid)
        .update({ routingPath: FieldValue.arrayUnion(label) })
        .catch(() => {});
}

async function resolveUsersForChurch(db: any, churchId: string): Promise<Array<{ id: string; data: any }>> {
    const snap = await db.collection('users').where('churchId', '==', churchId).get();
    return snap.docs.map((d: any) => ({ id: d.id, data: d.data() || {} }));
}

export async function executeFlowNode(
    ctx: FlowExecutionContext,
    nodeId: string,
    stepState: {
        digits?: string;
        dialStatus?: string;
        attempt?: number;
        targetUserId?: string | null;
        seqIdx?: number;
        depth?: number;
    } = {}
): Promise<string> {
    const depth = stepState.depth ?? 0;
    if (depth > 15) {
        return '<Say>We encountered a call routing loop. Goodbye.</Say><Hangup/>';
    }

    const node = findNode(ctx.graph, nodeId);
    if (!node) {
        return '<Say>Thank you for calling. Goodbye.</Say><Hangup/>';
    }

    await appendRoutingPath(ctx.db, ctx.callSid, `${node.type}:${node.label || node.id}`);
    const data = node.data || {};
    const attempt = stepState.attempt ?? 1;

    switch (node.type) {
        case 'inbound_trigger': {
            const nextId = findNextNodeId(ctx.graph, node.id);
            if (!nextId) return '<Say>This number is not configured yet. Goodbye.</Say><Hangup/>';
            return executeFlowNode(ctx, nextId, { ...stepState, depth: depth + 1 });
        }

        case 'hours_check': {
            const tz = data.timezone || ctx.churchTimezone || 'America/Chicago';
            const res = evaluateScheduleAvailability({
                timezone: tz,
                schedule: data.schedule,
                dateOverrides: data.dateOverrides,
            });
            const handle = res.available ? 'open' : 'closed';
            const nextId = findNextNodeId(ctx.graph, node.id, handle);
            if (!nextId) {
                return '<Say>Our office is currently closed. Goodbye.</Say><Hangup/>';
            }
            return executeFlowNode(ctx, nextId, { ...stepState, depth: depth + 1 });
        }

        case 'voice_agent': {
            // If we're returning from a <Gather> callback:
            if (stepState.digits !== undefined) {
                const digits = String(stepState.digits || '').trim();
                const maxRetries = Number(data.maxRetries ?? 2);

                if (digits) {
                    const digitNextId = findNextNodeId(ctx.graph, node.id, `digit_${digits}`);
                    if (digitNextId) {
                        return executeFlowNode(ctx, digitNextId, { depth: depth + 1, attempt: 1 });
                    }

                    // Support hybrid extension dialing inside voice_agent
                    if ((data.mode === 'hybrid' || data.mode === 'extension') && digits.length >= 2) {
                        const allUsers = await resolveUsersForChurch(ctx.db, ctx.churchId);
                        const matched = allUsers.find(
                            (u) => String(u.data.callingPreferences?.extension || '').trim() === digits
                        );
                        if (matched) {
                            const ringTimeout = Math.max(6, Math.min(60, Number(data.timeoutSec || (data.rings ? Number(data.rings) * 6 : 24))));
                            return dialSingleUserWithFallback(ctx, matched.id, matched.data, node.id, depth + 1, ringTimeout);
                        }
                    }

                    // Invalid selection
                    if (attempt <= maxRetries) {
                        const actionUrl = buildStepUrl(ctx.baseUrl, {
                            flowId: ctx.flowId,
                            nodeId: node.id,
                            callSid: ctx.callSid,
                            attempt: attempt + 1,
                        });
                        const numDigitsAttr =
                            data.mode === 'menu' ? ' numDigits="1"' : ' finishOnKey="#"';
                        const prompt = renderPromptXml(data, 'Please select an option.');
                        return `<Say>Sorry, that is not a valid option.</Say><Gather input="dtmf" timeout="6"${numDigitsAttr} action="${escapeXml(actionUrl)}" method="POST">${prompt}</Gather><Redirect method="POST">${escapeXml(actionUrl)}</Redirect>`;
                    }

                    const invalidNext =
                        findNextNodeId(ctx.graph, node.id, 'invalid') ||
                        findNextNodeId(ctx.graph, node.id, 'timeout');
                    if (invalidNext) return executeFlowNode(ctx, invalidNext, { depth: depth + 1 });
                    return '<Say>Goodbye.</Say><Hangup/>';
                }

                // Timeout (no digits pressed)
                if (attempt <= maxRetries) {
                    const actionUrl = buildStepUrl(ctx.baseUrl, {
                        flowId: ctx.flowId,
                        nodeId: node.id,
                        callSid: ctx.callSid,
                        attempt: attempt + 1,
                    });
                    const numDigitsAttr =
                        data.mode === 'menu' ? ' numDigits="1"' : ' finishOnKey="#"';
                    const prompt = renderPromptXml(data, 'Please select an option.');
                    return `<Gather input="dtmf" timeout="6"${numDigitsAttr} action="${escapeXml(actionUrl)}" method="POST">${prompt}</Gather><Redirect method="POST">${escapeXml(actionUrl)}</Redirect>`;
                }
                const timeoutNext = findNextNodeId(ctx.graph, node.id, 'timeout');
                if (timeoutNext) return executeFlowNode(ctx, timeoutNext, { depth: depth + 1 });
                return '<Say>We did not receive a selection. Goodbye.</Say><Hangup/>';
            }

            // Initial entry into voice_agent: emit <Gather> with nested <Play>/<Say> for barge-in
            const actionUrl = buildStepUrl(ctx.baseUrl, {
                flowId: ctx.flowId,
                nodeId: node.id,
                callSid: ctx.callSid,
                attempt: 1,
            });
            const numDigitsAttr =
                data.mode === 'menu' || !data.mode ? ' numDigits="1"' : ' finishOnKey="#"';
            const prompt = renderPromptXml(data, 'Thank you for calling. Please select an option.');
            return `<Gather input="dtmf" timeout="7"${numDigitsAttr} action="${escapeXml(actionUrl)}" method="POST">${prompt}</Gather><Redirect method="POST">${escapeXml(actionUrl)}</Redirect>`;
        }

        case 'extension_lookup': {
            if (stepState.digits !== undefined) {
                const digits = String(stepState.digits || '').trim();
                const allUsers = await resolveUsersForChurch(ctx.db, ctx.churchId);

                if (digits === '9' && data.allowDirectory !== false) {
                    const directoryUsers = allUsers
                        .filter((u) => u.data.callingPreferences?.extension)
                        .sort((a, b) =>
                            String(a.data.callingPreferences.extension).localeCompare(
                                String(b.data.callingPreferences.extension)
                            )
                        );
                    const dirText =
                        directoryUsers.length > 0
                            ? directoryUsers
                                  .map(
                                      (u) =>
                                          `For ${u.data.name}, dial ${String(u.data.callingPreferences.extension).split('').join(' ')}.`
                                  )
                                  .join(' ')
                            : 'No extensions are currently configured.';
                    const retryUrl = buildStepUrl(ctx.baseUrl, {
                        flowId: ctx.flowId,
                        nodeId: node.id,
                        callSid: ctx.callSid,
                        attempt,
                    });
                    return `<Say>${escapeXml(dirText)}</Say><Gather input="dtmf" timeout="7" finishOnKey="#" action="${escapeXml(retryUrl)}" method="POST"><Say>Please enter the extension followed by the pound key.</Say></Gather><Redirect method="POST">${escapeXml(retryUrl)}</Redirect>`;
                }

                const matched = allUsers.find(
                    (u) => String(u.data.callingPreferences?.extension || '').trim() === digits
                );
                if (matched) {
                    const ringTimeout = Math.max(6, Math.min(60, Number(data.timeoutSec || (data.rings ? Number(data.rings) * 6 : 24))));
                    return dialSingleUserWithFallback(ctx, matched.id, matched.data, node.id, depth + 1, ringTimeout);
                }

                if (attempt < 2) {
                    const retryUrl = buildStepUrl(ctx.baseUrl, {
                        flowId: ctx.flowId,
                        nodeId: node.id,
                        callSid: ctx.callSid,
                        attempt: attempt + 1,
                    });
                    return `<Say>We could not find that extension.</Say><Gather input="dtmf" timeout="7" finishOnKey="#" action="${escapeXml(retryUrl)}" method="POST"><Say>Please enter your party&apos;s extension followed by pound, or press 9 for the directory.</Say></Gather><Redirect method="POST">${escapeXml(retryUrl)}</Redirect>`;
                }

                const invalidNext = findNextNodeId(ctx.graph, node.id, 'invalid') || findNextNodeId(ctx.graph, node.id, 'timeout');
                if (invalidNext) return executeFlowNode(ctx, invalidNext, { depth: depth + 1 });
                return '<Say>Extension not found. Goodbye.</Say><Hangup/>';
            }

            const actionUrl = buildStepUrl(ctx.baseUrl, {
                flowId: ctx.flowId,
                nodeId: node.id,
                callSid: ctx.callSid,
                attempt: 1,
            });
            const prompt = renderPromptXml(
                data,
                'Please enter your party&apos;s extension followed by the pound key, or press 9 for the staff directory.'
            );
            return `<Gather input="dtmf" timeout="7" finishOnKey="#" action="${escapeXml(actionUrl)}" method="POST">${prompt}</Gather><Redirect method="POST">${escapeXml(actionUrl)}</Redirect>`;
        }

        case 'route_user': {
            const strategy: 'simultaneous' | 'sequential' | 'round_robin' = data.strategy || 'simultaneous';
            const timeoutSec = Math.max(6, Math.min(60, Number(data.timeoutSec || (data.rings ? Number(data.rings) * 6 : 24))));
            const emergencyBypass = Boolean(data.emergencyBypass);

            // Resolve candidate user IDs
            let candidateIds: string[] = Array.isArray(data.userIds) ? data.userIds : [];
            const allUsers = await resolveUsersForChurch(ctx.db, ctx.churchId);
            if (candidateIds.length === 0 && data.role) {
                candidateIds = allUsers
                    .filter((u) => Array.isArray(u.data.roles) && u.data.roles.includes(data.role))
                    .map((u) => u.id);
            }

            // Filter by calling hours & DND
            const availableUsers = candidateIds
                .map((id) => allUsers.find((u) => u.id === id))
                .filter((u): u is { id: string; data: any } => Boolean(u))
                .filter(
                    (u) =>
                        evaluateUserAvailability(u.data, ctx.churchTimezone, Date.now(), {
                            ignoreHoursForEmergency: emergencyBypass,
                        }).available
                );

            const singleTargetId = candidateIds.length === 1 ? candidateIds[0] : stepState.targetUserId || null;

            // Returning from <Dial> action callback
            if (stepState.dialStatus !== undefined) {
                const st = stepState.dialStatus.toLowerCase();
                if (st === 'completed' || st === 'answered') {
                    return '<Hangup/>';
                }

                // If sequential, try next available user
                if (strategy === 'sequential') {
                    const nextIdx = (stepState.seqIdx ?? 0) + 1;
                    if (nextIdx < availableUsers.length) {
                        const target = availableUsers[nextIdx];
                        await ctx.pushDispatcher([target.id]).catch(() => {});
                        const actionUrl = buildStepUrl(ctx.baseUrl, {
                            flowId: ctx.flowId,
                            nodeId: node.id,
                            callSid: ctx.callSid,
                            seqIdx: nextIdx,
                            targetUserId: target.id,
                        });
                        const recordAttr = ctx.numData.recordCalls ? ' record="record-from-answer"' : '';
                        return `<Dial timeout="${timeoutSec}" action="${escapeXml(actionUrl)}"${recordAttr}><Client>church_${escapeXml(ctx.churchId)}_user_${escapeXml(target.id)}</Client></Dial>`;
                    }
                }

                const noAnswerNext = findNextNodeId(ctx.graph, node.id, 'no_answer');
                if (noAnswerNext) {
                    return executeFlowNode(ctx, noAnswerNext, {
                        targetUserId: singleTargetId,
                        depth: depth + 1,
                    });
                }
                return renderUserVoicemailLaml({
                    db: ctx.db,
                    churchId: ctx.churchId,
                    targetUserId: singleTargetId,
                    numData: ctx.numData,
                    baseUrl: ctx.baseUrl,
                });
            }

            // Initial entry into route_user
            if (availableUsers.length === 0) {
                const unavailNext =
                    findNextNodeId(ctx.graph, node.id, 'unavailable') ||
                    findNextNodeId(ctx.graph, node.id, 'no_answer');
                if (unavailNext) {
                    return executeFlowNode(ctx, unavailNext, {
                        targetUserId: singleTargetId,
                        depth: depth + 1,
                    });
                }
                return renderUserVoicemailLaml({
                    db: ctx.db,
                    churchId: ctx.churchId,
                    targetUserId: singleTargetId,
                    numData: ctx.numData,
                    baseUrl: ctx.baseUrl,
                });
            }

            let ordered = availableUsers;
            if (strategy === 'round_robin' && ordered.length > 1) {
                const offset = Math.floor(Date.now() / 1000) % ordered.length;
                ordered = [...ordered.slice(offset), ...ordered.slice(0, offset)];
            }

            const toRing = strategy === 'sequential' ? [ordered[0]] : ordered.slice(0, 10);
            const ringUids = toRing.map((u) => u.id);
            await ctx.pushDispatcher(ringUids).catch(() => {});

            const actionUrl = buildStepUrl(ctx.baseUrl, {
                flowId: ctx.flowId,
                nodeId: node.id,
                callSid: ctx.callSid,
                seqIdx: 0,
                targetUserId: singleTargetId || (ringUids.length === 1 ? ringUids[0] : ''),
            });
            const recordAttr = ctx.numData.recordCalls ? ' record="record-from-answer"' : '';
            const recCb =
                ctx.baseUrl && ctx.numData.recordCalls
                    ? ` recordingStatusCallback="${escapeXml(`${ctx.baseUrl}/api/voice/recording-status`)}"`
                    : '';
            const clientsXml = ringUids
                .map((uid) => `<Client>church_${escapeXml(ctx.churchId)}_user_${escapeXml(uid)}</Client>`)
                .join('');

            return `<Dial timeout="${timeoutSec}" action="${escapeXml(actionUrl)}"${recordAttr}${recCb}>${clientsXml}</Dial>`;
        }

        case 'voicemail': {
            const mode = data.mode || 'context_user';
            const targetUserId =
                mode === 'specific_user'
                    ? data.userId || null
                    : mode === 'context_user'
                    ? stepState.targetUserId || null
                    : null;

            return renderUserVoicemailLaml({
                db: ctx.db,
                churchId: ctx.churchId,
                targetUserId,
                numData: ctx.numData,
                baseUrl: ctx.baseUrl,
                customNodeData: mode === 'church_general' ? data : undefined,
            });
        }

        case 'forward_number': {
            if (stepState.dialStatus !== undefined) {
                const st = stepState.dialStatus.toLowerCase();
                if (st === 'completed' || st === 'answered') return '<Hangup/>';
                const noAnswerNext = findNextNodeId(ctx.graph, node.id, 'no_answer');
                if (noAnswerNext) return executeFlowNode(ctx, noAnswerNext, { depth: depth + 1 });
                return '<Say>No one is available to take your call. Goodbye.</Say><Hangup/>';
            }

            const targetPhone = normaliseE164(data.phoneNumber || '');
            if (!targetPhone) {
                const noAnswerNext = findNextNodeId(ctx.graph, node.id, 'no_answer');
                if (noAnswerNext) return executeFlowNode(ctx, noAnswerNext, { depth: depth + 1 });
                return '<Say>Forwarding number is not configured. Goodbye.</Say><Hangup/>';
            }

            const timeoutSec = Number(data.timeoutSec || 20);
            const actionUrl = buildStepUrl(ctx.baseUrl, {
                flowId: ctx.flowId,
                nodeId: node.id,
                callSid: ctx.callSid,
            });
            const whisperAttr =
                data.callScreening && ctx.baseUrl
                    ? ` url="${escapeXml(`${ctx.baseUrl}/api/voice/whisper?callerName=${encodeURIComponent(ctx.callerName || ctx.fromPhone || 'a caller')}`)}"`
                    : '';

            return `<Dial timeout="${timeoutSec}" action="${escapeXml(actionUrl)}"><Number${whisperAttr}>${escapeXml(targetPhone)}</Number></Dial>`;
        }

        case 'send_sms': {
            const rawMsg = String(data.message || '').trim();
            if (rawMsg && ctx.fromPhone && ctx.smsSender) {
                const personalized = rawMsg.replace(/\{callerName\}/gi, ctx.callerName || 'there');
                await ctx.smsSender(personalized).catch((err: any) => {
                    console.warn('[voiceFlowEngine] send_sms failed:', err?.message || err);
                });
            }
            const confirmXml = renderPromptXml(
                data,
                rawMsg ? 'We have just sent that information to your phone via text message.' : ''
            );
            const nextId = findNextNodeId(ctx.graph, node.id);
            if (nextId) {
                const nextXml = await executeFlowNode(ctx, nextId, { ...stepState, depth: depth + 1 });
                return `${confirmXml}${nextXml}`;
            }
            return `${confirmXml}<Hangup/>`;
        }

        case 'hangup': {
            const prompt = renderPromptXml(data, '');
            return `${prompt}<Hangup/>`;
        }

        default:
            return '<Say>Goodbye.</Say><Hangup/>';
    }
}

async function dialSingleUserWithFallback(
    ctx: FlowExecutionContext,
    userId: string,
    userData: any,
    sourceNodeId: string,
    depth: number,
    timeoutSec = 24
): Promise<string> {
    const avail = evaluateUserAvailability(userData, ctx.churchTimezone, Date.now());
    if (!avail.available) {
        const nextId = findNextNodeId(ctx.graph, sourceNodeId, 'no_answer');
        if (nextId) {
            return executeFlowNode(ctx, nextId, { targetUserId: userId, depth });
        }
        return renderUserVoicemailLaml({
            db: ctx.db,
            churchId: ctx.churchId,
            targetUserId: userId,
            numData: ctx.numData,
            baseUrl: ctx.baseUrl,
        });
    }

    await ctx.pushDispatcher([userId]).catch(() => {});
    const vmFallbackUrl = `${ctx.baseUrl}/api/voice/no-answer?numberId=${encodeURIComponent(ctx.smsNumberId)}&targetUserId=${encodeURIComponent(userId)}`;
    const recordAttr = ctx.numData.recordCalls ? ' record="record-from-answer"' : '';
    return `<Dial timeout="${timeoutSec}" action="${escapeXml(vmFallbackUrl)}"${recordAttr}><Client>church_${escapeXml(ctx.churchId)}_user_${escapeXml(userId)}</Client></Dial>`;
}
