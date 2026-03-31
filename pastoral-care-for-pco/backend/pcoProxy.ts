
import admin from 'firebase-admin';
import { getDb } from './firebase';
import { createServerLogger } from '../services/logService';

export const pcoProxy = async (req: any, res: any) => {
    const db = getDb();
    const log = createServerLogger(db);

    // Enable CORS
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.status(204).send('');
        return;
    }

    try {
        const { url, method = 'GET', body, churchId } = req.body;

        log.info(`Proxy request received`, 'proxy', { url, method, churchId }, churchId);

        if (!url || !churchId) {
            log.warn('Proxy request missing url or churchId', 'proxy', { url, churchId });
            res.status(400).json({ error: 'Missing url or churchId' });
            return;
        }

        // 1. Get Church Credentials
        const churchDoc = await db.collection('churches').doc(churchId).get();
        if (!churchDoc.exists) {
            log.warn('Church not found in proxy', 'proxy', { churchId }, churchId);
            res.status(404).json({ error: 'Church not found' });
            return;
        }

        const churchData = churchDoc.data();
        let accessToken = churchData?.pcoAccessToken;
        const refreshToken = churchData?.pcoRefreshToken;

        if (!accessToken || !refreshToken) {
            log.warn('Missing PCO tokens for church', 'proxy', { churchId }, churchId);
            res.status(401).json({ error: 'Church not authenticated with PCO' });
            return;
        }

        // 2. Perform Request
        const performRequest = async (token: string) => {
            const headers: any = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'User-Agent': 'PastoralCareApp/1.0'
            };
            
            const options: any = { method, headers };

            if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                options.body = JSON.stringify(body);
            }

            return await fetch(url, options);
        };

        let response = await performRequest(accessToken);

        // 3. Handle Token Expiry (401)
        if (response.status === 401) {
            log.warn('PCO access token expired — refreshing', 'proxy', { churchId }, churchId);
            
            // Get Client Credentials
            const settingsDoc = await db.doc('system/settings').get();
            const settings = settingsDoc.data() || {};
            
            const clientId = (settings.pcoClientId || '').trim();
            const clientSecret = (settings.pcoClientSecret || '').trim();

            if (!clientId || !clientSecret) {
                log.error('System missing PCO credentials for token refresh', 'proxy', { churchId }, churchId);
                res.status(500).json({ error: "System missing PCO Credentials" });
                return;
            }

            const refreshParams = new URLSearchParams();
            refreshParams.append('grant_type', 'refresh_token');
            refreshParams.append('refresh_token', refreshToken);
            refreshParams.append('client_id', clientId);
            refreshParams.append('client_secret', clientSecret);

            const refreshRes = await fetch('https://api.planningcenteronline.com/oauth/token', {
                method: 'POST',
                body: refreshParams
            });

            if (!refreshRes.ok) {
                const errText = await refreshRes.text();
                log.error('PCO token refresh failed', 'proxy', { churchId, status: refreshRes.status, error: errText }, churchId);
                res.status(401).json({ error: 'Session expired. Please reconnect PCO.' });
                return;
            }

            const tokenData = await refreshRes.json();
            const newAccessToken = tokenData.access_token;
            const newRefreshToken = tokenData.refresh_token;

            // Save new tokens
            await db.collection('churches').doc(churchId).update({
                pcoConnected: true,
                pcoAccessToken: newAccessToken,
                pcoRefreshToken: newRefreshToken,
                pcoTokenExpiry: Date.now() + (tokenData.expires_in * 1000)
            });

            log.info('PCO token refreshed successfully', 'proxy', { churchId }, churchId);

            // Retry Request
            response = await performRequest(newAccessToken);
        }

        // 4. Return Response
        if (!response.ok) {
            const errText = await response.text();

            // 429 — PCO rate limit hit. Return a structured JSON so the client can
            // display a meaningful message instead of the raw "Proxy error: 429" string.
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After');
                log.warn('PCO rate limit (429) hit at proxy level', 'proxy', { churchId, url, retryAfter }, churchId);
                res.status(429).json({
                    error: 'Planning Center rate limit reached. Please wait a moment before trying again.',
                    pcoStatus: 429,
                    retryAfter: retryAfter ? parseInt(retryAfter, 10) : 30,
                });
                return;
            }

            // Special handling for registrations endpoints — check BEFORE logging
            // so we don't emit noisy warn logs for expected conditions.
            // Matches both /registrations/v2/... and /registrations/v2/signups/... paths.
            const isRegistrationsUrl = url?.includes('/registrations/v2/');
            if (isRegistrationsUrl) {
                if (response.status === 403) {
                    // 403 = valid token but missing 'registrations' scope — must reconnect
                    log.warn('Registrations scope not granted — reconnect PCO to enable', 'proxy', { churchId }, churchId);
                    res.status(403).json({
                        error: 'Registrations scope not authorized. Please reconnect Planning Center in Settings → Planning Center to grant Registrations access.',
                        requiresReauth: true,
                        pcoStatus: 403,
                        detail: errText.substring(0, 300)
                    });
                    return;
                }
                if (response.status === 404) {
                    // 404 = org's PCO account does not have the Registrations module/product
                    // This is expected and non-fatal — return empty data silently.
                    log.info('Registrations module not available for this organization (404 — non-fatal)', 'proxy', { churchId }, churchId);
                    res.status(200).json({ data: [], meta: { total_count: 0 }, _pcoNote: 'Registrations module not available for this organization' });
                    return;
                }
            }

            log.warn('PCO upstream error', 'proxy', { churchId, url, status: response.status, error: errText.substring(0, 500) }, churchId);
            res.status(response.status).json({ error: `PCO API error (${response.status})`, pcoStatus: response.status, detail: errText.substring(0, 300) });
            return;
        }

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            res.json(data);
        } else {
            const text = await response.text();
            res.send(text);
        }

    } catch (e: any) {
        const { churchId } = req.body || {};
        log.error('Proxy internal error', 'proxy', { churchId, error: e.message }, churchId);
        res.status(500).json({ error: e.message || 'Internal Proxy Error' });
    }
};
