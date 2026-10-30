'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { AuthModal } from './AuthModal';
import { MyProfileModal } from './MyProfileModal';
import BookDemoModal from './BookDemoModal';
import Logo from './Logo';

const Header: React.FC = () => {
  const [scrolled, setScrolled]         = useState(false);
  const [mobileOpen, setMobileOpen]     = useState(false);
  const [authOpen, setAuthOpen]         = useState(false);
  const [demoOpen, setDemoOpen]         = useState(false);
  const [authMode, setAuthMode]         = useState<'signin' | 'signup'>('signin');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profileOpen, setProfileOpen]   = useState(false);
  const pathname   = usePathname();
  const { user, isAuthenticated, logout } = useAuth();

  const cachedRole = typeof window !== 'undefined' ? (localStorage.getItem('tasknera_role') as any) : null;
  const cachedEmail = typeof window !== 'undefined' ? (localStorage.getItem('tasknera_email') || '') : '';
  const currentRole = user?.role || cachedRole || 'RECRUITER_MEMBER';

  const isSuperAdmin = currentRole === 'SUPER_ADMIN' || (user?.email || cachedEmail)?.toLowerCase().trim() === 'operations@tasknera.com' || (user?.email || cachedEmail)?.toLowerCase().trim() === 'admin@gmail.com';
  const isClientAdmin = currentRole === 'CLIENT_ADMIN' || currentRole === 'ADMIN';
  const isAdmin = isSuperAdmin || isClientAdmin;

  const canUploadJd = isSuperAdmin || user?.allowJdUpload !== false;

  // Clean navigation labels with dedicated SVG icons
  const nav = isSuperAdmin
    ? [
        { label: 'Super Admin', href: '/super-admin', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
      ]
    : isClientAdmin
    ? [
        { label: 'Admin Hub', href: '/admin', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
        { label: 'All Jobs', href: '/jobs', icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
        ...(canUploadJd ? [{ label: 'Upload JD', href: '/jobs/create', icon: 'M12 4v16m8-8H4' }] : []),
        { label: 'Candidate Pool', href: '/candidates', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
      ]
    : [
        { label: 'My Workspace', href: '/dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
        { label: 'My Jobs', href: '/jobs', icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
        ...(canUploadJd ? [{ label: 'Upload JD', href: '/jobs/create', icon: 'M12 4v16m8-8H4' }] : []),
        { label: 'Candidate Pool', href: '/candidates', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
      ];


  const active = (href: string) => {
    if (!pathname) return false;
    if (pathname === href) return true;
    if (href !== '/' && pathname.startsWith(href + '/')) {
      const hasMoreSpecificMatch = nav.some(
        other =>
          other.href !== href &&
          other.href.length > href.length &&
          (pathname === other.href || pathname.startsWith(other.href + '/'))
      );
      return !hasMoreSpecificMatch;
    }
    return false;
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = () => {
      setDropdownOpen(false);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('click', handleClick);
      return () => window.removeEventListener('click', handleClick);
    }
  }, []);

  const isAuth = isAuthenticated && user;
  const navBg = 'bg-white/95 backdrop-blur-xl';
  const navBorder = 'border-slate-200/80';
  const shadow = scrolled ? 'shadow-[0_4px_20px_rgba(30,41,59,0.06)]' : '';

  return (
    <>
      <nav className={`fixed top-0 w-full z-[150] transition-all duration-300 ${navBg} border-b ${navBorder} ${shadow}`}>
        <div className="max-w-screen-xl mx-auto px-6 h-[64px] flex items-center justify-between gap-3">

          {/* Logo */}
          <div className="flex-shrink-0">
            <Logo
              href={isAuth ? (isSuperAdmin ? '/super-admin' : isClientAdmin ? '/admin' : '/dashboard') : '/home'}
              size="sm"
              variant="dark"
            />
          </div>

          {/* Nav links - Clean alignment without overflow bar */}
          {isAuth && (
            <div className="hidden lg:flex items-center justify-center gap-1.5 flex-1 px-2">
              {nav.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    active(item.href)
                      ? (isAdmin ? 'bg-violet-600 text-white shadow-sm' : 'bg-brand-orange text-white shadow-orange')
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                  }`}
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                  </svg>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          )}

          {/* Right actions */}
          <div className="hidden md:flex items-center gap-2.5 flex-shrink-0">
            {isAuth ? (
              <>
                {/* Profile Dropdown */}
                <div className="flex items-center gap-2">
                  {user?.subscription?.isTrial && !user?.subscription?.isExpired && (
                    <div
                      className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10.5px] font-extrabold uppercase tracking-wider"
                      title={user.subscription.expiresAt ? `14-day trial ends on ${new Date(user.subscription.expiresAt).toLocaleDateString()}` : '14-Day Free Trial'}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      <span>Trial: {user.subscription.daysLeft}d left</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setProfileOpen(true)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer group"
                    title="View My Profile, Username & Password"
                  >
                    <div className={`w-7 h-7 rounded-lg text-white text-xs font-bold flex items-center justify-center flex-shrink-0 shadow-2xs ${
                      isAdmin ? 'bg-violet-600' : 'bg-brand-orange'
                    }`}>
                      {(user.name || user.email)[0].toUpperCase()}
                    </div>
                    <div className="text-left leading-none">
                      <span className="text-xs font-bold text-slate-800 block max-w-[110px] truncate">
                        {user.name || user.email.split('@')[0]}
                      </span>
                      <span className={`text-[9px] font-bold uppercase tracking-wider block mt-0.5 ${
                        isAdmin ? 'text-violet-600' : 'text-brand-orange'
                      }`}>
                        My Profile
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={logout}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer border border-slate-200"
                    title="Sign Out / Switch Account"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </button>
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            className="lg:hidden p-2 rounded-lg transition-colors text-slate-700 hover:bg-slate-100"
            onClick={() => setMobileOpen(v => !v)}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="lg:hidden border-t px-4 py-3 space-y-1 bg-white/95 backdrop-blur-md border-slate-200/90 shadow-xl">
            {isAuth && nav.map(item => (
              <Link key={item.href} href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  active(item.href)
                    ? (isAdmin ? 'bg-violet-600 text-white' : 'bg-brand-orange text-white shadow-orange')
                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100/80'
                }`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                </svg>
                {item.label}
              </Link>
            ))}

            <div className="border-t border-slate-100 pt-3 mt-2 space-y-2">
              {isAuth ? (
                <>
                  <button
                    onClick={() => { setMobileOpen(false); setProfileOpen(true); }}
                    className="w-full text-left px-3.5 py-2.5 text-xs font-bold text-slate-800 hover:bg-orange-50 rounded-xl transition-colors cursor-pointer flex items-center justify-between border border-slate-200 bg-slate-50/50"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-orange-100 text-brand-orange flex items-center justify-center">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div>
                        <span className="block font-bold">My Profile</span>
                        <span className="block text-[10px] text-slate-500 font-normal">View username and password</span>
                      </div>
                    </div>
                    <span className="text-slate-400 text-xs">→</span>
                  </button>

                  <button onClick={() => { setMobileOpen(false); logout(); }}
                    className="w-full text-left px-3.5 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer flex items-center gap-2">
                    <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span>Sign Out / Switch Account</span>
                  </button>
                </>
              ) : (
                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { setMobileOpen(false); setDemoOpen(true); }}
                    className="w-full text-center px-4 py-2.5 bg-white border border-slate-300 hover:border-brand-orange text-slate-800 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>Book a Demo Session</span>
                  </button>
                  <Link
                    href="/signin"
                    onClick={() => setMobileOpen(false)}
                    className="block w-full text-center px-4 py-2.5 bg-brand-orange hover:bg-brand-orange-hover text-white rounded-xl text-xs font-black shadow-orange transition-all cursor-pointer"
                  >
                    Sign In to Account →
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} initialMode={authMode} />
      <MyProfileModal isOpen={profileOpen} onClose={() => setProfileOpen(false)} />
      <BookDemoModal isOpen={demoOpen} onClose={() => setDemoOpen(false)} />
    </>
  );
};

export default Header;
