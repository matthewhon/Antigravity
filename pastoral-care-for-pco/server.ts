import { automationService } from './services/automationService';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
// import * as admin from 'firebase-admin';
// import { createCheckoutSession } from './backend/createCheckoutSession';
// import { cancelSubscription } from './backend/cancelSubscription';
// import { handleStripeWebhook } from './backend/stripeWebhook';
import { pcoTokenExchange } from './backend/pcoTokenExchange';
import { pcoProxy } from './backend/pcoProxy';
import { handlePcoWebhook } from './backend/pcoWebhookHandler';
import { sendEmail, getEmailStats } from './backend/sendEmail';
import { startEmailScheduler } from './backend/emailScheduler';
import { startSyncScheduler } from './backend/syncScheduler';
import { getDb } from './backend/firebase';
import { handleGeminiProxy } from './backend/geminiProxy';
import { provisionSubuser, authenticateDomain, verifyDomain, diagnoseDomain } from './backend/emailProvisioning';
import { getPublicGroups, getPublicRegistrations, getPublicEvents, serveWidgetScript } from './backend/publicApi.js';
import { getAvailableNumbers, provisionTwilioNumber, releaseTwilioNumber, registerA2p, checkA2pStatus, createCustomerProfile, deleteCustomerProfile, addTwilioNumber, releaseSpecificNumber, updateNumberSettings, setDefaultNumber, trustHubStatusCallback } from './backend/twilioProvisioning';
import { handleInboundSms } from './backend/twilioInbound';
import { sendIndividual, sendBulk } from './backend/twilioSend';
import { handleStatusCallback } from './backend/twilioWebhookStatus';
import { startSmsCampaignScheduler } from './backend/smsCampaignScheduler';

// Fix for bundled CJS environment
const __dirname = process.cwd();
const __filename = path.join(__dirname, 'server.js');

console.log("Pre-initialization: Checking Firebase Admin (DISABLED)...");

async function startServer() {
  try {
    const app = express();
    const PORT = Number(process.env.PORT) || 8080;

    // 1. Middlewares FIRST (must come before all routes)
    app.use(cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }));

    // Handle preflight for PCO API routes
    app.options('/pco/token', cors());
    app.options('/pco/proxy', cors());
    app.options('/pco/webhook', cors());


    // 2. Immediate Health Check (For Cloud Run + App Config Test button)
    app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
    app.get('/health', (req, res) => res.json({ status: 'ok', service: 'pastoral-care-for-pco' }));

    // PCO Webhook Endpoint
    // We use express.raw to ensure we can verify the HMAC signature based on the raw body
    app.post('/pco/webhook', express.raw({ type: 'application/json' }), handlePcoWebhook);

    // PCO Token Exchange
    app.post('/pco/token', express.json(), pcoTokenExchange);

    // PCO Proxy
    app.post('/pco/proxy', express.json(), pcoProxy);

    // PCO Sync — trigger a full or per-area sync from the UI
    app.post('/pco/sync', express.json(), async (req: any, res: any) => {
      const { churchId, area } = req.body || {};
      if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

      try {
        const {
          syncAllData,
          syncPeopleData,
          syncGroupsData,
          syncServicesData,
          syncRecentGiving,
          syncCheckInCounts,
          syncCheckInsData,
          syncRegistrationsData,
        } = await import('./services/pcoSyncService.js');

        const areaMap: Record<string, () => Promise<void>> = {
          people:        () => syncPeopleData(churchId),
          groups:        () => syncGroupsData(churchId),
          services:      () => syncServicesData(churchId),
          giving:        () => syncRecentGiving(churchId),
          checkins:      () => Promise.all([syncCheckInCounts(churchId), syncCheckInsData(churchId)]).then(() => {}),
          registrations: () => syncRegistrationsData(churchId),
        };

        if (area && areaMap[area]) {
          await areaMap[area]();
          res.json({ success: true, area });
        } else {
          await syncAllData(churchId);
          res.json({ success: true, area: 'all' });
        }
      } catch (e: any) {
        res.status(500).json({ error: e.message || 'Sync failed' });
      }
    });

    // PCO Registrations Diagnostic — shows exactly what PCO returns for this church's token
    app.post('/pco/diagnose-registrations', express.json(), async (req: any, res: any) => {
      const { churchId } = req.body || {};
      if (!churchId) return res.status(400).json({ error: 'Missing churchId' });
      try {
        const db = getDb();
        const churchDoc = await db.collection('churches').doc(churchId).get();
        if (!churchDoc.exists) return res.status(404).json({ error: 'Church not found' });
        const church = churchDoc.data()!;
        const token = church.pcoAccessToken;
        if (!token) return res.status(401).json({ error: 'No PCO access token for this church' });

        // PCO Registrations API v2 uses /signups (not /events) as the top-level resource
        const pcoRes = await fetch('https://api.planningcenteronline.com/registrations/v2/signups?per_page=1', {
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        const body = await pcoRes.text();
        let parsed: any;
        try { parsed = JSON.parse(body); } catch { parsed = body; }

        res.json({
          pcoStatus: pcoRes.status,
          pcoStatusText: pcoRes.statusText,
          hasRegistrationsScope: pcoRes.status === 200,
          body: parsed,
          tokenPrefix: token.substring(0, 8) + '...',
          churchId,
        });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });


    // Gemini AI Proxy (key stays server-side)
    app.post('/ai/generate', express.json(), handleGeminiProxy);

    // Email (SendGrid)
    app.post('/email/send', express.json(), sendEmail);
    app.post('/email/test', express.json(), sendEmail);
    app.post('/email/stats', express.json(), getEmailStats);

    // Email provisioning — tenant Subuser + domain authentication
    app.post('/email/provision-subuser', express.json(), provisionSubuser);
    app.post('/email/authenticate-domain', express.json(), authenticateDomain);
    app.post('/email/verify-domain', express.json(), verifyDomain);
    app.post('/email/diagnose-domain', express.json(), diagnoseDomain);

    // ─── Public Widget Sync Endpoints ───────────────────────────────
    app.get('/api/public/groups/:churchId', getPublicGroups);
    app.get('/api/public/registrations/:churchId', getPublicRegistrations);
    app.get('/api/public/events/:churchId', getPublicEvents);
    app.get('/widget.js', serveWidgetScript);

    // ─── SMS / Messaging Endpoints ────────────────────────────────────────────
    // Twilio inbound webhook — use raw body so Twilio's x-www-form-urlencoded POST parses correctly
    app.post('/api/messaging/inbound', express.urlencoded({ extended: false }), handleInboundSms);
    // Twilio delivery status callback
    app.post('/api/messaging/status', express.urlencoded({ extended: false }), handleStatusCallback);
    // Provisioning
    app.get('/api/messaging/available-numbers', express.json(), getAvailableNumbers);
    app.post('/api/messaging/provision', express.json(), provisionTwilioNumber);
    app.post('/api/messaging/release', express.json(), releaseTwilioNumber);
    app.post('/api/messaging/a2p-register', express.json(), registerA2p);
    app.get('/api/messaging/a2p-status', checkA2pStatus);
    app.post('/api/messaging/a2p-status', express.json(), checkA2pStatus); // also accept POST
    app.post('/api/messaging/create-customer-profile', express.json(), createCustomerProfile);
    app.delete('/api/messaging/customer-profile', express.json(), deleteCustomerProfile);
    // TrustHub status webhook — Twilio posts form-urlencoded when a bundle status changes
    app.post('/api/messaging/trust-hub-status', express.urlencoded({ extended: false }), trustHubStatusCallback);
    // Multi-number endpoints
    app.post('/api/messaging/add-number', express.json(), addTwilioNumber);
    app.post('/api/messaging/release-number', express.json(), releaseSpecificNumber);
    app.patch('/api/messaging/number-settings', express.json(), updateNumberSettings);
    app.post('/api/messaging/set-default-number', express.json(), setDefaultNumber);
    // Sending
    app.post('/api/messaging/send-individual', express.json(), sendIndividual);
    app.post('/api/messaging/send-bulk', express.json(), sendBulk);

    // ─── SMS Agent: Website Scanner ─────────────────────────────────────────────
    // Fetches a church website URL server-side, extracts visible text, and uses
    // Gemini to pull out structured church information for the knowledge base.
    app.post('/api/messaging/scan-website', express.json(), async (req: any, res: any) => {
      const { url } = req.body || {};
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'Missing url' });
      }

      // Validate the URL
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          return res.status(400).json({ error: 'Only http and https URLs are supported.' });
        }
      } catch {
        return res.status(400).json({ error: 'Invalid URL format.' });
      }

      try {
        // 1. Fetch the page server-side (avoids browser CORS restrictions)
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
        let html = '';
        try {
          const pageRes = await fetch(parsedUrl.toString(), {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; PastoralCareBot/1.0; +https://pastoralcare.barnabassoftware.com)',
              'Accept': 'text/html,application/xhtml+xml',
            },
          });
          clearTimeout(timeout);
          if (!pageRes.ok) {
            return res.status(400).json({ error: `Website returned HTTP ${pageRes.status}. Please check the URL.` });
          }
          html = await pageRes.text();
        } catch (fetchErr: any) {
          clearTimeout(timeout);
          if (fetchErr.name === 'AbortError') {
            return res.status(400).json({ error: 'The website took too long to respond (10s timeout).' });
          }
          return res.status(400).json({ error: `Could not reach the website: ${fetchErr.message}` });
        }

        // 2. Strip HTML to plain text — remove scripts, styles, hidden elements, then tags
        const plainText = html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<!--[\s\S]*?-->/g, ' ')
          .replace(/<[^>]+>/g, ' ')           // strip all remaining tags
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s{3,}/g, '\n')           // collapse whitespace
          .trim()
          .slice(0, 12000);                   // cap at ~12k chars to stay within token budget

        if (plainText.length < 50) {
          return res.status(400).json({ error: 'Could not extract readable text from the page. Try a different URL (e.g. the About or Contact page).' });
        }

        // 3. Use Gemini to extract structured church info
        const { GoogleGenAI } = await import('@google/genai');
        const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (!apiKey) {
          return res.status(500).json({ error: 'AI service not configured on server.' });
        }
        const ai = new GoogleGenAI({ apiKey });

        const extractPrompt = `You are extracting structured information about a church from website content.
Read the text below and extract the following fields. For each field, return the actual value found on the page.
If a field is not clearly present on the page, omit it from the JSON (do not make up data).
Return ONLY a valid JSON object with these keys (all optional):
{
  "address": "Full physical street address of the church",
  "serviceTimes": "All service times and schedules (e.g. Sundays 9am & 11am, Wednesdays 7pm)",
  "pastor": "Lead pastor or senior pastor name and any brief bio",
  "ministries": "Ministries offered (youth, worship, mens/womens groups, missions, etc.)",
  "classes": "Small groups, discipleship classes, Alpha course, Bible studies, etc.",
  "locations": "Names and addresses of all campus or meeting locations",
  "website": "${parsedUrl.origin}",
  "phone": "Main church phone number",
  "customFacts": "Any other important church info: parking, childcare, special programs, FAQs, social media, etc."
}

WEBSITE TEXT:
${plainText}

Return ONLY the JSON object, no markdown, no explanation:`;

        const aiResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: extractPrompt,
        });

        const raw = (aiResponse.text || '').trim()
          .replace(/^```[a-z]*\n?/i, '')
          .replace(/\n?```$/i, '')
          .trim();

        let extracted: Record<string, string> = {};
        try {
          extracted = JSON.parse(raw);
        } catch {
          return res.status(500).json({ error: 'AI returned unexpected format. Please try again or enter details manually.' });
        }

        // Ensure website is always set
        extracted.website = extracted.website || parsedUrl.origin;

        return res.json({ success: true, extracted });
      } catch (e: any) {
        console.error('[ScanWebsite] Error:', e?.message || e);
        return res.status(500).json({ error: e?.message || 'An unexpected error occurred.' });
      }
    });


    // ─── Public Unsubscribe (no auth required) ───────────────────────────────
    // Token = base64url(churchId:email)

    app.get('/unsubscribe', async (req: any, res: any) => {
      const { token } = req.query;
      if (!token || typeof token !== 'string') {
        return res.status(400).send('<h2>Invalid unsubscribe link.</h2>');
      }
      try {
        const decoded = Buffer.from(token, 'base64url').toString('utf8');
        const colonIdx = decoded.indexOf(':');
        if (colonIdx < 1) return res.status(400).send('<h2>Invalid token.</h2>');
        const churchId = decoded.slice(0, colonIdx);
        const email = decoded.slice(colonIdx + 1).toLowerCase().trim();
        if (!churchId || !email || !email.includes('@')) {
          return res.status(400).send('<h2>Invalid unsubscribe token.</h2>');
        }

        const db = getDb();
        const docId = `${churchId}_${Buffer.from(email).toString('base64url')}`;

        // Check if already unsubscribed
        const existing = await db.collection('email_unsubscribes').doc(docId).get();
        if (!existing.exists) {
          await db.collection('email_unsubscribes').doc(docId).set({
            id: docId,
            churchId,
            email,
            unsubscribedAt: Date.now(),
          });
        }

        res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Unsubscribed</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);padding:48px 40px;max-width:460px;width:100%;text-align:center}
    .icon{width:64px;height:64px;background:#f0fdf4;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px}
    h1{font-size:22px;font-weight:700;color:#0f172a;margin-bottom:12px}
    p{font-size:15px;color:#64748b;line-height:1.6}
    .email{font-weight:600;color:#334155}
    .note{margin-top:20px;font-size:13px;color:#94a3b8}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <h1>You've been unsubscribed</h1>
    <p><span class="email">${email}</span> has been removed from this church's email list.</p>
    <p class="note">You won't receive any further emails from this sender. If this was a mistake, please contact your church directly.</p>
  </div>
</body>
</html>`);
      } catch (e: any) {
        console.error('[Unsubscribe] Error:', e);
        res.status(500).send('<h2>Something went wrong. Please try again later.</h2>');
      }
    });


    // GET /polls/:pollId — returns poll config for the public page
    app.get('/polls/:pollId', async (req: any, res: any) => {
      const { pollId } = req.params;
      try {
        const db = getDb();
        const pollDoc = await db.collection('polls').doc(pollId).get();
        if (!pollDoc.exists) return res.status(404).json({ error: 'Poll not found' });
        const poll = pollDoc.data()!;
        // Auto-close if past closesAt
        if (poll.closesAt && poll.closesAt < Date.now() && poll.status === 'active') {
          await db.collection('polls').doc(pollId).update({ status: 'closed', updatedAt: Date.now() });
          poll.status = 'closed';
        }
        // Return safe subset — no internal fields
        res.json({
          id: pollDoc.id,
          churchId: poll.churchId,
          title: poll.title,
          description: poll.description || null,
          status: poll.status,
          questions: poll.questions || [],
          requireName: !!poll.requireName,
          requireEmail: !!poll.requireEmail,
          showResultsToRespondents: !!poll.showResultsToRespondents,
          totalResponses: poll.totalResponses || 0,
        });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // POST /polls/:pollId/respond — submit a response
    app.post('/polls/:pollId/respond', express.json(), async (req: any, res: any) => {
      const { pollId } = req.params;
      const { answers, respondentName, respondentEmail, sessionToken } = req.body || {};
      if (!answers || typeof answers !== 'object') {
        return res.status(400).json({ error: 'Missing answers' });
      }
      try {
        const db = getDb();
        const pollDoc = await db.collection('polls').doc(pollId).get();
        if (!pollDoc.exists) return res.status(404).json({ error: 'Poll not found' });
        const poll = pollDoc.data()!;

        if (poll.status !== 'active') {
          return res.status(403).json({ error: 'This poll is not currently accepting responses.' });
        }
        if (poll.closesAt && poll.closesAt < Date.now()) {
          await db.collection('polls').doc(pollId).update({ status: 'closed', updatedAt: Date.now() });
          return res.status(403).json({ error: 'This poll has closed.' });
        }

        const responseId = `resp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const response = {
          id: responseId,
          pollId,
          churchId: poll.churchId,
          respondentName: respondentName || null,
          respondentEmail: respondentEmail || null,
          answers,
          submittedAt: Date.now(),
          sessionToken: sessionToken || null,
        };

        await db.collection('poll_responses').doc(responseId).set(response);
        await db.collection('polls').doc(pollId).update({
          totalResponses: (poll.totalResponses || 0) + 1,
          updatedAt: Date.now(),
        });

        // If showResultsToRespondents, fetch aggregated results
        if (poll.showResultsToRespondents) {
          const responsesSnap = await db.collection('poll_responses').where('pollId', '==', pollId).get();
          const allResponses = responsesSnap.docs.map(d => d.data());
          res.json({ success: true, totalResponses: (poll.totalResponses || 0) + 1, responses: allResponses });
        } else {
          res.json({ success: true });
        }
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // Schedule an email campaign
    app.post('/email/schedule', express.json(), async (req: any, res: any) => {
      const { campaignId, churchId, scheduledAt, recurringFrequency } = req.body || {};
      if (!campaignId || !churchId || !scheduledAt) {
        return res.status(400).json({ error: 'Missing campaignId, churchId, or scheduledAt' });
      }
      try {
        const db = getDb();
        const updates: any = {
          status: 'scheduled',
          scheduledAt: Number(scheduledAt),
          sendAt: new Date(Number(scheduledAt)).toISOString(),
          retryCount: 0,
          lastError: null,
          updatedAt: Date.now(),
        };
        if (recurringFrequency) updates.recurringFrequency = recurringFrequency;
        else updates.recurringFrequency = null;

        await db.collection('email_campaigns').doc(campaignId).update(updates);
        res.json({ success: true, message: 'Email scheduled successfully.' });
      } catch (e: any) {
        res.status(500).json({ error: e.message || 'Failed to schedule email' });
      }
    });

    // Cancel a scheduled email (revert to draft)
    app.post('/email/cancel-schedule', express.json(), async (req: any, res: any) => {
      const { campaignId } = req.body || {};
      if (!campaignId) return res.status(400).json({ error: 'Missing campaignId' });
      try {
        const db = getDb();
        await db.collection('email_campaigns').doc(campaignId).update({
          status: 'draft',
          scheduledAt: null,
          sendAt: null,
          recurringFrequency: null,
          retryCount: 0,
          lastError: null,
          updatedAt: Date.now(),
        });
        res.json({ success: true, message: 'Schedule cancelled.' });
      } catch (e: any) {
        res.status(500).json({ error: e.message || 'Failed to cancel schedule' });
      }
    });

    // 3. Standard Middlewares (JSON body for any other routes)
    app.use((req, res, next) => {
      if (req.path === '/webhook' || req.path === '/pco/webhook') {
        next();
      } else {
        express.json()(req, res, next);
      }
    });


    // 3. Production Static Files (MUST be before the '*' route)
    if (process.env.NODE_ENV === 'production') {
      app.use(express.static(path.join(__dirname, 'dist')));
    }

    // 4. Vite for Dev / SPA Fallback for Prod
    if (process.env.NODE_ENV !== 'production') {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'custom',
      });
      app.use(vite.middlewares);
    }

    app.use(async (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path === '/webhook' || req.path === '/pco/webhook') {
        return next();
      }
      try {
        if (process.env.NODE_ENV === 'production') {
          res.sendFile(path.join(__dirname, 'dist', 'index.html'));
        } else {
          // Dev logic for Vite...
          next(); 
        }
      } catch (e) {
        next(e);
      }
    });

    // 5. Start Listening
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`>>> Server is listening on port ${PORT} (0.0.0.0)`);
      // Start email scheduler after server is up
      try {
        const db = getDb();
        startEmailScheduler(db as any);
      } catch (e) {
        console.warn('[EmailScheduler] Could not start scheduler:', e);
      }
      try {
        const db = getDb();
        startSyncScheduler(db as any);
      } catch (e) {
        console.warn('[SyncScheduler] Could not start scheduler:', e);
      }
      try {
        const db = getDb();
        startSmsCampaignScheduler(db as any);
      } catch (e) {
        console.warn('[SmsScheduler] Could not start scheduler:', e);
      }
    });

  } catch (error) {
    console.error("CRITICAL: Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
