import { getDb } from './firebase.js';

// Simple in-memory cache: { "churchId_type": { data: any, timestamp: number } }
const cache: Record<string, { data: any; timestamp: number }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchFromPco(churchId: string, url: string) {
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
    const publicGroups = groups.filter((g: any) => g.isPublic && !g.attributes?.archived_at);
    cache[cacheKey] = { data: publicGroups, timestamp: Date.now() };
    res.json(publicGroups);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function getPublicRegistrations(req: any, res: any) {
  const { churchId } = req.params;
  const includeArchived = req.query.includeArchived === 'true';
  const cacheKey = `${churchId}_registrations_${includeArchived}`;
  
  if (req.query.refresh !== 'true' && cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL) {
    return res.json(cache[cacheKey].data);
  }

  try {
    const url = includeArchived 
      ? 'https://api.planningcenteronline.com/registrations/v2/signups?per_page=100'
      : 'https://api.planningcenteronline.com/registrations/v2/signups?per_page=100&filter=unarchived';
      
    const data = await fetchFromPco(churchId, url);
    
    // Filter out archived registration events (fallback if attribute exists)
    let rawEvents = data.data || [];
    if (!includeArchived) {
      rawEvents = rawEvents.filter((e: any) => !e.attributes?.archived_at);
    }

    const events = rawEvents.map((e: any) => ({
      id: e.id,
      name: e.attributes.name,
      description: e.attributes.description,
      logoUrl: e.attributes.logo_url || null,
      signupsCount: e.attributes.signups_count || 0,
      startsAt: e.attributes.starts_at || null,
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

export async function getPublicForms(req: any, res: any) {
  const { churchId } = req.params;
  const cacheKey = `${churchId}_forms`;
  
  if (req.query.refresh !== 'true' && cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL) {
    return res.json(cache[cacheKey].data);
  }

  try {
    const data = await fetchFromPco(churchId, 'https://api.planningcenteronline.com/people/v2/forms?per_page=100');
    
    // Filter active forms
    const rawForms = (data.data || []).filter((f: any) => f.attributes.active !== false && !f.attributes.archived_at);

    const forms = rawForms.map((f: any) => ({
      id: f.id,
      name: f.attributes.name,
      description: f.attributes.description || null,
      active: f.attributes.active !== false,
      publicUrl: f.attributes.church_center_url || f.attributes.public_url || null,
    }));
    cache[cacheKey] = { data: forms, timestamp: Date.now() };
    res.json(forms);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function setFeaturedEvent(req: any, res: any) {
  const { churchId } = req.params;
  const { eventId, eventSource } = req.body;
  if (!eventId || !eventSource) return res.status(400).json({ error: 'Missing eventId or eventSource' });

  try {
    const db = getDb();
    await db.collection('churches').doc(churchId).update({
      featuredEventId: eventId,
      featuredEventSource: eventSource,
    });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function getFeaturedEvent(req: any, res: any) {
  const { churchId } = req.params;
  try {
    const db = getDb();
    const churchDoc = await db.collection('churches').doc(churchId).get();
    if (!churchDoc.exists) return res.status(404).json({ error: 'Church not found' });
    
    const data = churchDoc.data();
    res.json({ 
      eventId: data?.featuredEventId || null,
      eventSource: data?.featuredEventSource || 'calendar'
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}


export async function serveWidgetScript(req: any, res: any) {
  res.setHeader('Content-Type', 'application/javascript');
  
  const scriptContent = `
(function() {
  var currentScript = document.currentScript;
  if (!currentScript) {
      console.warn('PCO Widget: currentScript not found. Ensure script is not loaded dynamically in a way that obscures it.');
      return;
  }
  
  var scriptUrl = new URL(currentScript.src);
  var iframeParams = new URLSearchParams(scriptUrl.search);
  var widgetType = iframeParams.get('type');
  
  if (widgetType === 'bubble_form') {
      var color = iframeParams.get('color') || 'indigo';
      var formId = iframeParams.get('formId');
      var churchId = iframeParams.get('churchId');
      var bubbleMode = iframeParams.get('bubbleMode') || 'text';
      var bubbleText = iframeParams.get('bubbleText') || 'Plan a Visit';
      var bubbleHoverText = iframeParams.get('bubbleHoverText');
      var bubbleIcon = iframeParams.get('bubbleIcon') || '👋';
      var bubblePosition = iframeParams.get('bubblePosition') || 'right';
      
      var colorMap = {
          'indigo': '#4F46E5', 'blue': '#2563EB', 'emerald': '#10B981', 'amber': '#F59E0B',
          'red': '#EF4444', 'violet': '#8B5CF6', 'fuchsia': '#D946EF', 'rose': '#F43F5E'
      };
      var btnColor = colorMap[color] || '#4F46E5';
      
      var style = document.createElement('style');
      style.innerHTML = \`
        #pco-bubble-btn {
          position: fixed;
          bottom: 24px;
          \${bubblePosition === 'left' ? 'left: 24px;' : 'right: 24px;'}
          background-color: \${btnColor};
          color: white;
          border: none;
          \${bubbleMode === 'icon' ? 'border-radius: 50%; width: 60px; height: 60px; font-size: 28px; padding: 0;' : 'border-radius: 24px; padding: 12px 24px; font-size: 16px;'}
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          cursor: pointer;
          font-family: sans-serif;
          font-weight: bold;
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        #pco-bubble-btn:hover {
          transform: scale(1.05);
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
        }
        #pco-bubble-btn[data-tooltip]::after {
          content: attr(data-tooltip);
          position: absolute;
          \${bubblePosition === 'left' ? 'left: 100%; margin-left: 16px;' : 'right: 100%; margin-right: 16px;'}
          top: 50%;
          transform: translateY(-50%);
          background: #1e293b;
          color: white;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 14px;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          visibility: hidden;
        }
        #pco-bubble-btn[data-tooltip]:hover::after {
          opacity: 1;
          visibility: visible;
        }
        #pco-bubble-btn.pco-bubble-open-btn::after {
          display: none;
        }
        #pco-bubble-container {
          position: fixed;
          bottom: 90px;
          \${bubblePosition === 'left' ? 'left: 24px;' : 'right: 24px;'}
          width: 400px;
          max-width: calc(100vw - 48px);
          height: 600px;
          max-height: calc(100vh - 120px);
          background: white;
          border-radius: 16px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          z-index: 999999;
          display: none;
          overflow: hidden;
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.3s, transform 0.3s;
        }
        #pco-bubble-container.pco-bubble-open {
          display: block;
          opacity: 1;
          transform: translateY(0);
        }
        #pco-bubble-iframe {
          width: 100%;
          height: 100%;
          border: none;
        }
      \`;
      document.head.appendChild(style);
      
      var container = document.createElement('div');
      container.id = 'pco-bubble-container';
      
      var iframe = document.createElement('iframe');
      iframe.id = 'pco-bubble-iframe';
      iframe.src = scriptUrl.origin + '/form/' + churchId + '/' + formId + '?embedded=true';
      iframe.allow = 'clipboard-write';
      container.appendChild(iframe);
      
      var btn = document.createElement('button');
      btn.id = 'pco-bubble-btn';
      btn.innerHTML = bubbleMode === 'icon' ? bubbleIcon : bubbleText;
      if (bubbleHoverText) {
        btn.setAttribute('data-tooltip', bubbleHoverText);
      }
      
      var isOpen = false;
      function toggleBubble() {
        isOpen = !isOpen;
        if (isOpen) {
          container.classList.add('pco-bubble-open');
          btn.classList.add('pco-bubble-open-btn');
          btn.innerHTML = bubbleMode === 'icon' ? '✕' : 'Close';
        } else {
          container.classList.remove('pco-bubble-open');
          btn.classList.remove('pco-bubble-open-btn');
          setTimeout(function() {
            if (!isOpen) container.style.display = 'none';
          }, 300);
          container.style.opacity = '0';
          container.style.transform = 'translateY(20px)';
          btn.innerHTML = bubbleMode === 'icon' ? bubbleIcon : bubbleText;
        }
      }
      
      btn.addEventListener('click', toggleBubble);
      
      window.addEventListener('message', function(event) {
        if (event.data === 'close-pco-bubble' && isOpen) {
          toggleBubble();
        }
      });
      
      document.body.appendChild(container);
      document.body.appendChild(btn);

  } else {
      var iframe = document.createElement('iframe');
      var iframeId = 'pco-widget-' + Math.random().toString(36).substr(2, 9);
      
      iframeParams.set('widget', 'true');
      iframeParams.set('iframeId', iframeId);
      
      iframe.id = iframeId;
      iframe.src = scriptUrl.origin + '/?' + iframeParams.toString();
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

      currentScript.parentNode.insertBefore(iframe, currentScript.nextSibling);
  }
})();
  `;
  res.send(scriptContent);
}
