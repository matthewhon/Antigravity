const fs = require('fs');

// 1. Add workflowForceScan to backend/workflowEnrollEndpoint.ts
let content = fs.readFileSync('backend/workflowEnrollEndpoint.ts', 'utf8');
const toAdd = `

export const workflowForceScan = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');
    const { churchId } = req.body || {};
    if (!churchId) return res.status(400).json({ error: 'Missing churchId' });
    
    const { getDb } = require('./firebase.js');
    const { createServerLogger } = require('../services/logService.js');
    const db = getDb();
    const log = createServerLogger(db);
    
    try {
        const { runBirthdayAnniversaryScanner, runEventRegistrationScanner } = await import('./smsCampaignScheduler.js');
        // Run both asynchronously in the background. We don't need to wait for them.
        runBirthdayAnniversaryScanner(db).catch(e => console.error(e));
        runEventRegistrationScanner(db).catch(e => console.error(e));
        
        return res.json({ success: true, message: 'Scanners triggered' });
    } catch (e: any) {
        log.error('Force scan failed: ' + e.message, 'system', { churchId }, churchId);
        return res.status(500).json({ error: e.message });
    }
};
`;
fs.appendFileSync('backend/workflowEnrollEndpoint.ts', toAdd, 'utf8');

// 2. Update server.ts
let serverContent = fs.readFileSync('server.ts', 'utf8');
// Import
serverContent = serverContent.replace(
    /import \{ workflowEnrollList, workflowEnrollPreview \} from '\.\/backend\/workflowEnrollEndpoint\.js';/,
    "import { workflowEnrollList, workflowEnrollPreview, workflowForceScan } from './backend/workflowEnrollEndpoint.js';"
);
// Route
serverContent = serverContent.replace(
    /app\.post\('\/api\/messaging\/workflow-enroll-preview', express\.json\(\), workflowEnrollPreview\);/,
    "app.post('/api/messaging/workflow-enroll-preview', express.json(), workflowEnrollPreview);\n    app.post('/api/messaging/workflow-force-scan', express.json(), workflowForceScan);"
);
fs.writeFileSync('server.ts', serverContent, 'utf8');

console.log('Backend endpoints updated');
