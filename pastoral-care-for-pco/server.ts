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
// import { pcoTokenExchange } from './backend/pcoTokenExchange';
import { pcoProxy } from './backend/pcoProxy';
import { handlePcoWebhook } from './backend/pcoWebhookHandler';

// Fix for bundled CJS environment
const __dirname = process.cwd();
const __filename = path.join(__dirname, 'server.js');

console.log("Pre-initialization: Checking Firebase Admin (DISABLED)...");

async function startServer() {
  try {
    const app = express();
    const PORT = 3000;

    // 1. Immediate Health Check (For Cloud Run)
    app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

    // PCO Webhook Endpoint
    // We use express.raw to ensure we can verify the HMAC signature based on the raw body
    app.post('/pco/webhook', express.raw({ type: 'application/json' }), handlePcoWebhook);

    // PCO Proxy
    app.post('/pco/proxy', pcoProxy);

    // 2. Standard Middlewares
    app.use(cors());
    app.use((req, res, next) => {
      if (req.path === '/webhook' || req.path === '/pco/webhook') {
        // Body is already handled by route-specific express.raw() if needed
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
    });

  } catch (error) {
    console.error("CRITICAL: Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
