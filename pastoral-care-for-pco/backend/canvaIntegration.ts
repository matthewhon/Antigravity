import { getDb, getStorage } from './firebase.js';
import { createServerLogger } from '../services/logService.js';
import fetch from 'node-fetch'; // assuming node-fetch or native fetch is available
import { v4 as uuidv4 } from 'uuid';

const CANVA_API_BASE = 'https://api.canva.com/rest/v1';

// ─── OAuth 2.0 Endpoints ──────────────────────────────────────────────────────

export const handleCanvaOAuthCallback = async (req: any, res: any): Promise<void> => {
    const db = getDb();
    const log = createServerLogger(db);
    const { code, state } = req.query;

    if (!code) {
        return res.status(400).send('Missing authorization code');
    }

    try {
        let clientId = process.env.CANVA_CLIENT_ID;
        let clientSecret = process.env.CANVA_CLIENT_SECRET;

        // Fallback for local development if dotenv is not loaded
        if (!clientId || !clientSecret) {
            try {
                const fs = await import('fs');
                const envLocal = fs.readFileSync('.env.local', 'utf8');
                const idMatch = envLocal.match(/CANVA_CLIENT_ID=(.*)/);
                const secretMatch = envLocal.match(/CANVA_CLIENT_SECRET=(.*)/);
                if (idMatch && !clientId) clientId = idMatch[1].trim();
                if (secretMatch && !clientSecret) clientSecret = secretMatch[1].trim();
            } catch (e) {}
        }

        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:8080';
        const redirectUri = `${protocol}://${host}/api/canva/oauth/callback`;

        // Basic Auth using base64(client_id:client_secret)
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        // Parse cookie
        const cookieHeader = req.headers.cookie || '';
        const match = cookieHeader.match(/canva_pkce=([^;]+)/);
        const codeVerifier = match ? match[1] : '';

        if (!codeVerifier) {
            log.warn('Missing canva_pkce cookie in OAuth callback', 'system', {}, 'system');
        }

        const tokenResponse = await fetch('https://api.canva.com/rest/v1/oauth/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code.toString(),
                redirect_uri: redirectUri,
                code_verifier: codeVerifier,
            }),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
            throw new Error(`Canva OAuth Error: ${JSON.stringify(tokenData)}`);
        }

        // We assume state contains a churchId and/or userId to link the token
        const churchId = state; // Simplification, ensure you pass state when initiating OAuth
        
        if (churchId) {
            await db.collection('churches').doc(churchId).collection('integrations').doc('canva').set({
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                expiresAt: Date.now() + (tokenData.expires_in * 1000),
                updatedAt: Date.now()
            });
        }

        // Close the popup or redirect to a success page
        res.send(`<script>window.close();</script>`);
    } catch (error: any) {
        log.error(`[CanvaIntegration] OAuth Callback Error: ${error.message}`, 'system', { error: error.message }, 'system');
        res.status(500).send('Internal Server Error during Canva Authentication');
    }
};

// ─── Designs Endpoints ────────────────────────────────────────────────────────

export const handleGetCanvaDesigns = async (req: any, res: any): Promise<void> => {
    const db = getDb();
    const churchId = req.headers['x-church-id'] || req.query.churchId;

    if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

    try {
        const integrationDoc = await db.collection('churches').doc(churchId).collection('integrations').doc('canva').get();
        if (!integrationDoc.exists) {
            return res.status(401).json({ error: 'Canva not connected' });
        }

        const { accessToken } = integrationDoc.data()!;

        // Fetch user designs and shared designs
        const canvaRes = await fetch(`${CANVA_API_BASE}/designs?ownership=any`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!canvaRes.ok) {
            if (canvaRes.status === 401) {
                // Token likely expired, handle refresh token logic here in production
                return res.status(401).json({ error: 'Canva token expired' });
            }
            throw new Error(`Canva API Error: ${await canvaRes.text()}`);
        }

        const data = await canvaRes.json();
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// ─── Export Endpoints ─────────────────────────────────────────────────────────

export const handleTriggerCanvaExport = async (req: any, res: any): Promise<void> => {
    const db = getDb();
    const churchId = req.headers['x-church-id'] || req.body.churchId;
    const { designId } = req.body;

    if (!churchId || !designId) return res.status(400).json({ error: 'Missing churchId or designId' });

    try {
        const integrationDoc = await db.collection('churches').doc(churchId).collection('integrations').doc('canva').get();
        if (!integrationDoc.exists) return res.status(401).json({ error: 'Canva not connected' });
        
        const { accessToken } = integrationDoc.data()!;

        const exportRes = await fetch(`${CANVA_API_BASE}/exports`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                design_id: designId,
                format: {
                    type: 'jpg'
                }
            })
        });

        if (!exportRes.ok) throw new Error(`Canva Export Error: ${await exportRes.text()}`);

        const data = await exportRes.json();
        // data.job.id is the export job id
        res.json({ jobId: data.job.id });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const handlePollCanvaExport = async (req: any, res: any): Promise<void> => {
    const db = getDb();
    const churchId = req.headers['x-church-id'] || req.query.churchId;
    const { jobId } = req.params;

    if (!churchId || !jobId) return res.status(400).json({ error: 'Missing churchId or jobId' });

    try {
        const integrationDoc = await db.collection('churches').doc(churchId).collection('integrations').doc('canva').get();
        if (!integrationDoc.exists) return res.status(401).json({ error: 'Canva not connected' });
        
        const { accessToken } = integrationDoc.data()!;

        const exportRes = await fetch(`${CANVA_API_BASE}/exports/${jobId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!exportRes.ok) throw new Error(`Canva Poll Error: ${await exportRes.text()}`);

        const data = await exportRes.json();
        
        // If success, download from Canva and upload to Firebase Storage
        if (data.job.status === 'success') {
            const downloadUrls = data.job.urls; // Array of URLs
            if (!downloadUrls || downloadUrls.length === 0) {
                return res.json({ status: 'failed', error: 'No download URLs provided' });
            }

            const imageUrl = downloadUrls[0];
            
            // Fetch the image from Canva
            const imageRes = await fetch(imageUrl);
            if (!imageRes.ok) throw new Error(`Failed to download image from Canva`);
            const imageBuffer = await imageRes.buffer();

            // Upload to Firebase Storage
            const storage = getStorage();
            const bucket = storage.bucket();
            const uniqueFilename = `canva_exports/${churchId}/${uuidv4()}.jpg`;
            const file = bucket.file(uniqueFilename);
            
            await file.save(imageBuffer, {
                metadata: {
                    contentType: 'image/jpeg',
                }
            });

            // Make public or get signed URL depending on your security rules.
            await file.makePublic();
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${uniqueFilename}`;

            return res.json({ status: 'success', url: publicUrl });
        }

        res.json({ status: data.job.status }); // e.g. 'in_progress', 'failed'
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
