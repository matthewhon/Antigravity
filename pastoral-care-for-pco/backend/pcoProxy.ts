
import * as admin from 'firebase-admin';
import { getDb } from './firebase';

export const pcoProxy = async (req: any, res: any) => {
    console.log("[Proxy] Received request to:", req.path, "Body:", JSON.stringify(req.body));
    const db = getDb();
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

        console.log(`[Proxy] Request for churchId: ${churchId}, URL: ${url}, Method: ${method}`);

        if (!url || !churchId) {
            res.status(400).json({ error: 'Missing url or churchId' });
            return;
        }

        // 1. Get Church Credentials
        const churchDoc = await db.collection('churches').doc(churchId).get();
        console.log(`[Proxy] Church doc exists: ${churchDoc.exists}`);
        if (!churchDoc.exists) {
            res.status(404).json({ error: 'Church not found' });
            return;
        }

        const churchData = churchDoc.data();
        console.log(`[Proxy] Church data:`, churchData);
        let accessToken = churchData?.pcoAccessToken;
        const refreshToken = churchData?.pcoRefreshToken;

        if (!accessToken || !refreshToken) {
            console.log(`[Proxy] Missing tokens for ${churchId}`);
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
            
            const options: any = {
                method,
                headers
            };

            if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                options.body = JSON.stringify(body);
            }

            console.log(`[Proxy] ${method} ${url}`);
            if (method === 'POST') console.log(`[Proxy] Body:`, options.body);

            return await fetch(url, options);
        };

        let response = await performRequest(accessToken);

        // 3. Handle Token Expiry (401)
        if (response.status === 401) {
            console.log(`[Proxy] Token expired for ${churchId}. Refreshing...`);
            
            // Get Client Credentials
            const settingsDoc = await db.doc('system/settings').get();
            const settings = settingsDoc.data() || {};
            
            // Use Church overrides if present, else System default
            const clientId = churchData?.pcoClientId || settings.pcoClientId;
            const clientSecret = churchData?.pcoClientSecret || settings.pcoClientSecret;

            if (!clientId || !clientSecret) {
                console.error("[Proxy] Missing Client ID/Secret for refresh");
                res.status(401).json({ error: 'Token expired and missing credentials to refresh.' });
                return;
            }

            // Refresh Token
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
                console.error(`[Proxy] Refresh failed: ${refreshRes.status} ${errText}`);
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

            // Retry Request
            response = await performRequest(newAccessToken);
        }

        // 4. Return Response
        if (!response.ok) {
            // Forward PCO error
            const errText = await response.text();
            console.warn(`[Proxy] Upstream Error ${response.status}: ${url}, Error: ${errText}`);
            res.status(response.status).send(errText);
            return;
        }

        // Check content type to decide how to parse
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            res.json(data);
        } else {
            const text = await response.text();
            res.send(text);
        }

    } catch (e: any) {
        console.error("[Proxy] Internal Error:", e);
        res.status(500).json({ error: e.message || 'Internal Proxy Error' });
    }
};
