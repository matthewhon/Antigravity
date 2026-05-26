import { getDb } from './backend/firebase';
import { createServerLogger } from './services/logService';
import { processExecutiveAiQuery } from './backend/executiveAiAgent';
import { GoogleGenAI } from '@google/genai';

// Set environment to mock SMS
process.env.MOCK_SMS = 'true';

// Mock Logger
const mockLogger = {
    info: (msg: string, ...args: any[]) => console.log(`[INFO] ${msg}`, ...args),
    warn: (msg: string, ...args: any[]) => console.warn(`[WARN] ${msg}`, ...args),
    error: (msg: string, ...args: any[]) => console.error(`[ERROR] ${msg}`, ...args),
    debug: (msg: string, ...args: any[]) => console.log(`[DEBUG] ${msg}`, ...args),
} as any;

async function runTest() {
    console.log('🚀 Starting Executive AI Responder Test...');
    const db = getDb();
    
    // Fetch Gemini Key from Firestore to use for the test prompt
    const settingsSnap = await db.doc('system/settings').get();
    const geminiApiKey = settingsSnap.data()?.geminiApiKey;
    if (!geminiApiKey) {
        console.error('❌ No geminiApiKey found in system/settings!');
        process.exit(1);
    }
    
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

    // Mock fetch for PCO list check and Gemini proxy
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any, init: any) => {
        const urlStr = typeof input === 'string' ? input : input?.url || '';
        
        if (urlStr.includes('/pco/proxy')) {
            console.log('   [MOCK FETCH] Intercepted PCO list proxy check:', urlStr);
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    // Return valid data so the person check passes
                    data: [{ id: 'test_person_id' }]
                })
            } as any;
        }
        
        if (urlStr.includes('/ai/generate')) {
            console.log('   [MOCK FETCH] Intercepted /ai/generate proxy call');
            const body = JSON.parse(init.body);
            try {
                const mergedConfig: any = { ...(body.config || {}) };
                if (body.systemInstruction) {
                    mergedConfig.systemInstruction = body.systemInstruction;
                }
                
                const response = await ai.models.generateContent({
                    model: body.model || 'gemini-2.5-flash',
                    contents: body.prompt,
                    config: mergedConfig
                });
                
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        text: response.text || '',
                        candidates: response.candidates || []
                    })
                } as any;
            } catch (err: any) {
                console.error('   ❌ Gemini generation error in mock fetch:', err);
                return {
                    ok: false,
                    status: 500,
                    json: async () => ({ error: err.message })
                } as any;
            }
        }

        return originalFetch(input, init);
    }) as any;

    const churchId = 'ch_v0cjkh0z1';
    const personId = '3cD9NJtnJjYk6BmahoVfZyRa6Fb2'; // Mat Hon
    const phoneNumber = '+12146624661';
    const queryText = 'What is our YTD giving?';
    const listId = '4942298';
    const smsNumberId = 'ch_v0cjkh0z1_aa378651-7370-4572-8ed5-9929e89ed9b2';

    console.log(`Sending query: "${queryText}" for person ${personId} in church ${churchId}`);
    
    await processExecutiveAiQuery(
        db,
        mockLogger,
        churchId,
        personId,
        phoneNumber,
        queryText,
        listId,
        smsNumberId
    );

    console.log('🏁 Test completed successfully.');
}

runTest().catch(err => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
});
