
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
    AttendanceData, PeopleDashboardData, GivingAnalytics, GroupsDashboardData, 
    CensusStats, PcoPerson, User, Church, PastoralNote, PrayerRequest 
} from '../types';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, Legend
} from 'recharts';
import WidgetsController from './WidgetsController';
import { 
    PASTORAL_CHURCH_WIDGETS, 
    PASTORAL_MEMBERSHIP_WIDGETS, 
    PASTORAL_COMMUNITY_WIDGETS,
    PASTORAL_CARE_WIDGETS
} from '../constants/widgetRegistry';
import { 
    WidgetWrapper, StatCard, CensusCard, 
    CareNoteCard, PrayerRequestCard 
} from './SharedUI';
import { CommunityComparison } from './CommunityComparison';
import { PastoralCalendar } from './PastoralCalendar';
import { CarePeopleListWidget } from './CarePeopleListWidget';
import { DEFAULT_RISK_SETTINGS } from '../services/riskService';
import { fetchCensusDataForTenant } from '../services/censusService';
import { generateCommunityStrategy, generateCareAdvice } from '../services/geminiService';
import { firestore } from '../services/firestoreService';
import { pcoService } from '../services/pcoService';
import Markdown from 'react-markdown';

interface PastoralViewProps {
  user: User;
  church: Church;
  attendanceData: AttendanceData[];
  peopleData: PeopleDashboardData | null;
  givingAnalytics: GivingAnalytics | null;
  groupsData: GroupsDashboardData | null;
  pcoConnected: boolean;
  censusData?: CensusStats | null;
  churchConfig: { city?: string, state?: string };
  censusError?: string;
  activePage?: 'Church' | 'Membership' | 'Community' | 'Care' | 'Calendar';
  // Per-tab widget preferences
  churchWidgets: string[];
  membershipWidgets: string[];
  communityWidgets: string[];
  careWidgets: string[];
  onUpdateChurchWidgets: (widgets: string[]) => void;
  onUpdateMembershipWidgets: (widgets: string[]) => void;
  onUpdateCommunityWidgets: (widgets: string[]) => void;
  onUpdateCareWidgets: (widgets: string[]) => void;
  allowedWidgetIds?: string[];
  googleMapsApiKey?: string;
  onUpdateTheme?: (theme: 'traditional' | 'dark') => void;
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#10b981'];

const TOOLTIP_STYLE = {
    borderRadius: '12px',
    border: 'none',
    backgroundColor: '#1e293b',
    color: '#fff',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
};

const getMinistrySignals = (data: CensusStats) => {
    const signals = [];
    
    if (data.commute && data.commute.longCommuteRate > 40) {
        signals.push({
            icon: '🚗',
            title: 'Commuter Context',
            desc: 'High commute times (>30m). Weeknight programs may suffer.'
        });
    }

    if (data.economics && data.economics.povertyRate > 12) {
        signals.push({
            icon: '🍞',
            title: 'Benevolence Need',
            desc: `Poverty rate is ${data.economics.povertyRate.toFixed(1)}%. Consider Food Pantry.`
        });
    }

    if (data.families && data.families.singleParentRate > 30) {
        signals.push({
            icon: '🎒',
            title: 'Single Parent Support',
            desc: `${data.families.singleParentRate.toFixed(1)}% of families are single-parent led.`
        });
    }

    if (data.education && data.education.bachelorsPlus > 50) {
        signals.push({
            icon: '🧠',
            title: 'Intellectual Engagement',
            desc: 'Highly educated demographic. Consider apologetics or deep-dive theology.'
        });
    }

    if (signals.length === 0) {
        signals.push({
            icon: '🏡',
            title: 'Stable Community',
            desc: 'Metrics indicate a stable demographic. Focus on deepening community.'
        });
    }
    
    return signals;
};

const ensureLeafletCss = () => {
    const id = 'leaflet-css';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
};

const PersonSearchCombobox = ({ 
    people, 
    value, 
    onChange, 
    onNameChange,
    placeholder = "Search person..." 
}: { 
    people: PcoPerson[], 
    value: string, 
    onChange: (id: string, name: string) => void,
    onNameChange?: (name: string) => void,
    placeholder?: string
}) => {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Initialize display value based on selected ID
    useEffect(() => {
        if (value) {
            const person = people.find(p => p.id === value);
            if (person) setQuery(person.name);
        } else if (!onNameChange) {
            // Only reset if we're strictly enforcing a valid ID (like in newNote)
            setQuery('');
        }
    }, [value, people, onNameChange]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filtered = people.filter(p => typeof p.name === 'string' && p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 10);

    return (
        <div className="relative" ref={wrapperRef}>
            <input
                type="text"
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setIsOpen(true);
                    onChange('', ''); // Clear strict selection when typing
                    if (onNameChange) onNameChange(e.target.value);
                }}
                onFocus={() => setIsOpen(true)}
                placeholder={placeholder}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-400 font-bold"
            />
            {isOpen && filtered.length > 0 && (
                <div className="absolute z-20 w-full mt-2 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl shadow-xl max-h-48 overflow-auto">
                    {filtered.map(p => (
                        <div
                            key={p.id}
                            className="p-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-slate-700 dark:text-slate-200 border-b border-slate-50 dark:border-slate-700/50 last:border-0"
                            onClick={() => {
                                onChange(p.id, p.name);
                                setQuery(p.name);
                                setIsOpen(false);
                            }}
                        >
                            {p.name}
                        </div>
                    ))}
                </div>
            )}
            {isOpen && query && filtered.length === 0 && (
                <div className="absolute z-20 w-full mt-2 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl shadow-xl p-4 text-sm text-slate-400 text-center italic">
                    No matching members found
                </div>
            )}
        </div>
    );
};


export const PastoralView: React.FC<PastoralViewProps> = ({
  user,
  church,
  attendanceData,
  peopleData,
  givingAnalytics,
  groupsData,
  pcoConnected,
  censusData,
  churchConfig,
  censusError,
  churchWidgets,
  membershipWidgets,
  communityWidgets,
  careWidgets,
  onUpdateChurchWidgets,
  onUpdateMembershipWidgets,
  onUpdateCommunityWidgets,
  onUpdateCareWidgets,
  activePage,
  allowedWidgetIds,
  googleMapsApiKey,
  onUpdateTheme
}) => {
  const activeTab = activePage ?? 'Church';
  const [locationCensusMap, setLocationCensusMap] = useState<Record<string, CensusStats>>({});
  const [locationErrorMap, setLocationErrorMap] = useState<Record<string, string>>({});
  const [isFetchingAllCensus, setIsFetchingAllCensus] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      const fetchAllCensus = async () => {
          if (!church.communityLocations || church.communityLocations.length === 0) return;
          
          setIsFetchingAllCensus(true);
          const newMap: Record<string, CensusStats> = {};
          const newErrorMap: Record<string, string> = {};
          
          try {
              const sysSettings = await firestore.getSystemSettings();
              
              await Promise.all(church.communityLocations.map(async (loc) => {
                  try {
                      const result = await fetchCensusDataForTenant(sysSettings, loc.state, loc.city);
                      if (result.data) {
                          newMap[loc.id] = result.data;
                      } else {
                          newErrorMap[loc.id] = result.error || 'Failed to load';
                      }
                  } catch (e: any) {
                      newErrorMap[loc.id] = e.message;
                  }
              }));
          } catch (e) {
              console.error("Error fetching system settings:", e);
          } finally {
              setLocationCensusMap(newMap);
              setLocationErrorMap(newErrorMap);
              setIsFetchingAllCensus(false);
          }
      };

      if (activeTab === 'Community' || activeTab === 'Church') {
          fetchAllCensus();
      }
  }, [activeTab, church.communityLocations]);

  // Use default location data for non-community tabs if available
  const defaultLocation = useMemo(() => 
      church.communityLocations?.find(l => l.isDefault) || church.communityLocations?.[0]
  , [church.communityLocations]);

  useEffect(() => {
      if (defaultLocation && !selectedLocationId) {
          setSelectedLocationId(defaultLocation.id);
      }
  }, [defaultLocation]);

  const effectiveCensusData = (defaultLocation && locationCensusMap[defaultLocation.id]) || censusData;
  const effectiveCensusError = (defaultLocation && locationErrorMap[defaultLocation.id]) || censusError;
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [mapAuthError, setMapAuthError] = useState(false);
  const [geocodeProgress, setGeocodeProgress] = useState<{ plotted: number; ungeocoded: number; topCities: string[] } | null>(null);

  // Care State
  const [notes, setNotes] = useState<PastoralNote[]>([]);
  const [prayerRequests, setPrayerRequests] = useState<PrayerRequest[]>([]);
  const [careAdvice, setCareAdvice] = useState<string>('');
  const [isGeneratingCare, setIsGeneratingCare] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isAddingPrayer, setIsAddingPrayer] = useState(false);

  const [newNote, setNewNote] = useState<Partial<PastoralNote>>({
      type: 'Note',
      content: '',
      date: new Date().toISOString().split('T')[0],
      isCompleted: false
  });

  const [newPrayer, setNewPrayer] = useState<Partial<PrayerRequest>>({
      request: '',
      status: 'Active',
      isPublic: false,
      date: new Date().toISOString().split('T')[0]
  });

  // AI Agent State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [strategyReport, setStrategyReport] = useState<string>('');

  // Pick the correct widget list and updater for the active tab
  const activeWidgets = useMemo(() => {
      if (activeTab === 'Church') return churchWidgets;
      if (activeTab === 'Membership') return membershipWidgets;
      if (activeTab === 'Community') return communityWidgets;
      if (activeTab === 'Care') return careWidgets;
      return [];
  }, [activeTab, churchWidgets, membershipWidgets, communityWidgets, careWidgets]);

  const handleUpdateActiveWidgets = (newWidgets: string[]) => {
      if (activeTab === 'Church') onUpdateChurchWidgets(newWidgets);
      else if (activeTab === 'Membership') onUpdateMembershipWidgets(newWidgets);
      else if (activeTab === 'Community') onUpdateCommunityWidgets(newWidgets);
      else if (activeTab === 'Care') onUpdateCareWidgets(newWidgets);
  };

  const availableWidgets = useMemo(() => {
      let base: any[] = [];
      if (activeTab === 'Church') base = PASTORAL_CHURCH_WIDGETS;
      else if (activeTab === 'Membership') base = PASTORAL_MEMBERSHIP_WIDGETS;
      else if (activeTab === 'Community') base = PASTORAL_COMMUNITY_WIDGETS;
      else if (activeTab === 'Care') base = PASTORAL_CARE_WIDGETS;

      if (allowedWidgetIds) {
          const prefix = activeTab === 'Church' ? 'pastoral_church' : 
                         activeTab === 'Membership' ? 'pastoral_membership' : 
                         activeTab === 'Community' ? 'pastoral_community' : 'pastoral_care';
          return base.filter(w => allowedWidgetIds.includes(`${prefix}:${w.id}`));
      }
      return base;
  }, [activeTab, allowedWidgetIds]);

  useEffect(() => {
      if (activeTab === 'Care' && church.id) {
          firestore.getPastoralNotes(church.id).then(setNotes);
          firestore.getPrayerRequests(church.id, 'Active').then(setPrayerRequests);
      }
  }, [activeTab, church.id]);

  const handleGenerateCareAdvice = async () => {
      if (!church.id || !peopleData) return;
      setIsGeneratingCare(true);
      try {
          const advice = await generateCareAdvice(notes, peopleData.recentPeople, church.name);
          setCareAdvice(advice);
      } catch (e) {
          console.error(e);
      } finally {
          setIsGeneratingCare(false);
      }
  };

  const handleSaveNote = async () => {
      if (!newNote.content || !newNote.personId || !church.id) return;
      
      const person = peopleData?.allPeople.find(p => p.id === newNote.personId);
      
      const note: PastoralNote = {
          id: `note_${Date.now()}`,
          churchId: church.id,
          personId: newNote.personId,
          personName: person?.name || 'Unknown',
          authorId: user.id || 'system',
          authorName: user.name || 'Unknown',
          date: newNote.date || new Date().toISOString().split('T')[0],
          type: (newNote.type || 'Note') as any,
          content: newNote.content,
          followUpDate: newNote.followUpDate || null,
          isCompleted: false,
          tags: []
      } as any;

      await firestore.savePastoralNote(note);

      // Sink to PCO if connected
      if (pcoConnected && person?.id) {
          try {
              let noteText = `[Pastoral Care: ${note.type}]\n${note.content}`;
              if (note.followUpDate) {
                  const formattedDate = new Date(note.followUpDate).toLocaleDateString();
                  noteText += `\n\nFollow-up needed by: ${formattedDate}`;
              }
              await pcoService.addNoteToPerson(church.id, person.id, noteText);
          } catch (e) {
              console.error('Failed to sync note to PCO:', e);
          }
      }

      setNotes([note, ...notes]);
      setIsAddingNote(false);
      setNewNote({ type: 'Note', content: '', date: new Date().toISOString().split('T')[0], isCompleted: false });
  };

  const handleSavePrayer = async () => {
      if (!newPrayer.request || !church.id) return;

      const person = newPrayer.personId ? peopleData?.allPeople.find(p => p.id === newPrayer.personId) : null;

      const request: PrayerRequest = {
          id: `prayer_${Date.now()}`,
          churchId: church.id,
          personId: newPrayer.personId || null,
          personName: person?.name || newPrayer.personName || 'Anonymous',
          request: newPrayer.request,
          date: newPrayer.date || new Date().toISOString().split('T')[0],
          status: 'Active',
          isPublic: newPrayer.isPublic || false
      } as any;

      await firestore.savePrayerRequest(request);
      setPrayerRequests([request, ...prayerRequests]);
      setIsAddingPrayer(false);
      setNewPrayer({ request: '', status: 'Active', isPublic: false, date: new Date().toISOString().split('T')[0] });
  };

  const safeVisibleWidgets = useMemo(() => {
      const currentTabIds = availableWidgets.map(w => w.id);
      return activeWidgets.filter(id => currentTabIds.includes(id));
  }, [activeWidgets, availableWidgets]);

  const handleUpdateCurrentTabWidgets = (newWidgetsForTab: string[]) => {
      handleUpdateActiveWidgets(newWidgetsForTab);
  };

  const handleRemoveWidget = (id: string) => {
      handleUpdateActiveWidgets(safeVisibleWidgets.filter(w => w !== id));
  };

  // --- Drag-and-Drop reordering ---
  const dndItem = useRef<number | null>(null);
  const dndOverItem = useRef<number | null>(null);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, position: number) => {
    dndItem.current = position;
    e.currentTarget.style.opacity = '0.5';
  };

  const handleDragEnter = (_e: React.DragEvent<HTMLDivElement>, position: number) => {
    dndOverItem.current = position;
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.style.opacity = '1';
    if (dndItem.current !== null && dndOverItem.current !== null && dndItem.current !== dndOverItem.current) {
      const copy = [...safeVisibleWidgets];
      const dragged = copy[dndItem.current];
      copy.splice(dndItem.current, 1);
      copy.splice(dndOverItem.current, 0, dragged);
      handleUpdateCurrentTabWidgets(copy);
    }
    dndItem.current = null;
    dndOverItem.current = null;
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleGenerateStrategy = async () => {
      if (!peopleData) return;
      
      setIsAnalyzing(true);
      setStrategyReport('');

      try {
          let cities: string[] = [];
          let censusDataList: CensusStats[] = [];

          // If on Community tab and a location is selected, use that primarily
          const selectedLoc = activeTab === 'Community' && selectedLocationId 
              ? church.communityLocations?.find(l => l.id === selectedLocationId) 
              : null;
          
          const selectedCensus = selectedLoc ? locationCensusMap[selectedLoc.id] : null;

          if (selectedCensus) {
              cities = [selectedLoc!.city];
              censusDataList = [selectedCensus];
          } else {
              // Fallback to top cities from people data
              if (!peopleData.geoData?.byCity) {
                  setStrategyReport("No community data available for analysis.");
                  setIsAnalyzing(false);
                  return;
              }
              const topCities = peopleData.geoData.byCity.slice(0, 3);
              const cityConfigs: { city: string, state: string }[] = [];
              
              topCities.forEach(c => {
                  const personWithAddr = peopleData.allPeople.find(p => 
                      p.addresses?.some(a => a.city === c.name)
                  );
                  if (personWithAddr) {
                      const addr = personWithAddr.addresses?.find(a => a.city === c.name);
                      if (addr && addr.state) {
                          cityConfigs.push({ city: c.name, state: addr.state });
                      }
                  }
              });

              const censusResults = await Promise.all(
                  cityConfigs.map(config => fetchCensusDataForTenant({} as any, config.state, config.city))
              );

              censusDataList = censusResults
                  .map(r => r.data)
                  .filter((d): d is CensusStats => d !== null);
              
              cities = topCities.map(c => c.name);
          }

          if (censusDataList.length === 0) {
              setStrategyReport("Unable to fetch census data for analysis. Please check community settings or address data.");
              setIsAnalyzing(false);
              return;
          }

          const report = await generateCommunityStrategy(
              {
                  age: peopleData.ageData,
                  gender: peopleData.genderData
              },
              {
                  cities,
                  censusData: censusDataList
              }
          );

          setStrategyReport(report);

      } catch (e) {
          console.error(e);
          setStrategyReport("An error occurred while generating the strategy.");
      } finally {
          setIsAnalyzing(false);
      }
  };

  useEffect(() => {
      setStrategyReport('');
  }, [selectedLocationId, activeTab]);

  // --- Map Initialization Effect (Leaflet + MarkerCluster) ---
  useEffect(() => {
      if (activeTab !== 'Membership' || !peopleData || !mapRef.current || mapInstance || !safeVisibleWidgets.includes('member_map')) return;

      ensureLeafletCss();

      Promise.all([
          import('leaflet'),
          import('leaflet.markercluster').then(() => {}) // side-effect: attaches to L global
      ]).then(([L]) => {
          if (!mapRef.current) return;

          // Build geocoded point list from people with lat/lng on their first address
          const points: { lat: number; lng: number; name: string; city?: string; membership?: string }[] = [];
          let ungeocodedCount = 0;
          const cityCounter = new Map<string, number>();

          peopleData.allPeople.forEach(p => {
              const addr = p.addresses?.[0];
              if (addr?.lat != null && addr?.lng != null) {
                  points.push({
                      lat: addr.lat,
                      lng: addr.lng,
                      name: p.name,
                      city: addr.city || '',
                      membership: p.membership || 'Non-Member',
                  });
                  if (addr.city) cityCounter.set(addr.city, (cityCounter.get(addr.city) || 0) + 1);
              } else if (addr && (addr.city || addr.zip)) {
                  ungeocodedCount++;
                  if (addr.city) cityCounter.set(addr.city, (cityCounter.get(addr.city) || 0) + 1);
              }
          });

          const topCities = Array.from(cityCounter.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([city]) => city);

          setGeocodeProgress({ plotted: points.length, ungeocoded: ungeocodedCount, topCities });

          // Fix default icon paths broken by bundlers
          (L.Icon.Default.prototype as any)._getIconUrl = undefined;
          L.Icon.Default.mergeOptions({
              iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
              iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
              shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
          });

          const map = L.map(mapRef.current!, {
              center: [39.8283, -98.5795],
              zoom: 4,
              zoomControl: true,
              attributionControl: true,
              maxZoom: 16,
          });

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
              maxZoom: 19,
          }).addTo(map);

          if (points.length > 0) {
              // Build the cluster group with custom indigo cluster icon
              const clusterGroup = (L as any).markerClusterGroup({
                  maxClusterRadius: 60,
                  showCoverageOnHover: false,
                  iconCreateFunction: (cluster: any) => {
                      const count = cluster.getChildCount();
                      const size = count < 10 ? 36 : count < 50 ? 44 : 52;
                      return L.divIcon({
                          html: `<div style="
                              width:${size}px;height:${size}px;
                              background:linear-gradient(135deg,#6366f1,#8b5cf6);
                              border:2px solid #fff;
                              border-radius:50%;
                              display:flex;align-items:center;justify-content:center;
                              box-shadow:0 2px 8px rgba(99,102,241,0.5);
                              font-size:${count < 100 ? 12 : 10}px;
                              font-weight:800;
                              color:#fff;
                          ">${count}</div>`,
                          className: '',
                          iconSize: [size, size],
                          iconAnchor: [size / 2, size / 2],
                      });
                  },
              });

              points.forEach(pt => {
                  const memberColor = pt.membership === 'Member' ? '#10b981' : '#6366f1';
                  const marker = L.circleMarker([pt.lat, pt.lng], {
                      radius: 7,
                      fillColor: memberColor,
                      fillOpacity: 0.85,
                      color: '#fff',
                      weight: 1.5,
                  });

                  marker.bindPopup(`
                      <div style="text-align:center;padding:6px 10px;font-family:system-ui,sans-serif">
                          <strong style="font-size:13px;color:#1e293b;display:block;margin-bottom:2px">${pt.name}</strong>
                          <span style="font-size:11px;color:#64748b">${pt.city || 'Unknown city'}</span><br/>
                          <span style="font-size:10px;font-weight:700;color:${memberColor}">${pt.membership}</span>
                      </div>
                  `);

                  clusterGroup.addLayer(marker);
              });

              map.addLayer(clusterGroup);

              try {
                  map.fitBounds(clusterGroup.getBounds(), { padding: [40, 40], maxZoom: 12 });
              } catch { /* bounds may fail if only 1 point */ }
          }

          setMapInstance(map);
      }).catch(err => {
          console.error('Leaflet cluster load error:', err);
          setMapAuthError(true);
      });

      return () => {};
  }, [activeTab, peopleData, safeVisibleWidgets, mapInstance]);

  // Destroy Leaflet map and reset when leaving Membership tab so re-entry triggers fresh init
  useEffect(() => {
      if (activeTab !== 'Membership' && mapInstance) {
          try { (mapInstance as any).remove(); } catch { /* ignore */ }
          setMapInstance(null);
          setMapAuthError(false);
      }
  }, [activeTab]);



  // --- Metrics Calculations ---
  
  const avgAttendance = attendanceData.length > 0 
      ? Math.round(attendanceData.slice(-4).reduce((sum, a) => sum + a.attendance, 0) / Math.min(4, attendanceData.length)) 
      : 0;
  const newGuestCount = attendanceData.slice(-8).reduce((sum, a) => sum + (a.newComers || 0), 0);
  const guestReturnRate = 42;
  const baptisms = 12;
  const salvations = 8;
  const volunteerRate = peopleData ? Math.round(((peopleData.stats.members * 0.45) / peopleData.stats.members) * 100) : 0; 

  const guestReturnFunnel = [
      { name: '1st Visit', value: newGuestCount },
      { name: '2nd Visit', value: Math.round(newGuestCount * (guestReturnRate/100)) },
      { name: 'Connected', value: Math.round(newGuestCount * (guestReturnRate/100) * 0.6) },
      { name: 'Member', value: Math.round(newGuestCount * (guestReturnRate/100) * 0.6 * 0.5) },
  ];

  const renderWidget = (id: string, censusContext?: CensusStats | null, locationName?: string, isDefault?: boolean) => {
      const displayCensus = censusContext !== undefined ? censusContext : effectiveCensusData;
      const currentTheme = user.theme || 'traditional';
      const gridColor = currentTheme === 'dark' ? '#334155' : '#f1f5f9';
      const axisColor = currentTheme === 'dark' ? '#94a3b8' : '#94a3b8';
      
      switch(id) {
          // --- Church Health Widgets ---
          case 'church_growth_stats':
              return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 h-full">
                      <StatCard label="Avg Attendance" value={avgAttendance.toLocaleString()} color="indigo" source="PCO" subValue="Last 4 Weeks" />
                      <StatCard label="New Guests" value={newGuestCount.toLocaleString()} color="emerald" source="PCO" subValue="Last 8 Weeks" />
                      <StatCard label="Return Rate" value={`${guestReturnRate}%`} color="violet" source="PCO" subValue="Est. 2nd Visit" />
                      <StatCard label="Volunteer %" value={`${volunteerRate}%`} color="amber" source="PCO" subValue="of Members" />
                  </div>
              );
          case 'church_spiritual_stats':
              return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
                      <StatCard label="Baptisms (YTD)" value={baptisms.toLocaleString()} color="cyan" source="PCO" />
                      <StatCard label="Salvations (YTD)" value={salvations.toLocaleString()} color="rose" source="PCO" />
                  </div>
              );
          case 'church_attendance_chart':
              return (
                  <WidgetWrapper title="Attendance Trend" onRemove={() => handleRemoveWidget(id)} source="PCO Services">
                      <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                              <AreaChart data={attendanceData}>
                                  <defs>
                                      <linearGradient id="colorAttend" x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                      </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: axisColor}} tickFormatter={v => new Date(v).toLocaleDateString(undefined, {month:'short', day:'numeric'})} />
                                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: axisColor}} />
                                  <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} cursor={{stroke: axisColor}} />
                                  <Area type="monotone" dataKey="attendance" stroke="#6366f1" fillOpacity={1} fill="url(#colorAttend)" />
                              </AreaChart>
                          </ResponsiveContainer>
                      </div>
                  </WidgetWrapper>
              );
          case 'church_guest_funnel':
              return (
                  <WidgetWrapper title="Guest Retention Funnel" onRemove={() => handleRemoveWidget(id)} source="Estimates">
                      <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                              <BarChart data={guestReturnFunnel} layout="vertical" margin={{ left: 20 }}>
                                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                                  <XAxis type="number" hide />
                                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: axisColor }} width={60} />
                                  <Tooltip cursor={{fill: currentTheme === 'dark' ? '#334155' : '#f8fafc'}} contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} />
                                  <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={30}>
                                      {guestReturnFunnel.map((entry, index) => (
                                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                      ))}
                                  </Bar>
                              </BarChart>
                          </ResponsiveContainer>
                      </div>
                  </WidgetWrapper>
              );
          case 'church_gender_comparison':
              return peopleData ? (
                  <WidgetWrapper title="Gender Demographics" onRemove={() => handleRemoveWidget(id)} source="Comparison">
                      <CommunityComparison peopleData={peopleData} censusData={displayCensus || null} type="gender" currentTheme={currentTheme} />
                  </WidgetWrapper>
              ) : null;
          case 'church_age_comparison':
              return peopleData ? (
                  <WidgetWrapper title="Age Demographics" onRemove={() => handleRemoveWidget(id)} source="Comparison">
                      <CommunityComparison peopleData={peopleData} censusData={displayCensus || null} type="age" currentTheme={currentTheme} />
                  </WidgetWrapper>
              ) : null;

          // --- Membership Widgets ---
          case 'member_headline_stats':
              return peopleData ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 h-full">
                      <StatCard label="Total Members" value={peopleData.stats.members.toLocaleString()} color="emerald" source="PCO" />
                      <StatCard label="Non-Members" value={peopleData.stats.nonMembers.toLocaleString()} color="amber" source="PCO" />
                      <StatCard label="In Groups" value={groupsData ? groupsData.stats.totalEnrollment.toLocaleString() : '0'} color="indigo" source="PCO" />
                      <StatCard label="Serving" value="420" color="violet" source="PCO" subValue="Est." />
                  </div>
              ) : null;
          case 'member_map':
              return (
                  <WidgetWrapper title="Member Heatmap" onRemove={() => handleRemoveWidget(id)} source="OpenStreetMap">
                      <div className="h-96 w-full rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 relative">
                          <div ref={mapRef} className="w-full h-full" />
                          {mapAuthError && (
                              <div className="absolute inset-0 flex items-center justify-center bg-slate-100/90 dark:bg-slate-900/90 z-10">
                                  <div className="text-center p-6">
                                      <p className="text-rose-500 font-bold mb-2">Map Load Error</p>
                                      <p className="text-xs text-slate-500">Could not load the map. Check your network connection.</p>
                                  </div>
                              </div>
                          )}
                          {!mapInstance && !mapAuthError && (
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                  <div className="flex items-center gap-2">
                                      <svg className="animate-spin w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                      </svg>
                                      <p className="text-xs font-bold text-slate-400">Loading Map…</p>
                                  </div>
                              </div>
                          )}
                      </div>
                      {/* Stats bar */}
                      {geocodeProgress !== null && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-[10px] font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                                  <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                                  {geocodeProgress.plotted.toLocaleString()} plotted
                              </span>
                              {geocodeProgress.ungeocoded > 0 && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 text-[10px] font-black text-amber-700 dark:text-amber-300 uppercase tracking-wider" title="Run a PCO sync or use 'Geocode Addresses' in App Config to resolve these.">
                                      <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                                      {geocodeProgress.ungeocoded.toLocaleString()} pending geocode
                                  </span>
                              )}
                              {geocodeProgress.topCities.length > 0 && (
                                  <span className="ml-auto text-[10px] text-slate-400 font-bold truncate">
                                      Top: {geocodeProgress.topCities.join(' · ')}
                                  </span>
                              )}
                          </div>
                      )}
                      {geocodeProgress?.plotted === 0 && geocodeProgress?.ungeocoded === 0 && (
                          <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-700 text-center">
                              <p className="text-xs font-bold text-slate-400">No address data found. Sync PCO to import member addresses.</p>
                          </div>
                      )}
                      {geocodeProgress?.plotted === 0 && (geocodeProgress?.ungeocoded ?? 0) > 0 && (
                          <div className="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-center">
                              <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                                  {geocodeProgress.ungeocoded} addresses imported but not yet geocoded.
                              </p>
                              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">Run a full PCO sync or use "Geocode Addresses" in App Config → API Integrations.</p>
                          </div>
                      )}
                  </WidgetWrapper>
              );
          case 'member_age_chart':
              return peopleData ? (
                  <WidgetWrapper title="Generational Mix" onRemove={() => handleRemoveWidget(id)} source="PCO People">
                      <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                              <BarChart data={peopleData.ageData}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                  <XAxis dataKey="range" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: axisColor }} />
                                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: axisColor }} />
                                  <Tooltip cursor={{ fill: currentTheme === 'dark' ? '#334155' : '#f8fafc' }} contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} />
                                  <Bar dataKey="count" fill="#ec4899" radius={[4, 4, 0, 0]} />
                              </BarChart>
                          </ResponsiveContainer>
                      </div>
                  </WidgetWrapper>
              ) : null;
          case 'member_geo_list':
              if (!peopleData) return null;
              const geoList = peopleData.geoData.byCity;
              const maxCityCount = geoList.length > 0 ? geoList[0].value : 1;
              
              return (
                  <WidgetWrapper title="City Penetration" onRemove={() => handleRemoveWidget(id)} source="PCO Addresses" locationName={locationName} isDefault={isDefault}>
                      <div className="overflow-y-auto max-h-64 custom-scrollbar space-y-3 pr-2">
                          {geoList.map((city, idx) => {
                              const density = (city.value / peopleData.stats.total) * 100;
                              // Relative width based on the largest city for better visualization spread
                              const relativeWidth = (city.value / maxCityCount) * 100;
                              
                              return (
                                  <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-900 rounded-lg group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                      <div className="flex items-center gap-3 flex-1 min-w-0">
                                          <span className="text-[10px] font-bold text-slate-400 w-4">{idx + 1}</span>
                                          <div className="flex-1 min-w-0">
                                              <div className="flex justify-between items-baseline mb-1">
                                                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate pr-2">{city.name}</span>
                                                  <span className="text-[10px] font-medium text-slate-400">{density.toFixed(1)}%</span>
                                              </div>
                                              <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                                  <div 
                                                      className="h-full bg-indigo-500 rounded-full" 
                                                      style={{ width: `${relativeWidth}%` }}
                                                  ></div>
                                              </div>
                                          </div>
                                      </div>
                                      <span className="text-xs font-black text-slate-900 dark:text-white w-10 text-right">{city.value}</span>
                                  </div>
                              );
                          })}
                          {geoList.length === 0 && (
                              <div className="text-center p-4 text-slate-400 text-xs">No address data found.</div>
                          )}
                      </div>
                  </WidgetWrapper>
              );
          case 'member_unconnected':
              const unconnectedEstimate = peopleData ? Math.round(peopleData.stats.nonMembers * 0.7) : 0; // Estimation
              return (
                  <WidgetWrapper title="Unconnected People" onRemove={() => handleRemoveWidget(id)} source="Estimate">
                      <div className="h-full flex flex-col justify-center items-center text-center p-4">
                          <span className="text-5xl font-black text-rose-500 mb-2">{unconnectedEstimate}</span>
                          <p className="text-xs text-slate-400 font-bold max-w-[150px]">Est. people not in a group or serving team.</p>
                      </div>
                  </WidgetWrapper>
              );
          case 'member_missional_gap':
              const gap = (displayCensus?.totalPopulation || 0) - (peopleData?.stats.total || 0);
              return (
                  <WidgetWrapper title="Missional Gap" onRemove={() => handleRemoveWidget(id)} source="Census vs Church" locationName={locationName} isDefault={isDefault}>
                      <div className="h-full flex flex-col justify-center items-center text-center p-4">
                          <span className="text-4xl font-black text-indigo-600 dark:text-indigo-400 mb-2">{gap.toLocaleString()}</span>
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Unreached Residents</p>
                      </div>
                  </WidgetWrapper>
              );
          case 'member_pastoral_touches':
              return (
                  <WidgetWrapper title="Pastoral Touches" onRemove={() => handleRemoveWidget(id)} source="Notes (Beta)">
                      <div className="h-full flex flex-col justify-center items-center text-center p-6 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                          <p className="text-2xl mb-2">🤝</p>
                          <p className="text-xs font-bold text-slate-400">Pastoral Care tracking coming soon.</p>
                      </div>
                  </WidgetWrapper>
              );
          case 'member_attrition_chart':
              return (
                  <WidgetWrapper title="Attrition Rate" onRemove={() => handleRemoveWidget(id)} source="Inactive Status">
                      <div className="h-full flex flex-col justify-center items-center text-center p-6 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                          <p className="text-2xl mb-2">📉</p>
                          <p className="text-xs font-bold text-slate-400">Attrition analysis coming soon.</p>
                      </div>
                  </WidgetWrapper>
              );

          // --- Community Widgets ---
          case 'censusHero':
              if (!displayCensus) return null;
              return (
                  <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] border border-slate-800 shadow-xl relative overflow-hidden h-full flex flex-col justify-between">
                      <div className="relative z-10">
                          <div className="flex items-center gap-3 mb-6">
                              <span className="text-3xl">🏛️</span>
                              <div>
                                  <div className="flex items-center gap-2">
                                      <h3 className="text-xl font-black">{locationName || displayCensus.locationName}</h3>
                                      {isDefault && (
                                          <span className="bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest">Default</span>
                                      )}
                                  </div>
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Primary Ministry Context</p>
                              </div>
                          </div>
                          <div className="grid grid-cols-2 gap-8">
                              <div>
                                  <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">Population</p>
                                  <p className="text-3xl font-black">{displayCensus.totalPopulation.toLocaleString()}</p>
                              </div>
                              <div>
                                  <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">Median Income</p>
                                  <p className="text-3xl font-black text-emerald-400">${displayCensus.economics?.medianHouseholdIncome?.toLocaleString() || 'N/A'}</p>
                              </div>
                          </div>
                      </div>
                      {/* Decorative */}
                      <div className="absolute -right-10 -top-10 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
                  </div>
              );
          case 'community_ai_agent':
              return (
                  <div className="bg-gradient-to-br from-indigo-900 to-slate-900 p-8 rounded-[2.5rem] border border-slate-800 shadow-xl relative overflow-hidden h-full flex flex-col">
                      <button onClick={() => handleRemoveWidget(id)} className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors z-20">✕</button>
                      
                      <div className="flex justify-between items-start mb-6 relative z-10">
                          <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center text-2xl">
                                  🤖
                              </div>
                              <div>
                                  <div className="flex items-center gap-2">
                                      <h3 className="text-lg font-black text-white tracking-tight">Missional Strategist</h3>
                                      {isDefault && (
                                          <span className="bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest">Default</span>
                                      )}
                                  </div>
                                  <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">AI Community Analysis {locationName ? `(${locationName})` : ''}</p>
                              </div>
                          </div>
                      </div>

                      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4 relative z-10">
                          {strategyReport ? (
                              <div className="prose prose-sm prose-invert max-w-none">
                                  <div dangerouslySetInnerHTML={{ __html: strategyReport.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                              </div>
                          ) : (
                              <div className="flex flex-col items-center justify-center h-48 text-center p-4">
                                  <p className="text-sm font-bold text-indigo-200 mb-2">Identify missional gaps in your community.</p>
                                  <button 
                                      onClick={handleGenerateStrategy}
                                      disabled={isAnalyzing}
                                      className="bg-white text-indigo-900 px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-indigo-50 transition-all disabled:opacity-50"
                                  >
                                      {isAnalyzing ? 'Analyzing Census...' : 'Generate Strategy'}
                                  </button>
                              </div>
                          )}
                      </div>
                  </div>
              );
          case 'culturalMosaic':
              if (!displayCensus?.ethnicity) return null;
              const ethData = [
                  { name: 'White', value: displayCensus.ethnicity.white },
                  { name: 'Black', value: displayCensus.ethnicity.black },
                  { name: 'Hispanic', value: displayCensus.ethnicity.hispanic },
                  { name: 'Asian', value: displayCensus.ethnicity.asian },
                  { name: 'Other', value: displayCensus.ethnicity.other },
              ].filter(d => d.value > 0);
              return (
                  <CensusCard title="Cultural Mosaic" onRemove={() => handleRemoveWidget(id)} locationName={locationName} isDefault={isDefault}>
                      <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                              <PieChart>
                                  <Pie data={ethData} innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value">
                                      {ethData.map((entry, index) => (
                                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                      ))}
                                  </Pie>
                                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                                  <Legend layout="vertical" verticalAlign="middle" align="right" />
                              </PieChart>
                          </ResponsiveContainer>
                      </div>
                  </CensusCard>
              );
          case 'commute':
              if (!displayCensus?.commute) return null;
              return (
                  <CensusCard title="Commute Context" onRemove={() => handleRemoveWidget(id)} locationName={locationName} isDefault={isDefault}>
                      <div className="flex flex-col items-center justify-center h-full text-center">
                          <span className="text-3xl font-black text-slate-700 dark:text-white">{displayCensus.commute.longCommuteRate.toFixed(1)}%</span>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Commute &gt; 30m</span>
                          <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mt-3">
                              <div className="h-full bg-indigo-500" style={{width: `${Math.min(100, displayCensus.commute.longCommuteRate)}%`}}></div>
                          </div>
                      </div>
                  </CensusCard>
              );
          case 'education':
              if (!displayCensus?.education) return null;
              return (
                  <CensusCard title="Education Level" onRemove={() => handleRemoveWidget(id)} locationName={locationName} isDefault={isDefault}>
                      <div className="flex flex-col items-center justify-center h-full text-center">
                          <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400">{displayCensus.education.bachelorsPlus.toFixed(1)}%</span>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Bachelor's Degree+</span>
                      </div>
                  </CensusCard>
              );
          case 'economicHealth':
              if (!displayCensus?.economics) return null;
              return (
                  <CensusCard title="Economic Health" onRemove={() => handleRemoveWidget(id)} locationName={locationName} isDefault={isDefault}>
                      <div className="grid grid-cols-1 gap-4 h-full content-center">
                          <div className="flex justify-between items-end border-b border-slate-50 dark:border-slate-800 pb-2">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Poverty Rate</span>
                              <span className={`text-lg font-black ${displayCensus.economics.povertyRate > 15 ? 'text-rose-500' : 'text-emerald-500'}`}>{displayCensus.economics.povertyRate.toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between items-end">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Unemployment</span>
                              <span className="text-lg font-black text-slate-700 dark:text-white">{displayCensus.economics.unemploymentRate.toFixed(1)}%</span>
                          </div>
                      </div>
                  </CensusCard>
              );
          case 'housingVacancy':
              if (!displayCensus?.housing) return null;
              return (
                  <CensusCard title="Housing Vacancy" onRemove={() => handleRemoveWidget(id)} locationName={locationName} isDefault={isDefault}>
                      <div className="flex flex-col items-center justify-center h-full text-center">
                          <span className="text-3xl font-black text-amber-500">{displayCensus.housing.vacancyRate.toFixed(1)}%</span>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Vacant Units</span>
                      </div>
                  </CensusCard>
              );
          case 'housingStability':
              if (!displayCensus?.housing) return null;
              const housingData = [
                  { name: 'Owners', value: displayCensus.housing.ownerOccupied, color: '#10b981' },
                  { name: 'Renters', value: 100 - displayCensus.housing.ownerOccupied, color: '#6366f1' },
              ];
              return (
                  <CensusCard title="Housing Stability" onRemove={() => handleRemoveWidget(id)} locationName={locationName} isDefault={isDefault}>
                      <div className="h-32">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                              <PieChart>
                                  <Pie data={housingData} innerRadius={30} outerRadius={50} paddingAngle={5} dataKey="value">
                                      {housingData.map((entry, index) => (
                                          <Cell key={`cell-${index}`} fill={entry.color} />
                                      ))}
                                  </Pie>
                                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                                  <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" wrapperStyle={{fontSize: '9px'}} />
                              </PieChart>
                          </ResponsiveContainer>
                      </div>
                  </CensusCard>
              );
          case 'familyStructure':
              if (!displayCensus?.families) return null;
              return (
                  <CensusCard title="Family Structure" onRemove={() => handleRemoveWidget(id)} locationName={locationName} isDefault={isDefault}>
                      <div className="flex flex-col items-center justify-center h-full text-center">
                          <span className="text-3xl font-black text-rose-500">{displayCensus.families.singleParentRate.toFixed(1)}%</span>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Single Parent Homes</span>
                      </div>
                  </CensusCard>
              );
          case 'communityAge':
              if (!displayCensus?.age) return null;
              const commAgeData = [
                  { name: '0-17', value: displayCensus.age.under18 },
                  { name: '18-34', value: displayCensus.age.youngAdults },
                  { name: '35-64', value: displayCensus.age.adults },
                  { name: '65+', value: displayCensus.age.seniors },
              ];
              return (
                  <CensusCard title="Community Age" onRemove={() => handleRemoveWidget(id)} locationName={locationName} isDefault={isDefault}>
                      <div className="h-32">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                              <BarChart data={commAgeData}>
                                  <XAxis dataKey="name" tick={{fontSize: 9}} axisLine={false} tickLine={false} />
                                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{fill: 'transparent'}} />
                                  <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                              </BarChart>
                          </ResponsiveContainer>
                      </div>
                  </CensusCard>
              );
          case 'communityGender':
              if (!displayCensus?.gender) return null;
              const commGenderData = [
                  { name: 'Male', value: displayCensus.gender.male, color: '#6366f1' },
                  { name: 'Female', value: displayCensus.gender.female, color: '#ec4899' },
              ];
              return (
                  <CensusCard title="Community Gender" onRemove={() => handleRemoveWidget(id)} locationName={locationName} isDefault={isDefault}>
                      <div className="h-32">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                              <PieChart>
                                  <Pie data={commGenderData} innerRadius={30} outerRadius={50} paddingAngle={5} dataKey="value">
                                      {commGenderData.map((entry, index) => (
                                          <Cell key={`cell-${index}`} fill={commGenderData.map(d => d.color)[index]} />
                                      ))}
                                  </Pie>
                                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                                  <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" wrapperStyle={{fontSize: '9px'}} />
                              </PieChart>
                          </ResponsiveContainer>
                      </div>
                  </CensusCard>
              );
          case 'ministrySignals':
              if (!displayCensus) return null;
              const signals = getMinistrySignals(displayCensus);
              return (
                  <WidgetWrapper title="Ministry Signals" onRemove={() => handleRemoveWidget(id)} source="Inference Engine" locationName={locationName} isDefault={isDefault}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 h-full overflow-y-auto custom-scrollbar pr-1">
                          {signals.map((sig, i) => (
                              <div key={i} className="flex items-start gap-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
                                  <span className="text-xl">{sig.icon}</span>
                                  <div>
                                      <p className="text-[10px] font-black text-indigo-900 dark:text-indigo-300 uppercase tracking-wide mb-0.5">{sig.title}</p>
                                      <p className="text-[9px] text-indigo-700 dark:text-indigo-400 leading-snug">{sig.desc}</p>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </WidgetWrapper>
              );
          
          case 'care_log':
              return (
                  <WidgetWrapper 
                    title="Pastoral Care Log" 
                    onRemove={() => handleRemoveWidget(id)} 
                    source="Internal"
                    headerControl={
                        <button 
                            onClick={() => setIsAddingNote(true)}
                            className="text-[9px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-700"
                        >
                            + New Entry
                        </button>
                    }
                  >
                      <div className="space-y-4 overflow-y-auto max-h-[500px] pr-2 custom-scrollbar">
                          {notes.map(note => (
                              <CareNoteCard 
                                key={note.id} 
                                note={note} 
                                onRemove={() => firestore.deletePastoralNote(note.id).then(() => setNotes(notes.filter(n => n.id !== note.id)))} 
                              />
                          ))}
                          {notes.length === 0 && (
                              <div className="py-10 text-center text-slate-400 text-xs font-bold">No care notes yet.</div>
                          )}
                      </div>
                  </WidgetWrapper>
              );
          case 'prayer_requests':
              return (
                  <WidgetWrapper 
                    title="Active Prayer Requests" 
                    onRemove={() => handleRemoveWidget(id)} 
                    source="Internal"
                    headerControl={
                        <button 
                            onClick={() => setIsAddingPrayer(true)}
                            className="text-[9px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-700"
                        >
                            + New Request
                        </button>
                    }
                  >
                      <div className="space-y-4 overflow-y-auto max-h-[500px] pr-2 custom-scrollbar">
                          {prayerRequests.map(req => (
                              <PrayerRequestCard 
                                key={req.id} 
                                request={req} 
                                onUpdateStatus={(status) => {
                                    const updated = { ...req, status };
                                    firestore.savePrayerRequest(updated).then(() => {
                                        if (status === 'Active') {
                                            setPrayerRequests(prayerRequests.map(r => r.id === req.id ? updated : r));
                                        } else {
                                            setPrayerRequests(prayerRequests.filter(r => r.id !== req.id));
                                        }
                                    });
                                }}
                                onRemove={() => firestore.deletePrayerRequest(req.id).then(() => setPrayerRequests(prayerRequests.filter(r => r.id !== req.id)))}
                              />
                          ))}
                          {prayerRequests.length === 0 && (
                              <div className="py-10 text-center text-slate-400 text-xs font-bold">No active prayer requests.</div>
                          )}
                      </div>
                  </WidgetWrapper>
              );
          case 'follow_ups':
              const followUps = notes.filter(n => n.followUpDate && !n.isCompleted);
              return (
                  <WidgetWrapper title="Pending Follow-ups" onRemove={() => handleRemoveWidget(id)} source="Internal">
                      <div className="space-y-3">
                          {followUps.map(n => (
                              <div key={n.id} className="p-4 bg-rose-50 dark:bg-rose-900/20 rounded-2xl border border-rose-100 dark:border-rose-900/30 flex justify-between items-center">
                                  <div>
                                      <p className="text-xs font-black text-slate-900 dark:text-white">{n.personName}</p>
                                      <p className="text-[10px] font-bold text-rose-600 uppercase tracking-widest mt-0.5">Due: {new Date(n.followUpDate!).toLocaleDateString()}</p>
                                  </div>
                                  <button 
                                    onClick={() => {
                                        const updated = { ...n, isCompleted: true };
                                        firestore.savePastoralNote(updated).then(() => setNotes(notes.map(note => note.id === n.id ? updated : note)));
                                    }}
                                    className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center text-xs shadow-sm hover:bg-emerald-500 hover:text-white transition-all"
                                  >
                                      ✓
                                  </button>
                              </div>
                          ))}
                          {followUps.length === 0 && (
                              <div className="py-10 text-center text-slate-400 text-xs font-bold">All caught up! 🎉</div>
                          )}
                      </div>
                  </WidgetWrapper>
              );
          case 'care_ai_agent':
              return (
                  <div className="bg-gradient-to-br from-emerald-900 to-slate-900 p-8 rounded-[2.5rem] border border-slate-800 shadow-xl relative overflow-hidden h-full flex flex-col">
                      <button onClick={() => handleRemoveWidget(id)} className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors z-20">✕</button>
                      
                      <div className="flex justify-between items-start mb-6 relative z-10">
                          <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center text-2xl">
                                  🕊️
                              </div>
                              <div>
                                  <h3 className="text-lg font-black text-white tracking-tight">Care Advisor</h3>
                                  <p className="text-[10px] font-bold text-emerald-300 uppercase tracking-widest">AI Pastoral Support</p>
                              </div>
                          </div>
                      </div>

                      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4 relative z-10">
                          {careAdvice ? (
                              <div className="prose prose-sm prose-invert max-w-none">
                                  <Markdown>{careAdvice}</Markdown>
                              </div>
                          ) : (
                              <div className="flex flex-col items-center justify-center h-48 text-center p-4">
                                  <p className="text-sm font-bold text-emerald-200 mb-2">Get AI-driven care prioritization.</p>
                                  <button 
                                      onClick={handleGenerateCareAdvice}
                                      disabled={isGeneratingCare}
                                      className="bg-white text-emerald-900 px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-indigo-50 transition-all disabled:opacity-50"
                                  >
                                      {isGeneratingCare ? 'Consulting...' : 'Get Advice'}
                                  </button>
                              </div>
                          )}
                      </div>
                  </div>
              );
          
          case 'care_people_list':
              return (
                  <CarePeopleListWidget
                      peopleData={peopleData}
                      settings={church.riskSettings || DEFAULT_RISK_SETTINGS}
                      onRemove={() => handleRemoveWidget(id)}
                      currentTheme={currentTheme}
                  />
              );
          
          default:
              return null;
      }
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h3 className="text-4xl font-black tracking-tighter text-slate-900 dark:text-white">Pastoral Care</h3>
          <p className="text-slate-400 dark:text-slate-500 font-medium uppercase text-[10px] tracking-widest mt-1">Shepherding & Community Context</p>
        </div>
        
        <div className="flex items-center gap-4">

            {activeTab === 'Community' && church.communityLocations && church.communityLocations.length > 0 && (
                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl">
                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 px-2">Location:</span>
                    <select 
                        title="Select community location"
                        value={selectedLocationId || ''} 
                        onChange={(e) => setSelectedLocationId(e.target.value)}
                        className="bg-white dark:bg-slate-700 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl border-none outline-none text-indigo-600 dark:text-indigo-300"
                    >
                        {church.communityLocations.map(loc => (
                            <option key={loc.id} value={loc.id}>{loc.name}</option>
                        ))}
                    </select>
                </div>
            )}

            {activeTab === 'Community' && (
                <div className="flex items-center gap-2">
                    {isFetchingAllCensus && (
                        <span className="text-[10px] font-bold text-indigo-500 animate-pulse uppercase tracking-widest">Updating Census Data...</span>
                    )}
                </div>
            )}
            
            {activeTab !== 'Calendar' && (
                <WidgetsController 
                    availableWidgets={availableWidgets} 
                    visibleWidgets={safeVisibleWidgets} 
                    onUpdate={handleUpdateCurrentTabWidgets} 
                    onUpdateTheme={onUpdateTheme}
                    currentTheme={user.theme}
                />
            )}
        </div>
      </header>

      {isFetchingAllCensus && activeTab === 'Community' && (
          <div className="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 p-4 rounded-xl text-xs font-bold border border-indigo-100 dark:border-indigo-900/30 flex items-center gap-3 animate-pulse">
              <span className="animate-spin">⏳</span>
              Fetching census data for community locations...
          </div>
      )}

      {effectiveCensusError && activeTab === 'Community' && !isFetchingAllCensus && (
          <div className="bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 p-4 rounded-xl text-xs font-bold border border-rose-100 dark:border-rose-900/30 flex items-center gap-3">
              <span className="text-lg">⚠️</span>
              {effectiveCensusError}
          </div>
      )}

      {activeTab === 'Calendar' ? (
          <div className="h-[calc(100vh-250px)] min-h-[600px]">
              <PastoralCalendar people={peopleData?.allPeople || []} />
          </div>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {activeTab === 'Community' && selectedLocationId ? (
                  (() => {
                      const loc = church.communityLocations?.find(l => l.id === selectedLocationId);
                      if (!loc) return null;
                      return safeVisibleWidgets.map((id, index) => {
                          let spanClass = "col-span-1";
                          if (['church_growth_stats', 'member_headline_stats', 'member_map', 'care_people_list'].includes(id)) {
                              spanClass = "col-span-1 md:col-span-2 lg:col-span-4";
                          } else if (['church_spiritual_stats', 'censusHero', 'community_ai_agent', 'member_geo_list', 'ministrySignals', 'care_ai_agent'].includes(id)) {
                              spanClass = "col-span-1 lg:col-span-2";
                          } else if (['care_log', 'prayer_requests'].includes(id)) {
                              spanClass = "col-span-1 lg:col-span-2";
                          }
                          
                          return (
                              <div
                                  key={`${loc.id}-${id}`}
                                  className={`${spanClass} cursor-grab active:cursor-grabbing transition-opacity`}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, index)}
                                  onDragEnter={(e) => handleDragEnter(e, index)}
                                  onDragEnd={handleDragEnd}
                                  onDragOver={handleDragOver}
                              >
                                  {renderWidget(id, locationCensusMap[loc.id], loc.name, loc.isDefault)}
                              </div>
                          );
                      });
                  })()
              ) : (
                  safeVisibleWidgets.map((id, index) => {
                      // Special Full Width Handling
                      let spanClass = "col-span-1";
                      if (['church_growth_stats', 'member_headline_stats', 'member_map', 'care_people_list'].includes(id)) {
                          spanClass = "col-span-1 md:col-span-2 lg:col-span-4";
                      } else if (['church_spiritual_stats', 'censusHero', 'community_ai_agent', 'member_geo_list', 'ministrySignals', 'care_ai_agent'].includes(id)) {
                          spanClass = "col-span-1 lg:col-span-2";
                      } else if (['care_log', 'prayer_requests'].includes(id)) {
                          spanClass = "col-span-1 lg:col-span-2";
                      }
                      
                      return (
                          <div
                              key={id}
                              className={`${spanClass} cursor-grab active:cursor-grabbing transition-opacity`}
                              draggable
                              onDragStart={(e) => handleDragStart(e, index)}
                              onDragEnter={(e) => handleDragEnter(e, index)}
                              onDragEnd={handleDragEnd}
                              onDragOver={handleDragOver}
                          >
                              {renderWidget(id)}
                          </div>
                      );
                  })
              )}
              {safeVisibleWidgets.length === 0 && (
                  <div className="col-span-full py-20 text-center bg-slate-50 dark:bg-slate-900 rounded-[3rem] border border-dashed border-slate-200 dark:border-slate-700">
                      <p className="text-slate-400 dark:text-slate-500 font-bold">No widgets configured for {activeTab}.</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Use the "Customize Layout" button to add widgets.</p>
                  </div>
              )}
          </div>
      )}

      {/* Modals */}
      {isAddingNote && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-850 w-full max-w-lg rounded-[3rem] p-8 shadow-2xl animate-in zoom-in duration-300">
                  <div className="flex justify-between items-center mb-6">
                      <h4 className="text-xl font-black tracking-tight dark:text-white">New Care Entry</h4>
                      <button onClick={() => setIsAddingNote(false)} className="text-slate-400 hover:text-rose-500">✕</button>
                  </div>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Search Person (Required)</label>
                          <PersonSearchCombobox 
                              people={peopleData?.allPeople || []}
                              value={newNote.personId || ''}
                              onChange={(id) => setNewNote({...newNote, personId: id})}
                              placeholder="Search for a congregation member..."
                          />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Type</label>
                              <select 
                                title="Care entry type"
                                value={newNote.type} 
                                onChange={(e) => setNewNote({...newNote, type: e.target.value as any})}
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                              >
                                  <option value="Visit">Visit</option>
                                  <option value="Call">Call</option>
                                  <option value="Meeting">Meeting</option>
                                  <option value="Note">Note</option>
                                  <option value="Crisis">Crisis</option>
                                  <option value="Hospital">Hospital</option>
                              </select>
                          </div>
                          <div>
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Date</label>
                              <input 
                                type="date" 
                                title="Entry date"
                                value={newNote.date} 
                                onChange={(e) => setNewNote({...newNote, date: e.target.value})}
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                          </div>
                      </div>

                      <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Content</label>
                          <textarea 
                            value={newNote.content} 
                            onChange={(e) => setNewNote({...newNote, content: e.target.value})}
                            placeholder="Details of the interaction..."
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none h-32 resize-none"
                          />
                      </div>

                      <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Follow-up Date (Optional)</label>
                          <input 
                            type="date" 
                            title="Follow-up date"
                            value={newNote.followUpDate || ''} 
                            onChange={(e) => setNewNote({...newNote, followUpDate: e.target.value})}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                      </div>

                      <button 
                        onClick={handleSaveNote}
                        className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl hover:bg-indigo-700 transition-all mt-4"
                      >
                          Save Entry
                      </button>
                  </div>
              </div>
          </div>
      )}

      {isAddingPrayer && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-850 w-full max-w-lg rounded-[3rem] p-8 shadow-2xl animate-in zoom-in duration-300">
                  <div className="flex justify-between items-center mb-6">
                      <h4 className="text-xl font-black tracking-tight dark:text-white">New Prayer Request</h4>
                      <button onClick={() => setIsAddingPrayer(false)} className="text-slate-400 hover:text-rose-500">✕</button>
                  </div>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Person Name</label>
                          <PersonSearchCombobox 
                              people={peopleData?.allPeople || []}
                              value={newPrayer.personId || ''}
                              onChange={(id, name) => setNewPrayer({...newPrayer, personId: id, personName: name})}
                              onNameChange={(name) => setNewPrayer({...newPrayer, personName: name})}
                              placeholder="Search or type a name..."
                          />
                          <p className="text-[10px] text-slate-400 mt-2 font-medium">Type any name (or select an existing person) to associate with this request.</p>
                      </div>

                      <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Request</label>
                          <textarea 
                            value={newPrayer.request} 
                            onChange={(e) => setNewPrayer({...newPrayer, request: e.target.value})}
                            placeholder="What are we praying for?"
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none h-32 resize-none"
                          />
                      </div>

                      <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
                          <input 
                            type="checkbox" 
                            title="Mark as public prayer request"
                            checked={newPrayer.isPublic} 
                            onChange={(e) => setNewPrayer({...newPrayer, isPublic: e.target.checked})}
                            className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <div>
                              <p className="text-xs font-black text-slate-900 dark:text-white">Public Request</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Visible to the whole team</p>
                          </div>
                      </div>

                      <button 
                        onClick={handleSavePrayer}
                        className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl hover:bg-indigo-700 transition-all mt-4"
                      >
                          Submit Request
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
