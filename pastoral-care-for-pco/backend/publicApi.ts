import { getDb } from './firebase.js';

export async function getPublicGroups(req: any, res: any) {
  const { churchId } = req.params;
  try {
    const db = getDb();
    const snap = await db.collection(`churches/${churchId}/groups`).get();
    const groups = snap.docs.map(d => d.data());
    
    // Filter out private or non-visible groups
    // If 'isPublic' is tracked or 'publiclyDisplay' flag
    // Let's assume groups.filter(g => g.isPublic !== false);
    const publicGroups = groups.filter(g => g.isPublic !== false);
    
    res.json(publicGroups);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function getPublicRegistrations(req: any, res: any) {
  const { churchId } = req.params;
  try {
    const db = getDb();
    const snap = await db.collection(`churches/${churchId}/registrations`).get();
    const events = snap.docs.map(d => d.data());
    
    // Similarly filter out if needed
    res.json(events);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function getPublicEvents(req: any, res: any) {
  const { churchId } = req.params;
  try {
    const db = getDb();
    const snap = await db.collection(`churches/${churchId}/events`).get();
    const events = snap.docs.map(d => d.data());
    
    res.json(events);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function serveWidgetScript(req: any, res: any) {
  // Return JS that creates an iframe
  // Format: <script src="/widget.js?churchId=x&type=groups&theme=dark" .../>
  const churchId = req.query.churchId || '';
  const type = req.query.type || 'groups';
  const theme = req.query.theme || 'light';
  const color = req.query.color || 'indigo';
  const layout = req.query.layout || 'grid';

  res.setHeader('Content-Type', 'application/javascript');
  
  const scriptContent = `
(function() {
  var iframe = document.createElement('iframe');
  var baseUrl = window.location.origin; // or hardcode if needed, but relative works if script is loaded from backend
  const origin = new URL(document.currentScript.src).origin;
  
  iframe.src = origin + '/?widget=true&type=${type}&churchId=${churchId}&theme=${theme}&color=${color}&layout=${layout}';
  iframe.style.width = '100%';
  iframe.style.height = '600px'; 
  iframe.style.border = 'none';
  iframe.style.borderRadius = '12px';
  iframe.style.overflow = 'hidden';
  iframe.allow = 'clipboard-write';
  
  // Insert after the current script tag
  var currentScript = document.currentScript;
  currentScript.parentNode.insertBefore(iframe, currentScript.nextSibling);
})();
  `;
  res.send(scriptContent);
}
