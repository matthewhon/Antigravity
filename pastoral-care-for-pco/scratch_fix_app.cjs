const fs = require('fs');
const file = 'c:\\Users\\matth\\OneDrive\\Antigravity\\pastoral-care-for-pco\\App.tsx';
let content = fs.readFileSync(file, 'utf8');

const startMarker = "<Layout ";
const endMarker = "<Routes>";

const startIdx = content.lastIndexOf(startMarker);
const endIdx = content.indexOf(endMarker, startIdx);

if (startIdx !== -1 && endIdx !== -1) {
    const replacement = `<Layout 
                user={user} 
                church={church} 
                allChurches={allChurches}
                onSwitchChurch={handleSwitchChurch}
                onLogout={() => auth.signOut()} 
                currentView={view} 
                onNavigate={handleNavigate}
                hasPermission={hasPermission}
                onRefreshUser={() => firestore.getUserProfile(user.id).then(u => u && setUser(u))}
                isSyncing={isSyncing}
                enableLibrary={systemSettings?.enableLibrary}
                noPadding={view.startsWith('tools')}
                subNavItems={view.startsWith('tools-sms') ? [
                    { label: 'Inbox',     view: 'tools-sms-inbox',     icon: <span className="text-sm">📥</span> },
                    { label: 'Broadcast', view: 'tools-sms-campaigns', icon: <span className="text-sm">📨</span> },
                    { label: 'Keywords',  view: 'tools-sms-keywords',  icon: <span className="text-sm">🔑</span> },
                    { label: 'Analytics', view: 'tools-sms-analytics', icon: <span className="text-sm">📊</span> },
                    { label: 'AI Agent',  view: 'tools-sms-agent',     icon: <span className="text-sm">✨</span> },
                ] : undefined}
            >
            <Routes>`;

    content = content.substring(0, startIdx) + replacement + content.substring(endIdx + endMarker.length);
    fs.writeFileSync(file, content, 'utf8');
    console.log('Fixed Layout successfully');
} else {
    console.log('Markers not found');
}
