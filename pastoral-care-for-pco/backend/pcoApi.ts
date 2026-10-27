import { getDb } from './firebase.js';

/**
 * Ensures the church has a valid, unexpired PCO access token, refreshing it if needed.
 */
export async function getFreshPcoToken(churchId: string, forceRefresh = false): Promise<string> {
  const db = getDb();
  const churchDoc = await db.collection('churches').doc(churchId).get();
  if (!churchDoc.exists) throw new Error(`Church ${churchId} not found`);
  const churchData = churchDoc.data();
  let accessToken = churchData?.pcoAccessToken;
  const refreshToken = churchData?.pcoRefreshToken;
  const tokenExpiry = churchData?.pcoTokenExpiry || 0;

  if (!accessToken) throw new Error(`No PCO access token for church ${churchId}`);

  // If forceRefresh is requested or token is expired / within 5 minutes of expiring, refresh it
  if (refreshToken && (forceRefresh || Date.now() >= tokenExpiry - 5 * 60 * 1000)) {
    const settingsDoc = await db.doc('system/settings').get();
    const settings = settingsDoc.data() || {};
    const clientId = (settings.pcoClientId || '').trim();
    const clientSecret = (settings.pcoClientSecret || '').trim();

    if (clientId && clientSecret) {
      const refreshParams = new URLSearchParams();
      refreshParams.append('grant_type', 'refresh_token');
      refreshParams.append('refresh_token', refreshToken);
      refreshParams.append('client_id', clientId);
      refreshParams.append('client_secret', clientSecret);

      const refreshRes = await fetch('https://api.planningcenteronline.com/oauth/token', {
        method: 'POST',
        body: refreshParams
      });

      if (refreshRes.ok) {
        const tokenData = await refreshRes.json();
        accessToken = tokenData.access_token;
        await db.collection('churches').doc(churchId).update({
          pcoAccessToken: accessToken,
          pcoRefreshToken: tokenData.refresh_token,
          pcoTokenExpiry: Date.now() + (tokenData.expires_in * 1000)
        });
      }
    }
  }

  return accessToken;
}

/**
 * Authenticated PCO API request with automatic access-token refresh.
 *
 * Shared by the backend modules that need to call PCO directly (i.e. outside
 * the /pco/proxy request path used by the browser and the sync service).
 */
export async function pcoRequest(
  churchId: string,
  url: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: any
): Promise<any> {
  let accessToken = await getFreshPcoToken(churchId);

  const performReq = async (token: string) => {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'PastoralCareApp/1.0'
    };
    const options: RequestInit = { method, headers };
    if (body && (method === 'POST' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }
    return fetch(url, options);
  };

  let response = await performReq(accessToken);

  if (response.status === 401) {
    try {
      accessToken = await getFreshPcoToken(churchId, true);
      response = await performReq(accessToken);
    } catch {
      // Ignore refresh error here; downstream response check will handle it
    }
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`PCO API error: ${response.status} - ${errText}`);
  }

  if (response.status === 204) return null;
  return response.json();
}
