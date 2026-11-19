import assert from 'node:assert/strict';
import { executeFlowNode } from './voiceFlowEngine';
import { defaultCallingPreferences } from './voiceAvailability';
import type { VoiceFlowGraph } from '../types';

function makeMockDb(users: Record<string, any>) {
    return {
        collection: (name: string) => ({
            doc: (id: string) => ({
                get: async () => ({
                    exists: Boolean(users[id]),
                    id,
                    data: () => users[id] || {},
                }),
                update: async () => {},
            }),
            where: () => ({
                get: async () => ({
                    docs: Object.entries(users).map(([id, data]) => ({
                        id,
                        data: () => data,
                    })),
                }),
            }),
        }),
    };
}

async function runTests() {
    const offHoursPrefs = defaultCallingPreferences('America/Chicago');
    offHoursPrefs.callingHoursEnabled = true;
    // Always off via DND
    offHoursPrefs.dndOverride = { active: true, until: null, reason: 'Testing' };
    offHoursPrefs.extension = '101';
    offHoursPrefs.voicemail = {
        enabled: true,
        greetingType: 'tts',
        greetingText: 'Pastor John personal voicemail.',
        maxLengthSec: 90,
    };

    const openPrefs = defaultCallingPreferences('America/Chicago');
    openPrefs.callingHoursEnabled = false;
    openPrefs.extension = '102';

    const db = makeMockDb({
        u1: { name: 'Pastor John', roles: ['Pastor'], callingPreferences: offHoursPrefs },
        u2: { name: 'Pastor Jane', roles: ['Pastor'], callingPreferences: openPrefs },
    });

    const graph: VoiceFlowGraph = {
        entryNodeId: 'trig',
        nodes: [
            { id: 'trig', type: 'inbound_trigger', position: { x: 0, y: 0 }, label: 'Start', data: {} },
            {
                id: 'agent',
                type: 'voice_agent',
                position: { x: 200, y: 0 },
                label: 'Main Greeting',
                data: { mode: 'menu', audioUrl: 'https://example.com/greeting.mp3' },
            },
            {
                id: 'route_u1',
                type: 'route_user',
                position: { x: 400, y: 0 },
                label: 'Ring John',
                data: { userIds: ['u1'], timeoutSec: 20 },
            },
            {
                id: 'ext',
                type: 'extension_lookup',
                position: { x: 400, y: 150 },
                label: 'Ext Lookup',
                data: {},
            },
            {
                id: 'fwd',
                type: 'forward_number',
                position: { x: 400, y: 300 },
                label: 'On-Call Cell',
                data: { phoneNumber: '+15551234567', callScreening: true },
            },
            {
                id: 'sms_node',
                type: 'send_sms',
                position: { x: 400, y: 450 },
                label: 'Send Maps Link',
                data: {
                    message: 'Hi {callerName}, directions: https://maps.google.com/?q=Grace+Church',
                    ttsText: 'We just texted you our Google Maps link.',
                },
            },
        ],
        edges: [
            { id: 'e1', source: 'trig', target: 'agent' },
            { id: 'e2', source: 'agent', sourceHandle: 'digit_1', target: 'route_u1' },
            { id: 'e3', source: 'agent', sourceHandle: 'digit_2', target: 'ext' },
            { id: 'e4', source: 'agent', sourceHandle: 'digit_3', target: 'fwd' },
            { id: 'e5', source: 'agent', sourceHandle: 'digit_4', target: 'sms_node' },
        ],
    };

    const sentMessages: string[] = [];
    const ctx = {
        db,
        churchId: 'c1',
        churchTimezone: 'America/Chicago',
        smsNumberId: 'n1',
        numData: { recordCalls: false, voicemailEnabled: true },
        flowId: 'f1',
        graph,
        callSid: 'call_1',
        fromPhone: '+15550001111',
        toPhone: '+15559990000',
        callerName: 'Alice',
        baseUrl: 'https://app.example.com',
        pushDispatcher: async () => {},
        smsSender: async (msg: string) => {
            sentMessages.push(msg);
        },
    };

    // 1. Entry -> Voice Agent with <Play> inside <Gather> (barge-in)
    const entryLaml = await executeFlowNode(ctx, 'trig');
    assert.ok(entryLaml.includes('<Gather'), 'Should emit <Gather>');
    assert.ok(entryLaml.includes('<Play>https://example.com/greeting.mp3</Play>'), 'Should nest <Play> inside <Gather>');

    // 2. Pressing 1 -> route_user u1 (on DND) -> immediately falls back to u1's personal voicemail
    const dtmf1Laml = await executeFlowNode(ctx, 'agent', { digits: '1' });
    assert.ok(dtmf1Laml.includes('Pastor John personal voicemail.'), 'Should route unavailable u1 to personal voicemail');
    assert.ok(dtmf1Laml.includes('targetUserId=u1'), 'Should pass targetUserId=u1 to recordingStatusCallback');

    // 3. Pressing 102 at extension_lookup -> rings available u2
    const ext102Laml = await executeFlowNode(ctx, 'ext', { digits: '102' });
    assert.ok(ext102Laml.includes('<Client>church_c1_user_u2</Client>'), 'Should dial u2 WebRTC client');

    // 4. Pressing 3 -> forward_number with callScreening whisper
    const fwdLaml = await executeFlowNode(ctx, 'agent', { digits: '3' });
    assert.ok(fwdLaml.includes('url="https://app.example.com/api/voice/whisper?callerName=Alice"'), 'Should include whisper url');

    // 5. Pressing 4 -> send_sms sends personalized link and plays confirmation
    const smsLaml = await executeFlowNode(ctx, 'agent', { digits: '4' });
    assert.equal(sentMessages.length, 1, 'Should send 1 SMS');
    assert.ok(sentMessages[0].includes('Hi Alice, directions: https://maps.google.com'), 'Should personalize SMS');
    assert.ok(smsLaml.includes('We just texted you our Google Maps link.'), 'Should speak confirmation');

    console.log('All voiceFlowEngine tests passed!');
}

runTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
