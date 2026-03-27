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
import { getDb } from './backend/firebase';
import { handleGeminiProxy } from './backend/geminiProxy';

// Fix for bundled CJS environment
const __dirname = process.cwd();
const __filename = path.join(__dirname, 'server.js');

console.log("Pre-initialization: Checking Firebase Admin (DISABLED)...");

async function startServer() {
  try {
    const app = express();
    const PORT = process.env.PORT || 8080;

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

    // Gemini AI Proxy (key stays server-side)
    app.post('/ai/generate', express.json(), handleGeminiProxy);

    // Email (SendGrid)
    app.post('/email/send', express.json(), sendEmail);
    app.post('/email/test', express.json(), sendEmail);

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
    });

  } catch (error) {
    console.error("CRITICAL: Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
