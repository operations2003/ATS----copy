'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { AuthModal } from './AuthModal';
import { MyProfileModal } from './MyProfileModal';
import BookDemoModal from './BookDemoModal';
import Logo from './Logo';

interface InterviewNotification {
  id: string;
  interviewId: string;
  kind: 'today' | 'reminder';
  title: string;
  description: string;
  timeLabel: string;
  startAt: string;
}

const INTERVIEW_STORAGE_KEY = 'tasknera_interviews_frontend_v1';
const NOTIFICATION_READ_STORAGE_KEY = 'tasknera_interview_notification_read_v1';

const Header: React.FC = () => {
  const [mobileOpen, setMobileOpen]     = useState(false);
  const [authOpen, setAuthOpen]         = useState(false);
  const [demoOpen, setDemoOpen]         = useState(false);
  const [authMode, setAuthMode]         = useState<'signin' | 'signup'>('signin');
  const [profileOpen, setProfileOpen]   = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');
  const [mounted, setMounted]           = useState(false);
  const [interviewNotifications, setInterviewNotifications] = useState<InterviewNotification[]>([]);
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(new Set());
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationPanelRef = useRef<HTMLDivElement>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    'RECRUITMENT WORKSPACE': true,
    'ANALYTICS & AUTOMATION': true,
    'ADMINISTRATION': true,
  });

  const toggleSection = (sectionKey: string) => {
    setOpenSections(prev => ({
      ...prev,
      [sectionKey]: !(prev[sectionKey] ?? true),
    }));
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const refreshNotifications = () => {
      let interviews: any[] = [];
      try {
        const saved = JSON.parse(localStorage.getItem(INTERVIEW_STORAGE_KEY) || '{}');
        interviews = Array.isArray(saved?.interviews) ? saved.interviews : [];
      } catch {
        interviews = [];
      }

      let readIds: string[] = [];
      try {
        const savedReadIds = JSON.parse(localStorage.getItem(NOTIFICATION_READ_STORAGE_KEY) || '[]');
        if (Array.isArray(savedReadIds)) readIds = savedReadIds.map(String);
      } catch {
        readIds = [];
      }
      setReadNotificationIds(new Set(readIds));

      const now = Date.now();
      const notifications: InterviewNotification[] = [];
      interviews.forEach((interview: any) => {
        if (String(interview?.status || '').toLowerCase() !== 'scheduled') return;
        const start = new Date(interview.startAt);
        const startTime = start.getTime();
        if (!Number.isFinite(startTime)) return;

        const candidateName = String(interview.candidateName || 'Candidate');
        const roleAndRound = [interview.role, interview.round].filter(Boolean).join(' · ');
        const time = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        const interviewId = String(interview.id || `${interview.candidateId || candidateName}-${interview.startAt}`);
        const todayId = `today:${interviewId}:${start.toLocaleDateString()}`;
        const isToday = start.toDateString() === new Date(now).toDateString();

        if (isToday) {
          notifications.push({
            id: todayId,
            interviewId,
            kind: 'today',
            title: 'Interview scheduled today',
            description: [candidateName, roleAndRound].filter(Boolean).join(' · '),
            timeLabel: `Today at ${time}`,
            startAt: interview.startAt,
          });
        }

        if (startTime > now && startTime - now <= 60 * 60 * 1000) {
          const minutesRemaining = Math.max(1, Math.ceil((startTime - now) / 60_000));
          notifications.push({
            id: `reminder:${interviewId}`,
            interviewId,
            kind: 'reminder',
            title: 'Interview reminder',
            description: `${candidateName}${roleAndRound ? ` · ${roleAndRound}` : ''} starts in ${minutesRemaining >= 60 ? '1 hour' : `${minutesRemaining} min`}`,
            timeLabel: `Starts at ${time}`,
            startAt: interview.startAt,
          });
        }
      });

      notifications.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime() || (a.kind === 'reminder' ? -1 : 1));
      setInterviewNotifications(notifications);
    };

    refreshNotifications();
    const poll = window.setInterval(refreshNotifications, 30_000);
    window.addEventListener('storage', refreshNotifications);
    window.addEventListener('tasknera:interviews-updated', refreshNotifications);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener('storage', refreshNotifications);
      window.removeEventListener('tasknera:interviews-updated', refreshNotifications);
    };
  }, []);

  useEffect(() => {
    if (!notificationsOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!notificationPanelRef.current?.contains(event.target as Node)) setNotificationsOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [notificationsOpen]);

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
    const basePath = href.split('?')[0];
    const query = href.includes('?') ? href.split('?')[1] : null;

    if (query) {
      if (pathname === basePath) {
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const [qKey, qVal] = query.split('=');
          if (params.get(qKey) === qVal) return true;
        }
      }
      return false;
    }

    if (pathname === basePath) return true;
    if (basePath !== '/' && basePath !== '/dashboard' && pathname.startsWith(basePath + '/')) {
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

  const unreadNotificationCount = interviewNotifications.filter(notification => !readNotificationIds.has(notification.id)).length;

  const markNotificationsRead = () => {
    const nextReadIds = new Set(readNotificationIds);
    interviewNotifications.forEach(notification => nextReadIds.add(notification.id));
    setReadNotificationIds(nextReadIds);
    try {
      localStorage.setItem(NOTIFICATION_READ_STORAGE_KEY, JSON.stringify(Array.from(nextReadIds)));
    } catch {}
  };

  // ───────────────────────────────────────────────────────────────────────────
  // HIRE IQ Navigation Groups (Proposed Structure)
  // ───────────────────────────────────────────────────────────────────────────
  interface SidebarNavItem {
    label: string;
    href: string;
    badge?: string;
    icon: React.ReactNode;
  }

  const recruitmentWorkspaceItems: SidebarNavItem[] = [
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
      label: 'Jobs & Requisitions',
      href: '/jobs',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="2" y="7" width="20" height="14" rx="2" strokeWidth={2} />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
        </svg>
      ),
    },
    {
      label: 'Candidate Database',
      href: '/candidates',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      label: 'AI Evaluations',
      href: '/evaluations',
      badge: 'AI',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
    },
    {
      label: 'Recruitment Pipeline',
      href: '/pipeline',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3.5" y="4" width="17" height="16" rx="1.5" strokeWidth={2} />
          <path d="M9 4.5v15M15 4.5v15" strokeWidth={2} strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: 'Interviews',
      href: '/interviews',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3.5" y="5" width="17" height="16" rx="2" strokeWidth={2} />
          <path d="M7.5 3.5v3M16.5 3.5v3M3.5 9h17M8 13h2m4 0h2m-8 4h2" strokeWidth={2} strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: 'Talent Pool',
      href: '/candidates?view=talent-pool',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      ),
    },
    {
      label: 'Clients',
      href: '/clients',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
  ];

  const analyticsAutomationItems: SidebarNavItem[] = [
    {
      label: 'Analytics & Reports',
      href: '/reports',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 3.5h7l5 5v12A1.5 1.5 0 0117.5 22h-11A1.5 1.5 0 015 20.5v-15A2 2 0 017 3.5zM14 3.5v5h5M8.5 13h7M8.5 16.5h7" />
        </svg>
      ),
    },
    {
      label: 'AI Recruitment Assistant',
      href: '/evaluations?assistant=open',
      badge: 'AI',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      ),
    },
    {
      label: 'Automation Centre',
      href: '/pipeline?automation=open',
      badge: 'Auto',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
  ];

  const administrationItems: SidebarNavItem[] = [
    {
      label: 'Team Management',
      href: isSuperAdmin ? '/super-admin' : '/admin',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      label: 'Subscription & Billing',
      href: isSuperAdmin ? '/super-admin?tab=subscription' : '/admin?view=subscription',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="2" y="5" width="20" height="14" rx="2" strokeWidth={2} />
          <line x1="2" y1="10" x2="22" y2="10" strokeWidth={2} />
        </svg>
      ),
    },
    {
      label: 'Security & Audit Logs',
      href: isSuperAdmin ? '/super-admin?tab=audit' : '/admin?tab=audit',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
    {
      label: 'Settings',
      href: '/settings',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  // Helper to render collapsible dropdown section items
  const renderNavSection = (title: string, items: SidebarNavItem[]) => {
    const isOpen = openSections[title] ?? true;
    const hasActiveItem = items.some(item => active(item.href));

    return (
      <div className="space-y-1">
        {/* Collapsible Dropdown Header */}
        <button
          type="button"
          onClick={() => toggleSection(title)}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors group cursor-pointer text-left"
          aria-expanded={isOpen}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-[9.5px] font-extrabold tracking-wider uppercase transition-colors truncate ${
              hasActiveItem ? 'text-[#FF5A36]' : 'text-slate-400/90 group-hover:text-slate-200'
            }`}>
              {title}
            </span>
            <span className="text-[9px] font-bold text-slate-500 bg-slate-800/90 px-1.5 py-0.2 rounded-md border border-slate-700/60 shrink-0">
              {items.length}
            </span>
          </div>
          <svg
            className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 transition-transform duration-200 shrink-0 ${
              isOpen ? 'rotate-180 text-slate-200' : 'rotate-0'
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown Items (Collapsible) */}
        {isOpen && (
          <div className="space-y-0.5 pt-0.5">
            {items.map(item => {
              const isItemActive = active(item.href);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                    isItemActive
                      ? 'border border-[#FF5A36] bg-[#1E293B] text-white shadow-xs font-semibold'
                      : 'border border-transparent text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`transition-colors ${isItemActive ? 'text-[#FF5A36]' : 'text-slate-400 group-hover:text-slate-200'}`}>
                      {item.icon}
                    </div>
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                      isItemActive
                        ? 'bg-[#FF5A36]/20 text-[#FF5A36] border border-[#FF5A36]/30'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Clean Sidebar Component (HIRE IQ Proposed Structure)
  // ───────────────────────────────────────────────────────────────────────────
  const SidebarContent = () => (
    <div
      className="flex flex-col h-full bg-[#0F172A] text-slate-300 font-sans select-none overflow-y-auto"
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor: '#334155 #0F172A',
      }}
    >
      {/* Brand Header */}
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#FF5722] text-white font-black text-base flex items-center justify-center shadow-md flex-shrink-0">
            H
          </div>
          <div className="min-w-0">
            <span className="text-white font-black text-base tracking-tight block leading-tight">HIRE IQ</span>
            <span className="text-[8px] uppercase tracking-[0.2em] font-semibold text-slate-400 block mt-0.5">
              RECRUITMENT INTELLIGENCE
            </span>
          </div>
        </div>
        <span className="rounded-full bg-[#FF5722]/15 px-2 py-0.5 text-[10px] font-bold text-[#FF5722] border border-[#FF5722]/25 tracking-wide shrink-0">
          Proposed
        </span>
      </div>

      {/* Workspace Indicator */}
      <div className="mx-3.5 mb-3 px-3 py-2 rounded-xl bg-[#182238] border border-slate-700/60">
        <div suppressHydrationWarning className="text-xs font-semibold text-white truncate">
          {(user as any)?.organizationName || 'TaskNera Demo Workspace'}
        </div>
        <div suppressHydrationWarning className="text-[9px] uppercase font-bold text-slate-400 tracking-wider mt-0.5">
          {isSuperAdmin ? 'SUPER ADMIN' : isClientAdmin ? 'ORG ADMIN' : 'RECRUITER'}
        </div>
      </div>

      {/* Navigation Groups */}
      <div className="px-3 space-y-4 flex-1 pb-4">
        {renderNavSection('RECRUITMENT WORKSPACE', recruitmentWorkspaceItems)}
        {renderNavSection('ANALYTICS & AUTOMATION', analyticsAutomationItems)}
        {renderNavSection('ADMINISTRATION', administrationItems)}
      </div>

      {/* Profile & Logout Pinned to Bottom */}
      <div className="mt-auto p-3.5 border-t border-slate-800/90 bg-[#0B132B] shrink-0">
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
            <div suppressHydrationWarning className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-white font-bold text-xs flex items-center justify-center flex-shrink-0 group-hover:border-[#FF5A36] transition-colors">
              {getInitials(user?.name, user?.email)}
            </div>
            <div className="min-w-0 flex-1">
              <span suppressHydrationWarning className="text-xs font-semibold text-white block truncate leading-tight group-hover:text-[#FF5A36] transition-colors">
                {user?.name || user?.email?.split('@')[0] || 'User Profile'}
              </span>
              <span suppressHydrationWarning className="text-[10px] text-slate-400 block truncate mt-0.5">
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
          <div className="relative" ref={notificationPanelRef}>
            <button
              type="button"
              onClick={() => setNotificationsOpen(open => !open)}
              aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ''}`}
              aria-haspopup="dialog"
              aria-expanded={notificationsOpen}
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M18 8a6 6 0 00-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
              </svg>
              {unreadNotificationCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[9px] font-bold leading-none text-white">
                  {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                </span>
              )}
            </button>

            {notificationsOpen && (
              <div role="dialog" aria-label="Notifications" className="absolute right-0 top-full z-[160] mt-3 w-[min(420px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900">Notifications</h2>
                    {unreadNotificationCount > 0 && <span className="rounded-full bg-[#EEE8FF] px-2 py-0.5 text-[10px] font-bold text-[#5436C8]">{unreadNotificationCount} new</span>}
                  </div>
                  {unreadNotificationCount > 0 && (
                    <button type="button" onClick={markNotificationsRead} className="shrink-0 text-[11px] font-semibold text-[#5436C8] transition hover:text-[#39239E]">
                      ✓ Mark all read
                    </button>
                  )}
                </div>

                <div className="max-h-[min(60vh,420px)] overflow-y-auto">
                  {interviewNotifications.length === 0 ? (
                    <div className="px-5 py-10 text-center">
                      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M18 8a6 6 0 00-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
                      </div>
                      <p className="text-xs font-semibold text-slate-700">No interview reminders right now</p>
                      <p className="mt-1 text-[11px] text-slate-400">Today&apos;s interviews and one-hour reminders will appear here.</p>
                    </div>
                  ) : interviewNotifications.map(notification => {
                    const isRead = readNotificationIds.has(notification.id);
                    return (
                      <div key={notification.id} className={`flex gap-3 border-b border-slate-100 px-4 py-3.5 last:border-b-0 ${isRead ? 'bg-white' : 'bg-[#FCFBFF]'}`}>
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F7F2FB] text-[#62347B]">
                          {notification.kind === 'reminder' ? (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="8.5" strokeWidth="1.8" /><path strokeLinecap="round" strokeWidth="1.8" d="M12 7v5l3 2" /></svg>
                          ) : (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="3.5" y="5" width="17" height="16" rx="2" strokeWidth="1.8" /><path strokeLinecap="round" strokeWidth="1.8" d="M7.5 3.5v3M16.5 3.5v3M3.5 9h17M8 13h2m4 0h2" /></svg>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-bold leading-5 text-slate-800">{notification.title}</p>
                            {!isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#5436C8]" aria-label="Unread" />}
                          </div>
                          <p className="mt-0.5 text-[11px] leading-[1.45] text-slate-500">{notification.description}</p>
                          <p className="mt-1 text-[10px] font-medium text-slate-400">{notification.timeLabel}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Link href="/interviews" onClick={() => setNotificationsOpen(false)} className="flex items-center justify-center gap-1 border-t border-slate-100 px-4 py-3 text-xs font-bold text-[#5436C8] transition hover:bg-slate-50">
                  View interviews <span aria-hidden="true">›</span>
                </Link>
              </div>
            )}
          </div>
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
export { Header };
