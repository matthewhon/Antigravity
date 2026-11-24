
import { getDb } from './firebase';
import { createServerLogger } from '../services/logService';
import { getFreshPcoToken } from './pcoApi';

export const pcoProxy = async (req: any, res: any) => {
    const db = getDb();
    const log = createServerLogger(db);

    if (req.method === 'OPTIONS') {
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

        // 1. Get valid PCO token (uses shared per-churchId refresh mutex)
        let accessToken: string;
        try {
            accessToken = await getFreshPcoToken(churchId);
        } catch (tokenErr: any) {
            const msg = tokenErr?.message || '';
            if (msg.includes('not found')) {
                res.status(404).json({ error: 'Church not found' });
            } else if (msg.includes('No PCO access token')) {
                res.status(401).json({ error: 'Church not authenticated with PCO' });
            } else {
                res.status(500).json({ error: msg || 'Failed to get PCO token' });
            }
            return;
        }

        // 2. Perform Request
        const performRequest = async (token: string) => {
            const headers: any = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'User-Agent': 'PastoralCareApp/1.0',
                'Connection': 'close'
            };
            
            const options: any = { method, headers };

            if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                options.body = JSON.stringify(body);
            }

            return await fetch(url, options);
        };

        let response = await performRequest(accessToken);

        // 3. Handle Token Expiry (401) via shared per-churchId mutex
        if (response.status === 401) {
            log.warn('PCO access token expired — refreshing', 'proxy', { churchId }, churchId);
            try {
                const newAccessToken = await getFreshPcoToken(churchId, true);
                log.info('PCO token refreshed successfully', 'proxy', { churchId }, churchId);
                response = await performRequest(newAccessToken);
            } catch (refreshErr: any) {
                log.error('PCO token refresh failed', 'proxy', { churchId, error: refreshErr?.message }, churchId);
                res.status(401).json({ error: 'Session expired. Please reconnect PCO.' });
                return;
            }
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
