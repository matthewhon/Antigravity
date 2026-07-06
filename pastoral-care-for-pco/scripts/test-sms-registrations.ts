// ─── test-sms-registrations.ts ────────────────────────────────────────────────
//
// Automated test runner for Conversational SMS Event Registration.
// Tests the state machine logic by simulating SMS replies and verifying transitions.
//
// Run via: npx tsx scripts/test-sms-registrations.ts
// ─────────────────────────────────────────────────────────────────────────────

import { processRegistrationFlowReply } from '../backend/smsInbound.js';

// Mock functions from registrations service
const mockSignupQuestions = [
    { id: 'q_tshirt', label: 'T-Shirt Size', kind: 'select', required: true, options: ['Small', 'Medium', 'Large'] },
    { id: 'q_allergies', label: 'Dietary Allergies', kind: 'string', required: false, options: [] }
];

let createdPersonId = 'new_pco_person_999';
let registrationComplete = false;

// Mock the imports in Node runtime by overriding the module exports
// Since ES6 imports are read-only, we can override the helper imports locally inside the test runner by injecting mock handlers
// or by mocking the parameters to processRegistrationFlowReply. We will pass a mocked logger and database.

// Memory-based Mock Firestore
class MockDoc {
    private dataStore: any;
    private collections: Record<string, MockCollection> = {};
    constructor(dataStore: any) {
        this.dataStore = dataStore;
    }
    collection(name: string) {
        if (!this.collections[name]) {
            this.collections[name] = new MockCollection();
        }
        return this.collections[name];
    }
    async get() {
        return {
            exists: this.dataStore !== undefined,
            data: () => this.dataStore
        };
    }
    async set(val: any, options?: any) {
        if (!this.dataStore) this.dataStore = {};
        if (options?.merge) {
            Object.assign(this.dataStore, val);
        } else {
            this.dataStore = val;
        }
    }
    async update(val: any) {
        if (!this.dataStore) this.dataStore = {};
        Object.assign(this.dataStore, val);
    }
}

class MockCollection {
    private store: Record<string, any> = {};
    constructor() {}
    doc(id: string) {
        if (!this.store[id]) {
            this.store[id] = new MockDoc(undefined);
        }
        return this.store[id];
    }
    addDocData(id: string, data: any) {
        this.store[id] = new MockDoc(data);
    }
}

class MockDb {
    public collections: Record<string, MockCollection> = {};
    constructor() {
        this.collections['smsRegistrationProgress'] = new MockCollection();
        this.collections['smsConversations'] = new MockCollection();
        this.collections['people'] = new MockCollection();
    }
    collection(name: string) {
        if (!this.collections[name]) {
            this.collections[name] = new MockCollection();
        }
        return this.collections[name];
    }
}

const mockLog = {
    info: (msg: string, ...args: any[]) => console.log(`[INFO] ${msg}`, ...args),
    warn: (msg: string, ...args: any[]) => console.warn(`[WARN] ${msg}`, ...args),
    error: (msg: string, ...args: any[]) => console.error(`[ERROR] ${msg}`, ...args)
};

// We intercept the functions processRegistrationFlowReply uses from the registrations service by defining them globally/mocking them.
// We can temporarily modify the imports or simply mock processRegistrationFlowReply's dependency environment.
// To mock ES module imports cleanly, we can temporarily patch the imported functions on the global object or override them.
// Let's check how smsInbound.ts imports pcoRegistrationsService.
// It does: `import { getPcoSignupQuestions, createPcoPerson, registerPersonForEvent } from './pcoRegistrationsService.js';`
// Since we are running in tsx, we can mock the functions by dynamically patching the prototype/exports or exporting our own mocks.
// Let's define the mocks on global/module level.
import * as pcoRegService from '../backend/pcoRegistrationsService.js';

// Assign mock handlers to pcoRegService.mocks
pcoRegService.mocks.getPcoSignupQuestions = async (churchId: string, signupId: string) => {
    console.log(`[MOCK PCO] Fetching questions for signup: ${signupId}`);
    return mockSignupQuestions;
};

pcoRegService.mocks.createPcoPerson = async (churchId: string, firstName: string, lastName: string, email: string | null, phone: string) => {
    console.log(`[MOCK PCO] Creating person: ${firstName} ${lastName} (${email})`);
    return createdPersonId;
};

pcoRegService.mocks.registerPersonForEvent = async (churchId: string, personId: string, signupId: string, answers: any) => {
    console.log(`[MOCK PCO] Completing registration for person ${personId}:`, answers);
    registrationComplete = true;
    return { registrationId: 'reg_123', attendeeId: 'att_123' };
};


async function runTests() {
    console.log('=== STARTING SMS REGISTRATION STATE MACHINE TESTS ===');
    
    // ----------------------------------------------------
    // TEST CASE 1: Flow for unrecognized phone number (creates person then answers questions)
    // ----------------------------------------------------
    console.log('\n--- Test Case 1: Unmatched Phone Number Flow ---');
    const db = new MockDb();
    const churchId = 'test_church';
    const convId = 'test_conv_1';
    const regProgressId = 'test_church_main_15550001';
    
    // Initialize the invitation progress state (no personId mapped)
    const initialProgress = {
        id: regProgressId,
        churchId,
        smsNumberId: 'main',
        phoneNumber: '+15550001',
        personId: null, // trigger profile gathering
        personName: 'Guest',
        signupId: 'signup_summer_camp',
        eventName: 'Summer Camp 2026',
        status: 'invited',
        currentQuestionIndex: -1,
        answers: {},
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    db.collection('smsRegistrationProgress').addDocData(regProgressId, initialProgress);
    db.collection('smsConversations').addDocData(convId, { id: convId });

    // Step 1: User replies YES to invitation
    let progressSnap = await db.collection('smsRegistrationProgress').doc(regProgressId).get();
    let twiml = await processRegistrationFlowReply(db, mockLog, churchId, progressSnap.data(), 'YES', convId, 'main', '+15559999');
    console.log('TwiML Response (YES):', twiml);
    
    // Verify status advanced to gathering_profile and currentQuestionIndex = 0 (First Name)
    let currentProgress = (await db.collection('smsRegistrationProgress').doc(regProgressId).get()).data();
    console.log('Current State:', { status: currentProgress.status, step: currentProgress.currentQuestionIndex });
    if (currentProgress.status !== 'gathering_profile' || currentProgress.currentQuestionIndex !== 0) {
        throw new Error('Test Case 1 Step 1 Failed');
    }

    // Step 2: User provides First Name "Alice"
    progressSnap = await db.collection('smsRegistrationProgress').doc(regProgressId).get();
    twiml = await processRegistrationFlowReply(db, mockLog, churchId, progressSnap.data(), 'Alice', convId, 'main', '+15559999');
    console.log('TwiML Response (First Name):', twiml);
    
    currentProgress = (await db.collection('smsRegistrationProgress').doc(regProgressId).get()).data();
    console.log('Current State:', { status: currentProgress.status, step: currentProgress.currentQuestionIndex, personFirstName: currentProgress.personFirstName });
    if (currentProgress.personFirstName !== 'Alice' || currentProgress.currentQuestionIndex !== 1) {
        throw new Error('Test Case 1 Step 2 Failed');
    }

    // Step 3: User provides Last Name "Smith"
    progressSnap = await db.collection('smsRegistrationProgress').doc(regProgressId).get();
    twiml = await processRegistrationFlowReply(db, mockLog, churchId, progressSnap.data(), 'Smith', convId, 'main', '+15559999');
    console.log('TwiML Response (Last Name):', twiml);
    
    currentProgress = (await db.collection('smsRegistrationProgress').doc(regProgressId).get()).data();
    console.log('Current State:', { status: currentProgress.status, step: currentProgress.currentQuestionIndex, personLastName: currentProgress.personLastName });
    if (currentProgress.personLastName !== 'Smith' || currentProgress.currentQuestionIndex !== 2) {
        throw new Error('Test Case 1 Step 3 Failed');
    }

    // Step 4: User provides Email "alice@example.com"
    progressSnap = await db.collection('smsRegistrationProgress').doc(regProgressId).get();
    twiml = await processRegistrationFlowReply(db, mockLog, churchId, progressSnap.data(), 'alice@example.com', convId, 'main', '+15559999');
    console.log('TwiML Response (Email / Transition to Q1):', twiml);
    
    currentProgress = (await db.collection('smsRegistrationProgress').doc(regProgressId).get()).data();
    console.log('Current State:', { status: currentProgress.status, step: currentProgress.currentQuestionIndex, personId: currentProgress.personId });
    if (currentProgress.personId !== createdPersonId || currentProgress.status !== 'in_progress' || currentProgress.currentQuestionIndex !== 0) {
        throw new Error('Test Case 1 Step 4 Failed');
    }

    // Step 5: Answer T-shirt question with invalid option "Extra Large"
    progressSnap = await db.collection('smsRegistrationProgress').doc(regProgressId).get();
    twiml = await processRegistrationFlowReply(db, mockLog, churchId, progressSnap.data(), 'Extra Large', convId, 'main', '+15559999');
    console.log('TwiML Response (Invalid selection):', twiml);
    
    currentProgress = (await db.collection('smsRegistrationProgress').doc(regProgressId).get()).data();
    console.log('Current State:', { status: currentProgress.status, step: currentProgress.currentQuestionIndex });
    // Index should still be 0 because validation failed
    if (currentProgress.currentQuestionIndex !== 0) {
        throw new Error('Test Case 1 Step 5 Failed (Validation did not block progression)');
    }

    // Step 6: Answer T-shirt question with option numeric index "2" (Medium)
    progressSnap = await db.collection('smsRegistrationProgress').doc(regProgressId).get();
    twiml = await processRegistrationFlowReply(db, mockLog, churchId, progressSnap.data(), '2', convId, 'main', '+15559999');
    console.log('TwiML Response (Option index choice):', twiml);
    
    currentProgress = (await db.collection('smsRegistrationProgress').doc(regProgressId).get()).data();
    console.log('Current State:', { status: currentProgress.status, step: currentProgress.currentQuestionIndex, answers: currentProgress.answers });
    if (currentProgress.answers['q_tshirt'] !== 'Medium' || currentProgress.currentQuestionIndex !== 1) {
        throw new Error('Test Case 1 Step 6 Failed');
    }

    // Step 7: Answer second question (Dietary Allergies text question) with "None"
    registrationComplete = false;
    progressSnap = await db.collection('smsRegistrationProgress').doc(regProgressId).get();
    twiml = await processRegistrationFlowReply(db, mockLog, churchId, progressSnap.data(), 'None', convId, 'main', '+15559999');
    console.log('TwiML Response (Final answer):', twiml);
    
    currentProgress = (await db.collection('smsRegistrationProgress').doc(regProgressId).get()).data();
    console.log('Current State:', { status: currentProgress.status, answers: currentProgress.answers });
    if (currentProgress.status !== 'completed' || currentProgress.answers['q_allergies'] !== 'None' || !registrationComplete) {
        throw new Error('Test Case 1 Step 7 Failed (Registration not completed)');
    }
    
    console.log('Test Case 1: PASSED!');

    // ----------------------------------------------------
    // TEST CASE 2: Flow for mapped PCO person (skip gathering profile, directly ask questions)
    // ----------------------------------------------------
    console.log('\n--- Test Case 2: Mapped Person Flow ---');
    const db2 = new MockDb();
    const regProgressId2 = 'test_church_main_15550002';
    
    const initialProgress2 = {
        id: regProgressId2,
        churchId,
        smsNumberId: 'main',
        phoneNumber: '+15550002',
        personId: 'existing_pco_person_123', // Mapped!
        personName: 'Bob Builder',
        signupId: 'signup_summer_camp',
        eventName: 'Summer Camp 2026',
        status: 'invited',
        currentQuestionIndex: -1,
        answers: {},
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    db2.collection('smsRegistrationProgress').addDocData(regProgressId2, initialProgress2);
    db2.collection('smsConversations').addDocData(convId, { id: convId });

    // Step 1: User replies YES to invitation
    let progressSnap2 = await db2.collection('smsRegistrationProgress').doc(regProgressId2).get();
    twiml = await processRegistrationFlowReply(db2, mockLog, churchId, progressSnap2.data(), 'YES', convId, 'main', '+15559999');
    console.log('TwiML Response (YES):', twiml);
    
    // Verify status jumped directly to in_progress and index = 0
    currentProgress = (await db2.collection('smsRegistrationProgress').doc(regProgressId2).get()).data();
    console.log('Current State:', { status: currentProgress.status, step: currentProgress.currentQuestionIndex });
    if (currentProgress.status !== 'in_progress' || currentProgress.currentQuestionIndex !== 0) {
        throw new Error('Test Case 2 Step 1 Failed (Did not jump directly to questions)');
    }
    
    console.log('Test Case 2: PASSED!');
    
    console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
    process.exit(0);
}

runTests().catch(err => {
    console.error('Test run failed with error:', err);
    process.exit(1);
});
