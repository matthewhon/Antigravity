import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { auth } from './services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { firestore } from './services/firestoreService';
import { DashboardPage } from './components/pages/DashboardPage';
import { PeoplePage } from './components/pages/PeoplePage';
import { GroupsPage } from './components/pages/GroupsPage';
import { ServicesPage } from './components/pages/ServicesPage';
import { GivingPage } from './components/pages/GivingPage';
import { CarePage } from './components/pages/CarePage';
import { TenantDataProvider } from './contexts/TenantDataContext';
import { useRiskEnrichedPeople, usePeopleDashboardData, useGivingAnalyticsData, useGroupsDashboardData, useAttendanceChartData } from './hooks/useDashboardData';
import { syncAllData, syncGroupsData, syncServicesData, syncRecentGiving } from './services/pcoSyncService';
import { initializeWebhooks } from './services/pcoWebhookService';
import { LoginView } from './components/LoginView';
import { RegisterView } from './components/RegisterView';
import Layout from './components/Layout';
import { DashboardView } from './components/DashboardView';
import { PeopleView } from './components/PeopleView';
import GroupsView from './components/GroupsView';
import ServicesView from './components/ServicesView';
import { GivingView } from './components/GivingView';
import { PastoralView } from './components/PastoralView';
import RoleAdminView from './components/RoleAdminView';
import { SystemSettingsView } from './components/SystemSettingsView';
import { GlobalAdminManager } from './components/GlobalAdminManager';
import { PastorAIView } from './components/PastorAIView';
import { MetricsView } from './components/MetricsView';
import WelcomeLayoutModal from './components/WelcomeLayoutModal';
import { PublicPollView } from './components/PublicPollView';
import { PollProjectorView } from './components/PollProjectorView';
import { PublicNoteView } from './components/PublicNoteView';
import { PublicFormView } from './components/PublicFormView';
import { ToolsView } from './components/ToolsView';
import { SmsWorkflowsManager } from './components/MessagingModule';
import MobileSmsLayout from './components/MobileSmsLayout';
import { PersonProfileDrawer } from './components/PersonProfileDrawer';
import { useTwilioNumbers, canUserSeeNumber, canUserUseFeature } from './hooks/useTwilioNumbers';
import { 
  User, Church, PeopleDashboardData, GivingAnalytics, GroupsDashboardData, 
  ServicesDashboardData, AttendanceData, CensusStats, BudgetRecord, PcoFund, 
  DetailedDonation, PcoPerson, ServicesFilter, GivingFilter, GeoInsight,
  PcoGroup, AttendanceRecord, ServicesTeam, RiskSettings, SystemSettings, RiskChangeRecord, StatusChangeRecord
} from './types';
import { getDefaultWidgets } from './constants/widgetRegistry';
import { calculateGivingAnalytics, DEFAULT_LIFECYCLE_SETTINGS } from './services/analyticsService';
import { fetchCensusDataForTenant } from './services/censusService';
import { generateGlobalInsights, generateGeoInsights, generateLayoutSuggestion } from './services/geminiService';
import { calculateBulkRisk, DEFAULT_RISK_SETTINGS } from './services/riskService';

const App: React.FC = () => {
  // Auth & User State
  const [user, setUser] = useState<User | null>(null);
  const [church, setChurch] = useState<Church | null>(null);
  const [allChurches, setAllChurches] = useState<Church[]>([]);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  const view = useMemo(() => {
     const path = location.pathname;
     if (path.startsWith('/ai-assistant')) return 'pastor-ai';
     if (path.startsWith('/people/households')) return 'people-households';
     if (path.startsWith('/people/risk')) return 'people-risk';
     if (path.startsWith('/people/reports')) return 'people-reports';
     if (path.startsWith('/people')) return 'people';
     if (path.startsWith('/groups')) return 'groups';
     if (path.startsWith('/services/attendance')) return 'services-attendance';
     if (path.startsWith('/services/teams')) return 'services-teams';
     if (path.startsWith('/services/reminders')) return 'services-reminders';
     if (path.startsWith('/services/plans')) return 'services-plans';
     if (path.startsWith('/services')) return 'services';
     if (path.startsWith('/giving/donor')) return 'giving-donor';
     if (path.startsWith('/giving/budgets')) return 'giving-budgets';
     if (path.startsWith('/giving/donations')) return 'giving-donations';
     if (path.startsWith('/giving/reports')) return 'giving-reports';
     if (path.startsWith('/giving')) return 'giving';
     if (path.startsWith('/care/membership')) return 'pastoral-membership';
     if (path.startsWith('/care/community')) return 'pastoral-community';
     if (path.startsWith('/care/calendar')) return 'pastoral-calendar';
     if (path.startsWith('/care/care')) return 'pastoral-care';
     if (path.startsWith('/care')) return 'pastoral';
     if (path.startsWith('/metrics/input')) return 'metrics-input';
     if (path.startsWith('/metrics/settings')) return 'metrics-settings';
     if (path.startsWith('/metrics')) return 'metrics';
     if (path.startsWith('/settings')) return 'settings';
     if (path.startsWith('/app-settings')) return 'app-settings';
     if (path.startsWith('/global-admin')) return 'global-admin';
     if (path.startsWith('/library')) return 'library';
     if (path.startsWith('/tools/emails')) return 'tools-emails';
     if (path.startsWith('/tools/forms')) return 'tools-forms';
     if (path.startsWith('/tools/polls')) return 'tools-polls';
     if (path.startsWith('/tools/website')) return 'tools-website';
     if (path.startsWith('/tools/unsubscribers')) return 'tools-unsubscribers';
     if (path.startsWith('/tools/qrcodes')) return 'tools-qrcodes';
     if (path.startsWith('/tools/notes')) return 'tools-notes';
     if (path.startsWith('/tools/workflows')) return 'tools-workflows';
     if (path.startsWith('/tools/files')) return 'tools-files';
     if (path.startsWith('/tools/sms/inbox')) return 'tools-sms-inbox';
     if (path.startsWith('/tools/sms/campaigns')) return 'tools-sms-campaigns';
     if (path.startsWith('/tools/sms/keywords')) return 'tools-sms-keywords';
     if (path.startsWith('/tools/sms/analytics')) return 'tools-sms-analytics';
     if (path.startsWith('/tools/sms/permissions')) return 'tools-sms-permissions';
     if (path.startsWith('/tools/sms/agent')) return 'tools-sms-agent';
     if (path.startsWith('/tools/sms')) return 'tools-sms-inbox';
     if (path.startsWith('/tools')) return 'tools';
     return 'dashboard';
  }, [location.pathname]);
  const [isRegistering, setIsRegistering] = useState(window.location.pathname === '/register');
  const [settingsTab, setSettingsTab] = useState<string>('Team'); // Controls initial tab in Settings

  // Raw Data States
  const [people, setPeople] = useState<PcoPerson[]>([]);
  const [groups, setGroups] = useState<PcoGroup[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [donations, setDonations] = useState<DetailedDonation[]>([]);
  const [funds, setFunds] = useState<PcoFund[]>([]);
  const [budgets, setBudgets] = useState<BudgetRecord[]>([]);
  const [teams, setTeams] = useState<ServicesTeam[]>([]);
  const [recentRiskChanges, setRecentRiskChanges] = useState<RiskChangeRecord[]>([]);
  const [recentStatusChanges, setRecentStatusChanges] = useState<StatusChangeRecord[]>([]);
  
  // Dashboard Aggregates
  const [servicesData, setServicesData] = useState<ServicesDashboardData | null>(null);
  const [censusData, setCensusData] = useState<CensusStats | null>(null);
  const [censusError, setCensusError] = useState('');

  // UI States
  const [isSyncing, setIsSyncing] = useState(false);
  const [servicesFilter, setServicesFilter] = useState<ServicesFilter>('Month');
  const [givingFilter, setGivingFilter] = useState<GivingFilter>('Year');
  const [givingDateRange, setGivingDateRange] = useState<{start: string, end: string}>({ start: '', end: '' });
  
  // Gemini Insights
  const [globalInsights, setGlobalInsights] = useState('');
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [geoInsights, setGeoInsights] = useState<GeoInsight | null>(null);
  const [isGeneratingGeo, setIsGeneratingGeo] = useState(false);

  // Widget Preferences
  const [widgets, setWidgets] = useState<string[]>([]);

  // First-login layout suggestion
  const [layoutSuggestion, setLayoutSuggestion] = useState<Record<string, string[]> | null>(null);
  const [isGeneratingLayout, setIsGeneratingLayout] = useState(false);

  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  
  // Global drawer state
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  // Twilio Active Number and permissions state
  const [smsActiveNumberId, setSmsActiveNumberId] = useState<string | null>(null);
  const { numbers: twilioNumbers } = useTwilioNumbers(church?.id || '');

  const visibleNumbers = useMemo(() => {
    if (!user) return [];
    return twilioNumbers.filter(n => canUserSeeNumber(n, user));
  }, [twilioNumbers, user]);

  const activeNumber = useMemo(() => {
    return visibleNumbers.find(n => n.id === smsActiveNumberId) ?? 
           visibleNumbers.find(n => n.isDefault) ?? 
           visibleNumbers[0] ?? null;
  }, [visibleNumbers, smsActiveNumberId]);

  useEffect(() => {
    if (!smsActiveNumberId && activeNumber) {
      setSmsActiveNumberId(activeNumber.id);
    }
  }, [activeNumber, smsActiveNumberId]);

  // Redirect guard for unauthorized SMS deep links/refreshes
  useEffect(() => {
    if (!user) return;
    const path = location.pathname;
    if (path.startsWith('/tools/sms/')) {
      if (activeNumber) {
        if (path.startsWith('/tools/sms/campaigns') && !canUserUseFeature(activeNumber, user, 'broadcastUserIds')) {
          navigate('/tools/sms/inbox', { replace: true });
        } else if (path.startsWith('/tools/sms/keywords') && !canUserUseFeature(activeNumber, user, 'keywordsUserIds')) {
          navigate('/tools/sms/inbox', { replace: true });
        } else if (path.startsWith('/tools/sms/analytics') && !canUserUseFeature(activeNumber, user, 'analyticsUserIds')) {
          navigate('/tools/sms/inbox', { replace: true });
        } else if (path.startsWith('/tools/sms/agent') && !canUserUseFeature(activeNumber, user, 'aiAgentUserIds')) {
          navigate('/tools/sms/inbox', { replace: true });
        }
      }
    }
  }, [location.pathname, user, activeNumber, navigate]);

  // Refs
  const processedCodeRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        try {
          const userProfile = await firestore.getUserProfile(authUser.uid);
          if (userProfile) {
            // Sync Firestore user profile email with Auth user email if changed & verified
            if (authUser.email && authUser.email.toLowerCase() !== userProfile.email.toLowerCase()) {
              const updatedProfile = { ...userProfile, email: authUser.email.toLowerCase() };
              await firestore.createUserProfile(updatedProfile);
              setUser(updatedProfile);
            } else {
              setUser(userProfile);
            }
            
            // Update last login timestamp
            firestore.updateUserLastLogin(authUser.uid);
            
            // Apply Theme Preference on Load
            const isDark = userProfile.theme === 'dark';
            const html = document.documentElement;
            const body = document.body;
            if (isDark) {
                html.classList.add('dark');
                body.classList.add('dark');
                html.style.colorScheme = 'dark';
            } else {
                html.classList.remove('dark');
                body.classList.remove('dark');
                html.style.colorScheme = 'light';
            }
            
            if (userProfile.churchId) {
                const churchProfile = await firestore.getChurch(userProfile.churchId);
                setChurch(churchProfile);
                if (userProfile.roles.includes('System Administration')) {
                    const churches = await firestore.getAllChurches();
                    setAllChurches(churches);
                }
            }

            // First login detection: no lastLogin + no widgetPreferences saved
            const isFirstLogin = !userProfile.lastLogin && !userProfile.widgetPreferences;
            if (isFirstLogin) {
                setIsGeneratingLayout(true);
                // Show the modal immediately (spinner state) then populate
                setLayoutSuggestion({});
                generateLayoutSuggestion(userProfile.roles as string[])
                    .then(suggestion => setLayoutSuggestion(suggestion))
                    .catch(() => setLayoutSuggestion({}))
                    .finally(() => setIsGeneratingLayout(false));
            }
          } else {
            console.error("No user profile found for auth user");
            setUser(null);
          }
        } catch (e) {
          console.error("Error fetching user profile", e);
        }
      } else {
        setUser(null);
        setChurch(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    firestore.getSystemSettings().then(async (settings) => {
        const correctUrl = 'https://pastoralcare.barnabassoftware.com';
        // Fix stale URL â€” covers: no URL, old api.* subdomain, old Cloud Run URL
        const isStaleUrl = !settings.apiBaseUrl 
            || settings.apiBaseUrl.includes('api.pastoralcare.barnabassoftware.com')
            || settings.apiBaseUrl.includes('u3gnt7kb5a-uc.a.run.app')
            || settings.apiBaseUrl.includes('api-ejvpnqnz4q-uc.a.run.app');
        if (isStaleUrl) {
            const newSettings = { ...settings, apiBaseUrl: correctUrl };
            await firestore.saveSystemSettings(newSettings);
            setSystemSettings(newSettings);
        } else {
            setSystemSettings(settings);
        }
    });
  }, [user]);

  // Listen for global open profile events
  useEffect(() => {
    const handleOpenProfile = (e: any) => {
      setSelectedPersonId(e.detail);
    };
    window.addEventListener('openPersonProfile', handleOpenProfile);
    return () => window.removeEventListener('openPersonProfile', handleOpenProfile);
  }, []);

  // Handle Planning Center OAuth Callback
  useEffect(() => {
      const handlePcoCallback = async () => {
          if (loading || !user) return; // Wait for auth

          const params = new URLSearchParams(window.location.search);
          const code = params.get('code');
          const stateChurchId = params.get('state');

          // Prevent double processing in Strict Mode
          if (code && stateChurchId && processedCodeRef.current !== code) {
              processedCodeRef.current = code;
              
              // Clear URL immediately
              window.history.replaceState({}, document.title, window.location.pathname);
              setIsSyncing(true);

              try {
                  // 1. Get Credentials
                  const sysSettings = await firestore.getSystemSettings();
                  const targetChurch = await firestore.getChurch(stateChurchId);
                  
                  if (!targetChurch) throw new Error("Church context not found.");

                  const apiBaseUrl = sysSettings.apiBaseUrl || 'https://pastoralcare.barnabassoftware.com';

                  // 2. Exchange Token
                  const payload = {
                      grantType: 'authorization_code',
                      code,
                      redirectUri: window.location.origin
                  };

                  const response = await fetch(`${apiBaseUrl}/pco/token`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload)
                  });

                  if (!response.ok) {
                      const err = await response.json().catch(() => ({}));
                      throw new Error(err.error_description || err.error || err.message || `Token exchange failed: ${response.status} (Check your Client ID/Secret in Global App Settings for trailing spaces)`);
                  }

                  const data = await response.json();

                  // 3. Save to Firestore
                  const updates = {
                      pcoConnected: true,
                      pcoAccessToken: data.access_token,
                      pcoRefreshToken: data.refresh_token,
                      pcoTokenExpiry: Date.now() + (data.expires_in * 1000)
                  };
                  
                  await firestore.updateChurch(stateChurchId, updates);
                  
                  // 4. Initial Bulk Sync and Webhooks
                  try {
                      console.log("Starting initial data sync...");
                      await syncAllData(stateChurchId);
                      console.log("Initial sync and webhooks completed successfully.");
                      
                      // Refresh the local data to show it on the dashboard immediately
                      await loadTenantData(stateChurchId);
                      await loadServicesData(stateChurchId, servicesFilter);
                  } catch (e) {
                      console.error("Initial data sync or webhook setup failed:", e);
                  }

                  // 5. Update Local State
                  // Only update state if the callback corresponds to the currently loaded church
                  // or if we need to switch context (unlikely in this flow, but good for safety)
                  if (church?.id === stateChurchId) {
                      setChurch(prev => prev ? ({ ...prev, ...updates }) : null);
                  }
                  
                  alert("Planning Center connected successfully!");
                  
                  // Ensure we are on the settings page to see the result
                  setSettingsTab('Planning Center');
                  handleNavigate('settings');

              } catch (e: any) {
                  console.error("PCO Auth Error:", e);
                  alert(`Connection Failed: ${e.message}`);
              } finally {
                  setIsSyncing(false);
              }
          }
      };

      handlePcoCallback();
  }, [user, loading, church?.id]);

  // Data Fetching Effect
  useEffect(() => {
    if (user && church) {
      loadTenantData(church.id);
      loadServicesData(church.id, servicesFilter);
      loadWidgets(user, view);
    }
  }, [user, church?.id]);

  useEffect(() => {
      if (church?.id) {
          loadServicesData(church.id, servicesFilter);
      }
  }, [servicesFilter, church?.id]);

  // Census Data Effect
  useEffect(() => {
      const loadCensus = async () => {
          if (!church) return;

          // Determine which location to use for initial load
          const defaultLoc = (church.communityLocations || []).find(l => l.isDefault);
          const city = defaultLoc ? defaultLoc.city : church.city;
          const state = defaultLoc ? defaultLoc.state : church.state;

          if (city && state) {
              if (church.censusCache && (Date.now() - church.censusCache.lastUpdated < 1000 * 60 * 60 * 24 * 30)) {
                  // Use Cache if less than 30 days old
                  if (church.censusCache.city === city && church.censusCache.state === state) {
                      setCensusData(church.censusCache.data);
                      return;
                  }
              }
              
              // Fetch Fresh
              const sysSettings = await firestore.getSystemSettings();
              const result = await fetchCensusDataForTenant(sysSettings, state, city);
              if (result.data) {
                  setCensusData(result.data);
                  await firestore.updateCensusCache(church.id, result.data, result.sourceUrl, city, state);
                  setCensusError('');
              } else {
                  setCensusError(result.error || 'Failed to load census data.');
              }
          }
      };
      loadCensus();
  }, [church?.city, church?.state, church?.communityLocations]);

  const loadTenantData = async (churchId: string) => {
      const [p, g, a, d, f, b, t, rc, sc] = await Promise.all([
          firestore.getPeople(churchId),
          firestore.getGroups(churchId),
          firestore.getAttendance(churchId),
          firestore.getDetailedDonations(churchId),
          firestore.getFunds(churchId),
          firestore.getBudgets(churchId),
          firestore.getServicesTeams(churchId),
          firestore.getRecentRiskChanges(churchId),
          firestore.getRecentStatusChanges(churchId)
      ]);
      setPeople(p);
      setGroups(g);
      setAttendance(a);
      setDonations(d);
      setFunds(f);
      setBudgets(b);
      setTeams(t);
      setRecentRiskChanges(rc);
      setRecentStatusChanges(sc);
  };

  const loadServicesData = async (churchId: string, filter: ServicesFilter) => {
      const data = await firestore.getServicesAnalytics(churchId, filter);
      setServicesData(data);
  };

  const loadWidgets = (u: User, v: string) => {
      if (u.widgetPreferences && u.widgetPreferences[v]) {
          setWidgets(u.widgetPreferences[v]);
      } else {
          setWidgets(getDefaultWidgets(v));
      }
  };

  const hasPermission = (v: string) => {
      if (!user) return false;
      
      // Check if module is enabled
      if (v === 'communication' && systemSettings?.enabledModules?.communication === false) return false;

      if (user.roles.includes('System Administration') || user.roles.includes('Church Admin')) return true;
      if (v === 'dashboard') return true;
      if (v === 'settings') return user.roles.includes('Church Admin');
      if (v === 'pastoral') return user.roles.includes('Pastor') || user.roles.includes('Pastoral Care');
      if (v === 'pastoral-membership') return user.roles.includes('Pastor') || user.roles.includes('Pastoral Care');
      if (v === 'pastoral-community') return user.roles.includes('Pastor') || user.roles.includes('Pastoral Care');
      if (v === 'pastoral-care') return user.roles.includes('Pastor') || user.roles.includes('Pastoral Care');
      if (v === 'pastoral-calendar') return user.roles.includes('Pastor') || user.roles.includes('Pastoral Care');
      if (v === 'pastor-ai') return user.roles.includes('Pastor AI') || user.roles.includes('Pastor');
      
      const roleMap: Record<string, string> = {
          'people': 'People',
          'people-households': 'People',
          'people-risk': 'People',
          'people-reports': 'People',
          'groups': 'Groups',
          'services': 'Services',
          'services-attendance': 'Services',
          'services-teams': 'Services',
          'services-plans': 'Services',
          'giving': 'Giving',
          'giving-donor': 'Giving',
          'giving-budgets': 'Giving',
          'giving-donations': 'Giving',
          'giving-reports': 'Giving',
          'finance': 'Finance',
          'metrics': 'Metrics',
          'metrics-input': 'Metrics',
          'metrics-settings': 'Metrics',
          'messaging': 'Messaging',
          'tools-sms': 'Messaging',
          'tools-sms-inbox': 'Messaging',
          'tools-sms-campaigns': 'Messaging',
          'tools-sms-workflows': 'Messaging',
          'tools-sms-keywords': 'Messaging',
          'tools-sms-analytics': 'Messaging',
          'tools-sms-agent': 'Messaging',
          'tools-sms-permissions': 'Messaging',
          'tools-emails': 'Email',
          'tools-polls': 'Polls',
          'tools-workflows': 'Workflows',
          'tools-notes': 'Notes',
          'tools-files': 'Files',
          'tools-forms': 'People',
      };
      
      if (v === 'tools') return true; 
      if (v.startsWith('tools-') && !roleMap[v]) return true; // All other tools sub-pages: allow all church users

      const requiredRole = roleMap[v];
      return requiredRole ? user.roles.includes(requiredRole as any) : false;
  };

  const handleNavigate = (newView: string) => {
      let resolvedView = newView;
      
      if (newView === 'tools') {
          const toolViews = ['tools-emails', 'tools-sms-inbox', 'tools-workflows', 'tools-polls', 'tools-notes', 'tools-files', 'tools-website', 'tools-qrcodes', 'tools-unsubscribers', 'tools-forms'];
          const availableTool = toolViews.find(tv => hasPermission(tv));
          resolvedView = availableTool || 'dashboard';
      }

      if (hasPermission(resolvedView)) {
          const viewToPath: Record<string, string> = {
              'dashboard': '/',
              'pastor-ai': '/ai-assistant',
              'people': '/people',
              'people-households': '/people/households',
              'people-risk': '/people/risk',
              'people-reports': '/people/reports',
              'groups': '/groups',
              'groups-reports': '/groups/reports',
              'services': '/services',
              'services-attendance': '/services/attendance',
              'services-teams': '/services/teams',
              'services-reminders': '/services/reminders',
              'services-plans': '/services/plans',
              'giving': '/giving',
              'giving-donor': '/giving/donor',
              'giving-budgets': '/giving/budgets',
              'giving-donations': '/giving/donations',
              'giving-reports': '/giving/reports',
              'pastoral': '/care',
              'pastoral-membership': '/care/membership',
              'pastoral-community': '/care/community',
              'pastoral-care': '/care/care',
              'pastoral-calendar': '/care/calendar',
              'metrics': '/metrics',
              'metrics-input': '/metrics/input',
              'metrics-settings': '/metrics/settings',
              'settings': '/settings',
              'app-settings': '/app-settings',
              'global-admin': '/global-admin',
              'library': '/library',
              'tools-emails': '/tools/emails',
              'tools-sms-inbox': '/tools/sms/inbox',
              'tools-sms-campaigns': '/tools/sms/campaigns',
              'tools-sms-workflows': '/tools/sms/workflows',
              'tools-sms-keywords': '/tools/sms/keywords',
              'tools-sms-analytics': '/tools/sms/analytics',
              'tools-sms-agent': '/tools/sms/agent',
              'tools-sms-permissions': '/tools/sms/permissions',
              'tools-workflows': '/tools/workflows',
              'tools-polls': '/tools/polls',
              'tools-notes': '/tools/notes',
              'tools-files': '/tools/files',
              'tools-forms': '/tools/forms',
              'tools-website': '/tools/website',
              'tools-qrcodes': '/tools/qrcodes',
              'tools-unsubscribers': '/tools/unsubscribers'
          };
          
          const navPath = viewToPath[resolvedView] || '/';
          navigate(navPath);
          loadWidgets(user!, resolvedView);
      }
  };

  const handleUpdateWidgets = (newWidgets: string[]) => {
      setWidgets(newWidgets);
      if (user) {
          const newPrefs = { ...user.widgetPreferences, [view]: newWidgets };
          firestore.updateUserPreferences(user.id, newPrefs);
          setUser({ ...user, widgetPreferences: newPrefs });
      }
  };

  const handleAcceptLayout = (layout: Record<string, string[]>) => {
      if (!user) return;
      firestore.updateUserPreferences(user.id, layout);
      setUser({ ...user, widgetPreferences: layout });
      // Apply dashboard widgets immediately
      if (layout['dashboard']) setWidgets(layout['dashboard']);
      setLayoutSuggestion(null);
  };

  const handleCustomizeLayout = (layout: Record<string, string[]>) => {
      // Save the suggestion first so it isn't lost, then close modal
      handleAcceptLayout(layout);
      // The user will use the WidgetsController drawer to further adjust
  };

  const handleSync = async () => {
    if (!church) return;
    setIsSyncing(true);
    try {
      await syncAllData(church.id);
      await loadTenantData(church.id);
      await loadServicesData(church.id, servicesFilter);
      const freshChurch = await firestore.getChurch(church.id);
      if (freshChurch) setChurch(freshChurch);
    } catch (e: any) {
      console.error(e);
      alert(`Sync failed: ${e.message || "Unknown error"}. Check console logs for details.`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncGroups = async () => {
      if (!church) return;
      setIsSyncing(true);
      try {
          await syncGroupsData(church.id);
          // Refresh local state to reflect new groups
          await loadTenantData(church.id);
      } catch (e: any) {
          console.error(e);
          alert(`Groups Sync failed: ${e.message}`);
      } finally {
          setIsSyncing(false);
      }
  };

  const handleSyncRecentGiving = async (startDate?: Date) => {
      if (!church) return;
      setIsSyncing(true);
      try {
          await syncRecentGiving(church.id, startDate);
          const d = await firestore.getDetailedDonations(church.id);
          setDonations(d);
          const f = await firestore.getFunds(church.id);
          setFunds(f);
      } catch (e: any) {
          console.error(e);
          alert(`Sync failed: ${e.message}`);
      } finally {
          setIsSyncing(false);
      }
  };

  const handleSaveBudget = async (budget: BudgetRecord) => {
      if (!church) return;
      try {
          await firestore.saveBudget(budget);
          const freshBudgets = await firestore.getBudgets(church.id);
          setBudgets(freshBudgets);
      } catch (e: any) {
          console.error('Failed to save budget:', e);
          alert(`Failed to save budget: ${e.message}`);
      }
  };

  const handleSwitchChurch = async (id: string) => {
      const target = allChurches.find(c => c.id === id);
      if (target) {
          setChurch(target);
          loadTenantData(target.id);
      }
  };

  // Sync Theme with DOM
  useEffect(() => {
    const isDark = user?.theme === 'dark';
    const html = document.documentElement;
    const body = document.body;

    if (isDark) {
      html.classList.add('dark');
      body.classList.add('dark');
      html.style.colorScheme = 'dark';
    } else {
      html.classList.remove('dark');
      body.classList.remove('dark');
      html.style.colorScheme = 'light';
    }
  }, [user?.theme]);

  const handleUpdateUserTheme = (theme: 'traditional' | 'dark') => {
      if (user) {
          firestore.updateUserTheme(user.id, theme);
          setUser({ ...user, theme });
      }
  };

  // --- PCO Display Filters ---
  const visiblePeople = useMemo(() => {
    if (!church?.pcoSettings?.hideInactiveMembers) return people;
    return people.filter(p => p.status?.toLowerCase() !== 'inactive');
  }, [people, church?.pcoSettings?.hideInactiveMembers]);

  const visibleGroups = useMemo(() => {
    if (!church?.pcoSettings?.hideArchivedItems) return groups;
    return groups.filter(g => !g.archivedAt);
  }, [groups, church?.pcoSettings?.hideArchivedItems]);

  // --- Derived Data Calculations ---

  const riskEnrichedPeople = useRiskEnrichedPeople(visiblePeople, visibleGroups, donations, servicesData, teams, church?.riskSettings);
  const peopleDashboardData = usePeopleDashboardData(visiblePeople, riskEnrichedPeople, recentRiskChanges, recentStatusChanges);
  const givingAnalyticsData = useGivingAnalyticsData(donations, givingFilter, givingDateRange, visiblePeople, church?.donorLifecycleSettings);
  const groupsDashboardData = useGroupsDashboardData(visibleGroups, visiblePeople);
  const attendanceChartData = useAttendanceChartData(attendance);


  const handleGenerateAIInsights = async () => {
      if (!church) return;
      setIsGeneratingInsights(true);
      try {
          const text = await generateGlobalInsights({
              people: peopleDashboardData,
              giving: givingAnalyticsData,
              groups: groupsDashboardData,
              services: servicesData,
              attendance: attendanceChartData,
              census: censusData,
              churchName: church.name
          });
          setGlobalInsights(text);
      } catch (e) {
          console.error(e);
      } finally {
          setIsGeneratingInsights(false);
      }
  };

  const handleGenerateGeoInsights = async () => {
      if (!peopleDashboardData.geoData?.byCity) return;
      setIsGeneratingGeo(true);
      try {
          const result = await generateGeoInsights(peopleDashboardData.geoData.byCity);
          setGeoInsights(result);
      } catch (e) {
          console.error(e);
      } finally {
          setIsGeneratingGeo(false);
      }
  };

  // --- Render ---

  // â”€â”€ Public Poll Route (no auth required) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const pollMatch = window.location.pathname.match(/^\/poll\/([^/]+)/);
  if (pollMatch) {
    // Sub-path: /poll/:id/live â€” Live Projector Display
    if (window.location.pathname.includes('/live')) {
      return <PollProjectorView pollId={pollMatch[1]} />;
    }
    return <PublicPollView pollId={pollMatch[1]} />;
  }

  // ─── Public Note Route (no auth required) ──────────────────────────────────
  const noteMatch = window.location.pathname.match(/^\/note\/([^/]+)/);
  if (noteMatch) {
    return <PublicNoteView noteId={noteMatch[1]} />;
  }

  // ─── Public Form Route (no auth required) ──────────────────────────────────
  const formMatch = window.location.pathname.match(/^\/form\/([^/]+)\/([^/]+)/);
  if (formMatch) {
    return <PublicFormView churchId={formMatch[1]} formId={formMatch[2]} />;
  }

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-400 font-bold text-sm bg-slate-50 dark:bg-slate-950">Loading Pastoral Care...</div>;
  }

  if (!user) {
    return isRegistering 
        ? <RegisterView onCancel={() => {
            window.history.pushState({}, '', '/');
            setIsRegistering(false);
          }} /> 
        : <LoginView onRegister={() => {
            window.history.pushState({}, '', '/register');
            setIsRegistering(true);
          }} />;
  }

  if (!church) {
      return <div className="flex h-screen items-center justify-center text-slate-400">No Church Organization Found. Contact Admin.</div>;
  }

  // ─── Mobile SMS App Route ──────────────────────────────────────────────────
  if (window.location.pathname.startsWith('/mobile/sms')) {
      return (
          <MobileSmsLayout
              churchId={church.id}
              church={church}
              currentUser={user}
              onUpdateChurch={async (updates) => {
                  await firestore.updateChurch(church.id, updates);
                  setChurch({ ...church, ...updates });
              }}
              onNavigateHome={() => {
                  // Standard back navigation out of the mobile standalone app
                  window.location.href = '/';
              }}
          />
      );
  }


  // -- Mobile device detection -----------------------------------------------
  const isMobileDevice = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || window.innerWidth < 768;

  // Auto-redirect mobile browsers that land on the desktop SMS tools route
  if (isMobileDevice && window.location.pathname.startsWith('/tools/sms')) {
      const smsMobilePath = window.location.pathname;
      let mobileTab = 'inbox';
      if (smsMobilePath.includes('/campaigns')) mobileTab = 'campaigns';
      else if (smsMobilePath.includes('/keywords'))  mobileTab = 'keywords';
      else if (smsMobilePath.includes('/analytics')) mobileTab = 'analytics';
      window.location.replace("/mobile/sms?tab=" + mobileTab);
      return null;
  }

  const safeEnabledWidgets = (church.enabledWidgets && church.enabledWidgets.length > 0) ? church.enabledWidgets : undefined;

  const isOverlayOpen = selectedPersonId !== null || layoutSuggestion !== null;

  return (
    <>
    {layoutSuggestion !== null && (
        <WelcomeLayoutModal
            user={user}
            suggestedLayout={layoutSuggestion}
            isLoading={isGeneratingLayout}
            onAccept={handleAcceptLayout}
            onCustomize={handleCustomizeLayout}
        />
    )}
    
        <TenantDataProvider value={{
            user, church, allChurches, systemSettings, widgets,
            people: visiblePeople, groups: visibleGroups, attendance, donations, funds, budgets, teams,
            recentRiskChanges, recentStatusChanges, servicesData,
            setPeople, setGroups, setAttendance, setDonations, setFunds, setBudgets,
            setTeams, setRecentRiskChanges, setRecentStatusChanges, setServicesData
        }}>
            <div inert={isOverlayOpen ? true : undefined} className="flex flex-col min-h-screen">
                <Layout 
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
                noPadding={view.startsWith('tools')}
                subNavItems={view.startsWith('tools-sms') ? [
                    { label: 'Inbox',     view: 'tools-sms-inbox',     icon: <span className="text-sm">📥</span> },
                    (user && canUserUseFeature(activeNumber, user, 'broadcastUserIds')) ? { label: 'Broadcast', view: 'tools-sms-campaigns', icon: <span className="text-sm">📨</span> } : null,
                    (user && canUserUseFeature(activeNumber, user, 'keywordsUserIds')) ? { label: 'Keywords',  view: 'tools-sms-keywords',  icon: <span className="text-sm">🔑</span> } : null,
                    (user && canUserUseFeature(activeNumber, user, 'analyticsUserIds')) ? { label: 'Analytics', view: 'tools-sms-analytics', icon: <span className="text-sm">📊</span> } : null,
                    (user && canUserUseFeature(activeNumber, user, 'aiAgentUserIds')) ? { label: 'AI Agent',  view: 'tools-sms-agent',     icon: <span className="text-sm">✨</span> } : null,
                    (user && (user.roles.includes('Church Admin') || user.roles.includes('System Administration'))) ? { label: 'Permissions', view: 'tools-sms-permissions', icon: <span className="text-sm">🛡️</span> } : null
                ].filter(Boolean) as any : undefined}
            >
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
                
                <Route path="/tools/emails" element={<ToolsView churchId={church!.id} church={church!} currentUserId={user!.id} currentUser={user!} onUpdateChurch={(updates) => { firestore.updateChurch(church!.id, updates); setChurch({ ...church!, ...updates }); }} activePage="emails" />} />
                <Route path="/tools/polls" element={<ToolsView churchId={church!.id} church={church!} currentUserId={user!.id} currentUser={user!} onUpdateChurch={(updates) => { firestore.updateChurch(church!.id, updates); setChurch({ ...church!, ...updates }); }} activePage="polls" />} />
                <Route path="/tools/website" element={<ToolsView churchId={church!.id} church={church!} currentUserId={user!.id} currentUser={user!} onUpdateChurch={(updates) => { firestore.updateChurch(church!.id, updates); setChurch({ ...church!, ...updates }); }} activePage="website" />} />
                <Route path="/tools/unsubscribers" element={<ToolsView churchId={church!.id} church={church!} currentUserId={user!.id} currentUser={user!} onUpdateChurch={(updates) => { firestore.updateChurch(church!.id, updates); setChurch({ ...church!, ...updates }); }} activePage="unsubscribers" />} />
                <Route path="/tools/qrcodes" element={<ToolsView churchId={church!.id} church={church!} currentUserId={user!.id} currentUser={user!} onUpdateChurch={(updates) => { firestore.updateChurch(church!.id, updates); setChurch({ ...church!, ...updates }); }} activePage="qrcodes" />} />
                <Route path="/tools/notes" element={<ToolsView churchId={church!.id} church={church!} currentUserId={user!.id} currentUser={user!} onUpdateChurch={(updates) => { firestore.updateChurch(church!.id, updates); setChurch({ ...church!, ...updates }); }} activePage="notes" />} />
                <Route path="/tools/files" element={<ToolsView churchId={church!.id} church={church!} currentUserId={user!.id} currentUser={user!} onUpdateChurch={(updates) => { firestore.updateChurch(church!.id, updates); setChurch({ ...church!, ...updates }); }} activePage="files" />} />
                <Route path="/tools/forms" element={<ToolsView churchId={church!.id} church={church!} currentUserId={user!.id} currentUser={user!} onUpdateChurch={(updates) => { firestore.updateChurch(church!.id, updates); setChurch({ ...church!, ...updates }); }} activePage="forms" />} />
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
                            view === 'tools-sms-permissions' ? 'permissions' :
                            view === 'tools-sms-agent'     ? 'agent'     : 'inbox'
                        }
                        mobileSmsUrl={`${window.location.protocol}//${window.location.host}/mobile/sms`}
                        activeNumberId={smsActiveNumberId}
                        onActiveNumberIdChange={setSmsActiveNumberId}
                    /> 
                } />
                <Route path="/ai-assistant" element={
                    hasPermission('pastor-ai') ? (
                        <div className="flex-1 min-h-0 p-6">
                            <PastorAIView 
                                peopleData={peopleDashboardData}
                                givingAnalytics={givingAnalyticsData}
                                groupsData={groupsDashboardData}
                                servicesData={servicesData}
                                attendanceData={attendanceChartData}
                                censusData={censusData}
                                churchName={church.name}
                                donations={donations}
                                funds={funds}
                                budgets={budgets}
                                teams={teams}
                                recentRiskChanges={recentRiskChanges}
                                recentStatusChanges={recentStatusChanges}
                            />
                        </div>
                    ) : <Navigate to="/" replace />
                } />

                {/* Fallback route */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Layout>
            </div>
            
            {/* Global Profile Drawer Overlay */}
            {selectedPersonId && church && (
                <PersonProfileDrawer 
                    personId={selectedPersonId}
                    churchId={church.id}
                    onClose={() => setSelectedPersonId(null)}
                />
            )}
        </TenantDataProvider>
    </>
  );
};

export default App;
