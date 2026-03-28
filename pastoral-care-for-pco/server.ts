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
import { sendEmail } from './backend/sendEmail';
import { startEmailScheduler } from './backend/emailScheduler';
import { startSyncScheduler } from './backend/syncScheduler';
import { getDb } from './backend/firebase';
import { handleGeminiProxy } from './backend/geminiProxy';
import { provisionSubuser, authenticateDomain, verifyDomain } from './backend/emailProvisioning';

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

        const pcoRes = await fetch('https://api.planningcenteronline.com/registrations/v2/events?per_page=1', {
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

    // Email provisioning — tenant Subuser + domain authentication
    app.post('/email/provision-subuser', express.json(), provisionSubuser);
    app.post('/email/authenticate-domain', express.json(), authenticateDomain);
    app.post('/email/verify-domain', express.json(), verifyDomain);

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
      const { campaignId, churchId, scheduledAt } = req.body || {};
      if (!campaignId || !churchId || !scheduledAt) {
        return res.status(400).json({ error: 'Missing campaignId, churchId, or scheduledAt' });
      }
      try {
        const db = getDb();
        await db.collection('email_campaigns').doc(campaignId).update({
          status: 'scheduled',
          scheduledAt: Number(scheduledAt),
          sendAt: new Date(Number(scheduledAt)).toISOString(),
          retryCount: 0,
          lastError: null,
          updatedAt: Date.now(),
        });
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
    });

  } catch (error) {
    console.error("CRITICAL: Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
