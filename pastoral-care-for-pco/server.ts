import { automationService } from './services/automationService';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
// import * as admin from 'firebase-admin';
import { createCheckoutSession } from './backend/createCheckoutSession';
import { cancelSubscription } from './backend/cancelSubscription';
import { handleStripeWebhook } from './backend/stripeWebhook';
import { pcoTokenExchange } from './backend/pcoTokenExchange';
import { pcoProxy } from './backend/pcoProxy';
import { handlePcoWebhook } from './backend/pcoWebhookHandler';
import { sendEmail, getEmailStats } from './backend/sendEmail';
import { startEmailScheduler } from './backend/emailScheduler';
import { startSyncScheduler } from './backend/syncScheduler';
import { startBillingScheduler } from './backend/billingScheduler';
import { getDb } from './backend/firebase';
import { handleGeminiProxy } from './backend/geminiProxy';
import { provisionSubuser, authenticateDomain, verifyDomain, diagnoseDomain } from './backend/emailProvisioning';
import { getPublicGroups, getPublicRegistrations, getPublicEvents, serveWidgetScript, getPublicForms } from './backend/publicApi.js';
import { getAvailableNumbers, provisionSmsNumber, releaseSpecificNumber, addSmsNumber, updateNumberSettings, setDefaultNumber, registerSmsBrand, registerSmsCampaign, getSmsRegistrationStatus, handleCampaignStatusWebhook, handleAssignmentStatusWebhook } from './backend/smsProvisioning';
import { handleInboundSms } from './backend/smsInbound';
import { sendIndividual, sendBulk } from './backend/smsSend';
import { handleStatusCallback } from './backend/smsWebhookStatus';
import { startSmsCampaignScheduler } from './backend/smsCampaignScheduler';
import { startServicesReminderScheduler } from './backend/servicesReminderScheduler';
import { workflowEnrollList, workflowEnrollPreview, workflowForceScan } from './backend/workflowEnrollEndpoint';
import { handleGrowDailyEmail, setupGrowIntegration, requestGrowAccess, getGrowStatus } from './backend/growIntegration';
import { getVapidPublicKey, savePushSubscription, removePushSubscription } from './backend/webPushService';
import { handleFileProxy } from './backend/fileProxy';
import { videoProcessingQueue } from './services/jobQueue.js';

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

    // ── Stripe Billing ──────────────────────────────────────────────────────
    // Raw body required for Stripe webhook signature verification
    app.post('/stripe/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);
    app.post('/createCheckoutSession', express.json(), createCheckoutSession);
    app.post('/cancelSubscription',    express.json(), cancelSubscription);

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

    // Geocode addresses on-demand (without full sync) — useful after first deploy
    app.post('/geocode/run', express.json(), async (req: any, res: any) => {
      const { churchId } = req.body || {};
      if (!churchId) return res.status(400).json({ error: 'Missing churchId' });
      try {
        const { geocodePeopleAddresses } = await import('./services/pcoSyncService.js');
        await geocodePeopleAddresses(churchId, true);
        res.json({ success: true, message: 'Geocoding complete.' });
      } catch (e: any) {
        res.status(500).json({ error: e.message || 'Geocoding failed' });
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


    // PCO Pastoral Care Tab Checker
    // Called by the Setup Wizard in Settings -> Planning Center
    app.post('/api/pco/check-pastoral-care-tab', express.json(), async (req: any, res: any) => {
      const { churchId } = req.body || {};
      if (!churchId) return res.status(400).json({ error: 'Missing churchId' });
      try {
        const db = getDb();
        const churchDoc = await db.collection('churches').doc(churchId).get();
        if (!churchDoc.exists) return res.status(404).json({ error: 'Church not found' });
        const church = churchDoc.data()!;
        const token = church.pcoAccessToken;
        if (!token) return res.status(401).json({ error: 'No PCO access token. Connect Planning Center first.' });
        const pcoHeaders = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
        // 1. Fetch tabs
        const tabsRes = await fetch('https://api.planningcenteronline.com/people/v2/tabs?per_page=100', { headers: pcoHeaders });
        if (!tabsRes.ok) return res.status(502).json({ error: `PCO tabs ${tabsRes.status}` });
        const tabs: any[] = (await tabsRes.json())?.data || [];
        const pastoralTab = tabs.find((t: any) => (t.attributes?.name || '').trim().toLowerCase() === 'pastoral care');
        // 2. Fetch field definitions
        const fieldsRes = await fetch('https://api.planningcenteronline.com/people/v2/field_definitions?per_page=200', { headers: pcoHeaders });
        if (!fieldsRes.ok) return res.status(502).json({ error: `PCO fields ${fieldsRes.status}` });
        const fields: any[] = (await fieldsRes.json())?.data || [];
        const smsField = fields.find((f: any) => {
          const name = (f.attributes?.name || '').trim().toLowerCase();
          const dt = (f.attributes?.data_type || '').toLowerCase();
          const tid = f.relationships?.tab?.data?.id;
          return name === 'sms subscriptions' && dt === 'checkboxes' && (!pastoralTab || tid === pastoralTab.id);
        });
        const dateField = fields.find((f: any) => {
          const name = (f.attributes?.name || '').trim().toLowerCase();
          const dt = (f.attributes?.data_type || '').toLowerCase();
          const tid = f.relationships?.tab?.data?.id;
          return name === 'last keyword match' && dt === 'date' && (!pastoralTab || tid === pastoralTab.id);
        });
        console.log(`[PastoralCareCheck] churchId=${churchId} tabFound=${!!pastoralTab} fieldFound=${!!smsField}`);
        return res.json({
          tabFound: !!pastoralTab, fieldFound: !!smsField,
          smsFieldDefId: smsField?.id || null,
          dateFieldDefId: dateField?.id || null,
          tabId: pastoralTab?.id || null,
        });
      } catch (e: any) {
        console.error('[PastoralCareCheck]', e.message);
        return res.status(500).json({ error: e.message || 'Check failed' });
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

    // Integrations
    app.post('/api/integrations/grow/daily-email', express.json(), handleGrowDailyEmail);
    app.post('/api/integrations/grow/setup', express.json(), setupGrowIntegration);
    // Grow permission / auto-connect flow
    app.post('/api/integrations/grow/request-access', express.json(), requestGrowAccess);
    app.get('/api/integrations/grow/status', getGrowStatus);

    // ─── Public Widget Sync Endpoints ───────────────────────────────
    app.get('/api/public/groups/:churchId', getPublicGroups);
    app.get('/api/public/registrations/:churchId', getPublicRegistrations);
    app.get('/api/public/events/:churchId', getPublicEvents);
    app.get('/api/public/forms/:churchId', getPublicForms);
    app.get('/widget.js', serveWidgetScript);

    // ─── File Proxy & Egress Tracking ───────────────────────────────
    app.get('/f/:fileId', handleFileProxy);

    app.post('/api/files/process-video', express.json(), async (req: any, res: any) => {
        const { fileId, churchId, gcsPath } = req.body || {};
        if (!fileId || !churchId || !gcsPath) {
            return res.status(400).json({ error: 'Missing fileId, churchId, or gcsPath' });
        }
        try {
            const db = getDb();
            await db.collection('tenantFiles').doc(fileId).update({
                processingStatus: 'processing'
            });
            await videoProcessingQueue.add('compress-video', { fileId, churchId, gcsPath });
            res.json({ success: true, message: 'Video queued for compression' });
        } catch (e: any) {
            console.error('[process-video]', e.message);
            res.status(500).json({ error: e.message });
        }
    });

    // ─── SMS / Messaging Endpoints ────────────────────────────────────────────
    // SignalWire webhooks — support both form-encoded (compatibility SDK) and
    // JSON (native REST API) payloads for future-proofing.
    app.post('/api/messaging/inbound', express.urlencoded({ extended: false }), express.json(), handleInboundSms);
    app.post('/api/messaging/status',  express.urlencoded({ extended: false }), express.json(), handleStatusCallback);
    // Provisioning
    app.get('/api/messaging/available-numbers', express.json(), getAvailableNumbers);
    app.post('/api/messaging/provision', express.json(), provisionSmsNumber);
    // Multi-number endpoints
    app.post('/api/messaging/add-number', express.json(), addSmsNumber);
    app.post('/api/messaging/release-number', express.json(), releaseSpecificNumber);
    app.patch('/api/messaging/number-settings', express.json(), updateNumberSettings);
    app.post('/api/messaging/set-default-number', express.json(), setDefaultNumber);
    // Sending
    app.post('/api/messaging/send-individual', express.json(), sendIndividual);
    app.post('/api/messaging/send-bulk', express.json(), sendBulk);

    // Quick-send routes used by the NewMessageComposer modal (sends to a PCO List or Group
    // without creating a campaign doc first — delegates to the same bulk-send pipeline).
    app.post('/api/messaging/send-to-list', express.json(), async (req: any, res: any) => {
        const { churchId, pcoListId, listName, body, mediaUrls = [], sentBy, sentByName, smsNumberId, twilioNumberId, attachVcard } = req.body || {};
        if (!churchId || !pcoListId || !body) {
            return res.status(400).json({ error: 'Missing churchId, pcoListId, or body' });
        }
        try {
            const db = getDb();
            const { resolvePcoRecipients } = await import('./backend/smsCampaignScheduler.js');
            const { sendBulkInternal }     = await import('./backend/smsSend.js');
            const { destinations, personMap } = await resolvePcoRecipients(db, churchId, pcoListId, undefined, 'sms');
            if (!destinations.length) {
                return res.status(400).json({ error: 'No phone numbers found in this PCO list (members may be missing phone numbers).' });
            }
            const result = await sendBulkInternal({ db, churchId, phones: destinations, body, mediaUrls, sentBy, sentByName, personMap, smsNumberId: smsNumberId || twilioNumberId || null, attachVcard });
            return res.json({ success: true, listName, ...result });
        } catch (e: any) {
            console.error('[send-to-list]', e.message);
            return res.status(500).json({ error: e.message || 'Send failed' });
        }
    });
    app.post('/api/messaging/send-to-group', express.json(), async (req: any, res: any) => {
        const { churchId, pcoGroupId, groupName, body, mediaUrls = [], sentBy, sentByName, smsNumberId, twilioNumberId, attachVcard } = req.body || {};
        if (!churchId || !pcoGroupId || !body) {
            return res.status(400).json({ error: 'Missing churchId, pcoGroupId, or body' });
        }
        try {
            const db = getDb();
            const { resolvePcoRecipients } = await import('./backend/smsCampaignScheduler.js');
            const { sendBulkInternal }     = await import('./backend/smsSend.js');
            const { destinations, personMap } = await resolvePcoRecipients(db, churchId, undefined, pcoGroupId, 'sms');
            if (!destinations.length) {
                return res.status(400).json({ error: 'No phone numbers found in this PCO group (members may be missing phone numbers).' });
            }
            const result = await sendBulkInternal({ db, churchId, phones: destinations, body, mediaUrls, sentBy, sentByName, personMap, smsNumberId: smsNumberId || twilioNumberId || null, attachVcard });
            return res.json({ success: true, groupName, ...result });
        } catch (e: any) {
            console.error('[send-to-group]', e.message);
            return res.status(500).json({ error: e.message || 'Send failed' });
        }
    });
    // Workflow bulk-enrollment from a PCO List or Group
    app.post('/api/messaging/workflow-enroll-list', express.json(), workflowEnrollList);
    app.post('/api/messaging/workflow-enroll-preview', express.json(), workflowEnrollPreview);
    app.post('/api/messaging/workflow-force-scan', express.json(), workflowForceScan);
    // 10DLC Brand & Campaign registration (per-tenant)
    app.post('/api/messaging/register-brand',       express.json(), registerSmsBrand);
    app.post('/api/messaging/register-campaign',    express.json(), registerSmsCampaign);
    app.get('/api/messaging/registration-status',   getSmsRegistrationStatus);
    app.post('/api/messaging/campaign-status',      express.json(), handleCampaignStatusWebhook);
    app.post('/api/messaging/assignment-status',    express.json(), handleAssignmentStatusWebhook);
    // Admin override: force-mark a number as campaign-active (clears stale 'pending' status)
    app.post('/api/messaging/mark-number-active', express.json(), async (req: any, res: any) => {
      const { churchId, smsNumberId } = req.body || {};
      if (!churchId || !smsNumberId) return res.status(400).json({ error: 'Missing churchId or smsNumberId' });
      try {
        const db = getDb();
        const numSnap = await db.collection('smsNumbers').doc(smsNumberId).get();
        if (!numSnap.exists) return res.status(404).json({ error: 'Number not found' });
        if (numSnap.data()?.churchId !== churchId) return res.status(403).json({ error: 'Forbidden' });
        await db.collection('smsNumbers').doc(smsNumberId).update({
          campaignAssignmentStatus: 'active',
          campaignAssigned: true,
          updatedAt: Date.now(),
        });
        return res.json({ success: true });
      } catch (e: any) {
        return res.status(500).json({ error: e.message });
      }
    });

    // ─── Web Push Notifications ─────────────────────────────────────────────────
    app.get('/push/vapid-public-key',  getVapidPublicKey);
    app.post('/push/subscribe',        express.json(), savePushSubscription);
    app.delete('/push/subscribe',      express.json(), removePushSubscription);

    // Dynamic vCard endpoint for "Who Is This" contact card feature
    app.get('/api/messaging/vcard/:numberId', async (req: any, res: any) => {
      const { numberId } = req.params;
      try {
        const db = getDb();
        let numSnap = await db.collection('smsNumbers').doc(numberId).get();
        if (!numSnap.exists) {
          numSnap = await db.collection('twilioNumbers').doc(numberId).get();
        }
        if (!numSnap.exists) return res.status(404).send('Number not found');
        
        const numData = numSnap.data()!;
        const churchSnap = await db.collection('churches').doc(numData.churchId).get();
        const churchName = churchSnap.data()?.name || 'Church';
        const lineName = numData.friendlyLabel || 'Main Line';
        const phone = numData.phoneNumber || '';
        
        const vcard = `BEGIN:VCARD\r\nVERSION:3.0\r\nN:${churchName};${lineName};;;\r\nFN:${churchName} (${lineName})\r\nORG:${churchName}\r\nTEL;TYPE=WORK,VOICE:${phone}\r\nEND:VCARD\r\n`;
        
        res.set('Content-Type', 'text/vcard');
        res.set('Content-Disposition', 'attachment; filename="contact.vcf"');
        return res.send(vcard);
      } catch (e: any) {
        return res.status(500).send('Error generating vCard');
      }
    });

    // Admin endpoint to backfill SMS conversation names and avatars
    app.get('/api/admin/backfill-sms', async (req: any, res: any) => {
        try {
            const db = getDb();
            const peopleSnap = await db.collection('people').get();
            const peopleMap = new Map(); // e164 -> person data
            
            // Backfill people with e164Phone and build map
            let peopleUpdates = 0;
            
            for (const doc of peopleSnap.docs) {
                const p = doc.data();
                const rawPhone = (p.phone || '').replace(/\D/g, '');
                const e164 = rawPhone.length === 10 ? `+1${rawPhone}` : rawPhone.length === 11 ? `+${rawPhone}` : null;
                
                if (e164) {
                    peopleMap.set(`${p.churchId}_${e164}`, { id: doc.id, name: p.name, avatar: p.avatar });
                    if (!p.e164Phone) {
                        await doc.ref.update({ e164Phone: e164 });
                        peopleUpdates++;
                    }
                }
            }

            const convsSnap = await db.collection('smsConversations').get();
            let convUpdates = 0;
            
            for (const convDoc of convsSnap.docs) {
                const conv = convDoc.data();
                if (conv.personName) continue; // Already mapped
                
                const phone = conv.phoneNumber;
                if (!phone) continue;
                
                const match = peopleMap.get(`${conv.churchId}_${phone}`);
                if (match) {
                    await convDoc.ref.update({
                        personId: match.id,
                        personName: match.name || null,
                        personAvatar: match.avatar || null
                    });
                    convUpdates++;
                }
            }
            res.send(`Updated ${peopleUpdates} people with e164Phone. Backfilled ${convUpdates} SMS conversations.`);
        } catch(e: any) {
            res.status(500).send(`Error: ${e.message}`);
        }
    });

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
        let apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        try {
          const db = getDb();
          const snap = await db.doc('system/settings').get();
          const data = snap.data() || {};
          if (data.geminiApiKey) {
            apiKey = data.geminiApiKey.trim();
          }
        } catch (dbErr) {
          console.error('[ScanWebsite] Failed to fetch system settings:', dbErr);
        }

        if (!apiKey) {
          return res.status(500).json({ error: 'AI service not configured on server or in System Settings.' });
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

    // GET /polls/:pollId/live-results — aggregated vote counts for the live projector (no auth)
    app.get('/polls/:pollId/live-results', async (req: any, res: any) => {
      const { pollId } = req.params;
      try {
        const db = getDb();
        const pollDoc = await db.collection('polls').doc(pollId).get();
        if (!pollDoc.exists) return res.status(404).json({ error: 'Poll not found' });
        const poll = pollDoc.data()!;

        // Fetch all responses
        const responsesSnap = await db.collection('poll_responses').where('pollId', '==', pollId).get();
        const responses = responsesSnap.docs.map((d: any) => d.data());

        // Build per-question aggregated counts
        const questionResults: Record<string, any> = {};
        (poll.questions || []).forEach((q: any) => {
          const qAnswers = responses.map((r: any) => r.answers?.[q.id]).filter(Boolean);
          if (q.type === 'text') {
            questionResults[q.id] = { type: 'text', count: qAnswers.length, answers: qAnswers.map(String).slice(0, 100) };
          } else if (q.type === 'rating') {
            const nums = qAnswers.map(Number).filter((n: number) => !isNaN(n));
            const avg = nums.length > 0 ? (nums.reduce((s: number, n: number) => s + n, 0) / nums.length) : 0;
            const dist: Record<number, number> = {};
            for (let i = 1; i <= (q.ratingMax || 5); i++) dist[i] = 0;
            nums.forEach((n: number) => { dist[n] = (dist[n] || 0) + 1; });
            questionResults[q.id] = { type: 'rating', avg: Math.round(avg * 10) / 10, dist, count: nums.length, max: q.ratingMax || 5 };
          } else {
            const opts = q.type === 'yes_no' ? ['Yes', 'No'] : q.type === 'thumbs_up_down' ? ['Thumbs Up', 'Thumbs Down'] : (q.options || []);
            const counts: Record<string, number> = {};
            opts.forEach((o: string) => (counts[o] = 0));
            qAnswers.forEach((ans: any) => {
              if (Array.isArray(ans)) ans.forEach((a: string) => { counts[a] = (counts[a] || 0) + 1; });
              else { counts[String(ans)] = (counts[String(ans)] || 0) + 1; }
            });
            questionResults[q.id] = { type: q.type, options: opts, counts, total: qAnswers.length };
          }
        });

        res.json({
          id: pollDoc.id,
          title: poll.title,
          status: poll.status,
          activeQuestionIndex: poll.activeQuestionIndex ?? 0,
          totalResponses: poll.totalResponses || 0,
          questions: poll.questions || [],
          questionResults,
        });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // PATCH /polls/:pollId/active-question — set which question is shown on the projector
    app.patch('/polls/:pollId/active-question', express.json(), async (req: any, res: any) => {
      const { pollId } = req.params;
      const { activeQuestionIndex } = req.body || {};
      if (typeof activeQuestionIndex !== 'number') {
        return res.status(400).json({ error: 'Missing activeQuestionIndex' });
      }
      try {
        const db = getDb();
        await db.collection('polls').doc(pollId).update({ activeQuestionIndex, updatedAt: Date.now() });
        res.json({ success: true, activeQuestionIndex });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // POST /polls/:pollId/close-question — close current active question and advance to next
    app.post('/polls/:pollId/close-question', express.json(), async (req: any, res: any) => {
      const { pollId } = req.params;
      const { currentIndex } = req.body || {};
      try {
        const db = getDb();
        const pollDoc = await db.collection('polls').doc(pollId).get();
        if (!pollDoc.exists) return res.status(404).json({ error: 'Poll not found' });
        const poll = pollDoc.data()!;
        const total = (poll.questions || []).length;
        const nextIndex = typeof currentIndex === 'number' ? currentIndex + 1 : 1;
        const updates: any = { updatedAt: Date.now() };
        if (nextIndex >= total) {
          // All questions done — close the poll
          updates.status = 'closed';
          updates.activeQuestionIndex = total; // sentinel: past end
        } else {
          updates.activeQuestionIndex = nextIndex;
        }
        await db.collection('polls').doc(pollId).update(updates);
        res.json({ success: true, nextIndex: updates.activeQuestionIndex, pollClosed: updates.status === 'closed' });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ─── Admin: Manual Subscription Patch ─────────────────────────────────────
    // Used when Stripe webhooks fail and a subscription needs to be manually synced.
    // POST /admin/patch-subscription { churchId, subscription: { status, planId, customerId, subscriptionId, currentPeriodEnd } }
    app.post('/admin/patch-subscription', express.json(), async (req: any, res: any) => {
      const { churchId, subscription } = req.body || {};
      if (!churchId || !subscription) {
        return res.status(400).json({ error: 'Missing churchId or subscription fields' });
      }
      if (!['active', 'past_due', 'canceled', 'trialing'].includes(subscription.status)) {
        return res.status(400).json({ error: 'Invalid status value' });
      }
      try {
        const db = getDb();
        const ref = db.collection('churches').doc(churchId);
        const snap = await ref.get();
        if (!snap.exists) return res.status(404).json({ error: `Church ${churchId} not found` });
        await ref.update({ subscription });
        console.log(`[AdminPatch] Updated subscription for ${churchId}:`, subscription);
        res.json({ success: true, churchId, subscription });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // ─── Tenant Deletion ─────────────────────────────────────────────────────
    // ─── User Management (Admin SDK) ──────────────────────────────────────────
    // Creates a Firebase Auth user + Firestore profile without signing out the admin.
    // POST /user/create { churchId, name, email, password, roles[] }
    app.post('/user/create', express.json(), async (req: any, res: any) => {
      const { churchId, name, email, password, roles } = req.body || {};
      if (!churchId || !name || !email || !password) {
        return res.status(400).json({ error: 'Missing required fields: churchId, name, email, password' });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      try {
        const admin = await import('firebase-admin');
        const db = getDb();

        // 1. Create the Firebase Auth user (Admin SDK — does NOT affect caller's session)
        const authUser = await admin.default.auth().createUser({
          email,
          password,
          displayName: name,
        });

        // 2. Write the Firestore user profile with the real UID
        const userDoc = {
          id: authUser.uid,
          churchId,
          name,
          email: email.toLowerCase().trim(),
          roles: roles || ['Pastoral Care'],
          theme: 'traditional',
          createdAt: Date.now(),
        };
        await db.collection('users').doc(authUser.uid).set(userDoc, { merge: true });

        console.log(`[UserCreate] Created auth+profile for ${email} (uid=${authUser.uid}) in church ${churchId}`);
        res.json({ success: true, uid: authUser.uid });
      } catch (e: any) {
        // Surface Firebase Auth error codes clearly
        const code = e.code || 'unknown';
        console.error(`[UserCreate] Failed for ${email}:`, e.message);
        res.status(400).json({ error: e.message, code });
      }
    });

    // Fixes an orphaned Firestore user profile that has no Auth account.
    // POST /user/fix-orphan { firestoreUserId, email, password, name, churchId }
    app.post('/user/fix-orphan', express.json(), async (req: any, res: any) => {
      const { firestoreUserId, email, password, name, churchId } = req.body || {};
      if (!firestoreUserId || !email || !password) {
        return res.status(400).json({ error: 'Missing firestoreUserId, email, or password' });
      }
      try {
        const admin = await import('firebase-admin');
        const db = getDb();

        // 1. Create Auth user
        const authUser = await admin.default.auth().createUser({ email, password, displayName: name || email });

        // 2. Rename Firestore doc from old fake ID → real UID
        const oldRef = db.collection('users').doc(firestoreUserId);
        const oldSnap = await oldRef.get();
        const existingData = oldSnap.exists ? oldSnap.data() : {};

        const newData = {
          ...existingData,
          id:        authUser.uid,
          email:     email.toLowerCase().trim(),
          churchId:  churchId || existingData?.churchId,
          name:      name || existingData?.name,
          createdAt: Date.now(),
        };
        await db.collection('users').doc(authUser.uid).set(newData, { merge: true });

        // 3. Delete the orphaned old doc
        if (oldSnap.exists) await oldRef.delete();

        console.log(`[FixOrphan] Migrated ${firestoreUserId} → ${authUser.uid} for ${email}`);
        res.json({ success: true, oldId: firestoreUserId, newUid: authUser.uid });
      } catch (e: any) {
        res.status(400).json({ error: e.message, code: e.code });
      }
    });

    // Permanently deletes all Firebase Auth users + all Firestore data for a tenant.

    // Requires Admin SDK — must remain server-side.
    app.post('/tenant/delete', express.json(), async (req: any, res: any) => {

      const { churchId, confirmationText } = req.body || {};
      if (!churchId) return res.status(400).json({ error: 'Missing churchId' });
      if (confirmationText !== 'DELETE') {
        return res.status(400).json({ error: 'Invalid confirmation. Must send confirmationText: "DELETE"' });
      }

      try {
        const admin = await import('firebase-admin');
        const db = getDb();

        // 1. Find all user records for this tenant in Firestore to get their UIDs
        const usersSnap = await db.collection('users').where('churchId', '==', churchId).get();
        const uids = usersSnap.docs.map(d => d.id);

        // 2. Delete each Firebase Auth user (Admin SDK required)
        const authErrors: string[] = [];
        for (const uid of uids) {
          try {
            await admin.default.auth().deleteUser(uid);
          } catch (authErr: any) {
            // Don't abort if one user is already gone
            if (authErr.code !== 'auth/user-not-found') {
              authErrors.push(`${uid}: ${authErr.message}`);
            }
          }
        }

        // 3. Purge all Firestore collections scoped to this churchId
        const collectionsToDelete = [
          'users',
          'attendance',
          'giving',
          'detailed_donations',
          'people',
          'groups',
          'email_campaigns',
          'email_unsubscribes',
          'sms_campaigns',
          'sms_messages',
          'sms_keywords',
          'smsNumbers',
          'polls',
          'poll_responses',
          'notes',
          'budgets',
          'funds',
          'pastoral_notes',
          'qr_codes',
          'workflows',
          'workflow_enrollments',
          'log_entries',
          'metrics',
          'metrics_settings',
          'registrations',
        ];

        for (const colName of collectionsToDelete) {
          const snap = await db.collection(colName).where('churchId', '==', churchId).get();
          if (snap.empty) continue;
          let batch = db.batch();
          let count = 0;
          for (const d of snap.docs) {
            batch.delete(d.ref);
            count++;
            if (count >= 450) {
              await batch.commit();
              batch = db.batch();
              count = 0;
            }
          }
          if (count > 0) await batch.commit();
        }

        // 4. Delete the church document itself
        await db.collection('churches').doc(churchId).delete();

        console.log(`[TenantDelete] Purged tenant ${churchId}. Auth users deleted: ${uids.length}. Auth errors: ${authErrors.length}`);
        res.json({
          success: true,
          deletedAuthUsers: uids.length,
          authErrors: authErrors.length > 0 ? authErrors : undefined,
        });
      } catch (e: any) {
        console.error('[TenantDelete] Error:', e?.message || e);
        res.status(500).json({ error: e?.message || 'Tenant deletion failed' });
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
        startBillingScheduler(db as any);
        startSmsCampaignScheduler(db as any);
        startServicesReminderScheduler(db as any);
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
