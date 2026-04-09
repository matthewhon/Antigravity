import { getDb } from './firebase.js';

// Simple in-memory cache: { "churchId_type": { data: any, timestamp: number } }
const cache: Record<string, { data: any; timestamp: number }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchFromPco(churchId: string, url: string) {
  const db = getDb();
  const churchDoc = await db.collection('churches').doc(churchId).get();
  if (!churchDoc.exists) throw new Error('Church not found');
  const churchData = churchDoc.data();
  let accessToken = churchData?.pcoAccessToken;
  const refreshToken = churchData?.pcoRefreshToken;

  if (!accessToken) throw new Error('No PCO access token');

  const performReq = async (token: string) => {
    return fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'PastoralCareApp/1.0'
      }
    });
  };

  let response = await performReq(accessToken);

  if (response.status === 401 && refreshToken) {
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
        method: 'POST', body: refreshParams
      });
      if (refreshRes.ok) {
        const tokenData = await refreshRes.json();
        accessToken = tokenData.access_token;
        await db.collection('churches').doc(churchId).update({
          pcoAccessToken: accessToken,
          pcoRefreshToken: tokenData.refresh_token,
          pcoTokenExpiry: Date.now() + (tokenData.expires_in * 1000)
        });
        response = await performReq(accessToken);
      }
    }
  }

  if (!response.ok) {
    let errorMsg = `PCO API error: ${response.status}`;
    if (response.status === 401) errorMsg = 'Unauthorized: Planning Center Token expired or invalid. Please re-authenticate your church account.';
    if (response.status === 403) errorMsg = 'Forbidden: Your Planning Center connection lacks the necessary scopes (e.g. calendar/registrations). Please re-authenticate to upgrade your permissions.';
    throw new Error(errorMsg);
  }
  return response.json();
}

export async function getPublicGroups(req: any, res: any) {
  const { churchId } = req.params;
  const cacheKey = `${churchId}_groups`;
  
  if (req.query.refresh !== 'true' && cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL) {
    return res.json(cache[cacheKey].data);
  }

  try {
    const data = await fetchFromPco(churchId, 'https://api.planningcenteronline.com/groups/v2/groups?include=group_type&per_page=100');
    const included = data.included || [];
    const groups = (data.data || []).map((g: any) => {
      const typeId = g.relationships?.group_type?.data?.id;
      const typeObj = included.find((i: any) => i.type === 'GroupType' && i.id === typeId);
      return {
        id: g.id,
        name: g.attributes.name,
        groupTypeName: typeObj?.attributes?.name || 'Small Group',
        description: g.attributes.description,
        membersCount: g.attributes.members_count || 0,
        headerImage: g.attributes.header_image?.medium || g.attributes.header_image?.thumbnail || null,
        publicUrl: g.attributes.public_church_center_web_url || g.attributes.public_url || null,
        isPublic: g.attributes.publicly_visible !== false
      };
    });
    const publicGroups = groups.filter((g: any) => g.isPublic);
    cache[cacheKey] = { data: publicGroups, timestamp: Date.now() };
    res.json(publicGroups);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function getPublicRegistrations(req: any, res: any) {
  const { churchId } = req.params;
  const cacheKey = `${churchId}_registrations`;
  
  if (req.query.refresh !== 'true' && cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL) {
    return res.json(cache[cacheKey].data);
  }

  try {
    const data = await fetchFromPco(churchId, 'https://api.planningcenteronline.com/registrations/v2/signups?per_page=100');
    const events = (data.data || []).map((e: any) => ({
      id: e.id,
      name: e.attributes.name,
      description: e.attributes.description,
      logoUrl: e.attributes.logo_url || null,
      signupsCount: e.attributes.signups_count || 0,
      publicUrl: e.attributes.church_center_url || e.attributes.public_url || null,
    }));
    cache[cacheKey] = { data: events, timestamp: Date.now() };
    res.json(events);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function getPublicEvents(req: any, res: any) {
  const { churchId } = req.params;
  const cacheKey = `${churchId}_events`;
  
  if (req.query.refresh !== 'true' && cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL) {
    return res.json(cache[cacheKey].data);
  }

  try {
    const data = await fetchFromPco(churchId, 'https://api.planningcenteronline.com/calendar/v2/event_instances?include=event&filter=future&per_page=100');
    
    const includedEvents = data.included || [];

    const events = (data.data || []).map((instance: any) => {
      const eventId = instance.relationships?.event?.data?.id;
      const parentEvent = includedEvents.find((inc: any) => inc.type === 'Event' && inc.id === eventId);
      const eventDetails = parentEvent ? parentEvent.attributes : {};

      return {
        id: instance.id,
        name: eventDetails.name || instance.attributes.title || 'Unnamed Event',
        description: eventDetails.description || null,
        startsAt: instance.attributes.starts_at || null,
        endsAt: instance.attributes.ends_at || null,
        location: instance.attributes.location || eventDetails.location || null,
        publicUrl: eventDetails.church_center_url || eventDetails.public_url || null,
        imageUrl: eventDetails.image_url || null,
      };
    });
    cache[cacheKey] = { data: events, timestamp: Date.now() };
    res.json(events);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function serveWidgetScript(req: any, res: any) {
  const churchId = req.query.churchId || '';
  const type = req.query.type || 'groups';
  const theme = req.query.theme || 'light';
  const color = req.query.color || 'indigo';
  const layout = req.query.layout || 'grid';
  const autoHeight = req.query.autoHeight === 'true';
  const scale = req.query.scale || '1';

  res.setHeader('Content-Type', 'application/javascript');
  
  const scriptContent = `
(function() {
  var iframe = document.createElement('iframe');
  var origin = new URL(document.currentScript.src).origin;
  var iframeId = 'pco-widget-' + Math.random().toString(36).substr(2, 9);
  
  iframe.id = iframeId;
  iframe.src = origin + '/?widget=true&type=${type}&churchId=${churchId}&theme=${theme}&color=${color}&layout=${layout}&autoHeight=${autoHeight}&scale=${scale}&iframeId=' + iframeId;
  iframe.style.width = '100%';
  iframe.style.height = '600px'; 
  iframe.style.border = 'none';
  iframe.style.borderRadius = '12px';
  iframe.style.overflow = 'hidden';
  iframe.allow = 'clipboard-write';
  
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'pco-widget-resize' && e.data.iframeId === iframeId) {
      iframe.style.height = e.data.height + 'px';
    }
  });

  var currentScript = document.currentScript;
  currentScript.parentNode.insertBefore(iframe, currentScript.nextSibling);
})();
  `;
  res.send(scriptContent);
}
