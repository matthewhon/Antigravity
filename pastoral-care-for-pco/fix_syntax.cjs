const fs = require('fs');
const filePath = 'components/MessagingModule.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const regex = /^\s*=\s*async\s*\(wf:\s*SmsWorkflow\)\s*=>\s*\{\s*await\s*updateDoc\(doc\(firebaseDb,\s*'smsWorkflows',\s*wf\.id\),\s*\{\s*isActive:\s*!wf\.isActive\s*\}\);\s*\};/m;

const replacement = `    const handleToggleActive = async (wf: SmsWorkflow) => {
        const newlyActive = !wf.isActive;
        await updateDoc(doc(firebaseDb, 'smsWorkflows', wf.id), { isActive: newlyActive });
        
        if (newlyActive) {
            if (wf.trigger === 'list_add' && wf.triggerListId) {
                fetch(\`\${API_BASE}/api/messaging/workflow-enroll-list\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        churchId,
                        workflowId: wf.id,
                        targetType: 'list',
                        targetId: wf.triggerListId,
                    })
                }).catch(e => console.error('Failed to trigger list enrollment:', e));
            } else if (wf.trigger === 'event_registration' || wf.trigger === 'birthday' || wf.trigger === 'anniversary') {
                fetch(\`\${API_BASE}/api/messaging/workflow-force-scan\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ churchId })
                }).catch(e => console.error('Failed to trigger force scan:', e));
            }
        }
    };`;

if (regex.test(content)) {
    const newContent = content.replace(regex, replacement);
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log('Fixed syntax using regex match!');
} else {
    console.log('Regex did not match.');
}
