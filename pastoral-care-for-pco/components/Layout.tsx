
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  LayoutDashboard, Globe, Users, FolderKanban, Music, HandCoins, HeartHandshake,
  TrendingUp, Wrench, SlidersHorizontal, Home, AlertTriangle, FileText, Palette,
  MapPin, User as UserIcon, Calendar, Smartphone, BarChart3, Briefcase, Church as ChurchIcon,
  Building2, Phone, ClipboardList, Pencil, Settings, Mail, MessageSquare, Zap,
  Newspaper, StickyNote, QrCode, Folder, Sparkles, UserMinus, ChevronDown, LogOut,
  type LucideIcon,
} from 'lucide-react';
import { Church, User } from '../types';
import UserProfileModal from './UserProfileModal';
import { AppLogo } from './AppLogo';
import { useTenantData } from '../contexts/TenantDataContext';

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
  metricsSubViews?: { label: string; view: string; icon: string }[];
  /** Secondary nav strip rendered below the context header (e.g. SMS sub-tabs) */
  subNavItems?: { label: string; view: string; icon: React.ReactNode }[];
  /** Remove the content padding wrapper so full-height panels can fill the space */
  noPadding?: boolean;
}

// ── Nav model ────────────────────────────────────────────────────────────────
// A single ordered list drives the top nav. `link` entries navigate directly;
// `menu` entries open a hover/click dropdown. Everything below is derived from
// this config so there is exactly one code path for triggers and panels.
interface NavLeaf {
  view: string;
  icon: LucideIcon;
  label: string;
  /** Custom active test; defaults to an exact match on `view`. */
  activeMatch?: (currentView: string) => boolean;
}
interface NavLink {
  kind: 'link';
  key: string;
  view: string;
  icon: LucideIcon;
  label: string;
  highlight?: 'amber';
}
interface NavMenuConfig {
  kind: 'menu';
  key: string;
  icon: LucideIcon;
  label: string;
  /** Trigger is highlighted when the current view starts with this prefix. */
  prefix: string;
  items: NavLeaf[];
}
type NavEntry = NavLink | NavMenuConfig;

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
  subNavItems,
  noPadding,
}) => {

  const { campuses, selectedCampusId, setSelectedCampusId } = useTenantData();

  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // -- Dropdown state (single open menu at a time) --
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const triggerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -- Nav scrollbar state --
  const navRef = useRef<HTMLDivElement>(null);
  const [showLeftScroll, setShowLeftScroll] = useState(false);
  const [showRightScroll, setShowRightScroll] = useState(false);

  const checkScroll = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    setShowLeftScroll(el.scrollLeft > 5);
    setShowRightScroll(el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
  }, []);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll);
    window.addEventListener('resize', checkScroll);
    const timer = setTimeout(checkScroll, 500);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
      clearTimeout(timer);
    };
  }, [checkScroll]);

  // ── Dropdown open/close ──────────────────────────────────────────────────
  // The panels are fixed-position with an 8px gap below the trigger. Without a
  // close delay, moving the mouse across that gap fires onMouseLeave and closes
  // the menu before the cursor reaches the panel. A single shared 150ms timer
  // debounces the close and also handles moving directly between two triggers.
  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);
  const openNow = useCallback((key: string) => {
    cancelClose();
    setOpenMenu(key);
  }, [cancelClose]);
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpenMenu(null), 150);
  }, [cancelClose]);

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!openMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenMenu(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openMenu]);

  const handleTriggerClick = (e: React.MouseEvent, key: string) => {
    // Touch / keyboard activation (no pointer coords) opens the menu instead of
    // treating the trigger as a plain link.
    const isTouchOrKeyboard = e.detail === 0 || ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (isTouchOrKeyboard && openMenu !== key) {
      e.preventDefault();
      openNow(key);
    } else {
      onNavigate(key);
      setOpenMenu(null);
    }
  };

  const navigateFromMenu = (view: string) => {
    onNavigate(view);
    setOpenMenu(null);
  };

  if (!user) return null;

  const isSystemAdmin = user.roles.includes('System Administration');
  const smsEnabled = !!church?.smsSettings?.smsEnabled;
  const isStarter = church.subscription?.status === 'active' && church.subscription?.planId === 'starter';

  // ── Build the nav config ────────────────────────────────────────────────
  const navEntries: NavEntry[] = useMemo(() => {
    const entries: NavEntry[] = [];

    if (hasPermission('dashboard')) {
      entries.push({ kind: 'link', key: 'dashboard', view: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' });
    }
    if (isSystemAdmin) {
      entries.push({ kind: 'link', key: 'global-admin', view: 'global-admin', icon: Globe, label: 'Global', highlight: 'amber' });
    }
    if (hasPermission('people')) {
      entries.push({
        kind: 'menu', key: 'people', icon: Users, label: 'People', prefix: 'people',
        items: [
          { view: 'people',            icon: LayoutDashboard, label: 'Overview'      },
          { view: 'people-households', icon: Home,            label: 'Households'    },
          { view: 'people-risk',       icon: AlertTriangle,   label: 'Risk Profiles' },
          { view: 'people-reports',    icon: FileText,        label: 'Reports'       },
        ],
      });
    }
    if (hasPermission('groups')) {
      entries.push({
        kind: 'menu', key: 'groups', icon: FolderKanban, label: 'Groups', prefix: 'groups',
        items: [
          { view: 'groups',         icon: LayoutDashboard, label: 'Overview' },
          { view: 'groups-reports', icon: FileText,        label: 'Reports'  },
        ],
      });
    }
    if (hasPermission('services')) {
      entries.push({
        kind: 'menu', key: 'services', icon: Music, label: 'Services', prefix: 'services',
        items: [
          { view: 'services',            icon: Palette,   label: 'Overview'   },
          { view: 'services-attendance', icon: MapPin,    label: 'Attendance' },
          { view: 'services-teams',      icon: UserIcon,  label: 'Teams'      },
          { view: 'services-plans',      icon: Calendar,  label: 'Plans'      },
          ...(smsEnabled ? [{ view: 'services-reminders', icon: Smartphone, label: 'Reminders' }] : []),
        ],
      });
    }
    if (hasPermission('giving')) {
      entries.push({
        kind: 'menu', key: 'giving', icon: HandCoins, label: 'Giving', prefix: 'giving',
        items: [
          { view: 'giving',         icon: BarChart3, label: 'Overview' },
          { view: 'giving-donor',   icon: Users,     label: 'Donors'   },
          { view: 'giving-budgets', icon: Briefcase, label: 'Budgets'  },
          { view: 'giving-reports', icon: FileText,  label: 'Reports'  },
        ],
      });
    }
    if (hasPermission('pastoral')) {
      entries.push({
        kind: 'menu', key: 'pastoral', icon: HeartHandshake, label: 'Care', prefix: 'pastoral',
        items: [
          { view: 'pastoral',            icon: ChurchIcon,    label: 'Church'     },
          { view: 'pastoral-membership', icon: Users,         label: 'Membership' },
          { view: 'pastoral-community',  icon: Building2,     label: 'Community'  },
          { view: 'pastoral-care',       icon: HeartHandshake, label: 'Care'      },
          { view: 'pastoral-calendar',   icon: Calendar,      label: 'Calendar'   },
          // Calling (Contact) is hidden for Starter plan subscribers
          ...(isStarter ? [] : [{ view: 'pastoral-contact', icon: Phone, label: 'Contact' }]),
          { view: 'pastoral-reports',    icon: ClipboardList, label: 'Reports'    },
        ],
      });
    }
    if (hasPermission('metrics')) {
      entries.push({
        kind: 'menu', key: 'metrics', icon: TrendingUp, label: 'Metrics', prefix: 'metrics',
        items: [
          { view: 'metrics',          icon: BarChart3, label: 'Dashboard'  },
          { view: 'metrics-input',    icon: Pencil,    label: 'Input Data' },
          { view: 'metrics-settings', icon: Settings,  label: 'Configure'  },
        ],
      });
    }
    if (hasPermission('tools')) {
      const toolItems: NavLeaf[] = [
        { view: 'tools-emails',        icon: Mail,          label: 'Emails'        },
        { view: 'tools-sms-inbox',     icon: MessageSquare, label: 'SMS',          activeMatch: v => v.startsWith('tools-sms') },
        { view: 'tools-workflows',     icon: Zap,           label: 'Workflows'     },
        { view: 'tools-polls',         icon: BarChart3,     label: 'Polls'         },
        { view: 'tools-bulletin',      icon: Newspaper,     label: 'Bulletins'     },
        { view: 'tools-notes',         icon: StickyNote,    label: 'Notes'         },
        { view: 'tools-website',       icon: Globe,         label: 'Website'       },
        { view: 'tools-qrcodes',       icon: QrCode,        label: 'QR Codes'      },
        { view: 'tools-files',         icon: Folder,        label: 'Files'         },
        { view: 'tools-forms',         icon: FileText,      label: 'Forms'         },
        { view: 'tools-church-helper', icon: Sparkles,      label: 'Church Helper' },
        { view: 'tools-unsubscribers', icon: UserMinus,     label: 'Unsubscribers' },
      ].filter(item => hasPermission(item.view));
      entries.push({ kind: 'menu', key: 'tools', icon: Wrench, label: 'Tools', prefix: 'tools', items: toolItems });
    }
    if (isSystemAdmin) {
      entries.push({ kind: 'link', key: 'app-settings', view: 'app-settings', icon: SlidersHorizontal, label: 'App Config' });
    }

    return entries;
  }, [hasPermission, isSystemAdmin, smsEnabled, isStarter]);

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
            <div className="relative flex-1 min-w-0">
              {/* Left scroll shadow/gradient indicator */}
              <div
                className={`absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-slate-900 dark:from-black to-transparent pointer-events-none z-10 transition-opacity duration-300 ${
                  showLeftScroll ? 'opacity-100' : 'opacity-0'
                }`}
              />
              {/* Right scroll shadow/gradient indicator */}
              <div
                className={`absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-900 dark:from-black to-transparent pointer-events-none z-10 transition-opacity duration-300 ${
                  showRightScroll ? 'opacity-100' : 'opacity-0'
                }`}
              />
              <nav
                ref={navRef}
                className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar mask-linear-fade px-2"
              >
                {navEntries.map(entry =>
                  entry.kind === 'link' ? (
                    <NavItem
                      key={entry.key}
                      icon={entry.icon}
                      label={entry.label}
                      active={currentView === entry.view}
                      onClick={() => onNavigate(entry.view)}
                      highlight={entry.highlight}
                    />
                  ) : (
                    <div
                      key={entry.key}
                      ref={el => { triggerRefs.current[entry.key] = el; }}
                      className="relative shrink-0"
                      onMouseEnter={() => openNow(entry.key)}
                      onMouseLeave={scheduleClose}
                      onFocus={() => openNow(entry.key)}
                      onBlur={scheduleClose}
                    >
                      <button
                        onClick={(e) => handleTriggerClick(e, entry.key)}
                        aria-haspopup="menu"
                        aria-expanded={openMenu === entry.key}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all border ${
                          currentView.startsWith(entry.prefix)
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-1 ring-indigo-500 border-transparent'
                            : 'text-slate-400 border-transparent hover:bg-slate-800 hover:text-white hover:border-slate-700'
                        }`}
                      >
                        <entry.icon size={17} strokeWidth={2.5} className="shrink-0" />
                        <span className="text-[10px] font-black uppercase tracking-widest">{entry.label}</span>
                        <ChevronDown className="w-3 h-3 opacity-60" strokeWidth={3} />
                      </button>
                    </div>
                  )
                )}
              </nav>
            </div>

            {/* Active dropdown panel — one shared, fixed-position node that escapes
                the nav's overflow-x-auto clipping. Positioned under its trigger. */}
            {(() => {
              const entry = navEntries.find(e => e.kind === 'menu' && e.key === openMenu) as NavMenuConfig | undefined;
              const trigger = openMenu ? triggerRefs.current[openMenu] : null;
              if (!entry || !trigger) return null;
              const rect = trigger.getBoundingClientRect();
              return (
                <div
                  role="menu"
                  className="nav-dropdown-panel animate-in fade-in slide-in-from-top-2 duration-150 ease-out"
                  ref={el => { if (el) { el.style.top = `${rect.bottom + 8}px`; el.style.left = `${rect.left}px`; } }}
                  onMouseEnter={cancelClose}
                  onMouseLeave={scheduleClose}
                >
                  <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl shadow-black/40 p-2 flex flex-col gap-1 min-w-[180px]">
                    {entry.items.map(item => {
                      const active = item.activeMatch ? item.activeMatch(currentView) : currentView === item.view;
                      return (
                        <button
                          key={item.view}
                          role="menuitem"
                          onClick={() => navigateFromMenu(item.view)}
                          className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest w-full text-left transition-all ${
                            active
                              ? 'bg-indigo-600 text-white'
                              : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                          }`}
                        >
                          <item.icon size={15} strokeWidth={2.5} className="shrink-0" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

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

                {/* Campus Selector (Multi-Campus Enabled) */}
                {church.multiCampusEnabled && campuses && campuses.length > 0 && (() => {
                    const isRestricted = user.allowedCampuses && user.allowedCampuses.length > 0 && !user.roles.includes('Church Admin');
                    const allowedCampusesList = isRestricted
                        ? campuses.filter(c => user.allowedCampuses?.includes(c.pcoId))
                        : campuses;

                    if (isRestricted && allowedCampusesList.length <= 1) {
                        const singleCampus = allowedCampusesList[0];
                        return singleCampus ? (
                            <div className="bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-black uppercase tracking-wider py-1.5 px-3 rounded-lg flex items-center gap-1.5 max-w-[150px] truncate" title={`Restricted to ${singleCampus.name}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                                {singleCampus.name}
                            </div>
                        ) : null;
                    }

                    return (
                        <div className="flex items-center gap-1.5 mr-2">
                            <select
                                value={selectedCampusId}
                                onChange={(e) => setSelectedCampusId(e.target.value)}
                                className="bg-slate-800 text-white border border-slate-700 text-[10px] font-black uppercase tracking-widest py-1.5 rounded-lg px-3 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer max-w-[150px] truncate"
                                title="Select Campus"
                            >
                                {!isRestricted && <option value="all">All Campuses</option>}
                                {allowedCampusesList.map(c => (
                                    <option key={c.pcoId} value={c.pcoId}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    );
                })()}

                {/* Settings Gear Icon */}
                {hasPermission('settings') && (
                    <button
                        onClick={() => onNavigate('settings')}
                        title="Settings"
                        aria-label="Settings"
                        className={`w-8 h-8 flex items-center justify-center rounded-full border transition-all ${
                            currentView === 'settings'
                                ? 'bg-indigo-600 border-indigo-500 text-white'
                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700'
                        }`}
                    >
                        <Settings size={14} strokeWidth={2.5} />
                    </button>
                )}

                {/* Profile Button */}
                <button
                    onClick={() => setIsEditingProfile(true)}
                    className="flex items-center gap-2 pl-1 pr-1 py-1 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors group"
                    title="Edit Profile"
                    aria-label="Edit profile"
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
                    aria-label="Sign out"
                >
                    <LogOut size={14} strokeWidth={2.5} />
                </button>
            </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className={`flex-1 print:overflow-visible bg-slate-50 dark:bg-slate-950 transition-colors duration-300 relative ${
        noPadding ? 'overflow-hidden flex flex-col min-h-0' : 'overflow-y-auto scroll-smooth'
      }`}>

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
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick: () => void;
  highlight?: 'amber' | 'emerald';
}

const NavItem: React.FC<NavItemProps> = ({ icon: Icon, label, active, onClick, highlight }) => {
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
      <Icon size={17} strokeWidth={2.5} className="shrink-0" />
      <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
    </button>
  );
};

export default Layout;
