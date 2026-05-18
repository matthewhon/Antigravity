const fs = require('fs');
const filePath = 'components/MessagingModule.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const regex = /setIsBusy\(true\);\s*setSaveError\(null\);\s*try \{\s*const handleToggleActive/g;

const badChunk = `        setIsBusy(true);
        setSaveError(null);
        try {

    const handleToggleActive = async (wf: SmsWorkflow) => {
        await updateDoc(doc(firebaseDb, 'smsWorkflows', wf.id), { isActive: !wf.isActive });
    };`;

const goodChunk = `        setIsBusy(true);
        setSaveError(null);
        try {
            const isNew = editing === null; // null = new workflow, SmsWorkflow = editing existing
            if (isNew) {
                const { id: _id, ...rest } = wf;
                await addDoc(collection(firebaseDb, 'smsWorkflows'), stripUndefined(rest));
            } else {
                await setDoc(doc(firebaseDb, 'smsWorkflows', wf.id), stripUndefined(wf), { merge: true });
            }
            setSaveError(null);
            setViewMode('list');
        } catch (err: any) {
            console.error('[WorkflowSave] failed:', err);
            setSaveError(err?.message || 'Failed to save workflow. Please try again.');
        } finally {
            setIsBusy(false);
        }
    };

    const handleToggleActive = async (wf: SmsWorkflow) => {
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

const newContent = content.replace(badChunk, goodChunk);
if (newContent !== content) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log('Fixed handleToggleActive AND handleSave! (string match)');
} else {
    // try regex match just in case whitespace is slightly off
    const newContent2 = content.replace(regex, goodChunk.substring(0, goodChunk.indexOf('const handleToggleActive')));
    if (newContent2 !== content) {
        fs.writeFileSync(filePath, newContent2, 'utf8');
        console.log('Fixed via regex fallback');
    } else {
        console.log('Failed to match either');
    }
}
