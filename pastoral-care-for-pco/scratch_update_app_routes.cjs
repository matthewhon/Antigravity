const fs = require('fs');
const file = 'c:\\Users\\matth\\OneDrive\\Antigravity\\pastoral-care-for-pco\\App.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add imports
if (!content.includes('DashboardPage')) {
    content = content.replace(
        "import { useRiskEnrichedPeople,", 
        "import { DashboardPage } from './components/pages/DashboardPage';\nimport { PeoplePage } from './components/pages/PeoplePage';\nimport { GroupsPage } from './components/pages/GroupsPage';\nimport { ServicesPage } from './components/pages/ServicesPage';\nimport { GivingPage } from './components/pages/GivingPage';\nimport { CarePage } from './components/pages/CarePage';\nimport { TenantDataProvider } from './contexts/TenantDataContext';\nimport { useRiskEnrichedPeople,"
    );
}

// Extract Layout start and end
const layoutStartMarker = "<Layout ";
const layoutEndMarker = "</Layout>";
const startIdx = content.indexOf(layoutStartMarker);
const endIdx = content.indexOf(layoutEndMarker) + layoutEndMarker.length;

if (startIdx !== -1 && endIdx !== -1) {
    const layoutOpeningTagEnd = content.indexOf(">", startIdx) + 1;
    
    // We will extract everything up to `> ` of Layout, and then put `<TenantDataProvider>` around Layout.
    // Wait, Layout should be wrapped IN the provider.
    
    // Replace from layoutOpeningTagEnd to endIdx - layoutEndMarker.length
    const originalLayoutOpen = content.substring(startIdx, layoutOpeningTagEnd);

    const replacement = `
        <TenantDataProvider value={{
            user, church, allChurches, systemSettings, widgets,
            people, groups, attendance, donations, funds, budgets, teams,
            recentRiskChanges, recentStatusChanges, servicesData,
            setPeople, setGroups, setAttendance, setDonations, setFunds, setBudgets,
            setTeams, setRecentRiskChanges, setRecentStatusChanges, setServicesData
        }}>
            ${originalLayoutOpen}
            <Routes>
                <Route path="/" element={
                    <DashboardPage 
                        onUpdateWidgets={handleUpdateWidgets}
                        onConnectPco={() => { setSettingsTab('Planning Center'); handleNavigate('settings'); }}
                        allowedWidgetIds={safeEnabledWidgets}
                        globalInsights={globalInsights}
                        isGeneratingInsights={isGeneratingInsights}
                        onUpdateTheme={handleUpdateUserTheme}
                        onGenerateInsights={handleGenerateAIInsights}
                        givingFilter={givingFilter}
                        givingDateRange={givingDateRange}
                    />
                } />
                <Route path="/people/*" element={
                    <PeoplePage 
                        geoInsights={geoInsights}
                        isGeneratingGeo={isGeneratingGeo}
                        onGenerateGeoInsights={handleGenerateGeoInsights}
                        censusData={censusData}
                        allowedWidgetIds={safeEnabledWidgets}
                        onSync={handleSync}
                        isSyncing={isSyncing}
                        apiBaseUrl={systemSettings?.apiBaseUrl || 'https://pastoralcare.barnabassoftware.com'}
                        onUpdateTheme={handleUpdateUserTheme}
                        setUser={setUser}
                        onUpdateWidgets={handleUpdateWidgets}
                    />
                } />
                <Route path="/groups/*" element={
                    <GroupsPage 
                        allowedWidgetIds={safeEnabledWidgets}
                        onSync={handleSync}
                        onSyncGroups={handleSyncGroups}
                        isSyncing={isSyncing}
                        onUpdateTheme={handleUpdateUserTheme}
                        onUpdateWidgets={handleUpdateWidgets}
                    />
                } />
                <Route path="/services/*" element={
                    <ServicesPage 
                        onUpdateChurch={(updates) => { firestore.updateChurch(church!.id, updates); setChurch({ ...church!, ...updates }); }}
                        servicesFilter={servicesFilter}
                        onFilterChange={setServicesFilter}
                        allowedWidgetIds={safeEnabledWidgets}
                        onSync={handleSync}
                        isSyncing={isSyncing}
                        onUpdateTheme={handleUpdateUserTheme}
                        setUser={setUser}
                    />
                } />
                <Route path="/giving/*" element={
                    <GivingPage 
                        givingFilter={givingFilter}
                        onFilterChange={setGivingFilter}
                        givingDateRange={givingDateRange}
                        onDateRangeChange={setGivingDateRange}
                        allowedWidgetIds={safeEnabledWidgets}
                        onSyncRecent={handleSyncRecentGiving}
                        isSyncing={isSyncing}
                        onUpdateTheme={handleUpdateUserTheme}
                        setUser={setUser}
                        onSaveBudget={handleSaveBudget}
                    />
                } />
                <Route path="/care/*" element={
                    <CarePage 
                        censusData={censusData}
                        censusError={censusError}
                        allowedWidgetIds={safeEnabledWidgets}
                        onUpdateTheme={handleUpdateUserTheme}
                        setUser={setUser}
                        givingFilter={givingFilter}
                        givingDateRange={givingDateRange}
                    />
                } />
                
                {/* Legacy Views that still accept data directly until further refactored */}
                <Route path="/metrics/*" element={
                    <MetricsView 
                        churchId={church!.id}
                        currentUser={user!}
                        censusData={censusData}
                        peopleData={peopleDashboardData}
                        church={church!}
                        activePage={view === 'metrics-input' ? 'Input' : view === 'metrics-settings' ? 'Settings' : 'Dashboard'}
                        onUpdateChurch={(updates) => { firestore.updateChurch(church!.id, updates); setChurch({ ...church!, ...updates }); }}
                    />
                } />
                <Route path="/settings" element={
                    <RoleAdminView 
                        currentUser={user!}
                        churchId={church!.id}
                        church={church!}
                        onUpdateChurch={(updates) => { firestore.updateChurch(church!.id, updates); setChurch({ ...church!, ...updates }); }}
                        initialTab={settingsTab}
                        onSync={handleSync}
                    />
                } />
                <Route path="/app-settings" element={
                    <SystemSettingsView 
                        settings={systemSettings || {}}
                        onSave={async (s) => { await firestore.saveSystemSettings(s); setSystemSettings(s); }}
                        onRecalculateBenchmarks={async () => {}}
                    />
                } />
                <Route path="/global-admin" element={<GlobalAdminManager />} />
                <Route path="/library" element={
                    (user?.email === 'matthewhon01@gmail.com' || systemSettings?.enableLibrary) ? (
                        <div className="flex-1 min-h-0 overflow-y-auto p-6">
                            <LibraryView churchId={church!.id} />
                        </div>
                    ) : <Navigate to="/" replace />
                } />
                
                <Route path="/tools/emails" element={<ToolsView churchId={church!.id} church={church!} currentUserId={user!.id} currentUser={user!} onUpdateChurch={(updates) => { firestore.updateChurch(church!.id, updates); setChurch({ ...church!, ...updates }); }} activePage="emails" />} />
                <Route path="/tools/polls" element={<ToolsView churchId={church!.id} church={church!} currentUserId={user!.id} currentUser={user!} onUpdateChurch={(updates) => { firestore.updateChurch(church!.id, updates); setChurch({ ...church!, ...updates }); }} activePage="polls" />} />
                <Route path="/tools/website" element={<ToolsView churchId={church!.id} church={church!} currentUserId={user!.id} currentUser={user!} onUpdateChurch={(updates) => { firestore.updateChurch(church!.id, updates); setChurch({ ...church!, ...updates }); }} activePage="website" />} />
                <Route path="/tools/unsubscribers" element={<ToolsView churchId={church!.id} church={church!} currentUserId={user!.id} currentUser={user!} onUpdateChurch={(updates) => { firestore.updateChurch(church!.id, updates); setChurch({ ...church!, ...updates }); }} activePage="unsubscribers" />} />
                <Route path="/tools/qrcodes" element={<ToolsView churchId={church!.id} church={church!} currentUserId={user!.id} currentUser={user!} onUpdateChurch={(updates) => { firestore.updateChurch(church!.id, updates); setChurch({ ...church!, ...updates }); }} activePage="qrcodes" />} />
                <Route path="/tools/notes" element={<ToolsView churchId={church!.id} church={church!} currentUserId={user!.id} currentUser={user!} onUpdateChurch={(updates) => { firestore.updateChurch(church!.id, updates); setChurch({ ...church!, ...updates }); }} activePage="notes" />} />
                <Route path="/tools/workflows" element={<SmsWorkflowsManager churchId={church!.id} />} />
                <Route path="/tools/sms/*" element={
                    <ToolsView 
                        churchId={church!.id} 
                        church={church!} 
                        currentUserId={user!.id} 
                        currentUser={user!} 
                        onUpdateChurch={(updates) => { firestore.updateChurch(church!.id, updates); setChurch({ ...church!, ...updates }); }} 
                        activePage="messaging" 
                        smsTab={
                            view === 'tools-sms-campaigns' ? 'campaigns' :
                            view === 'tools-sms-workflows' ? 'workflows' :
                            view === 'tools-sms-keywords'  ? 'keywords'  :
                            view === 'tools-sms-analytics' ? 'analytics' :
                            view === 'tools-sms-agent'     ? 'agent'     : 'inbox'
                        } 
                    />
                } />
                
                {/* Fallback route */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Layout>
        </TenantDataProvider>`;

    content = content.substring(0, startIdx) + replacement + content.substring(endIdx);
} else {
    console.error('Markers not found');
}

fs.writeFileSync(file, content, 'utf8');
console.log('App.tsx React Router update successful.');
