import { GoogleGenAI, Type } from '@google/genai';
import { getDb } from './firebase';
import { validateAndLayoutCallFlowGraph } from './callFlowValidator';
import type { VoiceFlowGraph } from '../types';

/**
 * POST /ai/call-flow-architect
 *
 * Interactive AI architect for church phone call flows.
 * Asks targeted discovery questions until enough context is gathered (or forceBuild is true),
 * then generates a validated, auto-laid-out VoiceFlowGraph compatible with voiceFlowEngine.ts.
 */

interface ArchitectMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface ArchitectContext {
    churchTimezone?: string;
    selectedNumber?: {
        id: string;
        friendlyLabel?: string;
        phoneNumber?: string;
    } | null;
    numbers?: Array<{ id: string; friendlyLabel?: string; phoneNumber?: string }>;
    users?: Array<{ id: string; name: string; roles?: string[]; extension?: string }>;
    currentFlow?: {
        name?: string;
        description?: string;
        graph: VoiceFlowGraph;
    } | null;
}

const resolveApiKey = async (): Promise<string | undefined> => {
    let apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    try {
        const snap = await getDb().doc('system/settings').get();
        const data = snap.data() || {};
        if (data.geminiApiKey) apiKey = String(data.geminiApiKey).trim();
    } catch (e) {
        console.error('[CallFlowArchitect] Failed to fetch system settings:', e);
    }
    return apiKey;
};

const loadKnowledge = async (churchId?: string): Promise<string> => {
    if (!churchId) return '';
    try {
        const snap = await getDb().collection('smsAgentKnowledge').doc(churchId).get();
        const k = snap.data();
        if (!k) return '';
        return [
            k.churchName && `Church: ${k.churchName}`,
            k.serviceTimes && `Service times: ${k.serviceTimes}`,
            k.location && `Location: ${k.location}`,
            k.customFacts && `Facts: ${k.customFacts}`,
        ]
            .filter(Boolean)
            .join('\n');
    } catch {
        return '';
    }
};

const architectResponseSchema = {
    type: Type.OBJECT,
    properties: {
        status: {
            type: Type.STRING,
            enum: ['needs_info', 'ready'],
        },
        assistantMessage: {
            type: Type.STRING,
        },
        questions: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING },
                    question: { type: Type.STRING },
                    options: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                    },
                    multiSelect: { type: Type.BOOLEAN },
                },
                required: ['id', 'question'],
            },
        },
        flowName: { type: Type.STRING },
        flowDescription: { type: Type.STRING },
        graph: {
            type: Type.OBJECT,
            properties: {
                entryNodeId: { type: Type.STRING },
                nodes: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            id: { type: Type.STRING },
                            type: {
                                type: Type.STRING,
                                enum: [
                                    'inbound_trigger',
                                    'hours_check',
                                    'voice_agent',
                                    'extension_lookup',
                                    'route_user',
                                    'voicemail',
                                    'forward_number',
                                    'send_sms',
                                    'hangup',
                                ],
                            },
                            label: { type: Type.STRING },
                            dataJson: { type: Type.STRING },
                        },
                        required: ['id', 'type', 'label', 'dataJson'],
                    },
                },
                edges: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            id: { type: Type.STRING },
                            source: { type: Type.STRING },
                            sourceHandle: { type: Type.STRING },
                            target: { type: Type.STRING },
                        },
                        required: ['id', 'source', 'sourceHandle', 'target'],
                    },
                },
            },
            required: ['entryNodeId', 'nodes', 'edges'],
        },
    },
    required: ['status', 'assistantMessage'],
};

const SYSTEM_INSTRUCTION = `You are a church telephony and pastoral care Call Flow Architect.
Your job is to interview the user with concise, practical questions and then design a complete VoiceFlowGraph for their phone number.

AVAILABLE NODE TYPES & THEIR EXACT DATA FIELDS (for dataJson, which MUST be a valid JSON string):
1. "inbound_trigger" — Entry point (exactly one per flow).
   - Output handles: "default"
   - dataJson: "{}"
2. "hours_check" — Branch on open vs closed schedule.
   - Output handles: "open", "closed"
   - dataJson: {"timezone":"America/Chicago","schedule":{"sun":{"enabled":false,"windows":[{"start":"09:00","end":"17:00"}]},"mon":{"enabled":true,"windows":[{"start":"09:00","end":"17:00"}]},...}}
3. "voice_agent" — Play greeting & route by keypad menu (or hybrid extension).
   - Output handles: "digit_1", "digit_2", ... (one per digit in menuDigits), plus "timeout", "invalid"
   - dataJson: {"mode":"menu","ttsText":"Thank you for calling... Press 1 for...","menuDigits":["1","2"],"maxRetries":2}
4. "extension_lookup" — Caller enters staff extension or presses 9 for directory.
   - Output handles: "invalid", "timeout"
   - dataJson: {"allowDirectory":true,"ttsText":"Please enter your party's extension followed by pound, or press 9 for the directory."}
5. "route_user" — Ring staff users or a role.
   - Output handles: "no_answer", "unavailable"
   - dataJson: {"userIds":["uid1"],"role":"Pastor","strategy":"simultaneous"|"sequential"|"round_robin","timeoutSec":20,"emergencyBypass":false}
   - Only use real userIds or roles from the provided church context!
6. "voicemail" — Record voicemail.
   - Output handles: (none, terminal)
   - dataJson: {"mode":"context_user"|"specific_user"|"church_general","userId":"optional","greetingText":"Please leave a message after the tone.","maxLengthSec":120}
7. "forward_number" — Forward to an external phone number (E.164).
   - Output handles: "no_answer"
   - dataJson: {"phoneNumber":"+16155550100","timeoutSec":20,"callScreening":false}
8. "send_sms" — Send an SMS text message to the caller (e.g., church website link, service times, giving link), speak an optional confirmation message, then continue via "default" or hang up if no outgoing edge.
   - Output handles: "default" (optional)
   - dataJson: {"message":"Here is our church website: https://example.org","ttsText":"We just texted you a link to our church website. Goodbye!"}
9. "hangup" — Play closing message & end call.
   - Output handles: (none, terminal)
   - dataJson: {"ttsText":"Our office is currently closed. Please call back during office hours."}

RULES:
- When CURRENT FLOW is provided in Church Context and the user asks to edit, update, or add to their existing flow (for example, adding a menu option to text a website link):
  - Preserve existing node IDs, labels, audioUrl fields, schedules, and unrelated edges!
  - Only add, modify, or rewire the specific nodes/edges needed for the requested change (e.g., add the new digit to an existing voice_agent's menuDigits, update its ttsText to mention the new option, and connect that digit handle to a new send_sms or other target node).
  - If the user's edit request is already clear and has all needed details (or forceBuild=true), return status="ready" immediately with the updated full graph; only ask 1-2 crisp questions if a key detail (like a website URL or destination) is missing.
- When creating a new flow from scratch (no CURRENT FLOW provided):
  - On the first turn (or if key routing details are still ambiguous and forceBuild is false), return status="needs_info" with 2 to 4 crisp questions.
- Each question should include 2-4 clickable "options" chips when helpful (e.g., ["Office hours + after-hours voicemail", "24/7 direct ring", "IVR menu with extensions"]).
- Never ask for staff names, extensions, or phone numbers that are already listed in the Church Context—reference them directly!
- Once you have enough information (usually after 1-2 user replies) OR when forceBuild=true, return status="ready" with a complete, connected "graph", a clear "flowName", "flowDescription", and a plain-English "assistantMessage" explaining the flow (or summarizing the edits made).
- Every edge's sourceHandle MUST match the allowed handles for its source node type.`;

export async function handleCallFlowArchitect(req: any, res: any) {
    try {
        const {
            churchId,
            messages = [],
            forceBuild = false,
            context = {},
        }: {
            churchId?: string;
            messages?: ArchitectMessage[];
            forceBuild?: boolean;
            context?: ArchitectContext;
        } = req.body || {};

        const apiKey = await resolveApiKey();
        if (!apiKey) {
            return res.status(500).json({ error: 'Gemini API key is not configured.' });
        }

        const knowledge = await loadKnowledge(churchId);
        const usersList = Array.isArray(context.users) ? context.users : [];
        const numbersList = Array.isArray(context.numbers) ? context.numbers : [];

        const contextSummary = [
            `Timezone: ${context.churchTimezone || 'America/Chicago'}`,
            context.selectedNumber
                ? `Target Phone Line: ${context.selectedNumber.friendlyLabel || 'Unnamed'} (${context.selectedNumber.phoneNumber || context.selectedNumber.id})`
                : numbersList.length > 0
                ? `Available Phone Lines: ${numbersList.map((n) => `${n.friendlyLabel || 'Line'} (${n.phoneNumber || n.id})`).join(', ')}`
                : 'No phone lines provided.',
            usersList.length > 0
                ? `Staff Users:\n${usersList
                      .map(
                          (u) =>
                              `- id="${u.id}" name="${u.name}" roles=${JSON.stringify(u.roles || [])}${
                                  u.extension ? ` ext="${u.extension}"` : ''
                              }`
                      )
                      .join('\n')}`
                : 'No staff users provided.',
            knowledge ? `Church Knowledge:\n${knowledge}` : '',
            context.currentFlow?.graph
                ? `CURRENT FLOW TO EDIT:\nName: ${context.currentFlow.name || 'Untitled Flow'}\n${
                      context.currentFlow.description ? `Description: ${context.currentFlow.description}\n` : ''
                  }Graph JSON:\n${JSON.stringify({
                      entryNodeId: context.currentFlow.graph.entryNodeId,
                      nodes: (context.currentFlow.graph.nodes || []).map((n) => ({
                          id: n.id,
                          type: n.type,
                          label: n.label,
                          data: n.data || {},
                      })),
                      edges: (context.currentFlow.graph.edges || []).map((e) => ({
                          id: e.id,
                          source: e.source,
                          sourceHandle: e.sourceHandle || 'default',
                          target: e.target,
                      })),
                  })}`
                : '',
            forceBuild ? 'IMPORTANT: The user clicked Build Flow Now. You MUST return status="ready" with a complete graph now using sensible defaults for any unspecified details.' : '',
        ]
            .filter(Boolean)
            .join('\n\n');

        const conversationText =
            messages.length > 0
                ? messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')
                : 'USER: Help me build a call flow for this phone number.';

        const prompt = `CHURCH CONTEXT:\n${contextSummary}\n\nCONVERSATION:\n${conversationText}`;

        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                responseMimeType: 'application/json',
                responseSchema: architectResponseSchema,
                temperature: 0.3,
            },
        });

        const rawText = response.text || '{}';
        const parsed = JSON.parse(rawText);

        if (parsed.status === 'ready' && parsed.graph) {
            const rawNodes = Array.isArray(parsed.graph.nodes)
                ? parsed.graph.nodes.map((n: any) => {
                      let data: Record<string, any> = {};
                      if (typeof n.dataJson === 'string') {
                          try {
                              data = JSON.parse(n.dataJson);
                          } catch {
                              data = {};
                          }
                      } else if (n.data && typeof n.data === 'object') {
                          data = n.data;
                      }
                      return {
                          id: n.id,
                          type: n.type,
                          position: { x: 0, y: 0 },
                          label: n.label,
                          data,
                      };
                  })
                : [];

            const rawGraph: Partial<VoiceFlowGraph> = {
                entryNodeId: parsed.graph.entryNodeId,
                nodes: rawNodes,
                edges: Array.isArray(parsed.graph.edges) ? parsed.graph.edges : [],
            };

            const validUserIds = usersList.length > 0 ? new Set(usersList.map((u) => u.id)) : undefined;
            const { graph, warnings } = validateAndLayoutCallFlowGraph(rawGraph, {
                churchTimezone: context.churchTimezone,
                validUserIds,
            });

            return res.json({
                status: 'ready',
                assistantMessage: parsed.assistantMessage || 'Here is your call flow.',
                flowName: parsed.flowName || context.selectedNumber?.friendlyLabel || 'AI Call Flow',
                flowDescription: parsed.flowDescription || '',
                graph,
                warnings,
            });
        }

        return res.json({
            status: 'needs_info',
            assistantMessage: parsed.assistantMessage || 'A few quick questions so I can design the right call flow:',
            questions: Array.isArray(parsed.questions) ? parsed.questions : [],
        });
    } catch (err: any) {
        console.error('[CallFlowArchitect] Error:', err);
        return res.status(500).json({ error: err?.message || 'Failed to run Call Flow Architect.' });
    }
}
