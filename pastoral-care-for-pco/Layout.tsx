
import React from 'react';
import { Church, User } from './types';

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
}

const AppLogo: React.FC<{ size?: number }> = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="blue-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#4A90E2" />
        <stop offset="100%" stopColor="#357ABD" />
      </linearGradient>
      <linearGradient id="yellow-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F5A623" />
        <stop offset="100%" stopColor="#F8E71C" />
      </linearGradient>
    </defs>
    <circle cx="35" cy="30" r="15" fill="url(#blue-grad)" />
    <path d="M15 70C15 50 35 45 50 45C35 45 35 60 35 80C35 80 15 80 15 70Z" fill="url(#blue-grad)" />
    <circle cx="65" cy="30" r="15" fill="url(#yellow-grad)" />
    <path d="M85 70C85 50 65 45 50 45C65 45 65 60 65 80C65 80 85 80 85 70Z" fill="url(#yellow-grad)" />
    <path d="M50 40C40 50 40 75 50 85C60 75 60 50 50 40Z" fill="#357ABD" stroke="white" strokeWidth="4" />
    <path d="M50 48V77M40 60H60" stroke="white" strokeWidth="6" strokeLinecap="round" />
  </svg>
);

const Layout: React.FC<LayoutProps> = ({ children, church, allChurches, onSwitchChurch, user, onLogout, currentView, onNavigate, hasPermission }) => {
  if (!user) return null;

  const isSystemAdmin = user.roles.includes('System Administration');

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300 font-sans">
      {/* Top Navigation Bar */}
      <header className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between shadow-md z-20">
        {/* Left: Logo & Brand */}
        <div className="flex items-center gap-4 cursor-pointer" onClick={() => onNavigate('dashboard')}>
          <AppLogo size={36} />
          <div className="leading-none">
            <h1 className="font-black text-sm tracking-tight text-white">Pastoral Care</h1>
            <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest">for PCO</p>
          </div>
        </div>

        {/* Center: Navigation */}
        <nav className="hidden md:flex items-center gap-1">
            {isSystemAdmin && (
              <NavItem 
                icon="🌍" 
                label="Global" 
                active={currentView === 'global-admin'} 
                onClick={() => onNavigate('global-admin')} 
                highlight="amber"
              />
            )}
            
            {hasPermission('dashboard') && (
              <NavItem 
                icon="📊" 
                label="Dashboard" 
                active={currentView === 'dashboard'} 
                onClick={() => onNavigate('dashboard')} 
              />
            )}
            {hasPermission('people') && (
              <NavItem 
                icon="👥" 
                label="People" 
                active={currentView === 'people'} 
                onClick={() => onNavigate('people')} 
              />
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
              <NavItem 
                icon="📅" 
                label="Services" 
                active={currentView === 'services'} 
                onClick={() => onNavigate('services')} 
              />
            )}
            {hasPermission('giving') && (
              <NavItem 
                icon="💰" 
                label="Giving" 
                active={currentView === 'giving'} 
                onClick={() => onNavigate('giving')} 
              />
            )}
            {hasPermission('pastoral') && (
              <NavItem 
                icon="🕊️" 
                label="Care" 
                active={currentView === 'pastoral'} 
                onClick={() => onNavigate('pastoral')} 
              />
            )}
             {hasPermission('metrics') && (
              <NavItem 
                icon="📈" 
                label="Metrics" 
                active={currentView === 'metrics'} 
                onClick={() => onNavigate('metrics')} 
              />
            )}
             <NavItem 
                icon="🤖" 
                label="AI Assistant" 
                active={currentView === 'ai-assistant'} 
                onClick={() => onNavigate('ai-assistant')} 
              />
             {hasPermission('settings') && (
              <NavItem 
                icon="⚙️" 
                label="Settings" 
                active={currentView === 'settings'} 
                onClick={() => onNavigate('settings')} 
              />
            )}
        </nav>

        {/* Right: User & Actions */}
        <div className="flex items-center gap-4">
           {/* Context Switcher for System Admin */}
           {isSystemAdmin && allChurches && allChurches.length > 0 && (
            <div className="hidden lg:block">
              <select 
                value={church.id} 
                onChange={(e) => onSwitchChurch?.(e.target.value)}
                className="bg-slate-800 border-none text-[10px] font-black uppercase tracking-widest py-1.5 rounded-lg px-2 outline-none focus:ring-1 focus:ring-indigo-500 transition-all text-indigo-400 cursor-pointer"
              >
                {allChurches.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-3 pl-4 border-l border-slate-700">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${isSystemAdmin ? 'bg-amber-500 text-white' : 'bg-indigo-600 text-white'}`}>
              {user.name?.charAt(0) || '?'}
            </div>
            <div className="hidden lg:block text-left">
              <p className="text-xs font-bold text-white leading-none">{user.name}</p>
            </div>
            <button 
                onClick={onLogout}
                className="text-slate-400 hover:text-white transition-colors"
                title="Sign Out"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            </button>
          </div>
        </div>
      </header>

      {/* Sub-Header / Breadcrumbs */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-8 py-4 flex justify-between items-center sticky top-0 z-10">
        <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-[0.2em]">
            {currentView.replace('-', ' ')}
        </h2>
        
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${church.pcoConnected ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${church.pcoConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {church.pcoConnected ? 'PCO Connected' : 'Handshake Pending'}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

interface NavItemProps {
  icon: string;
  label: string;
  active?: boolean;
  onClick: () => void;
  highlight?: 'indigo' | 'amber';
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, active, onClick, highlight = 'indigo' }) => {
  // Style matching the screenshot: Active items have a gradient/solid background, others are plain text
  const activeClass = highlight === 'amber' 
    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/20' 
    : 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/20';

  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
        active ? activeClass : 'text-slate-400 hover:text-white hover:bg-slate-800'
      }`}
    >
      <span className="text-sm">{icon}</span>
      <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
    </button>
  );
};

export default Layout;
