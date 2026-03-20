
import { getDb } from './firebase';

export const pcoTokenExchange = async (req: any, res: any) => {
    try {
        const db = getDb();
        let { code, refreshToken, clientId, clientSecret, redirectUri, grantType } = req.body;

        const grant_type = grantType || 'authorization_code';

        if (!clientId || !clientSecret) {
            const settingsDoc = await db.doc('system/settings').get();
            const settings = settingsDoc.data() || {};
            clientId = clientId || settings.pcoClientId;
            clientSecret = clientSecret || settings.pcoClientSecret;
        }

        if (!clientId || !clientSecret) {
            res.status(400).json({ error: "Missing required parameters (clientId, clientSecret) and no system defaults found." });
            return;
        }

        const params = new URLSearchParams();
        params.append('client_id', clientId);
        params.append('client_secret', clientSecret);

        if (grant_type === 'refresh_token') {
            if (!refreshToken) {
                res.status(400).json({ error: "Missing refresh_token for grant_type refresh_token" });
                return;
            }
            params.append('grant_type', 'refresh_token');
            params.append('refresh_token', refreshToken);
        } else {
            // Default to authorization_code
            if (!code || !redirectUri) {
                res.status(400).json({ error: "Missing required parameters (code, redirectUri) for authorization_code" });
                return;
            }
            params.append('grant_type', 'authorization_code');
            params.append('code', code);
            params.append('redirect_uri', redirectUri);
        }

        const pcoResponse = await fetch('https://api.planningcenteronline.com/oauth/token', {
            method: 'POST',
            body: params
        });

        const data = await pcoResponse.json();

        if (!pcoResponse.ok) {
            console.error("PCO Token Exchange Error:", data);
            res.status(pcoResponse.status).json(data);
            return;
        }

        res.status(200).json(data);
    } catch (e: any) {
        console.error("Backend Proxy Error:", e);
        res.status(500).json({ error: e.message });
    }
};
