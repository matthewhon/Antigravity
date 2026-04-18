import React, { useState, useEffect, useMemo, useRef } from 'react';
import { auth } from './services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { firestore } from './services/firestoreService';
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
import LibraryView from './components/LibraryView';
import WelcomeLayoutModal from './components/WelcomeLayoutModal';
import { PublicPollView } from './components/PublicPollView';
import { ToolsView } from './components/ToolsView';
import { SmsWorkflowsManager } from './components/MessagingModule';
import { 
  User, Church, PeopleDashboardData, GivingAnalytics, GroupsDashboardData, 
  ServicesDashboardData, AttendanceData, CensusStats, BudgetRecord, PcoFund, 
  DetailedDonation, PcoPerson, ServicesFilter, GivingFilter, GeoInsight,
  PcoGroup, AttendanceRecord, ServicesTeam, RiskSettings, SystemSettings, RiskChangeRecord
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
  const [view, setView] = useState('dashboard');
  const [isRegistering, setIsRegistering] = useState(false);
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

  // Refs
  const processedCodeRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        try {
          const userProfile = await firestore.getUserProfile(authUser.uid);
          if (userProfile) {
            setUser(userProfile);
            
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
        // Fix stale URL — covers: no URL, old api.* subdomain, old Cloud Run URL
        const isStaleUrl = !settings.apiBaseUrl 
            || settings.apiBaseUrl.includes('api.pastoralcare.barnabassoftware.com')
            || settings.apiBaseUrl.includes('u3gnt7kb5a-uc.a.run.app');
        if (isStaleUrl) {
            const newSettings = { ...settings, apiBaseUrl: correctUrl };
            await firestore.saveSystemSettings(newSettings);
            setSystemSettings(newSettings);
        } else {
            setSystemSettings(settings);
        }
    });
  }, [user]);


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
                  setView('settings');

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
      const [p, g, a, d, f, b, t, rc] = await Promise.all([
          firestore.getPeople(churchId),
          firestore.getGroups(churchId),
          firestore.getAttendance(churchId),
          firestore.getDetailedDonations(churchId),
          firestore.getFunds(churchId),
          firestore.getBudgets(churchId),
          firestore.getServicesTeams(churchId),
          firestore.getRecentRiskChanges(churchId)
      ]);
      setPeople(p);
      setGroups(g);
      setAttendance(a);
      setDonations(d);
      setFunds(f);
      setBudgets(b);
      setTeams(t);
      setRecentRiskChanges(rc);
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
          'groups': 'Groups',
          'services': 'Services',
          'services-attendance': 'Services',
          'services-teams': 'Services',
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
      };
      
      if (v === 'tools' || v.startsWith('tools-')) return true; // All tools sub-pages: allow all church users

      const requiredRole = roleMap[v];
      return requiredRole ? user.roles.includes(requiredRole as any) : false;
  };

  const handleNavigate = (newView: string) => {
      // Upgrade legacy bare 'tools' route to first sub-page
      const resolvedView = newView === 'tools' ? 'tools-emails' : newView;
      if (hasPermission(resolvedView)) {
          setView(resolvedView);
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

  // --- Derived Data Calculations ---

  // Risk Calculation (Enrich People with Risk Profiles)
  const riskEnrichedPeople = useMemo(() => {
      // Create a set of people in ANY group for easy risk calc lookup
      const groupMemberMap = new Set<string>();
      if (groups) {
          groups.forEach(g => {
              if (g.memberIds) {
                  g.memberIds.forEach(mid => groupMemberMap.add(mid));
              }
          });
      }

      const peopleWithGroups = people.map(p => ({
          ...p,
          groupIds: groupMemberMap.has(p.id) ? ['exists'] : [] // Simple check for now
      }));

      if (!peopleWithGroups || peopleWithGroups.length === 0) return [];
      return calculateBulkRisk(
          peopleWithGroups, 
          donations, 
          groups, 
          servicesData?.recentPlans || [], 
          teams, 
          church?.riskSettings || DEFAULT_RISK_SETTINGS
      );
  }, [people, donations, groups, servicesData, teams, church?.riskSettings]);

  const attendanceData = useMemo<AttendanceData[]>(() => {
      return attendance.map(a => ({
          date: a.date,
          attendance: a.count,
          newComers: a.guests
      }));
  }, [attendance]);

  // People Dashboard Data
  const peopleDashboardData = useMemo<PeopleDashboardData>(() => {
      const total = people.length;
      const members = people.filter(p => p.membership === 'Member').length;
      const newThisMonth = people.filter(p => {
          const d = new Date(p.createdAt);
          const now = new Date();
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).length;
      
      const genderData = [
          { name: 'Male', value: people.filter(p => p.gender === 'M' || p.gender === 'Male').length },
          { name: 'Female', value: people.filter(p => p.gender === 'F' || p.gender === 'Female').length },
      ].filter(d => d.value > 0);

      const membershipCounts: Record<string, number> = {};
      people.forEach(p => {
          const m = p.membership || 'No Status';
          membershipCounts[m] = (membershipCounts[m] || 0) + 1;
      });
      const membershipData = Object.entries(membershipCounts)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);

      const cityMap = new Map<string, number>();
      const zipMap = new Map<string, number>();
      people.forEach(p => {
          if (p.addresses && p.addresses.length > 0) {
              const addr = p.addresses[0];
              if (addr.city) cityMap.set(addr.city, (cityMap.get(addr.city) || 0) + 1);
              if (addr.zip) zipMap.set(addr.zip, (zipMap.get(addr.zip) || 0) + 1);
          }
      });

      const ageBuckets: Record<string, number> = { '0-18': 0, '19-30': 0, '31-50': 0, '51-70': 0, '70+': 0 };
      const currentYear = new Date().getFullYear();
      people.forEach(p => {
          if (p.birthdate) {
              const birthYear = parseInt(p.birthdate.split('-')[0]);
              const age = currentYear - birthYear;
              if (age <= 18) ageBuckets['0-18']++;
              else if (age <= 30) ageBuckets['19-30']++;
              else if (age <= 50) ageBuckets['31-50']++;
              else if (age <= 70) ageBuckets['51-70']++;
              else ageBuckets['70+']++;
          }
      });
      const ageData = Object.entries(ageBuckets).map(([range, count]) => ({ range, count }));

      const householdMap = new Map<string, PcoPerson[]>();
      people.forEach(p => {
          if (p.householdId) {
              if (!householdMap.has(p.householdId)) householdMap.set(p.householdId, []);
              householdMap.get(p.householdId)?.push(p);
          }
      });
      const pcoHouseholds = householdMap.size;
      const looseCount = people.filter(p => !p.householdId).length;
      const totalHouseholds = pcoHouseholds + looseCount;
      const avgSize = totalHouseholds > 0 ? total / totalHouseholds : 0;

      let familyCount = 0;
      householdMap.forEach(members => { if (members.length > 1) familyCount++; });
      const composition = [{ type: 'Family', count: familyCount }, { type: 'Individual', count: looseCount + (pcoHouseholds - familyCount) }];

      const sizeDist: Record<string, number> = {};
      householdMap.forEach(m => {
          const s = m.length;
          sizeDist[s] = (sizeDist[s] || 0) + 1;
      });
      if (looseCount > 0) sizeDist['1'] = (sizeDist['1'] || 0) + looseCount;
      const sizeDistribution = Object.entries(sizeDist).map(([size, count]) => ({ size: `${size} Person`, count })).sort((a,b) => parseInt(a.size) - parseInt(b.size));

      const householdList = Array.from(householdMap.entries()).map(([id, members]) => {
          let name = members[0].householdName || '';
          if (!name) {
              const lastName = members[0].name.split(' ').pop() || 'Unknown';
              name = `${lastName} Household`;
          }
          return { id, name, memberCount: members.length, members };
      }).sort((a,b) => b.memberCount - a.memberCount);

      // Stable calculation of 'Today' for consistent sorting
      const today = new Date();
      today.setHours(0,0,0,0);

      // Helper to calculate next occurrence of a date (birthday/anniversary)
      const getNextDate = (dateStr: string) => {
          const [y, m, d] = dateStr.split('-').map(Number);
          const currentYear = today.getFullYear();
          const target = new Date(currentYear, m - 1, d);
          
          if (target < today) {
              target.setFullYear(currentYear + 1);
          }
          return target;
      };

      return {
          stats: {
              total,
              members,
              nonMembers: total - members,
              newThisMonth,
              households: totalHouseholds
          },
          genderData,
          membershipData,
          ageData,
          engagementData: [
              { name: 'Core', value: people.filter(p => p.checkInCount && p.checkInCount > 8).length },
              { name: 'Regular', value: people.filter(p => p.checkInCount && p.checkInCount >= 4 && p.checkInCount <= 8).length },
              { name: 'Sporadic', value: people.filter(p => p.checkInCount && p.checkInCount > 0 && p.checkInCount < 4).length },
              { name: 'Inactive', value: people.filter(p => !p.checkInCount || p.checkInCount === 0).length }
          ],
          upcomingBirthdays: riskEnrichedPeople
              .filter(p => p.birthdate && p.status !== 'inactive') // Filter inactive
              .sort((a, b) => getNextDate(a.birthdate!).getTime() - getNextDate(b.birthdate!).getTime())
              .slice(0, 8),
          upcomingAnniversaries: riskEnrichedPeople
              .filter(p => p.anniversary && p.status !== 'inactive') // Filter inactive
              .sort((a, b) => getNextDate(a.anniversary!).getTime() - getNextDate(b.anniversary!).getTime())
              .slice(0, 8),
          recentPeople: [...riskEnrichedPeople]
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .slice(0, 10),
          geoData: {
              byCity: Array.from(cityMap.entries()).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 20),
              byZip: Array.from(zipMap.entries()).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 10)
          },
          allPeople: riskEnrichedPeople,
          householdStats: {
              totalHouseholds,
              pcoHouseholds,
              avgSize,
              sizeDistribution,
              composition,
              householdList
          },
          recentRiskChanges
      };
  }, [people, riskEnrichedPeople, recentRiskChanges]);

  const givingAnalyticsData = useMemo(() => {
      return calculateGivingAnalytics(
          donations, 
          givingFilter, 
          givingDateRange.start && givingDateRange.end ? givingDateRange : undefined, 
          people,
          church?.donorLifecycleSettings || DEFAULT_LIFECYCLE_SETTINGS
      );
  }, [donations, givingFilter, givingDateRange, people, church?.donorLifecycleSettings]);

  const groupsDashboardData = useMemo<GroupsDashboardData>(() => {
      const totalEnrollment = groups.reduce((sum, g) => sum + g.membersCount, 0);
      const groupTypeMap = new Map<string, number>();
      let totalAverageAttendance = 0;

      groups.forEach(g => {
          groupTypeMap.set(g.groupTypeName || 'Unknown', (groupTypeMap.get(g.groupTypeName || 'Unknown') || 0) + 1);
          
          if (g.attendanceHistory && g.attendanceHistory.length > 0) {
              const events = [...g.attendanceHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
              const recentEvents = events.slice(0, 4);
              const sum = recentEvents.reduce((acc, ev) => acc + (ev.count || 0), 0);
              if (recentEvents.length > 0) {
                  totalAverageAttendance += sum / recentEvents.length;
              }
          }
      });

      totalAverageAttendance = Math.round(totalAverageAttendance);

      // Calculate Gender Distribution based on Group Members
      let male = 0;
      let female = 0;
      
      // Create a set of unique person IDs who are in any group
      const allGroupMemberIds = new Set<string>();
      groups.forEach(g => {
          if (g.memberIds) {
              g.memberIds.forEach(mid => allGroupMemberIds.add(mid));
          }
      });

      // Cross-reference with People list
      if (people) {
          people.forEach(p => {
              if (allGroupMemberIds.has(p.id)) {
                  const g = p.gender?.toLowerCase();
                  if (g === 'm' || g === 'male') male++;
                  else if (g === 'f' || g === 'female') female++;
              }
          });
      }

      const genderDistribution = [
          { name: 'Male', value: male },
          { name: 'Female', value: female }
      ].filter(d => d.value > 0);

      // Calculate Church Progress Stats specifically
      const now = new Date();
      const thirtyDaysAgoIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const sixtyDaysAgoIso = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const todayIso = now.toISOString().split('T')[0];

      const attendedThisMonth = new Set<string>();
      const attendedLastMonth = new Set<string>();

      groups.forEach(g => {
          if (g.attendanceHistory) {
              g.attendanceHistory.forEach(h => {
                  const eventDate = h.date.split('T')[0];
                  if (eventDate > todayIso || eventDate < sixtyDaysAgoIso) return;
                  
                  if (h.attendeeIds) {
                      h.attendeeIds.forEach(id => {
                          if (eventDate >= thirtyDaysAgoIso) {
                              attendedThisMonth.add(id);
                          } else if (eventDate >= sixtyDaysAgoIso && eventDate < thirtyDaysAgoIso) {
                              attendedLastMonth.add(id);
                          }
                      });
                  }
              });
          }
      });

      return {
          stats: {
              totalGroups: groups.length,
              totalEnrollment,
              averageGroupSize: groups.length > 0 ? Math.round(totalEnrollment / groups.length) : 0,
              publicGroups: groups.filter(g => g.isPublic).length,
              averageAttendance: totalAverageAttendance
          },
          groupsByType: Array.from(groupTypeMap.entries()).map(([name, value]) => ({ name, value })),
          groupsByDay: [],
          allGroups: groups,
          recentGroups: groups.slice(0, 5),
          genderDistribution,
          progressStats: { thisMonth: attendedThisMonth.size, lastMonth: attendedLastMonth.size }
      };
  }, [groups, people]);

  const attendanceChartData = useMemo(() => {
      return attendance.map(a => ({
          date: a.date,
          attendance: a.count,
          newComers: a.guests
      }));
  }, [attendance]);

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

  // ── Public Poll Route (no auth required) ──────────────────────────────────
  const pollMatch = window.location.pathname.match(/^\/poll\/([^/]+)/);
  if (pollMatch) {
    return <PublicPollView pollId={pollMatch[1]} />;
  }

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-400 font-bold text-sm bg-slate-50 dark:bg-slate-950">Loading Pastoral Care...</div>;
  }

  if (!user) {
    return isRegistering 
        ? <RegisterView onCancel={() => setIsRegistering(false)} /> 
        : <LoginView onRegister={() => setIsRegistering(true)} />;
  }

  if (!church) {
      return <div className="flex h-screen items-center justify-center text-slate-400">No Church Organization Found. Contact Admin.</div>;
  }

  const safeEnabledWidgets = (church.enabledWidgets && church.enabledWidgets.length > 0) ? church.enabledWidgets : undefined;

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
        {view === 'dashboard' && (
            <DashboardView 
                user={user}
                peopleData={peopleDashboardData}
                givingAnalytics={givingAnalyticsData}
                groupsData={groupsDashboardData}
                servicesData={servicesData}
                attendanceData={attendanceChartData}
                censusData={censusData}
                visibleWidgets={widgets}
                onUpdateWidgets={handleUpdateWidgets}
                budgets={budgets}
                funds={funds}
                donations={donations}
                pcoConnected={church.pcoConnected}
                onConnectPco={() => {
                    setSettingsTab('Planning Center');
                    setView('settings');
                }}
                allowedWidgetIds={safeEnabledWidgets}
                globalInsights={globalInsights}
                isGeneratingInsights={isGeneratingInsights}
                onUpdateTheme={handleUpdateUserTheme}
                churchRiskSettings={church.churchRiskSettings}
                onGenerateInsights={handleGenerateAIInsights}
                churchName={church.name}
            />
        )}
        {(view === 'people' || view === 'people-households' || view === 'people-risk') && (
            <PeopleView 
                data={peopleDashboardData}
                activePage={
                    view === 'people-households' ? 'households' :
                    view === 'people-risk'       ? 'risk'       :
                    'overview'
                }
                overviewWidgets={widgets}
                householdWidgets={user.widgetPreferences?.['people_households'] || getDefaultWidgets('people_households')}
                riskWidgets={user.widgetPreferences?.['people_risk'] || getDefaultWidgets('people_risk')}
                onUpdateOverviewWidgets={handleUpdateWidgets}
                onUpdateHouseholdWidgets={(w) => {
                    const newPrefs = { ...user.widgetPreferences, 'people_households': w };
                    firestore.updateUserPreferences(user.id, newPrefs);
                    setUser({ ...user, widgetPreferences: newPrefs });
                }}
                onUpdateRiskWidgets={(w) => {
                    const newPrefs = { ...user.widgetPreferences, 'people_risk': w };
                    firestore.updateUserPreferences(user.id, newPrefs);
                    setUser({ ...user, widgetPreferences: newPrefs });
                }}
                geoInsights={geoInsights}
                isGeneratingGeo={isGeneratingGeo}
                onGenerateGeoInsights={handleGenerateGeoInsights}
                censusData={censusData}
                allowedWidgetIds={safeEnabledWidgets}
                onSync={handleSync}
                isSyncing={isSyncing}
                pcoConnected={church.pcoConnected}
                churchId={church.id}
                apiBaseUrl={systemSettings?.apiBaseUrl || 'https://pastoralcare.barnabassoftware.com'}
                onUpdateTheme={handleUpdateUserTheme}
                currentTheme={user.theme}
            />
        )}
        {view === 'groups' && (
            <GroupsView 
                data={groupsDashboardData}
                pcoConnected={church.pcoConnected}
                visibleWidgets={widgets}
                onUpdateWidgets={handleUpdateWidgets}
                allowedWidgetIds={safeEnabledWidgets}
                onSync={handleSync}
                onSyncGroups={handleSyncGroups}
                isSyncing={isSyncing}
                peopleData={peopleDashboardData}
                onUpdateTheme={handleUpdateUserTheme}
                currentTheme={user.theme}
                groupRiskSettings={church.groupRiskSettings}
            />
        )}
        {(view === 'services' || view === 'services-attendance' || view === 'services-teams') && (
            <ServicesView 
                data={servicesData}
                isLoading={!servicesData}
                filter={servicesFilter}
                onFilterChange={setServicesFilter}
                pcoConnected={church.pcoConnected}
                activePage={
                    view === 'services-attendance' ? 'Attendance' :
                    view === 'services-teams'      ? 'Teams'      :
                    'Overview'
                }
                overviewWidgets={user.widgetPreferences?.['services_overview'] || getDefaultWidgets('services_overview')}
                attendanceWidgets={user.widgetPreferences?.['services_attendance'] || getDefaultWidgets('services_attendance')}
                teamsWidgets={user.widgetPreferences?.['services_teams'] || getDefaultWidgets('services_teams')}
                onUpdateOverviewWidgets={(w) => {
                    const newPrefs = { ...user.widgetPreferences, 'services_overview': w };
                    firestore.updateUserPreferences(user.id, newPrefs);
                    setUser({ ...user, widgetPreferences: newPrefs });
                }}
                onUpdateAttendanceWidgets={(w) => {
                    const newPrefs = { ...user.widgetPreferences, 'services_attendance': w };
                    firestore.updateUserPreferences(user.id, newPrefs);
                    setUser({ ...user, widgetPreferences: newPrefs });
                }}
                onUpdateTeamsWidgets={(w) => {
                    const newPrefs = { ...user.widgetPreferences, 'services_teams': w };
                    firestore.updateUserPreferences(user.id, newPrefs);
                    setUser({ ...user, widgetPreferences: newPrefs });
                }}
                allowedWidgetIds={safeEnabledWidgets}
                onSync={handleSync}
                isSyncing={isSyncing}
                people={peopleDashboardData.allPeople}
                onUpdateTheme={handleUpdateUserTheme}
                currentTheme={user.theme}
                churchId={church.id}
            />
        )}
        {(view === 'giving' || view === 'giving-donor' || view === 'giving-budgets' || view === 'giving-donations' || view === 'giving-reports') && (
            <GivingView 
                analytics={givingAnalyticsData}
                filter={givingFilter}
                onFilterChange={setGivingFilter}
                dateRange={givingFilter === 'Custom' ? givingDateRange : undefined}
                onDateRangeChange={setGivingDateRange}
                pcoConnected={church.pcoConnected}
                activePage={
                    view === 'giving-donor'     ? 'donor'     :
                    view === 'giving-budgets'   ? 'budgets'   :
                    view === 'giving-donations' ? 'donations' :
                    view === 'giving-reports'   ? 'reports'   :
                    'overview'
                }
                overviewWidgets={user.widgetPreferences?.['giving_overview'] || getDefaultWidgets('giving_overview')}
                donorWidgets={user.widgetPreferences?.['giving_donors'] || getDefaultWidgets('giving_donors')}
                onUpdateOverviewWidgets={(w) => {
                    const newPrefs = { ...user.widgetPreferences, 'giving_overview': w };
                    firestore.updateUserPreferences(user.id, newPrefs);
                    setUser({ ...user, widgetPreferences: newPrefs });
                }}
                onUpdateDonorWidgets={(w) => {
                    const newPrefs = { ...user.widgetPreferences, 'giving_donors': w };
                    firestore.updateUserPreferences(user.id, newPrefs);
                    setUser({ ...user, widgetPreferences: newPrefs });
                }}
                allowedWidgetIds={safeEnabledWidgets}
                onSyncRecent={handleSyncRecentGiving}
                isSyncing={isSyncing}
                budgets={budgets}
                funds={funds}
                donations={donations}
                churchId={church.id}
                church={church}
                people={peopleDashboardData.allPeople}
                totalPeople={peopleDashboardData.stats.total}
                onUpdateTheme={handleUpdateUserTheme}
                currentTheme={user.theme}
                onSaveBudget={handleSaveBudget}
            />
        )}
        {(view === 'pastoral' || view === 'pastoral-membership' || view === 'pastoral-community' || view === 'pastoral-care' || view === 'pastoral-calendar') && (
            <PastoralView 
                user={user}
                church={church}
                attendanceData={attendanceChartData}
                peopleData={peopleDashboardData}
                givingAnalytics={givingAnalyticsData}
                groupsData={groupsDashboardData}
                pcoConnected={church.pcoConnected}
                censusData={censusData}
                churchConfig={{ city: church.city, state: church.state }}
                censusError={censusError}
                activePage={
                    view === 'pastoral-membership' ? 'Membership' :
                    view === 'pastoral-community'  ? 'Community'  :
                    view === 'pastoral-care'       ? 'Care'       :
                    view === 'pastoral-calendar'   ? 'Calendar'   :
                    'Church'
                }
                churchWidgets={user.widgetPreferences?.['pastoral_church'] || getDefaultWidgets('pastoral')}
                membershipWidgets={user.widgetPreferences?.['pastoral_membership'] || getDefaultWidgets('pastoral_membership')}
                communityWidgets={user.widgetPreferences?.['pastoral_community'] || getDefaultWidgets('pastoral_community')}
                careWidgets={user.widgetPreferences?.['pastoral_care'] || getDefaultWidgets('pastoral_care')}
                onUpdateChurchWidgets={(w) => {
                    const newPrefs = { ...user.widgetPreferences, 'pastoral_church': w };
                    firestore.updateUserPreferences(user.id, newPrefs);
                    setUser({ ...user, widgetPreferences: newPrefs });
                }}
                onUpdateMembershipWidgets={(w) => {
                    const newPrefs = { ...user.widgetPreferences, 'pastoral_membership': w };
                    firestore.updateUserPreferences(user.id, newPrefs);
                    setUser({ ...user, widgetPreferences: newPrefs });
                }}
                onUpdateCommunityWidgets={(w) => {
                    const newPrefs = { ...user.widgetPreferences, 'pastoral_community': w };
                    firestore.updateUserPreferences(user.id, newPrefs);
                    setUser({ ...user, widgetPreferences: newPrefs });
                }}
                onUpdateCareWidgets={(w) => {
                    const newPrefs = { ...user.widgetPreferences, 'pastoral_care': w };
                    firestore.updateUserPreferences(user.id, newPrefs);
                    setUser({ ...user, widgetPreferences: newPrefs });
                }}
                allowedWidgetIds={safeEnabledWidgets}
                googleMapsApiKey={church.googleMapsApiKey}
                onUpdateTheme={handleUpdateUserTheme}
            />
        )}

        {view === 'metrics' && (
            <MetricsView 
                churchId={church.id}
                currentUser={user}
                censusData={censusData}
                peopleData={peopleDashboardData}
                church={church}
                activePage="Dashboard"
                onUpdateChurch={(updates) => {
                    firestore.updateChurch(church.id, updates);
                    setChurch({ ...church, ...updates });
                }}
            />
        )}
        {view === 'metrics-input' && (
            <MetricsView 
                churchId={church.id}
                currentUser={user}
                censusData={censusData}
                peopleData={peopleDashboardData}
                church={church}
                activePage="Input"
                onUpdateChurch={(updates) => {
                    firestore.updateChurch(church.id, updates);
                    setChurch({ ...church, ...updates });
                }}
            />
        )}
        {view === 'metrics-settings' && (
            <MetricsView 
                churchId={church.id}
                currentUser={user}
                censusData={censusData}
                peopleData={peopleDashboardData}
                church={church}
                activePage="Settings"
                onUpdateChurch={(updates) => {
                    firestore.updateChurch(church.id, updates);
                    setChurch({ ...church, ...updates });
                }}
            />
        )}
        {view === 'settings' && (
            <RoleAdminView 
                currentUser={user}
                churchId={church.id}
                church={church}
                onUpdateChurch={(updates) => {
                    firestore.updateChurch(church.id, updates);
                    setChurch({ ...church, ...updates });
                }}
                initialTab={settingsTab}
                onSync={handleSync}
            />
        )}
        {view === 'app-settings' && (
            <SystemSettingsView 
                settings={systemSettings || {}}
                onSave={async (s) => {
                    await firestore.saveSystemSettings(s);
                    setSystemSettings(s);
                }}
                onRecalculateBenchmarks={async () => {
                    // Implementation for recalculating benchmarks
                }}
            />
        )}
        {view === 'global-admin' && (
            <GlobalAdminManager />
        )}
        {view === 'library' && (user.email === 'matthewhon01@gmail.com' || systemSettings?.enableLibrary) && (
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
                <LibraryView churchId={church.id} />
            </div>
        )}
        {/* ─── Tools: all sub-routes ─────────────────────────────────────── */}
        {view === 'tools-emails' && <ToolsView churchId={church.id} church={church} currentUserId={user.id} currentUser={user} onUpdateChurch={(updates) => { firestore.updateChurch(church.id, updates); setChurch({ ...church, ...updates }); }} activePage="emails" />}
        {view === 'tools-polls' && <ToolsView churchId={church.id} church={church} currentUserId={user.id} currentUser={user} onUpdateChurch={(updates) => { firestore.updateChurch(church.id, updates); setChurch({ ...church, ...updates }); }} activePage="polls" />}
        {view === 'tools-website' && <ToolsView churchId={church.id} church={church} currentUserId={user.id} currentUser={user} onUpdateChurch={(updates) => { firestore.updateChurch(church.id, updates); setChurch({ ...church, ...updates }); }} activePage="website" />}
        {view === 'tools-unsubscribers' && <ToolsView churchId={church.id} church={church} currentUserId={user.id} currentUser={user} onUpdateChurch={(updates) => { firestore.updateChurch(church.id, updates); setChurch({ ...church, ...updates }); }} activePage="unsubscribers" />}
        {/* Workflows — standalone, no SMS sub-nav */}
        {view === 'tools-workflows' && church && <SmsWorkflowsManager churchId={church.id} />}
        {/* SMS sub-routes — controlledTab drives panel selection; pill-nav hidden automatically */}
        {(view === 'tools-sms-inbox' || view === 'tools-sms') && <ToolsView churchId={church.id} church={church} currentUserId={user.id} currentUser={user} onUpdateChurch={(updates) => { firestore.updateChurch(church.id, updates); setChurch({ ...church, ...updates }); }} activePage="messaging" smsTab="inbox" />}
        {view === 'tools-sms-campaigns' && <ToolsView churchId={church.id} church={church} currentUserId={user.id} currentUser={user} onUpdateChurch={(updates) => { firestore.updateChurch(church.id, updates); setChurch({ ...church, ...updates }); }} activePage="messaging" smsTab="campaigns" />}
        {/* tools-sms-workflows kept as redirect alias for any bookmarks */}
        {view === 'tools-sms-workflows' && <ToolsView churchId={church.id} church={church} currentUserId={user.id} currentUser={user} onUpdateChurch={(updates) => { firestore.updateChurch(church.id, updates); setChurch({ ...church, ...updates }); }} activePage="messaging" smsTab="workflows" />}
        {view === 'tools-sms-keywords' && <ToolsView churchId={church.id} church={church} currentUserId={user.id} currentUser={user} onUpdateChurch={(updates) => { firestore.updateChurch(church.id, updates); setChurch({ ...church, ...updates }); }} activePage="messaging" smsTab="keywords" />}
        {view === 'tools-sms-analytics' && <ToolsView churchId={church.id} church={church} currentUserId={user.id} currentUser={user} onUpdateChurch={(updates) => { firestore.updateChurch(church.id, updates); setChurch({ ...church, ...updates }); }} activePage="messaging" smsTab="analytics" />}
        {view === 'tools-sms-agent'    && <ToolsView churchId={church.id} church={church} currentUserId={user.id} currentUser={user} onUpdateChurch={(updates) => { firestore.updateChurch(church.id, updates); setChurch({ ...church, ...updates }); }} activePage="messaging" smsTab="agent" />}

    </Layout>
    </>
  );
};

export default App;
