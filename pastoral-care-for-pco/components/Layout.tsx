
import React, { useState, useRef } from 'react';
import { Church, User } from '../types';
import UserProfileModal from './UserProfileModal';
import { AppLogo } from './AppLogo';

const LIBRARY_OWNER_EMAIL = 'matthewhon01@gmail.com';

interface LayoutProps {
  children: React.ReactNode;
  church: Church;
  allChurches?: Church[];
  onSwitchChurch?: (id: string) => void;
  user: User;
  onLogout: () => void;
  currentView: string;
  onNavigate: (view: any) => void;
  hasPermission: (view: any) => boolean;
  onRefreshUser?: () => void;
  isSyncing?: boolean;
  enableLibrary?: boolean;
  metricsSubViews?: { label: string; view: string; icon: string }[];
  /** Secondary nav strip rendered below the context header (e.g. SMS sub-tabs) */
  subNavItems?: { label: string; view: string; icon: React.ReactNode }[];
  /** Remove the content padding wrapper so full-height panels can fill the space */
  noPadding?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ 
  children, 
  church, 
  allChurches, 
  onSwitchChurch, 
  user, 
  onLogout, 
  currentView, 
  onNavigate, 
  hasPermission,
  onRefreshUser,
  isSyncing,
  enableLibrary,
  subNavItems,
  noPadding,
}) => {
  const canSeeLibrary = user.email === LIBRARY_OWNER_EMAIL || enableLibrary === true;
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const metricsRef = useRef<HTMLDivElement>(null);
  const [careOpen, setCareOpen] = useState(false);
  const careRef = useRef<HTMLDivElement>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const peopleRef = useRef<HTMLDivElement>(null);
  const [servicesOpen, setServicesOpen] = useState(false);
  const servicesRef = useRef<HTMLDivElement>(null);
  const [givingOpen, setGivingOpen] = useState(false);
  const givingRef = useRef<HTMLDivElement>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);

  const getDropdownStyle = (ref: React.RefObject<HTMLDivElement>) => {
    if (!ref.current) return {};
    const rect = ref.current.getBoundingClientRect();
    return { top: rect.bottom + 8, left: rect.left };
  };

  if (!user) return null;

  const isSystemAdmin = user.roles.includes('System Administration');

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      
      {/* Top Navigation Bar */}
      <header className="bg-slate-900 dark:bg-black text-white shadow-xl z-50 flex-none print:hidden">
        <div className="flex items-center justify-between px-4 lg:px-6 py-3 gap-4">
            
            {/* Logo & Title */}
            <div 
                className="flex items-center gap-3 cursor-pointer shrink-0 hover:opacity-90 transition-opacity" 
                onClick={() => onNavigate('dashboard')}
            >
                <AppLogo size={36} />
                <div className="hidden lg:block leading-tight">
                    <h1 className="font-black text-sm tracking-tight text-white">Pastoral Care</h1>
                    <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest">for PCO</p>
                </div>
            </div>

            {/* Main Navigation - Horizontal Scrollable */}
            <nav className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar mask-linear-fade px-2">
                
                {hasPermission('dashboard') && (
                  <NavItem 
                    icon="📊" 
                    label="Dashboard" 
                    active={currentView === 'dashboard'} 
                    onClick={() => onNavigate('dashboard')} 
                  />
                )}

                {isSystemAdmin && (
                  <NavItem 
                    icon="🌍" 
                    label="Global" 
                    active={currentView === 'global-admin'} 
                    onClick={() => onNavigate('global-admin')} 
                    highlight="amber"
                  />
                )}

                {hasPermission('people') && (
                  <div
                    ref={peopleRef}
                    className="relative shrink-0"
                    onMouseEnter={() => setPeopleOpen(true)}
                    onMouseLeave={() => setPeopleOpen(false)}
                  >
                    <button
                      onClick={() => onNavigate('people')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all border ${
                        currentView.startsWith('people')
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-1 ring-indigo-500 border-transparent'
                          : 'text-slate-400 border-transparent hover:bg-slate-800 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      <span className="text-base">👥</span>
                      <span className="text-[10px] font-black uppercase tracking-widest">People</span>
                      <svg className="w-3 h-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6"/></svg>
                    </button>
                  </div>
                )}



                {hasPermission('groups') && (
                  <NavItem 
                    icon="📂" 
                    label="Groups" 
                    active={currentView === 'groups'} 
                    onClick={() => onNavigate('groups')} 
                  />
                )}

                {hasPermission('services') && (
                  <div
                    ref={servicesRef}
                    className="relative shrink-0"
                    onMouseEnter={() => setServicesOpen(true)}
                    onMouseLeave={() => setServicesOpen(false)}
                  >
                    <button
                      onClick={() => onNavigate('services')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all border ${
                        currentView.startsWith('services')
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-1 ring-indigo-500 border-transparent'
                          : 'text-slate-400 border-transparent hover:bg-slate-800 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      <span className="text-base">🎹</span>
                      <span className="text-[10px] font-black uppercase tracking-widest">Services</span>
                      <svg className="w-3 h-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6"/></svg>
                    </button>
                  </div>
                )}

                {hasPermission('giving') && (
                  <div
                    ref={givingRef}
                    className="relative shrink-0"
                    onMouseEnter={() => setGivingOpen(true)}
                    onMouseLeave={() => setGivingOpen(false)}
                  >
                    <button
                      onClick={() => onNavigate('giving')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all border ${
                        currentView.startsWith('giving')
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-1 ring-indigo-500 border-transparent'
                          : 'text-slate-400 border-transparent hover:bg-slate-800 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      <span className="text-base">💰</span>
                      <span className="text-[10px] font-black uppercase tracking-widest">Giving</span>
                      <svg className="w-3 h-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6"/></svg>
                    </button>
                  </div>
                )}

                {hasPermission('pastoral') && (
                  <div
                    ref={careRef}
                    className="relative shrink-0"
                    onMouseEnter={() => setCareOpen(true)}
                    onMouseLeave={() => setCareOpen(false)}
                  >
                    <button
                      onClick={() => onNavigate('pastoral')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all border ${
                        currentView.startsWith('pastoral')
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-1 ring-indigo-500 border-transparent'
                          : 'text-slate-400 border-transparent hover:bg-slate-800 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      <span className="text-base">🕊️</span>
                      <span className="text-[10px] font-black uppercase tracking-widest">Care</span>
                      <svg className="w-3 h-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6"/></svg>
                    </button>
                  </div>
                )}

                {hasPermission('metrics') && (
                  <div
                    ref={metricsRef}
                    className="relative shrink-0"
                    onMouseEnter={() => setMetricsOpen(true)}
                    onMouseLeave={() => setMetricsOpen(false)}
                  >
                    <button
                      onClick={() => onNavigate('metrics')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all border ${
                        currentView.startsWith('metrics')
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-1 ring-indigo-500 border-transparent'
                          : 'text-slate-400 border-transparent hover:bg-slate-800 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      <span className="text-base">📈</span>
                      <span className="text-[10px] font-black uppercase tracking-widest">Metrics</span>
                      <svg className="w-3 h-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6"/></svg>
                    </button>
                  </div>
                )}

                {/* Metrics dropdown — rendered via fixed position to escape overflow-x-auto clipping */}
                {metricsOpen && hasPermission('metrics') && (
                  <div
                    className="fixed z-[9999]"
                    style={getDropdownStyle(metricsRef)}
                    onMouseEnter={() => setMetricsOpen(true)}
                    onMouseLeave={() => setMetricsOpen(false)}
                  >
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl shadow-black/40 p-2 flex flex-col gap-1 min-w-[180px]">
                      {[
                        { view: 'metrics',          icon: '📊', label: 'Dashboard'  },
                        { view: 'metrics-input',    icon: '✏️',  label: 'Input Data' },
                        { view: 'metrics-settings', icon: '⚙️',  label: 'Configure'  },
                      ].map(item => (
                        <button
                          key={item.view}
                          onClick={() => { onNavigate(item.view); setMetricsOpen(false); }}
                          className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest w-full text-left transition-all ${
                            currentView === item.view
                              ? 'bg-indigo-600 text-white'
                              : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                          }`}
                        >
                          <span className="text-sm">{item.icon}</span>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Care dropdown — fixed position to escape overflow-x-auto clipping */}
                {careOpen && hasPermission('pastoral') && (
                  <div
                    className="fixed z-[9999]"
                    style={getDropdownStyle(careRef)}
                    onMouseEnter={() => setCareOpen(true)}
                    onMouseLeave={() => setCareOpen(false)}
                  >
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl shadow-black/40 p-2 flex flex-col gap-1 min-w-[180px]">
                      {[
                        { view: 'pastoral',            icon: '⛪',  label: 'Church'     },
                        { view: 'pastoral-membership', icon: '👥', label: 'Membership'  },
                        { view: 'pastoral-community',  icon: '🏙️', label: 'Community'  },
                        { view: 'pastoral-care',       icon: '🕊️', label: 'Care'       },
                        { view: 'pastoral-calendar',   icon: '📅', label: 'Calendar'   },
                      ].map(item => (
                        <button
                          key={item.view}
                          onClick={() => { onNavigate(item.view); setCareOpen(false); }}
                          className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest w-full text-left transition-all ${
                            currentView === item.view
                              ? 'bg-indigo-600 text-white'
                              : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                          }`}
                        >
                          <span className="text-sm">{item.icon}</span>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* People dropdown */}
                {peopleOpen && hasPermission('people') && (
                  <div
                    className="fixed z-[9999]"
                    style={getDropdownStyle(peopleRef)}
                    onMouseEnter={() => setPeopleOpen(true)}
                    onMouseLeave={() => setPeopleOpen(false)}
                  >
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl shadow-black/40 p-2 flex flex-col gap-1 min-w-[180px]">
                      {[
                        { view: 'people',            icon: '📊', label: 'Overview'   },
                        { view: 'people-households', icon: '🏠', label: 'Households' },
                        { view: 'people-risk',       icon: '⚠️', label: 'Risk Profiles' },
                      ].map(item => (
                        <button
                          key={item.view}
                          onClick={() => { onNavigate(item.view); setPeopleOpen(false); }}
                          className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest w-full text-left transition-all ${
                            currentView === item.view
                              ? 'bg-indigo-600 text-white'
                              : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                          }`}
                        >
                          <span className="text-sm">{item.icon}</span>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Services dropdown */}
                {servicesOpen && hasPermission('services') && (
                  <div
                    className="fixed z-[9999]"
                    style={getDropdownStyle(servicesRef)}
                    onMouseEnter={() => setServicesOpen(true)}
                    onMouseLeave={() => setServicesOpen(false)}
                  >
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl shadow-black/40 p-2 flex flex-col gap-1 min-w-[180px]">
                      {[
                        { view: 'services',            icon: '🎨', label: 'Overview'    },
                        { view: 'services-attendance', icon: '📌', label: 'Attendance' },
                        { view: 'services-teams',      icon: '👤', label: 'Teams'      },
                      ].map(item => (
                        <button
                          key={item.view}
                          onClick={() => { onNavigate(item.view); setServicesOpen(false); }}
                          className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest w-full text-left transition-all ${
                            currentView === item.view
                              ? 'bg-indigo-600 text-white'
                              : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                          }`}
                        >
                          <span className="text-sm">{item.icon}</span>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Giving dropdown */}
                {givingOpen && hasPermission('giving') && (
                  <div
                    className="fixed z-[9999]"
                    style={getDropdownStyle(givingRef)}
                    onMouseEnter={() => setGivingOpen(true)}
                    onMouseLeave={() => setGivingOpen(false)}
                  >
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl shadow-black/40 p-2 flex flex-col gap-1 min-w-[180px]">
                      {[
                        { view: 'giving',            icon: '📊', label: 'Overview'   },
                        { view: 'giving-donor',      icon: '👥', label: 'Donors'     },
                        { view: 'giving-budgets',    icon: '💼', label: 'Budgets'    },
                        { view: 'giving-donations',  icon: '📝', label: 'Donations'  },
                        { view: 'giving-reports',    icon: '📄', label: 'Reports'    },
                      ].map(item => (
                        <button
                          key={item.view}
                          onClick={() => { onNavigate(item.view); setGivingOpen(false); }}
                          className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest w-full text-left transition-all ${
                            currentView === item.view
                              ? 'bg-indigo-600 text-white'
                              : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                          }`}
                        >
                          <span className="text-sm">{item.icon}</span>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {hasPermission('tools') && (
                  <div
                    ref={toolsRef}
                    className="relative shrink-0"
                    onMouseEnter={() => setToolsOpen(true)}
                    onMouseLeave={() => setToolsOpen(false)}
                  >
                    <button
                      onClick={() => onNavigate('tools-emails')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all border ${
                        currentView.startsWith('tools')
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-1 ring-indigo-500 border-transparent'
                          : 'text-slate-400 border-transparent hover:bg-slate-800 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      <span className="text-base">🧰</span>
                      <span className="text-[10px] font-black uppercase tracking-widest">Tools</span>
                      <svg className="w-3 h-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6"/></svg>
                    </button>
                  </div>
                )}

                {/* Tools dropdown — fixed position to escape overflow clipping */}
                {toolsOpen && hasPermission('tools') && (
                  <div
                    className="fixed z-[9999]"
                    style={getDropdownStyle(toolsRef)}
                    onMouseEnter={() => setToolsOpen(true)}
                    onMouseLeave={() => setToolsOpen(false)}
                  >
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl shadow-black/40 p-2 flex flex-col gap-1 min-w-[180px]">
                      {[
                        { view: 'tools-emails',        icon: '📧', label: 'Emails'        },
                        { view: 'tools-sms-inbox',     icon: '💬', label: 'SMS'           },
                        { view: 'tools-workflows',     icon: '⚡', label: 'Workflows'    },
                        { view: 'tools-polls',         icon: '📊', label: 'Polls'         },
                        { view: 'tools-website',       icon: '🌐', label: 'Website'       },
                        { view: 'tools-qrcodes',       icon: '🔲', label: 'QR Codes'      },
                        { view: 'tools-unsubscribers', icon: '🛋️',  label: 'Unsubscribers' },
                      ].map(item => (
                        <button
                          key={item.view}
                          onClick={() => { onNavigate(item.view); setToolsOpen(false); }}
                          className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest w-full text-left transition-all ${
                            currentView === item.view
                              || (item.view === 'tools-sms-inbox' && currentView.startsWith('tools-sms'))
                              || (item.view === 'tools-workflows' && currentView === 'tools-workflows')
                              ? 'bg-indigo-600 text-white'
                              : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                          }`}
                        >
                          <span className="text-sm">{item.icon}</span>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}


                {canSeeLibrary && (
                    <NavItem 
                        icon="📚" 
                        label="Library" 
                        active={currentView === 'library'} 
                        onClick={() => onNavigate('library')} 
                    />
                )}

                {isSystemAdmin && (
                  <NavItem 
                    icon="🛠️" 
                    label="App Config" 
                    active={currentView === 'app-settings'} 
                    onClick={() => onNavigate('app-settings')} 
                  />
                )}
            </nav>

            {/* Right Side: User Controls */}
            <div className="flex items-center gap-3 shrink-0">
                
                {/* Context Switcher (Admin Only) */}
                {isSystemAdmin && allChurches && allChurches.length > 0 && (
                    <div className="hidden xl:block mr-2">
                        <select 
                            value={church.id} 
                            onChange={(e) => onSwitchChurch?.(e.target.value)}
                            className="bg-slate-800 text-white border border-slate-700 text-[10px] font-black uppercase tracking-widest py-1.5 rounded-lg px-3 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer max-w-[140px] truncate"
                            title="Switch Tenant Context"
                        >
                            {allChurches.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Settings Gear Icon */}
                {hasPermission('settings') && (
                    <button
                        onClick={() => onNavigate('settings')}
                        title="Settings"
                        className={`w-8 h-8 flex items-center justify-center rounded-full border transition-all ${
                            currentView === 'settings'
                                ? 'bg-indigo-600 border-indigo-500 text-white'
                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700'
                        }`}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3"/>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                        </svg>
                    </button>
                )}

                {/* Profile Button */}
                <button 
                    onClick={() => setIsEditingProfile(true)}
                    className="flex items-center gap-2 pl-1 pr-1 py-1 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors group"
                    title="Edit Profile"
                >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shadow-lg ${isSystemAdmin ? 'bg-amber-500 text-white' : 'bg-indigo-600 text-white'}`}>
                        {user.name?.charAt(0) || '?'}
                    </div>
                    <span className="text-[10px] font-bold text-slate-300 group-hover:text-white pr-2 hidden md:block max-w-[100px] truncate">
                        {user.name.split(' ')[0]}
                    </span>
                </button>

                {/* Logout Button */}
                <button 
                    onClick={onLogout}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-900 transition-all"
                    title="Sign Out"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                </button>
            </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto print:overflow-visible bg-slate-50 dark:bg-slate-950 transition-colors duration-300 relative scroll-smooth">
        
        {/* Page Context Header (Sticky) */}
        <div className="bg-white/80 dark:bg-slate-900/80 border-b border-slate-100 dark:border-slate-800 px-6 lg:px-10 py-4 sticky top-0 z-40 flex justify-between items-center backdrop-blur-md print:hidden transition-colors duration-300">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-[0.2em]">
              {currentView.replace(/-/g, ' ')}
            </h2>
            {isSystemAdmin && (
              <span className="hidden sm:inline-block text-[9px] font-black uppercase tracking-widest bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full border border-amber-200">
                Global Admin Mode
              </span>
            )}
          </div>
          <div className="flex items-center gap-6">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                isSyncing
                ? 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/30'
                : church.pcoConnected 
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/30' 
                    : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
            }`}>
              {isSyncing ? (
                  <svg className="animate-spin h-3 w-3 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
              ) : (
                  <span className={`w-1.5 h-1.5 rounded-full ${
                      church.pcoConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                  }`} />
              )}
              {isSyncing ? 'Syncing Data...' : church.pcoConnected ? 'PCO Connected' : 'Not Connected'}
            </div>
          </div>
        </div>

        {/* Content Container */}
        {noPadding ? (
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Sub-nav strip (e.g. SMS tabs) — only when subNavItems provided */}
            {subNavItems && subNavItems.length > 0 && (
              <div className="shrink-0 flex items-center gap-1 px-5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 overflow-x-auto no-scrollbar">
                {subNavItems.map(item => (
                  <button
                    key={item.view}
                    onClick={() => onNavigate(item.view)}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition shrink-0 ${
                      currentView === item.view
                        ? 'border-violet-600 text-violet-600 dark:text-violet-400 dark:border-violet-400'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            )}
            {children}
          </div>
        ) : (
          <div className="p-6 lg:p-10 max-w-[1600px] mx-auto print:p-0 print:max-w-none">
            {/* Sub-nav strip when inside padded container */}
            {subNavItems && subNavItems.length > 0 && (
              <div className="flex items-center gap-1 mb-4 border-b border-slate-200 dark:border-slate-700">
                {subNavItems.map(item => (
                  <button
                    key={item.view}
                    onClick={() => onNavigate(item.view)}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition shrink-0 ${
                      currentView === item.view
                        ? 'border-violet-600 text-violet-600 dark:text-violet-400'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            )}
            {children}
          </div>
        )}
      </main>

      {/* User Profile Modal */}
      {isEditingProfile && (
          <UserProfileModal 
            user={user} 
            church={church}
            onClose={() => setIsEditingProfile(false)} 
            onUpdate={() => onRefreshUser && onRefreshUser()} 
          />
      )}
    </div>
  );
};

interface NavItemProps {
  icon: string;
  label: string;
  active?: boolean;
  onClick: () => void;
  highlight?: 'indigo' | 'amber' | 'emerald';
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, active, onClick, highlight = 'indigo' }) => {
  let activeClass = 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-1 ring-indigo-500 border-transparent';
  
  if (highlight === 'amber') {
      activeClass = 'bg-amber-500 text-white shadow-lg shadow-amber-500/30 ring-1 ring-amber-400 border-transparent';
  } else if (highlight === 'emerald') {
      activeClass = 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 ring-1 ring-emerald-500 border-transparent';
  }

  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all shrink-0 border ${
        active 
        ? activeClass 
        : 'text-slate-400 border-transparent hover:bg-slate-800 hover:text-white hover:border-slate-700'
      }`}
    >
      <span className="text-base">{icon}</span>
      <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
    </button>
  );
};

export default Layout;
