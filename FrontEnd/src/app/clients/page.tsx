'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useAuth } from '@/context/AuthContext';
import { atsStore, JobItem } from '@/lib/atsStore';

interface SharedClientLink {
  id: string;
  clientName: string;
  contactName?: string;
  clientEmail?: string;
  clientPhone?: string;
  welcomeNote?: string;
  token: string;
  shareUrl: string;
  expiresAt: string;
  createdAt: string;
  views: number;
  assignedMember?: string;
  assignedMemberRole?: string;
  assignedAt?: string;
}

export interface TeamMemberOption {
  id: string;
  name: string;
  email?: string;
  role: string;
  team?: string;
}

const formatMemberRole = (role?: string, customRole?: string, team?: string): string => {
  if (customRole && customRole !== 'General' && customRole !== 'MEMBER') return customRole;
  const r = String(role || '').toUpperCase().trim();
  if (r === 'CLIENT_ADMIN' || r === 'ADMIN') return 'Account Administrator';
  if (r === 'SUPER_ADMIN') return 'Executive Leadership';
  if (r === 'RECRUITER' || r === 'RECRUITER_MEMBER') return 'Technical Recruiter';
  if (r === 'TEAM_LEAD') return 'Team Lead';
  if (r === 'MEMBER') return 'Talent Partner';
  if (team && team !== 'General') return team;
  return 'Recruitment Partner';
};

const isDummyMember = (name?: string, email?: string): boolean => {
  const n = String(name || '').toLowerCase().trim();
  const e = String(email || '').toLowerCase().trim();
  const dummyList = [
    'sarah jenkins',
    'alex rivera',
    'david kim',
    'elena rostova',
    'marcus vance',
    'priya sharma',
    'sarah mitchell',
    'david park',
    'alex chen',
    'john doe',
    'elena r',
    'marcus v',
    'michael chen',
    'james wilson'
  ];
  if (dummyList.includes(n)) return true;
  if (e === 'admin@gmail.com' || e === 'operations@tasknera.com') return true;
  if (n.includes('harsh') || e.includes('harsh') || n.includes('aditya') || e.includes('aditya')) return true;
  return false;
};

const CLIENT_SHARES_STORAGE_KEY = 'tasknera_client_portal_shares_v1';

export default function ClientsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [cachedRole, setCachedRole] = useState<string | null>(null);
  const [cachedEmail, setCachedEmail] = useState<string | null>(null);
  const [isClientLoaded, setIsClientLoaded] = useState(false);

  // Share Link Modal State
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [clientCompanyName, setClientCompanyName] = useState('');
  const [contactPersonName, setContactPersonName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [welcomeNote, setWelcomeNote] = useState('');
  const [expirationDays, setExpirationDays] = useState(14);
  const [defaultAssignMember, setDefaultAssignMember] = useState('');
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [sharedLinks, setSharedLinks] = useState<SharedClientLink[]>([]);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Assign JD to Team Member Modal State
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([]);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [activeAssignLink, setActiveAssignLink] = useState<SharedClientLink | null>(null);
  const [selectedAssignMember, setSelectedAssignMember] = useState<string>('');
  const [selectedAssignRole, setSelectedAssignRole] = useState<string>('');
  const [isCustomMember, setIsCustomMember] = useState(false);
  const [customMemberName, setCustomMemberName] = useState('');
  const [customMemberRole, setCustomMemberRole] = useState('Technical Recruiter');
  const [selectedJobScope, setSelectedJobScope] = useState<'ALL' | string>('ALL');
  const [assignmentNote, setAssignmentNote] = useState('');

  // View Uploaded JDs Modal State
  const [viewJdModalOpen, setViewJdModalOpen] = useState(false);
  const [activeViewJdLink, setActiveViewJdLink] = useState<SharedClientLink | null>(null);
  const [selectedJdDetailIndex, setSelectedJdDetailIndex] = useState(0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCachedRole(localStorage.getItem('tasknera_role'));
      setCachedEmail(localStorage.getItem('tasknera_email'));
      setIsClientLoaded(true);
    }
  }, []);

  const currentRole = user?.role || cachedRole || '';
  const currentEmail = (user?.email || cachedEmail || '').toLowerCase().trim();
  const isSuperAdmin = currentRole === 'SUPER_ADMIN' || currentEmail === 'operations@tasknera.com' || currentEmail === 'admin@gmail.com';
  const isClientAdmin = currentRole === 'CLIENT_ADMIN' || currentRole === 'ADMIN';
  const isAdmin = isSuperAdmin || isClientAdmin;

  useEffect(() => {
    if (isClientLoaded && !authLoading && !isAdmin) {
      router.replace('/dashboard');
    }
  }, [isClientLoaded, authLoading, isAdmin, router]);

  useEffect(() => {
    // Load jobs from ATS Store
    const loadedJobs = atsStore.getJobs();
    setJobs(loadedJobs);

    // Load client share links from localStorage
    try {
      const stored = localStorage.getItem(CLIENT_SHARES_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setSharedLinks(parsed);
        }
      }
    } catch {
      // ignore
    }

    // Load genuine organization team members from backend database and atsStore
    const memberMap = new Map<string, TeamMemberOption>();

    // 1. Load real recruiters from atsStore (strictly non-dummy)
    const atsRecruiters = atsStore.getRecruiters();
    atsRecruiters.forEach(r => {
      if (!isDummyMember(r.name, r.email) && r.name?.trim()) {
        memberMap.set(r.name.toLowerCase().trim(), {
          id: r.id,
          name: r.name.trim(),
          email: r.email,
          role: formatMemberRole(r.role, r.customRole || r.displayRole, r.team),
          team: r.team && r.team !== 'General' ? r.team : undefined
        });
      }
    });

    // 2. Fetch live users belonging to the current organization from backend
    const fetchRealOrganizationUsers = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
        const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

        // Fetch /users (organization users: client admin, recruiters, members)
        try {
          const usersRes = await fetch(`${backendUrl}/users`, { headers });
          if (usersRes.ok) {
            const data = await usersRes.json();
            if (Array.isArray(data.users)) {
              data.users.forEach((u: any) => {
                if (isDummyMember(u.name, u.email)) return;
                const name = String(u.name || '').trim();
                if (name) {
                  memberMap.set(name.toLowerCase(), {
                    id: u.id,
                    name: name,
                    email: u.email,
                    role: formatMemberRole(u.role, u.customRole, u.team),
                    team: u.team && u.team !== 'General' ? u.team : undefined
                  });
                }
              });
            }
          }
        } catch (_) {}

        // Fetch /users/ta-members (TA recruiters & members)
        try {
          const taRes = await fetch(`${backendUrl}/users/ta-members`, { headers });
          if (taRes.ok) {
            const data = await taRes.json();
            if (Array.isArray(data.members)) {
              data.members.forEach((m: any) => {
                if (isDummyMember(m.name, m.email)) return;
                const name = String(m.name || '').trim();
                if (name && !memberMap.has(name.toLowerCase())) {
                  memberMap.set(name.toLowerCase(), {
                    id: m.id,
                    name: name,
                    email: m.email,
                    role: formatMemberRole(m.role, m.customRole || m.displayRole, m.team),
                    team: m.team && m.team !== 'General' ? m.team : undefined
                  });
                }
              });
            }
          }
        } catch (_) {}

        // 3. Ensure current authenticated user is included
        const currentName = user?.name || (typeof window !== 'undefined' ? localStorage.getItem('tasknera_name') : null);
        const currentEmail = user?.email || (typeof window !== 'undefined' ? localStorage.getItem('tasknera_email') : null);
        if (currentName && !isDummyMember(currentName, currentEmail || undefined)) {
          const cleanName = currentName.trim();
          if (!memberMap.has(cleanName.toLowerCase())) {
            memberMap.set(cleanName.toLowerCase(), {
              id: user?.id || 'current-user',
              name: cleanName,
              email: currentEmail || undefined,
              role: formatMemberRole(user?.role || cachedRole || 'CLIENT_ADMIN'),
              team: undefined
            });
          }
        }

        setTeamMembers(Array.from(memberMap.values()));
      } catch (err) {
        console.warn('Failed to load organization members:', err);
        setTeamMembers(Array.from(memberMap.values()));
      }
    };

    fetchRealOrganizationUsers();
  }, [user, cachedRole]);

  // Derives unique client names from shared links and existing ATS jobs
  const availableClientNames = useMemo(() => {
    const set = new Set<string>();
    sharedLinks.forEach(l => {
      if (l.clientName?.trim()) set.add(l.clientName.trim());
    });
    jobs.forEach(j => {
      if (j.client?.trim()) set.add(j.client.trim());
    });
    return Array.from(set);
  }, [sharedLinks, jobs]);

  // Aggregate client account cards from existing jobs
  const clientAccounts = useMemo(() => {
    const map = new Map<string, { name: string; jobsCount: number; jobTitles: string[] }>();
    jobs.forEach(j => {
      const client = j.client?.trim() || 'General Client';
      if (!map.has(client)) {
        map.set(client, { name: client, jobsCount: 0, jobTitles: [] });
      }
      const entry = map.get(client)!;
      entry.jobsCount += 1;
      if (j.title && !entry.jobTitles.includes(j.title)) {
        entry.jobTitles.push(j.title);
      }
    });
    return Array.from(map.values());
  }, [jobs]);

  // Counts JDs uploaded by this client (from local storage or jobs pool)
  const getClientUploadedJdsCount = (clientName: string) => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(`tasknera_client_jds_${clientName.replace(/\s+/g, '_')}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed.length;
        }
      } catch {}
    }
    return jobs.filter(j => j.client?.toLowerCase().trim() === clientName.toLowerCase().trim()).length;
  };

  interface ClientJdItem {
    id: string;
    title: string;
    assignedRecruiter?: string;
    description?: string;
    location?: string;
    mode?: string;
    salary?: string;
    createdAt?: string;
    status?: string;
    mandatoryRequirementsCount?: number;
  }

  // Helper to retrieve detailed uploaded JDs for a client
  const getClientUploadedJds = (clientName: string): ClientJdItem[] => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(`tasknera_client_jds_${clientName.replace(/\s+/g, '_')}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map((item: any, idx: number) => ({
              id: item.id || `jd-${idx}`,
              title: item.title || item.name || 'Job Requisition',
              assignedRecruiter: item.assignedRecruiter,
              description: item.description,
              location: item.location || 'Remote',
              mode: item.workMode || item.mode || 'Hybrid',
              salary: item.salary || 'Competitive',
              createdAt: item.createdAt || 'Recently',
              status: item.status || 'Active Screening',
              mandatoryRequirementsCount: item.mandatoryRequirementsCount || 3
            }));
          }
        }
      } catch {}
    }
    return jobs
      .filter(j => j.client?.toLowerCase().trim() === clientName.toLowerCase().trim())
      .map(j => ({
        id: j.id,
        title: j.title,
        assignedRecruiter: j.assignedRecruiter,
        description: j.description,
        location: j.location,
        mode: j.mode,
        salary: j.salary,
        createdAt: 'In ATS',
        status: j.status,
        mandatoryRequirementsCount: j.mandatoryRequirementsCount
      }));
  };

  const handleOpenJdViewer = (link: SharedClientLink) => {
    setActiveViewJdLink(link);
    setSelectedJdDetailIndex(0);
    setViewJdModalOpen(true);
  };

  // Helper to determine who is assigned to this client's JDs
  const getAssignedMemberForClient = (link: SharedClientLink): { name: string; role?: string } | null => {
    if (link.assignedMember) {
      return { name: link.assignedMember, role: link.assignedMemberRole };
    }
    const clientJobs = getClientUploadedJds(link.clientName);
    const withRecruiter = clientJobs.find(j => j.assignedRecruiter && j.assignedRecruiter !== 'Agency Delivery Team');
    if (withRecruiter?.assignedRecruiter) {
      return { name: withRecruiter.assignedRecruiter };
    }
    return null;
  };

  const handleOpenAssignModal = (link: SharedClientLink) => {
    setActiveAssignLink(link);
    const current = getAssignedMemberForClient(link);
    if (current?.name) {
      const matchInList = teamMembers.find(m => m.name.toLowerCase() === current.name.toLowerCase());
      if (matchInList) {
        setIsCustomMember(false);
        setSelectedAssignMember(matchInList.name);
        setSelectedAssignRole(matchInList.role);
      } else {
        setIsCustomMember(true);
        setCustomMemberName(current.name);
        setCustomMemberRole(current.role || 'Technical Recruiter');
      }
    } else {
      setIsCustomMember(false);
      setSelectedAssignMember(teamMembers[0]?.name || '');
      setSelectedAssignRole(teamMembers[0]?.role || 'Talent Partner');
    }
    setSelectedJobScope('ALL');
    setAssignmentNote('');
    setAssignModalOpen(true);
  };

  const handleConfirmAssignment = () => {
    if (!activeAssignLink) return;

    const targetMember = isCustomMember ? customMemberName.trim() : selectedAssignMember.trim();
    if (!targetMember) {
      showToast('Please select or enter a team member');
      return;
    }

    const targetRole = isCustomMember ? (customMemberRole.trim() || 'Technical Recruiter') : (selectedAssignRole.trim() || 'Talent Acquisition Lead');
    const clientName = activeAssignLink.clientName;
    const adminName = user?.name || cachedEmail?.split('@')[0] || 'Administrator';

    // 1. Update shared links in state & localStorage
    const updatedLinks = sharedLinks.map(l => {
      if (l.id === activeAssignLink.id || l.clientName.toLowerCase().trim() === clientName.toLowerCase().trim()) {
        return {
          ...l,
          assignedMember: targetMember,
          assignedMemberRole: targetRole,
          assignedAt: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        };
      }
      return l;
    });
    setSharedLinks(updatedLinks);
    try {
      localStorage.setItem(CLIENT_SHARES_STORAGE_KEY, JSON.stringify(updatedLinks));
    } catch {}

    // 2. Reassign matching jobs in atsStore
    const matchingJobs = atsStore.getJobs().filter(
      j => j.client?.toLowerCase().trim() === clientName.toLowerCase().trim()
    );
    matchingJobs.forEach(job => {
      if (selectedJobScope === 'ALL' || job.id === selectedJobScope) {
        atsStore.reassignJob(job.id, targetMember, adminName);
      }
    });

    // 3. Update tasknera_client_jds_${clientName} in localStorage
    if (typeof window !== 'undefined') {
      try {
        const storageKey = `tasknera_client_jds_${clientName.replace(/\s+/g, '_')}`;
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const updatedClientJds = parsed.map((item: any) => {
              if (selectedJobScope === 'ALL' || item.id === selectedJobScope) {
                return { ...item, assignedRecruiter: targetMember, assignedMemberRole: targetRole };
              }
              return item;
            });
            localStorage.setItem(storageKey, JSON.stringify(updatedClientJds));
          }
        }
      } catch {}
    }

    // 4. Log transparency activity in tasknera_portal_activities_${clientName}
    if (typeof window !== 'undefined') {
      try {
        const actStorageKey = `tasknera_portal_activities_${clientName.replace(/\s+/g, '_')}`;
        const rawActs = localStorage.getItem(actStorageKey);
        const parsedActs = rawActs ? JSON.parse(rawActs) : [];
        const newAct = {
          id: `act-assign-${Date.now()}`,
          title: `Requisition Assigned to ${targetMember}`,
          detail: `Client Job Description(s) assigned to ${targetMember} (${targetRole}) for deterministic sourcing and candidate screening.${assignmentNote.trim() ? ` Note: "${assignmentNote.trim()}"` : ''}`,
          actor: adminName,
          actorRole: 'ADMIN',
          timestamp: 'Just now',
          badge: 'Assigned'
        };
        localStorage.setItem(actStorageKey, JSON.stringify([newAct, ...(Array.isArray(parsedActs) ? parsedActs : [])]));
      } catch {}
    }

    // 5. Ensure member is registered in atsStore
    atsStore.ensureMember({
      name: targetMember,
      email: `${targetMember.toLowerCase().replace(/\s+/g, '.')}@hireiq.internal`,
      role: 'RECRUITER_MEMBER',
      customRole: targetRole
    } as any);

    // 6. Refresh jobs and show toast
    setJobs(atsStore.getJobs());
    setAssignModalOpen(false);
    showToast(`✓ Assigned JDs for ${clientName} to ${targetMember}`);
  };

  const handleOpenShareModal = (clientName?: string) => {
    if (clientName) {
      setClientCompanyName(clientName);
    } else if (availableClientNames.length > 0 && !clientCompanyName) {
      setClientCompanyName(availableClientNames[0]);
    }
    setContactPersonName('');
    setClientEmail('');
    setClientPhone('');
    setWelcomeNote('');
    setDefaultAssignMember('');
    setGeneratedLink(null);
    setCopiedLink(false);
    setShareModalOpen(true);
  };

  const handleGenerateShareLink = () => {
    const targetCompany = clientCompanyName.trim();
    if (!targetCompany) {
      showToast('Please enter the client company name');
      return;
    }

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const token = `cli-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    
    // Construct direct URL with client name and contact parameters
    const queryParams = new URLSearchParams();
    queryParams.set('client', targetCompany);
    if (contactPersonName.trim()) {
      queryParams.set('contact', contactPersonName.trim());
    }
    const fullUrl = `${origin}/share/${token}?${queryParams.toString()}`;
    
    let expiryLabel = 'Never';
    if (expirationDays > 0) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + expirationDays);
      expiryLabel = expiryDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    const matchedMember = defaultAssignMember.trim() ? teamMembers.find(m => m.name === defaultAssignMember.trim()) : null;

    const newShare: SharedClientLink = {
      id: `share-${Date.now()}`,
      clientName: targetCompany,
      contactName: contactPersonName.trim() || undefined,
      clientEmail: clientEmail.trim() || undefined,
      clientPhone: clientPhone.trim() || undefined,
      welcomeNote: welcomeNote.trim() || undefined,
      token,
      shareUrl: fullUrl,
      expiresAt: expiryLabel,
      createdAt: 'Just now',
      views: 0,
      assignedMember: defaultAssignMember.trim() || undefined,
      assignedMemberRole: matchedMember?.role || undefined,
      assignedAt: defaultAssignMember.trim() ? new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : undefined,
    };

    const updated = [newShare, ...sharedLinks];
    setSharedLinks(updated);
    setGeneratedLink(fullUrl);

    try {
      localStorage.setItem(CLIENT_SHARES_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }

    // If pre-assigned, cascade to any existing client jobs
    if (defaultAssignMember.trim()) {
      const adminName = user?.name || cachedEmail?.split('@')[0] || 'Administrator';
      const matchingJobs = atsStore.getJobs().filter(
        j => j.client?.toLowerCase().trim() === targetCompany.toLowerCase().trim()
      );
      matchingJobs.forEach(job => {
        atsStore.reassignJob(job.id, defaultAssignMember.trim(), adminName);
      });
      setJobs(atsStore.getJobs());
    }

    showToast('Client JD upload link generated successfully!');
  };

  const handleDeleteShare = (id: string, name: string) => {
    const updated = sharedLinks.filter(l => l.id !== id);
    setSharedLinks(updated);
    try {
      localStorage.setItem(CLIENT_SHARES_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
    showToast(`Revoked portal link for ${name}`);
  };

  const handleCopyLink = (url: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setCopiedLink(true);
      showToast('✓ Link copied to clipboard!');
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Non-admin Access Restriction Guard
  if (isClientLoaded && !authLoading && !isAdmin) {
    return (
      <div className="min-h-screen bg-[#F7F8FC] flex flex-col justify-between">
        <Header />
        <main className="flex-1 flex items-center justify-center p-6 pt-28 pb-16">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-[#EAECF0] p-8 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-100">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m11-3.5a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-[#101828] mb-2">Administrator Access Required</h2>
            <p className="text-sm text-[#667085] mb-6">
              The Client Portals section is restricted to administrators. Only administrative accounts can generate and manage client transparency links.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-[#3563E9] hover:bg-[#2851D6] text-white text-xs font-bold rounded-xl transition-colors shadow-sm cursor-pointer"
            >
              Return to Dashboard
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8FC] text-[#182230] flex flex-col selection:bg-[#EFF4FF] selection:text-[#3563E9]">
      <Header />
      <main className="max-w-screen-xl mx-auto px-6 pt-24 pb-16 flex-1 w-full">

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#EFF4FF] border border-[#D1E0FF] rounded-full text-xs font-bold text-[#3563E9] mb-2">
              <span className="w-2 h-2 rounded-full bg-[#3563E9]" />
              Client Transparency &amp; Portals
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#101828] tracking-tight">Client Portals &amp; Shared Links</h1>
            <p className="text-sm text-[#667085] mt-1">
              Create secure links for clients to upload their Job Descriptions (JDs), monitor agency screening progress, and review shortlisted candidates.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenShareModal()}
              className="flex items-center gap-2 px-5 py-3 bg-[#3563E9] hover:bg-[#2851D6] text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Create Client JD Upload Link</span>
            </button>
          </div>
        </div>

        {/* Enterprise KPI Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
          <div className="bg-white border border-[#EAECF0] rounded-2xl p-5 shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-[#667085] block mb-2">Active Client Portals</span>
            <div className="text-3xl font-extrabold text-[#101828]">{sharedLinks.length}</div>
            <p className="text-xs text-[#667085] mt-1">Dedicated links created for clients</p>
          </div>

          <div className="bg-white border border-[#EAECF0] rounded-2xl p-5 shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-[#667085] block mb-2">Client Accounts</span>
            <div className="text-3xl font-extrabold text-[#101828]">{clientAccounts.length}</div>
            <p className="text-xs text-[#667085] mt-1">Active hiring accounts in HireIQ</p>
          </div>

          <div className="bg-white border border-[#EAECF0] rounded-2xl p-5 shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-[#667085] block mb-2">Connected Requisitions</span>
            <div className="text-3xl font-extrabold text-[#101828]">{jobs.length}</div>
            <p className="text-xs text-[#667085] mt-1">Open positions connected to clients</p>
          </div>
        </div>

        {/* Active Client Portals Section */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-[#101828]">Active Shared Client Portals</h2>
              <p className="text-xs text-[#667085]">Live links shared with client hiring managers for real-time JD submission and candidate review</p>
            </div>
          </div>

          {sharedLinks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {sharedLinks.map(link => {
                const uploadedCount = getClientUploadedJdsCount(link.clientName);
                const assignedInfo = getAssignedMemberForClient(link);

                return (
                  <div
                    key={link.id}
                    className="bg-white border border-[#EAECF0] hover:border-[#3563E9]/40 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <a
                            href={link.shareUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#101828] hover:text-[#3563E9] font-bold text-base transition-colors inline-flex items-center gap-1.5 group cursor-pointer"
                            title="Click to open client portal in new tab"
                          >
                            <span>{link.clientName}</span>
                            <svg className="w-3.5 h-3.5 text-[#3563E9] opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                          {link.contactName && (
                            <p className="text-xs text-[#3563E9] font-semibold mt-0.5">
                              Contact: {link.contactName}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Active Link
                          </span>
                          <button
                            type="button"
                            title="Revoke Link"
                            onClick={() => handleDeleteShare(link.id, link.clientName)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 space-y-1.5 text-xs text-[#667085]">
                        <div className="flex items-center justify-between">
                          <span>JDs Uploaded:</span>
                          <button
                            type="button"
                            onClick={() => handleOpenJdViewer(link)}
                            className="font-bold text-[#3563E9] hover:text-[#2851D6] hover:underline cursor-pointer inline-flex items-center gap-1 transition-all group"
                            title="Click to open and view uploaded Job Description"
                          >
                            <span>{uploadedCount} Job Position{uploadedCount === 1 ? '' : 's'}</span>
                            <svg className="w-3.5 h-3.5 text-[#3563E9] group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </button>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Assigned To:</span>
                          {assignedInfo ? (
                            <button
                              type="button"
                              onClick={() => handleOpenAssignModal(link)}
                              className="font-bold text-[#101828] hover:text-[#3563E9] inline-flex items-center gap-1.5 cursor-pointer transition-colors group"
                              title="Click to reassign member"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                              <span className="truncate max-w-[145px]">{assignedInfo.name}</span>
                              <svg className="w-3 h-3 text-slate-400 group-hover:text-[#3563E9] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenAssignModal(link)}
                              className="font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded-md border border-amber-200 text-[10px] cursor-pointer transition-colors inline-flex items-center gap-1"
                              title="Click to assign team member"
                            >
                              <span>Unassigned</span>
                              <span className="text-[10px] font-bold text-amber-600">+</span>
                            </button>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Expires:</span>
                          <span className="font-medium text-[#101828]">{link.expiresAt}</span>
                        </div>
                        {link.clientEmail && (
                          <div className="flex items-center justify-between">
                            <span>Email:</span>
                            <span className="font-medium text-[#101828] truncate max-w-[170px]">{link.clientEmail}</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 p-2.5 rounded-xl bg-slate-50 border border-[#EAECF0] flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={link.shareUrl}
                          onClick={() => window.open(link.shareUrl, '_blank')}
                          title="Click to open portal in new tab"
                          className="w-full bg-transparent text-[11px] font-mono text-[#667085] hover:text-[#3563E9] outline-none select-all truncate cursor-pointer"
                        />
                        <a
                          href={link.shareUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-xs font-bold text-[#3563E9] hover:text-[#2851D6] hover:underline cursor-pointer inline-flex items-center gap-0.5"
                          title="Open link in new tab"
                        >
                          <span>Open</span>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => handleCopyLink(link.shareUrl)}
                          className="shrink-0 text-xs font-bold text-[#667085] hover:text-[#101828] hover:underline cursor-pointer"
                        >
                          Copy
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#EAECF0] flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenAssignModal(link)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EFF4FF] hover:bg-[#D1E0FF] text-[#3563E9] text-xs font-bold transition-all shadow-xs cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                        </svg>
                        <span>{assignedInfo ? 'Reassign JD' : 'Assign JD'}</span>
                      </button>

                      <div className="flex items-center gap-3">
                        <a
                          href={link.shareUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-bold text-[#667085] hover:text-[#3563E9] transition-colors cursor-pointer"
                        >
                          <span>Preview Portal</span>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>

                        {link.clientEmail && (
                          <a
                            href={`mailto:${link.clientEmail}?subject=${encodeURIComponent(`Hiring & JD Submission Portal: ${link.clientName}`)}&body=${encodeURIComponent(`Hello ${link.contactName || link.clientName},\n\nPlease use your secure link below to upload your Job Descriptions directly into our screening system:\n\n${link.shareUrl}\n\nBest regards,\nRecruitment Team`)}`}
                            className="text-xs font-semibold text-[#667085] hover:text-[#101828] cursor-pointer"
                          >
                            Send Email
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Clean Empty State */
            <div className="bg-white border border-[#EAECF0] rounded-2xl p-10 sm:p-12 text-center shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-[#EFF4FF] border border-[#D1E0FF] text-[#3563E9] flex items-center justify-center mx-auto mb-4 shadow-xs">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-[#101828] mb-1.5">No Client Portals Created Yet</h3>
              <p className="text-xs text-[#667085] max-w-md mx-auto mb-5">
                Generate a live client link to share with your clients. Clients can directly upload their JDs into HireIQ and track candidate screening with full transparency.
              </p>
              <button
                type="button"
                onClick={() => handleOpenShareModal()}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#3563E9] hover:bg-[#2851D6] text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create First Client JD Upload Link
              </button>
            </div>
          )}
        </div>

        {/* Client Accounts from ATS Requisitions */}
        {clientAccounts.length > 0 && (
          <div className="bg-white border border-[#EAECF0] rounded-2xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#EAECF0]">
              <div>
                <h3 className="text-base font-bold text-[#101828]">Existing Client Accounts ({clientAccounts.length})</h3>
                <p className="text-xs text-[#667085]">Companies with active positions or submissions in HireIQ</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {clientAccounts.map(client => (
                <div
                  key={client.name}
                  className="rounded-xl border border-[#EAECF0] bg-slate-50/60 p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-[#101828] truncate">{client.name}</h4>
                    <p className="text-[11px] text-[#667085] mt-0.5">
                      {client.jobsCount} Requisition{client.jobsCount === 1 ? '' : 's'} in ATS
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenShareModal(client.name)}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-white border border-[#EAECF0] hover:border-[#3563E9] text-[#3563E9] text-[11px] font-bold shadow-xs hover:bg-[#EFF4FF] transition-all cursor-pointer"
                  >
                    Create Link
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Create Client JD Upload Link Modal */}
        {shareModalOpen && (
          <div
            className="fixed inset-0 z-[300] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4"
            onMouseDown={e => {
              if (e.target === e.currentTarget) setShareModalOpen(false);
            }}
          >
            <div className="my-auto w-full max-w-xl rounded-2xl bg-white p-6 sm:p-7 shadow-2xl border border-[#EAECF0]">
              <div className="flex items-start justify-between border-b border-[#EAECF0] pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EFF4FF] text-[#3563E9] shadow-xs">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-[#101828]">Create Client JD Upload Link</h2>
                    <p className="text-xs text-[#667085]">
                      Enter client details to generate a link for them to upload JDs and track candidate screening
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShareModalOpen(false)}
                  className="rounded-lg p-1.5 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                >
                  ×
                </button>
              </div>

              {!generatedLink ? (
                <div className="mt-5 space-y-4">
                  {/* Row 1: Company Name & Contact Name */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#101828] mb-1.5">
                        Client Company Name <span className="text-[#3563E9]">*</span>
                      </label>
                      <input
                        list="available-clients-datalist"
                        type="text"
                        value={clientCompanyName}
                        onChange={e => setClientCompanyName(e.target.value)}
                        placeholder="e.g. Acme Corporation, Stripe, etc."
                        className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20"
                      />
                      {availableClientNames.length > 0 && (
                        <datalist id="available-clients-datalist">
                          {availableClientNames.map(name => (
                            <option key={name} value={name} />
                          ))}
                        </datalist>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#101828] mb-1.5">
                        Client Contact / Hiring Manager
                      </label>
                      <input
                        type="text"
                        value={contactPersonName}
                        onChange={e => setContactPersonName(e.target.value)}
                        placeholder="e.g. John Doe (Talent Lead)"
                        className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20"
                      />
                    </div>
                  </div>

                  {/* Row 2: Email & Phone */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#101828] mb-1.5">
                        Client Email Address <span className="text-[#667085] font-normal">(Optional - for direct email)</span>
                      </label>
                      <input
                        type="email"
                        value={clientEmail}
                        onChange={e => setClientEmail(e.target.value)}
                        placeholder="e.g. hiring.lead@client.com"
                        className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-medium text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#101828] mb-1.5">
                        Client Phone / WhatsApp <span className="text-[#667085] font-normal">(Optional)</span>
                      </label>
                      <input
                        type="tel"
                        value={clientPhone}
                        onChange={e => setClientPhone(e.target.value)}
                        placeholder="e.g. +1 (555) 019-2834"
                        className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-medium text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20"
                      />
                    </div>
                  </div>

                  {/* Row 3: Welcome Note / Submission Instructions */}
                  <div>
                    <label className="block text-xs font-bold text-[#101828] mb-1.5">
                      Instructions / Welcome Note for Client <span className="text-[#667085] font-normal">(Optional)</span>
                    </label>
                    <textarea
                      rows={2}
                      value={welcomeNote}
                      onChange={e => setWelcomeNote(e.target.value)}
                      placeholder="e.g. Please upload your open role descriptions here. Our agency team will begin screening matching candidates immediately."
                      className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-medium text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20 resize-none"
                    />
                  </div>

                  {/* Row 4: Assign to Organization Team Member */}
                  <div>
                    <label className="block text-xs font-bold text-[#101828] mb-1.5">
                      Assign Requisition Owner <span className="text-[#667085] font-normal">(Optional - Pre-assign incoming JDs)</span>
                    </label>
                    <select
                      value={defaultAssignMember}
                      onChange={e => setDefaultAssignMember(e.target.value)}
                      className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20"
                    >
                      <option value="">-- Assign Later from Client Card --</option>
                      {teamMembers.map(m => (
                        <option key={m.id} value={m.name}>
                          {m.name} • {m.role} {m.team ? `(${m.team})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Row 5: Link Expiry & Security */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#101828] mb-1.5">Link Validity</label>
                      <select
                        value={expirationDays}
                        onChange={e => setExpirationDays(Number(e.target.value))}
                        className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20"
                      >
                        <option value={14}>14 Days (Standard)</option>
                        <option value={30}>30 Days</option>
                        <option value={60}>60 Days</option>
                        <option value={90}>90 Days</option>
                        <option value={0}>No Expiration (Permanent)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#101828] mb-1.5">Access Security</label>
                      <div className="h-[38px] rounded-xl bg-slate-50 border border-[#EAECF0] px-3 flex items-center gap-1.5 text-[11px] font-semibold text-[#667085]">
                        <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <span>Token-Protected Direct Access</span>
                      </div>
                    </div>
                  </div>

                  {/* Feature Highlights */}
                  <div className="rounded-xl border border-[#D1E0FF] bg-[#EFF4FF]/60 p-3.5 space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#3563E9]">
                      What the client can do via this link:
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-[#182230]">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#15966A]" />
                        <span className="font-medium">Upload new JDs (PDF/Doc/Text)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#15966A]" />
                        <span className="font-medium">Live candidate screening status</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#15966A]" />
                        <span className="font-medium">Review &amp; Schedule interviews</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-end gap-3 border-t border-[#EAECF0] pt-4">
                    <button
                      type="button"
                      onClick={() => setShareModalOpen(false)}
                      className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-semibold text-[#182230] hover:bg-slate-200 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerateShareLink}
                      disabled={!clientCompanyName.trim()}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#3563E9] px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#2851D6] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      Generate Client JD Upload Link
                    </button>
                  </div>
                </div>
              ) : (
                /* Link Created Success View */
                <div className="mt-5 space-y-4">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                    <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                      <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      Client JD Upload Link Created for {clientCompanyName}
                    </div>
                    <p className="mt-1 text-xs text-emerald-700">
                      Share this link with {contactPersonName ? `${contactPersonName} at ` : ''}{clientCompanyName}.
                      They can immediately open this link to upload their open Job Descriptions into HireIQ and monitor screened candidate profiles in real time.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#101828] mb-1.5">Shareable Client Portal Link</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={generatedLink}
                        className="w-full rounded-xl border border-[#EAECF0] bg-slate-50 px-3.5 py-2.5 text-xs font-mono text-[#182230] select-all outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleCopyLink(generatedLink)}
                        className={`shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          copiedLink
                            ? 'bg-emerald-600 text-white'
                            : 'bg-[#3563E9] hover:bg-[#2851D6] text-white'
                        }`}
                      >
                        {copiedLink ? '✓ Copied' : 'Copy Link'}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <a
                      href={generatedLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#182230] text-xs font-bold transition-colors cursor-pointer"
                    >
                      <span>Preview Client Portal</span>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>

                    {clientEmail && (
                      <a
                        href={`mailto:${clientEmail}?subject=${encodeURIComponent(`Hiring & JD Submission Portal: ${clientCompanyName}`)}&body=${encodeURIComponent(`Hello ${contactPersonName || clientCompanyName},\n\nPlease use your secure hiring link below to upload your Job Descriptions (JDs) directly into our screening system:\n\n${generatedLink}\n\n${welcomeNote ? `${welcomeNote}\n\n` : ''}You will be able to review verified candidate profiles, screening status, and schedule interviews with complete transparency.\n\nBest regards,\nRecruitment Team`)}`}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#EAECF0] hover:bg-slate-50 text-[#182230] text-xs font-bold transition-colors cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5 text-[#3563E9]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span>Email Link to Client</span>
                      </a>
                    )}

                    {clientPhone && (
                      <a
                        href={`https://wa.me/${clientPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hello ${contactPersonName || clientCompanyName}, here is your secure hiring portal link to upload your Job Descriptions and track screened candidates: ${generatedLink}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition-colors cursor-pointer"
                      >
                        <span>Send on WhatsApp</span>
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => setGeneratedLink(null)}
                      className="ml-auto text-xs font-semibold text-[#667085] hover:text-[#101828] cursor-pointer"
                    >
                      + Create Another Link
                    </button>
                  </div>

                  <div className="flex items-center justify-end border-t border-[#EAECF0] pt-3">
                    <button
                      type="button"
                      onClick={() => setShareModalOpen(false)}
                      className="rounded-xl bg-[#101828] px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Assign JD to Organization Member Modal */}
        {assignModalOpen && activeAssignLink && (
          <div
            className="fixed inset-0 z-[300] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4"
            onMouseDown={e => {
              if (e.target === e.currentTarget) setAssignModalOpen(false);
            }}
          >
            <div className="my-auto w-full max-w-xl rounded-2xl bg-white p-6 sm:p-7 shadow-2xl border border-[#EAECF0]">
              {/* Modal Header */}
              <div className="flex items-start justify-between border-b border-[#EAECF0] pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EFF4FF] text-[#3563E9] shadow-xs">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-[#101828]">Assign Client JDs to Team Member</h2>
                    <p className="text-xs text-[#667085]">
                      Assign Job Descriptions from <span className="font-bold text-[#101828]">{activeAssignLink.clientName}</span> to a recruiter or delivery lead in your organization.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="rounded-lg p-1.5 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                >
                  ×
                </button>
              </div>

              {/* Modal Body */}
              <div className="mt-5 space-y-4">
                {/* Client & Requisition Context Box */}
                <div className="rounded-xl border border-[#EAECF0] bg-slate-50/70 p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#667085]">Client Account:</span>
                    <span className="font-bold text-[#101828]">{activeAssignLink.clientName}</span>
                  </div>
                  {activeAssignLink.contactName && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#667085]">Hiring Contact:</span>
                      <span className="font-semibold text-[#101828]">{activeAssignLink.contactName}</span>
                    </div>
                  )}
                  {(() => {
                    const clientJds = getClientUploadedJds(activeAssignLink.clientName);
                    const currentAssigned = getAssignedMemberForClient(activeAssignLink);
                    return (
                      <>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[#667085]">Current Status:</span>
                          {currentAssigned ? (
                            <span className="font-bold text-[#101828] inline-flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Assigned to {currentAssigned.name}
                            </span>
                          ) : (
                            <span className="font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[10px]">
                              Currently Unassigned
                            </span>
                          )}
                        </div>
                        <div className="pt-2 border-t border-[#EAECF0]/80">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-[#667085] mb-1">
                            Uploaded Job Descriptions ({clientJds.length}):
                          </div>
                          {clientJds.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {clientJds.map(j => (
                                <span
                                  key={j.id}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold bg-white border border-[#EAECF0] px-2.5 py-1 rounded-lg text-[#101828]"
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#3563E9]" />
                                  {j.title}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] text-[#667085] italic">
                              No JDs uploaded yet. This assignment will automatically be applied to incoming JDs submitted via this client link.
                            </p>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Team Member Selection */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-[#101828]">
                      Assign To Organization Member <span className="text-[#3563E9]">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCustomMember(!isCustomMember)}
                      className="text-[11px] font-bold text-[#3563E9] hover:underline cursor-pointer"
                    >
                      {isCustomMember ? '← Choose from Organization List' : '+ Enter Custom Member Name'}
                    </button>
                  </div>

                  {!isCustomMember ? (
                    <div className="space-y-2">
                      <select
                        value={selectedAssignMember}
                        onChange={e => {
                          const val = e.target.value;
                          setSelectedAssignMember(val);
                          const found = teamMembers.find(m => m.name === val);
                          if (found) setSelectedAssignRole(found.role);
                        }}
                        className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20"
                      >
                        <option value="" disabled>-- Select Organization Member --</option>
                        {teamMembers.length > 0 ? (
                          teamMembers.map(member => (
                            <option key={member.id} value={member.name}>
                              {member.name} — {member.role} {member.team ? `(${member.team})` : ''}
                            </option>
                          ))
                        ) : (
                          <option value="" disabled>No team members found in organization</option>
                        )}
                      </select>

                      {/* Member Details Preview */}
                      {selectedAssignMember && (() => {
                        const member = teamMembers.find(m => m.name === selectedAssignMember);
                        return member ? (
                          <div className="flex items-center gap-3 p-3 rounded-xl bg-[#EFF4FF]/60 border border-[#D1E0FF] text-xs">
                            <div className="w-9 h-9 rounded-full bg-[#3563E9] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                              {member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-[#101828] truncate">{member.name}</div>
                              <div className="text-[11px] text-[#667085] truncate">
                                {member.role} {member.team ? `• ${member.team}` : ''} {member.email ? `• ${member.email}` : ''}
                              </div>
                            </div>
                            <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-[#3563E9] border border-[#D1E0FF]">
                              Designated Owner
                            </span>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl border border-[#D1E0FF] bg-[#EFF4FF]/40">
                      <div>
                        <label className="block text-[11px] font-bold text-[#101828] mb-1">
                          Member Full Name <span className="text-[#3563E9]">*</span>
                        </label>
                        <input
                          type="text"
                          value={customMemberName}
                          onChange={e => setCustomMemberName(e.target.value)}
                          placeholder="e.g. Ashutosh, John, etc."
                          className="w-full rounded-xl border border-[#EAECF0] bg-white px-3 py-2 text-xs font-semibold text-[#182230] outline-none focus:border-[#3563E9]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[#101828] mb-1">
                          Role / Title in Organization
                        </label>
                        <input
                          type="text"
                          value={customMemberRole}
                          onChange={e => setCustomMemberRole(e.target.value)}
                          placeholder="e.g. Technical Recruiter"
                          className="w-full rounded-xl border border-[#EAECF0] bg-white px-3 py-2 text-xs font-semibold text-[#182230] outline-none focus:border-[#3563E9]"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Scope Selection */}
                {(() => {
                  const clientJds = getClientUploadedJds(activeAssignLink.clientName);
                  if (clientJds.length > 1) {
                    return (
                      <div>
                        <label className="block text-xs font-bold text-[#101828] mb-1.5">
                          Requisition Assignment Scope
                        </label>
                        <div className="grid grid-cols-1 gap-2">
                          <label className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                            selectedJobScope === 'ALL'
                              ? 'bg-[#EFF4FF] border-[#3563E9] text-[#101828]'
                              : 'bg-white border-[#EAECF0] text-[#667085] hover:bg-slate-50'
                          }`}>
                            <input
                              type="radio"
                              name="jobScope"
                              checked={selectedJobScope === 'ALL'}
                              onChange={() => setSelectedJobScope('ALL')}
                              className="text-[#3563E9]"
                            />
                            <span>All Requisitions from {activeAssignLink.clientName} ({clientJds.length} total)</span>
                          </label>

                          {clientJds.map(job => (
                            <label
                              key={job.id}
                              className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                                selectedJobScope === job.id
                                  ? 'bg-[#EFF4FF] border-[#3563E9] text-[#101828]'
                                  : 'bg-white border-[#EAECF0] text-[#667085] hover:bg-slate-50'
                              }`}
                            >
                              <input
                                type="radio"
                                name="jobScope"
                                checked={selectedJobScope === job.id}
                                onChange={() => setSelectedJobScope(job.id)}
                                className="text-[#3563E9]"
                              />
                              <span className="truncate">Only "{job.title}"</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Sourcing Instructions Note */}
                <div>
                  <label className="block text-xs font-bold text-[#101828] mb-1.5">
                    Internal Sourcing Guidelines &amp; Notes <span className="text-[#667085] font-normal">(Optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={assignmentNote}
                    onChange={e => setAssignmentNote(e.target.value)}
                    placeholder="e.g. Focus on candidates with 5+ years experience and hybrid availability. Shortlist target: 5 verified profiles."
                    className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-medium text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20 resize-none"
                  />
                </div>

                {/* Permissions & Responsibilities info */}
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-900 flex items-start gap-2">
                  <svg className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>
                    The assigned member will be registered as the requisition owner in HireIQ, manage candidate evaluations, and be visible in audit logs.
                  </span>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="mt-6 flex items-center justify-end gap-3 border-t border-[#EAECF0] pt-4">
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-semibold text-[#182230] hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAssignment}
                  disabled={isCustomMember ? !customMemberName.trim() : !selectedAssignMember.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#3563E9] px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#2851D6] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Confirm Assignment
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: View Uploaded JDs for Client */}
        {viewJdModalOpen && activeViewJdLink && (() => {
          const clientJds = getClientUploadedJds(activeViewJdLink.clientName);
          const currentJd = clientJds[selectedJdDetailIndex] || clientJds[0];
          const clientAssigned = getAssignedMemberForClient(activeViewJdLink);

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
              <div className="bg-white border border-[#EAECF0] rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-[#EAECF0] px-6 py-4 bg-slate-50/70">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-[#EFF4FF] text-[#3563E9] flex items-center justify-center border border-[#D1E0FF] shadow-xs">
                      <svg className="w-5 h-5 text-[#3563E9]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[#101828]">Uploaded Job Descriptions</h3>
                      <p className="text-xs text-[#667085]">
                        Client: <span className="font-semibold text-[#101828]">{activeViewJdLink.clientName}</span>
                        {activeViewJdLink.contactName && <span> • Contact: <span className="font-semibold text-[#101828]">{activeViewJdLink.contactName}</span></span>}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewJdModalOpen(false)}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 flex items-center justify-center text-sm font-bold cursor-pointer transition-colors"
                  >
                    ✕
                  </button>
                </div>

                {/* Modal Content */}
                <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
                  {clientJds.length === 0 ? (
                    <div className="text-center py-10 px-4">
                      <div className="w-14 h-14 rounded-2xl bg-[#EFF4FF] text-[#3563E9] flex items-center justify-center mx-auto mb-3 shadow-xs">
                        <svg className="w-7 h-7 text-[#3563E9]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <h4 className="text-sm font-bold text-[#101828] mb-1">No JDs Uploaded Yet</h4>
                      <p className="text-xs text-[#667085] max-w-sm mx-auto mb-5">
                        {activeViewJdLink.clientName} has not uploaded any Job Description documents yet. They can submit JDs directly through their active portal link.
                      </p>
                      <a
                        href={activeViewJdLink.shareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3563E9] text-white text-xs font-bold hover:bg-[#2851D6] transition-colors shadow-xs"
                      >
                        <span>Open Client Portal</span>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  ) : (
                    <>
                      {/* Multiple Positions Tab Selector */}
                      {clientJds.length > 1 && (
                        <div>
                          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                            Select Requisition ({clientJds.length} Positions Available)
                          </div>
                          <div className="flex items-center gap-2 overflow-x-auto pb-1">
                            {clientJds.map((jd, idx) => (
                              <button
                                key={jd.id || idx}
                                type="button"
                                onClick={() => setSelectedJdDetailIndex(idx)}
                                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                                  selectedJdDetailIndex === idx
                                    ? 'bg-[#3563E9] text-white shadow-sm'
                                    : 'bg-slate-100 text-[#475467] hover:bg-slate-200 hover:text-[#101828]'
                                }`}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
                                <span className="truncate max-w-[180px]">{jd.title}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Primary Position Card */}
                      {currentJd && (
                        <div className="space-y-4">
                          <div className="bg-[#F8F9FC] border border-[#EAECF0] rounded-2xl p-4">
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div>
                                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-[#3563E9] bg-[#EFF4FF] px-2.5 py-0.5 rounded-md border border-[#D1E0FF] mb-1.5">
                                  Position #{selectedJdDetailIndex + 1}
                                </span>
                                <h4 className="text-base font-extrabold text-[#101828] leading-tight">
                                  {currentJd.title}
                                </h4>
                              </div>
                              <span className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                {currentJd.status || 'Active Screening'}
                              </span>
                            </div>

                            {/* Tags Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-200/60 text-xs">
                              <div className="bg-white rounded-xl p-2.5 border border-[#EAECF0]">
                                <span className="block text-[10px] font-semibold text-[#667085] uppercase">Work Mode</span>
                                <span className="font-bold text-[#101828] mt-0.5 inline-block">{currentJd.mode || 'Hybrid'}</span>
                              </div>
                              <div className="bg-white rounded-xl p-2.5 border border-[#EAECF0]">
                                <span className="block text-[10px] font-semibold text-[#667085] uppercase">Location</span>
                                <span className="font-bold text-[#101828] mt-0.5 inline-block truncate max-w-full">{currentJd.location || 'Remote / Hybrid'}</span>
                              </div>
                              <div className="bg-white rounded-xl p-2.5 border border-[#EAECF0] col-span-2 sm:col-span-1">
                                <span className="block text-[10px] font-semibold text-[#667085] uppercase">Target Budget</span>
                                <span className="font-bold text-emerald-700 mt-0.5 inline-block">{currentJd.salary || 'Competitive'}</span>
                              </div>
                            </div>
                          </div>

                          {/* Recruiter Assignment Status */}
                          <div className="rounded-2xl border border-[#EAECF0] p-4 transition-all bg-white">
                            {(currentJd.assignedRecruiter || clientAssigned) ? (
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 font-extrabold text-sm flex items-center justify-center border border-emerald-200">
                                    {(currentJd.assignedRecruiter || clientAssigned?.name || 'R').charAt(0)}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs font-bold text-[#101828]">
                                        {currentJd.assignedRecruiter || clientAssigned?.name}
                                      </span>
                                      <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-1.5 py-0.5 rounded">
                                        Owner
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-[#667085]">
                                      {clientAssigned?.role || 'Lead Technical Recruiter'} • Actively managing requisition
                                    </p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setViewJdModalOpen(false);
                                    handleOpenAssignModal(activeViewJdLink);
                                  }}
                                  className="text-xs font-bold text-[#3563E9] hover:text-[#2851D6] hover:underline cursor-pointer shrink-0"
                                >
                                  Reassign Member
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-3 bg-amber-50/50 p-2 rounded-xl">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 font-bold text-xs flex items-center justify-center border border-amber-200">
                                    !
                                  </div>
                                  <div>
                                    <p className="text-xs font-bold text-amber-950">Currently Unassigned</p>
                                    <p className="text-[11px] text-amber-700">Assign a recruiter to start evaluating incoming candidates</p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setViewJdModalOpen(false);
                                    handleOpenAssignModal(activeViewJdLink);
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#3563E9] hover:bg-[#2851D6] text-white text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0"
                                >
                                  <span>Assign Recruiter</span>
                                </button>
                              </div>
                            )}
                          </div>

                          {/* JD Details / Criteria */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-xs font-bold text-[#101828]">
                                Job Description &amp; Role Requirements
                              </label>
                              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                Deterministic ATS Screening Active
                              </span>
                            </div>
                            <div className="bg-[#F8F9FC] border border-[#EAECF0] rounded-2xl p-4 text-xs text-[#344054] leading-relaxed max-h-56 overflow-y-auto whitespace-pre-wrap font-sans">
                              {currentJd.description || (
                                `Position: ${currentJd.title}\nClient: ${activeViewJdLink.clientName}\nLocation: ${currentJd.location || 'Remote / Hybrid'}\nWork Arrangement: ${currentJd.mode || 'Hybrid'}\nTarget Salary Range: ${currentJd.salary || 'Competitive Market Rate'}\n\nRole Responsibilities & Requirements:\n- Build and maintain mission-critical software features with exceptional code quality.\n- Collaborate with product management, engineering peers, and client leadership.\n- Rigorous automated testing, performance tuning, and technical documentation.\n- Compliance with HireIQ deterministic knockout criteria (minimum 3 required parameters).`
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="border-t border-[#EAECF0] px-6 py-4 flex items-center justify-between bg-slate-50/70">
                  <a
                    href={activeViewJdLink.shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#3563E9] hover:text-[#2851D6] hover:underline cursor-pointer"
                  >
                    <span>Open Live Portal</span>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setViewJdModalOpen(false);
                        router.push('/ats');
                      }}
                      className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-[#182230] cursor-pointer transition-colors"
                    >
                      View in ATS Pool
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewJdModalOpen(false)}
                      className="px-5 py-2.5 rounded-xl bg-[#3563E9] hover:bg-[#2851D6] text-xs font-bold text-white shadow-xs cursor-pointer transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Toast Feedback */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-[350] flex items-center gap-2.5 rounded-2xl bg-[#101828] px-4 py-3 text-sm font-medium text-white shadow-xl border border-slate-800">
            <svg className="h-4 w-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{toastMessage}</span>
          </div>
        )}

      </main>
      <Footer />
    </div>
  );
}
