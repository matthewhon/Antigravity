import { GoogleGenAI } from '@google/genai';

// Provide a friendly warning if API_KEY is missing
if (!process.env.API_KEY) {
    console.error("❌ API_KEY environment variable is missing.");
    console.error("Please ensure you run this script with your Gemini API Key set (e.g., in a .env file).");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const SERVER_URL = process.env.TEST_SERVER_URL || 'http://localhost:3000';

async function testWebhook(topic: string, description: string) {
    console.log(`\n🤖 AI Agent: Testing Webhook Topic: ${topic} (${description})`);
    try {
        // 1. Ask Gemini to generate a valid webhook payload
        const prompt = `
        You are a Planning Center API expert. 
        Please generate a mock JSON payload for a Planning Center Online Webhook event.
        The event topic is: "${topic}".
        Only output the valid, raw JSON, nothing else. No markdown formatting, no backticks.
        `;
        
        console.log("   -> Generating mock payload via Gemini...");
        const response = await ai.models.generateContent({
            // Using a stable flash model, though the project defaults to 3-flash-preview. 
            // We'll use the standard 2.5 flash string for safety.
            model: "gemini-2.5-flash", 
            contents: prompt,
        });
        
        let payloadText = response.text || "{}";
        // Clean up markdown if any leaked through
        payloadText = payloadText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let payload;
        try {
            payload = JSON.parse(payloadText);
        } catch (e) {
            console.error("   ❌ Failed to parse Gemini response as JSON. Raw text:", payloadText);
            return;
        }
        
        // Ensure the event matches the topic for our simple server logic
        if (!payload.event) {
            payload.event = topic;
        }
        // Ensure data root exists
        if (!payload.data) {
            payload.data = { id: 'evt_12345' };
        }

        console.log(`   -> Mock Payload Generated successfully.`);

        // 2. Fire payload at local server
        console.log(`   -> Firing POST request to ${SERVER_URL}/pco/webhook...`);
        const res = await fetch(`${SERVER_URL}/pco/webhook?churchId=ai-test-agent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const status = res.status;
        const bodyText = await res.text();

        if (status === 200 || status === 202) {
            console.log(`   ✅ Success: Webhook endpoint returned ${status} OK. Body: ${bodyText}`);
        } else {
            console.error(`   ❌ Failed: Webhook returned ${status}. Body: ${bodyText}`);
        }

    } catch (e: any) {
        console.error(`   ❌ Error testing webhook:`, e.message);
    }
}

async function runAllTests() {
    console.log("==================================================");
    console.log("🚀 Starting AI-Driven PCO Testing Agent");
    console.log("==================================================");
    
    // Test a common PCO Webhook topic used in our server
    await testWebhook('people.v2.events.person.created', "A new person is created in PCO People");
    await testWebhook('services.v2.events.plan_person.updated', "A volunteer responds to a scheduling request in Services");
    
    console.log("\n==================================================");
    console.log("🏁 AI Testing Complete!");
    console.log("==================================================");
}

runAllTests();
