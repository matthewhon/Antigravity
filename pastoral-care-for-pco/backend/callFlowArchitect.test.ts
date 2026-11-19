import assert from 'node:assert/strict';
import { validateAndLayoutCallFlowGraph } from './callFlowValidator';
import { executeFlowNode } from './voiceFlowEngine';

async function runTests() {
    // 1. Validates, normalizes, filters unknown users, formats E.164, and auto-lays out nodes
    {
        const { graph, warnings } = validateAndLayoutCallFlowGraph(
            {
                entryNodeId: 'missing_trigger',
                nodes: [
                    {
                        id: 'n_menu',
                        type: 'voice_agent',
                        position: { x: 0, y: 0 },
                        label: 'Welcome Menu',
                        data: {
                            mode: 'menu',
                            ttsText: 'Welcome to Grace Church. Press 1 for Care, 2 for Office.',
                        },
                    },
                    {
                        id: 'n_care',
                        type: 'route_user',
                        position: { x: 0, y: 0 },
                        label: 'Pastoral Care',
                        data: {
                            userIds: ['u_pastor', 'u_ghost'],
                            strategy: 'simultaneous',
                            timeoutSec: 25,
                        },
                    },
                    {
                        id: 'n_fwd',
                        type: 'forward_number',
                        position: { x: 0, y: 0 },
                        label: 'Office Line',
                        data: {
                            phoneNumber: '(615) 555-0199',
                        },
                    },
                    {
                        id: 'n_bad',
                        type: 'not_a_real_node' as any,
                        position: { x: 0, y: 0 },
                        label: 'Bad',
                        data: {},
                    },
                ],
                edges: [
                    { id: 'e1', source: 'n_menu', sourceHandle: 'digit_1', target: 'n_care' },
                    { id: 'e2', source: 'n_menu', sourceHandle: 'digit_2', target: 'n_fwd' },
                    { id: 'e_bad', source: 'n_menu', sourceHandle: 'nonexistent', target: 'n_fwd' },
                ],
            },
            {
                churchTimezone: 'America/Chicago',
                validUserIds: new Set(['u_pastor']),
            }
        );

        // Auto-created inbound_trigger
        assert.equal(graph.entryNodeId, 'node_trigger');
        const trigger = graph.nodes.find((n) => n.id === 'node_trigger');
        assert.ok(trigger, 'Expected inbound_trigger to be created');

        // Filtered unsupported node type
        assert.equal(graph.nodes.some((n) => n.id === 'n_bad'), false);

        // Derived menuDigits from edges
        const menu = graph.nodes.find((n) => n.id === 'n_menu')!;
        assert.deepEqual(menu.data.menuDigits, ['1', '2']);

        // Filtered unknown userId
        const care = graph.nodes.find((n) => n.id === 'n_care')!;
        assert.deepEqual(care.data.userIds, ['u_pastor']);

        // E.164 normalization
        const fwd = graph.nodes.find((n) => n.id === 'n_fwd')!;
        assert.equal(fwd.data.phoneNumber, '+16155550199');

        // Invalid edge handle removed
        assert.equal(graph.edges.some((e) => e.id === 'e_bad'), false);

        // Warnings emitted for bad node, unknown user, and invalid handle
        assert.ok(warnings.length >= 3, `Expected >= 3 warnings, got ${warnings.length}`);

        // Non-overlapping coordinates
        const coords = new Set(graph.nodes.map((n) => `${n.position.x},${n.position.y}`));
        assert.equal(coords.size, graph.nodes.length, 'Expected distinct node positions');

        // 2. Execute validated graph through voiceFlowEngine
        const laml = await executeFlowNode(
            {
                db: {
                    collection: () => ({
                        doc: () => ({
                            update: async () => {},
                        }),
                    }),
                } as any,
                churchId: 'c1',
                churchTimezone: 'America/Chicago',
                smsNumberId: 'num1',
                numData: {},
                flowId: 'flow1',
                graph,
                callSid: 'CA123',
                fromPhone: '+15550001111',
                toPhone: '+16155550100',
                baseUrl: 'https://example.com',
                pushDispatcher: async () => {},
            },
            graph.entryNodeId
        );
        assert.ok(laml.includes('<Gather'), 'Expected voiceFlowEngine to emit <Gather> for welcome menu');
        assert.ok(laml.includes('Welcome to Grace Church'), 'Expected menu prompt in LaML');
    }

    console.log('All callFlowArchitect tests passed!');
}

runTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
