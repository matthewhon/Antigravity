import { getDb, getStorage } from './firebase.js';
import { createServerLogger } from '../services/logService.js';
import { v4 as uuidv4 } from 'uuid';

const CANVA_API_BASE = 'https://api.canva.com/rest/v1';

// ─── OAuth 2.0 Endpoints ──────────────────────────────────────────────────────

export const handleCanvaOAuthCallback = async (req: any, res: any): Promise<void> => {
    const db = getDb();
    const log = createServerLogger(db);
    const { code, state, error: oauthError, error_description } = req.query;

    // 1. Check if Canva returned an error (user denied, etc.)
    if (oauthError) {
        log.warn(`[CanvaIntegration] OAuth error from Canva: ${oauthError} - ${error_description}`, 'system', { oauthError, error_description }, 'system');
        return res.status(400).send(`<html><body><h3>Canva Authorization Failed</h3><p>${error_description || oauthError}</p><script>setTimeout(()=>window.close(),3000)</script></body></html>`);
    }

    if (!code) {
        return res.status(400).send('Missing authorization code');
    }

    try {
        // 2. Load credentials
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
            } catch (e) {
                log.warn('[CanvaIntegration] .env.local fallback failed, relying on process.env only', 'system', {}, 'system');
            }
        }

        if (!clientId || !clientSecret) {
            log.error('[CanvaIntegration] CANVA_CLIENT_ID or CANVA_CLIENT_SECRET is not set. Set these as Cloud Run environment variables.', 'system', { hasClientId: !!clientId, hasClientSecret: !!clientSecret }, 'system');
            return res.status(500).send('<html><body><h3>Server Configuration Error</h3><p>Canva credentials are not configured on the server. Please contact your administrator.</p><script>setTimeout(()=>window.close(),5000)</script></body></html>');
        }

        // 3. Parse state
        let churchId = state;
        let frontendRedirectUri = '';

        try {
            const stateObj = JSON.parse(decodeURIComponent(state));
            if (stateObj.churchId) churchId = stateObj.churchId;
            if (stateObj.redirectUri) frontendRedirectUri = stateObj.redirectUri;
        } catch (e) {
            // Not JSON, use raw state as churchId
        }

        // 4. Determine redirect_uri
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:8080';
        const redirectUri = frontendRedirectUri || `${protocol}://${host}/api/canva/oauth/callback`;

        // 5. Parse PKCE verifier from cookie
        const cookieHeader = req.headers.cookie || '';
        const cookieMatch = cookieHeader.match(/__session=([^;]+)/);
        const codeVerifier = cookieMatch ? cookieMatch[1] : '';

        log.info(`[CanvaIntegration] OAuth callback: churchId=${churchId}, hasCode=true, hasVerifier=${!!codeVerifier}, redirectUri=${redirectUri}`, 'system', {}, 'system');

        if (!codeVerifier) {
            log.warn('[CanvaIntegration] Missing __session cookie (PKCE verifier). The cookie may have been stripped by Firebase Hosting or the browser blocked it.', 'system', { cookieHeader: cookieHeader.substring(0, 100) }, 'system');
        }

        // 6. Exchange authorization code for tokens
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        const tokenBody: Record<string, string> = {
            grant_type: 'authorization_code',
            code: code.toString(),
            redirect_uri: redirectUri,
        };

        // Only include code_verifier if we actually have one
        if (codeVerifier) {
            tokenBody.code_verifier = codeVerifier;
        }

        const tokenResponse = await fetch('https://api.canva.com/rest/v1/oauth/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams(tokenBody),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
            log.error(`[CanvaIntegration] Token exchange failed: ${JSON.stringify(tokenData)}`, 'system', {
                status: tokenResponse.status,
                error: tokenData.error,
                error_description: tokenData.error_description,
                redirectUri,
                hasVerifier: !!codeVerifier,
            }, 'system');
            throw new Error(`Canva token exchange failed (${tokenResponse.status}): ${tokenData.error_description || tokenData.error || JSON.stringify(tokenData)}`);
        }

        // 7. Store tokens in Firestore
        if (churchId) {
            await db.collection('churches').doc(churchId).collection('integrations').doc('canva').set({
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                expiresAt: Date.now() + (tokenData.expires_in * 1000),
                updatedAt: Date.now()
            });
            log.info(`[CanvaIntegration] Successfully connected Canva for church ${churchId}`, 'system', {}, 'system');
        }

        // 8. Close the popup
        res.send(`<html><body><p>Connected! This window will close automatically...</p><script>window.close();</script></body></html>`);
    } catch (error: any) {
        log.error(`[CanvaIntegration] OAuth Callback Error: ${error.message}`, 'system', { error: error.message, stack: error.stack?.substring(0, 500) }, 'system');
        res.status(500).send(`<html><body><h3>Canva Authentication Error</h3><p>${error.message}</p><script>setTimeout(()=>window.close(),5000)</script></body></html>`);
    }
};

// ─── Token Refresh Helper ─────────────────────────────────────────────────────

async function getValidCanvaToken(db: any, churchId: string, integrationData: any): Promise<string> {
    const { accessToken, refreshToken, expiresAt } = integrationData;
    
    // If token is valid for more than 5 minutes, return it
    if (Date.now() < expiresAt - 5 * 60 * 1000) {
        return accessToken;
    }

    if (!refreshToken) {
        throw new Error('No refresh token available');
    }

    let clientId = process.env.CANVA_CLIENT_ID;
    let clientSecret = process.env.CANVA_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        try {
            const fs = await import('fs');
            const envLocal = fs.readFileSync('.env.local', 'utf8');
            if (!clientId) {
                const match = envLocal.match(/CANVA_CLIENT_ID=(.*)/);
                if (match) clientId = match[1].trim();
            }
            if (!clientSecret) {
                const match = envLocal.match(/CANVA_CLIENT_SECRET=(.*)/);
                if (match) clientSecret = match[1].trim();
            }
        } catch (e) {}
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenResponse = await fetch('https://api.canva.com/rest/v1/oauth/token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
        throw new Error(`Canva Token Refresh Error: ${JSON.stringify(tokenData)}`);
    }

    // Save new tokens
    await db.collection('churches').doc(churchId).collection('integrations').doc('canva').update({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + (tokenData.expires_in * 1000),
        updatedAt: Date.now()
    });

    return tokenData.access_token;
}

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

        const integrationData = integrationDoc.data()!;
        const accessToken = await getValidCanvaToken(db, churchId, integrationData);

        // Fetch user designs and shared designs
        const canvaRes = await fetch(`${CANVA_API_BASE}/designs?ownership=any`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!canvaRes.ok) {
            if (canvaRes.status === 401) {
                return res.status(401).json({ error: 'Canva token expired and could not be refreshed' });
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
        
        const integrationData = integrationDoc.data()!;
        const accessToken = await getValidCanvaToken(db, churchId, integrationData);

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
        
        const integrationData = integrationDoc.data()!;
        const accessToken = await getValidCanvaToken(db, churchId, integrationData);

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
            const arrayBuffer = await imageRes.arrayBuffer();
            const imageBuffer = Buffer.from(arrayBuffer);

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
