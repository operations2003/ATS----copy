'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { AuthModal } from './AuthModal';
import { MyProfileModal } from './MyProfileModal';
import BookDemoModal from './BookDemoModal';
import Logo from './Logo';

export const Header: React.FC = () => {
  const [mobileOpen, setMobileOpen]     = useState(false);
  const [authOpen, setAuthOpen]         = useState(false);
  const [demoOpen, setDemoOpen]         = useState(false);
  const [authMode, setAuthMode]         = useState<'signin' | 'signup'>('signin');
  const [profileOpen, setProfileOpen]   = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');

  const pathname = usePathname();
  const router   = useRouter();
  const { user, isAuthenticated, logout } = useAuth();

  const cachedRole = typeof window !== 'undefined' ? (localStorage.getItem('tasknera_role') as any) : null;
  const cachedEmail = typeof window !== 'undefined' ? (localStorage.getItem('tasknera_email') || '') : '';
  const currentRole = user?.role || cachedRole || 'RECRUITER_MEMBER';

  const isSuperAdmin = currentRole === 'SUPER_ADMIN' || (user?.email || cachedEmail)?.toLowerCase().trim() === 'operations@tasknera.com' || (user?.email || cachedEmail)?.toLowerCase().trim() === 'admin@gmail.com';
  const isClientAdmin = currentRole === 'CLIENT_ADMIN' || currentRole === 'ADMIN';
  const isAdmin = isSuperAdmin || isClientAdmin;

  // Determine if this is a workspace route where the left sidebar should render
  const isPublicLanding = pathname === '/home' || (!isAuthenticated && pathname === '/');
  const isWorkspaceRoute = !isPublicLanding && 
    !pathname?.startsWith('/apply') && 
    !pathname?.startsWith('/share') && 
    !pathname?.startsWith('/signin') && 
    !pathname?.startsWith('/signup');

  // Inject global layout offset for workspace pages so main and footer align perfectly next to the left navbar
  useEffect(() => {
    if (isWorkspaceRoute) {
      document.body.classList.add('has-left-sidebar');
    } else {
      document.body.classList.remove('has-left-sidebar');
    }
    return () => {
      document.body.classList.remove('has-left-sidebar');
    };
  }, [isWorkspaceRoute]);

  // Compute initials for avatar (e.g. "Ashutosh Shrivastava" -> "AS")
  const getInitials = (name?: string | null, email?: string | null) => {
    if (name && name.trim()) {
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return parts[0].slice(0, 2).toUpperCase();
    }
    if (email && email.trim()) {
      const username = email.split('@')[0];
      return username.slice(0, 2).toUpperCase();
    }
    return 'AS';
  };

  const active = (href: string) => {
    if (!pathname) return false;
    if (pathname === href) return true;
    if (href !== '/' && href !== '/dashboard' && pathname.startsWith(href + '/')) {
      return true;
    }
    return false;
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const term = encodeURIComponent(searchQuery.trim());
    if (pathname?.startsWith('/jobs')) {
      router.push(`/jobs?search=${term}`);
    } else {
      router.push(`/candidates?search=${term}`);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Clean, Simple Navigation Items (No clutter)
  // ───────────────────────────────────────────────────────────────────────────
  const navItems = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="7" rx="1.5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      label: 'Jobs & JDs',
      href: '/jobs',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="2" y="7" width="20" height="14" rx="2" strokeWidth={2} />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
        </svg>
      ),
    },
    {
      label: 'Candidates',
      href: '/candidates',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    ...(isAdmin ? [
      {
        label: isSuperAdmin ? 'Super Admin' : 'Admin Hub',
        href: isSuperAdmin ? '/super-admin' : '/admin',
        icon: (
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
      }
    ] : []),
  ];

  // ───────────────────────────────────────────────────────────────────────────
  // Clean Sidebar Component
  // ───────────────────────────────────────────────────────────────────────────
  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-[#0F172A] text-slate-300 font-sans select-none overflow-y-auto">
      {/* Brand Header */}
      <div className="px-5 pt-6 pb-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-[#FF5722] text-white font-black text-base flex items-center justify-center shadow-md flex-shrink-0">
          H
        </div>
        <div className="min-w-0">
          <span className="text-white font-bold text-base tracking-tight block leading-tight">HireIQ</span>
          <span className="text-[8px] uppercase tracking-[0.2em] font-semibold text-slate-400 block mt-0.5">
            RECRUITMENT INTELLIGENCE
          </span>
        </div>
      </div>

      {/* Workspace Indicator */}
      <div className="mx-3.5 mb-5 px-3 py-2.5 rounded-xl bg-[#182238] border border-slate-700/60">
        <div className="text-xs font-semibold text-white truncate">
          {(user as any)?.organizationName || 'TaskNera Demo Workspace'}
        </div>
        <div className="text-[9.5px] uppercase font-bold text-slate-400 tracking-wider mt-0.5">
          {isSuperAdmin ? 'SUPER ADMIN' : isClientAdmin ? 'ORG ADMIN' : 'RECRUITER'}
        </div>
      </div>

      {/* Primary Navigation */}
      <div className="px-3 space-y-1 flex-1">
        <div className="text-[10px] font-bold tracking-wider uppercase text-slate-400 mb-2 px-3">
          MENU
        </div>
        {navItems.map((item) => {
          const isItemActive = active(item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                isItemActive
                  ? 'border border-[#FF5A36] bg-[#1E293B] text-white shadow-xs'
                  : 'border border-transparent text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <div className={isItemActive ? 'text-[#FF5A36]' : 'text-slate-400'}>{item.icon}</div>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Profile & Logout Pinned to Bottom */}
      <div className="mt-auto p-3.5 border-t border-slate-800/90 bg-[#0B132B]">
        <div className="flex items-center justify-between gap-2 p-1.5 rounded-xl hover:bg-slate-800/60 transition-colors">
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              setProfileOpen(true);
            }}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer group"
            title="View Profile & Credentials"
          >
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-white font-bold text-xs flex items-center justify-center flex-shrink-0 group-hover:border-[#FF5A36] transition-colors">
              {getInitials(user?.name, user?.email)}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-xs font-semibold text-white block truncate leading-tight group-hover:text-[#FF5A36] transition-colors">
                {user?.name || user?.email?.split('@')[0] || 'User Profile'}
              </span>
              <span className="text-[10px] text-slate-400 block truncate mt-0.5">
                {user?.email || 'user@tasknera.com'}
              </span>
            </div>
          </button>
          <button
            type="button"
            onClick={logout}
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer flex-shrink-0"
            title="Sign Out"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Public Marketing Header (for /home landing page)
  // ───────────────────────────────────────────────────────────────────────────
  if (isPublicLanding) {
    return (
      <>
        <nav className="fixed top-0 w-full z-[150] bg-white/95 backdrop-blur-xl border-b border-slate-200/80 shadow-xs">
          <div className="max-w-screen-xl mx-auto px-6 h-[64px] flex items-center justify-between gap-3">
            <div className="flex-shrink-0">
              <Logo href="/home" size="sm" variant="dark" />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDemoOpen(true)}
                className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold rounded-xl transition-all hover:border-brand-orange hover:text-brand-orange cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <svg className="w-3.5 h-3.5 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Book a Demo</span>
              </button>
              <Link
                href="/signin"
                className="px-5 py-2 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-black rounded-xl transition-all shadow-orange hover:shadow-orange-lg cursor-pointer flex items-center gap-1.5"
              >
                <span>Sign In</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        </nav>
        <BookDemoModal isOpen={demoOpen} onClose={() => setDemoOpen(false)} />
      </>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Authenticated Workspace Layout: Left Sidebar + Clean Top Bar
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <>
      <style jsx global>{`
        @media (min-width: 1024px) {
          body.has-left-sidebar main {
            margin-left: 16rem !important;
            width: calc(100% - 16rem) !important;
            max-width: calc(100% - 16rem) !important;
            padding-top: 5rem !important;
          }
          body.has-left-sidebar footer {
            margin-left: 16rem !important;
            width: calc(100% - 16rem) !important;
          }
        }
      `}</style>

      {/* 1. Desktop Left Sidebar */}
      <aside className="hidden lg:block fixed top-0 bottom-0 left-0 w-64 z-[110] border-r border-slate-800/80 shadow-sm">
        <SidebarContent />
      </aside>

      {/* 2. Top Header Bar */}
      <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200/90 z-[100] flex items-center justify-between px-4 sm:px-6 lg:px-8 shadow-xs">
        {/* Left: Mobile Toggle & Simple Search */}
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label="Open sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <form onSubmit={handleSearchSubmit} className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search candidates or jobs..."
              className="w-full pl-9 pr-3 py-1.5 bg-[#F8FAFC] hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF5A36]/30 focus:border-[#FF5A36] transition-all"
            />
          </form>
        </div>

        {/* Right: Status / Trial Badge */}
        <div className="flex items-center gap-2 sm:gap-3">
          {user?.subscription?.isTrial && !user?.subscription?.isExpired && (
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10.5px] font-bold uppercase tracking-wider"
              title={`14-Day Free Trial: ${user.subscription.daysLeft} days left`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span>Trial: {user.subscription.daysLeft}d left</span>
            </div>
          )}
        </div>
      </header>

      {/* 3. Mobile Off-Canvas Drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-[200]">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-64 bg-[#0F172A] flex flex-col z-[210] shadow-2xl">
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Modals */}
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} initialMode={authMode} />
      <MyProfileModal isOpen={profileOpen} onClose={() => setProfileOpen(false)} />
      <BookDemoModal isOpen={demoOpen} onClose={() => setDemoOpen(false)} />
    </>
  );
};

export default Header;
