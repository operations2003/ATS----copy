'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useAuth } from '@/context/AuthContext';
import { atsStore, JobItem } from '@/lib/atsStore';
import {
  getJobAssignment,
  setJobAssignment,
  isExcludedRecruiterName
} from '@/lib/jobAssignments';
import { getResolvedBackendUrl } from '@/lib/backendUrl';

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
  jds?: any[];
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

const getClientAvatarGradient = (name: string): string => {
  const n = (name || '').toLowerCase().trim();
  if (n.startsWith('g')) return 'bg-gradient-to-br from-blue-600 to-indigo-700';
  if (n.startsWith('r')) return 'bg-gradient-to-br from-violet-600 to-purple-700';
  if (n.startsWith('a')) return 'bg-gradient-to-br from-emerald-600 to-teal-700';
  if (n.startsWith('h')) return 'bg-gradient-to-br from-amber-500 to-orange-600';
  if (n.startsWith('m') || n.startsWith('s')) return 'bg-gradient-to-br from-rose-500 to-pink-600';
  if (n.startsWith('t') || n.startsWith('d')) return 'bg-gradient-to-br from-cyan-600 to-blue-700';
  return 'bg-gradient-to-br from-slate-700 to-slate-900';
};

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
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
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

  // Delete Client Confirmation Modal State
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [linkToDelete, setLinkToDelete] = useState<SharedClientLink | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit Client Portal Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<SharedClientLink | null>(null);
  const [editClientName, setEditClientName] = useState('');
  const [editContactName, setEditContactName] = useState('');
  const [editClientEmail, setEditClientEmail] = useState('');
  const [editClientPhone, setEditClientPhone] = useState('');
  const [editWelcomeNote, setEditWelcomeNote] = useState('');
  const [editAssignedMember, setEditAssignedMember] = useState('');
  const [editExpirationOption, setEditExpirationOption] = useState<string>('keep');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Quick Upload JD Modal State (Live two-way link with client portal)
  const [quickJdModalOpen, setQuickJdModalOpen] = useState(false);
  const [quickJdClient, setQuickJdClient] = useState<SharedClientLink | null>(null);
  const [quickJdTitle, setQuickJdTitle] = useState('');
  const [quickJdLocation, setQuickJdLocation] = useState('Remote / Hybrid');
  const [quickJdMode, setQuickJdMode] = useState<'Remote' | 'Hybrid' | 'Onsite'>('Hybrid');
  const [quickJdSalary, setQuickJdSalary] = useState('Competitive Market Rate');
  const [quickJdDescription, setQuickJdDescription] = useState('');
  const [quickJdRecruiter, setQuickJdRecruiter] = useState('');
  const [isSubmittingQuickJd, setIsSubmittingQuickJd] = useState(false);

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
    // All logged-in users can access the Clients section
  }, [isClientLoaded, authLoading, isAdmin, router]);

  useEffect(() => {
    // Load client share links from backend API and localStorage with union merge
    const loadClientPortals = async () => {
      // 1. Initial hydration from local storage (supporting both modern and legacy keys)
      let localPortals: SharedClientLink[] = [];
      try {
        const stored = localStorage.getItem(CLIENT_SHARES_STORAGE_KEY) || localStorage.getItem('tasknera_client_shares');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            localPortals = parsed;
            setSharedLinks(parsed);
          }
        }
      } catch { }

      // 2. Fetch authoritative client portals from backend API
      try {
        const backendUrl = getResolvedBackendUrl();
        const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
        const res = await fetch(`${backendUrl}/client-portals`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const data = await res.json();
          const serverPortals: SharedClientLink[] = Array.isArray(data.clientPortals) ? data.clientPortals : [];

          // Merge local and server portals without losing any client or assigned recruiter
          const mergedMap = new Map<string, SharedClientLink>();
          const getLinkKey = (p: SharedClientLink) =>
            (p.token || p.id || p.clientName || '').toLowerCase().trim();

          // Seed server portals first
          serverPortals.forEach(p => {
            const k = getLinkKey(p);
            if (k) mergedMap.set(k, p);
          });

          // Overlay/sync local portals
          localPortals.forEach(lp => {
            const k = getLinkKey(lp);
            if (!k) return;
            if (!mergedMap.has(k)) {
              mergedMap.set(k, lp);
              // Push to backend so it's globally available across all browsers/sessions
              if (token) {
                fetch(`${backendUrl}/client-portals`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  body: JSON.stringify(lp)
                }).catch(() => { });
              }
            } else {
              // Combine JDs without dropping any uploaded by client or recruiter
              const existing = mergedMap.get(k)!;
              const combinedJdsMap = new Map<string, any>();
              (Array.isArray(existing.jds) ? existing.jds : []).forEach((j: any) => {
                const titleKey = (j.title || j.name || j.id || '').toLowerCase().trim();
                if (titleKey) combinedJdsMap.set(titleKey, j);
              });
              (Array.isArray(lp.jds) ? lp.jds : []).forEach((j: any) => {
                const titleKey = (j.title || j.name || j.id || '').toLowerCase().trim();
                if (titleKey && !combinedJdsMap.has(titleKey)) {
                  combinedJdsMap.set(titleKey, j);
                }
              });

              const updated = {
                ...existing,
                assignedMember: existing.assignedMember || lp.assignedMember,
                assignedMemberRole: existing.assignedMemberRole || lp.assignedMemberRole,
                assignedAt: existing.assignedAt || lp.assignedAt,
                jds: Array.from(combinedJdsMap.values())
              };
              mergedMap.set(k, updated);
            }
          });

          // Also check localStorage tasknera_client_jds_${client} to ensure client-uploaded JDs are merged in
          if (typeof window !== 'undefined') {
            mergedMap.forEach((portal) => {
              try {
                const cleanName = (portal.clientName || '').replace(/\s+/g, '_');
                if (!cleanName) return;
                const rawJds = localStorage.getItem(`tasknera_client_jds_${cleanName}`);
                if (rawJds) {
                  const parsed = JSON.parse(rawJds);
                  if (Array.isArray(parsed) && parsed.length > 0) {
                    const existingNormTitles = new Set(
                      (portal.jds || []).map((j: any) =>
                        String(j.title || j.name || '')
                          .toLowerCase()
                          .replace(/\b(jd|job|description|spec|specs|final|v\d+)\b/gi, '')
                          .replace(/[^a-z0-9]/g, '')
                          .trim()
                      ).filter(Boolean)
                    );
                    parsed.forEach((pj: any) => {
                      const norm = String(pj.title || pj.name || '')
                        .toLowerCase()
                        .replace(/\b(jd|job|description|spec|specs|final|v\d+)\b/gi, '')
                        .replace(/[^a-z0-9]/g, '')
                        .trim();
                      if (norm && !existingNormTitles.has(norm)) {
                        portal.jds = portal.jds || [];
                        portal.jds.push(pj);
                        existingNormTitles.add(norm);
                      }
                    });
                  }
                }
              } catch { }
            });
          }

          const finalLinks = Array.from(mergedMap.values());
          if (finalLinks.length > 0) {
            setSharedLinks(finalLinks);
            try {
              localStorage.setItem(CLIENT_SHARES_STORAGE_KEY, JSON.stringify(finalLinks));
              localStorage.setItem('tasknera_client_shares', JSON.stringify(finalLinks));
            } catch { }
          }
        }
      } catch (err) {
        console.warn('Failed to load client portals from API:', err);
      }
    };

    loadClientPortals();

    // Refresh all jobs from atsStore, localStorage, and backend API
    const refreshJobs = async () => {
      const combined = new Map<string, JobItem>();

      // 1. atsStore jobs
      try {
        atsStore.getJobs().forEach(j => {
          if (j.id) combined.set(String(j.id), j);
        });
      } catch { }

      // 2. tasknera_created_jobs
      try {
        const rawCreated = JSON.parse(localStorage.getItem('tasknera_created_jobs') || '[]');
        if (Array.isArray(rawCreated)) {
          rawCreated.forEach((cj: any) => {
            if (cj.id && !combined.has(String(cj.id))) {
              const assignment = getJobAssignment(cj);
              combined.set(String(cj.id), {
                id: String(cj.id),
                title: cj.position || cj.title || 'Requisition Role',
                client: cj.client || cj.company || 'Client',
                location: cj.location || 'Remote / Hybrid',
                mode: cj.work_mode || cj.mode || 'Hybrid',
                salary: cj.salary || 'Competitive',
                candidates: cj.candidates || 0,
                topScore: cj.topScore || 0,
                status: cj.status || 'Active',
                assignedRecruiter: assignment?.assignedRecruiter || cj.assignedRecruiter,
                workedBy: cj.workedBy || [],
                pod: 'Client Portal Inflow',
                mandatoryRequirementsCount: 3,
                totalRequirementsCount: 6,
                description: cj.description,
                createdAtDaysAgo: 0
              } as JobItem);
            }
          });
        }
      } catch { }

      // 3. Backend jobs
      try {
        const backendUrl = getResolvedBackendUrl();
        const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
        const res = await fetch(`${backendUrl}/jobs`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data.jobs) ? data.jobs : (Array.isArray(data.data) ? data.data : []);
          list.forEach((bj: any) => {
            const assignment = getJobAssignment(bj);
            const resolvedAssigned = assignment?.assignedRecruiter || bj.assignedRecruiter;
            combined.set(String(bj.id), {
              id: String(bj.id),
              title: bj.position || bj.title || 'Requisition Role',
              client: bj.client || bj.company || 'Client',
              location: bj.location || 'Remote / Hybrid',
              mode: bj.work_mode || bj.workMode || 'Hybrid',
              salary: bj.salary || 'Competitive',
              candidates: bj.candidatesCount || bj.candidates || 0,
              topScore: bj.topScore || 0,
              status: bj.status || 'Active',
              assignedRecruiter: resolvedAssigned,
              workedBy: bj.workedBy || [],
              pod: 'Enterprise Pipeline',
              mandatoryRequirementsCount: 3,
              totalRequirementsCount: 6,
              description: bj.jd_text || bj.description,
              createdAtDaysAgo: 0
            } as JobItem);
          });
        }
      } catch { }

      setJobs(Array.from(combined.values()));
    };

    refreshJobs();

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
        const backendUrl = getResolvedBackendUrl();
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
        } catch (_) { }

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
        } catch (_) { }

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

    // Event listener for updates from jobs page or other tabs
    const handleUpdate = () => {
      refreshJobs();
      try {
        const stored = localStorage.getItem(CLIENT_SHARES_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) setSharedLinks(parsed);
        }
      } catch { }
    };

    window.addEventListener('tasknera_jobs_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    const unsub = atsStore.subscribe(handleUpdate);

    // BroadcastChannel for cross-tab immediate updates when client uploads JD in another tab
    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel('tasknera_portal_channel');
        bc.onmessage = (msg) => {
          if (msg.data?.type === 'JD_UPLOADED') {
            loadClientPortals();
            refreshJobs();
          }
        };
      } catch { }
    }

    // Live bidirectional sync: poll backend every 5 seconds for new client JDs
    const liveSyncInterval = setInterval(() => {
      loadClientPortals();
      refreshJobs();
    }, 5000);

    return () => {
      clearInterval(liveSyncInterval);
      window.removeEventListener('tasknera_jobs_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
      unsub();
      if (bc) {
        bc.close();
      }
    };
  }, [user, cachedRole]);

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

  // Helper to retrieve detailed uploaded JDs for a client (two-way synced with client portal)
  const getClientUploadedJds = (clientName: string): ClientJdItem[] => {
    const cleanClient = (clientName || '').toLowerCase().trim();
    if (!cleanClient) return [];
    const resultList: ClientJdItem[] = [];
    const seenTitles = new Set<string>();
    const seenIds = new Set<string>();

    const normalizeJobKey = (title?: string, id?: string): string => {
      const cleanT = String(title || '')
        .toLowerCase()
        .replace(/\b(jd|job|description|spec|specs|final|v\d+)\b/gi, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
      if (cleanT.length > 2) return cleanT;
      return String(id || '').toLowerCase().trim();
    };

    const addJd = (item: any, fallbackId: string, fallbackRecruiter?: string) => {
      if (!item) return;
      const title = item.title || item.name || item.position || 'Job Requisition';
      const cleanT = String(title || '').toLowerCase().trim();
      if (!cleanT || cleanT === 'client requisition' || cleanT === 'requisition role') return;
      const id = String(item.id || fallbackId);
      const normKey = normalizeJobKey(title, id);
      if (!normKey) return;
      if (seenTitles.has(normKey) || (item.id && seenIds.has(String(item.id)))) return;
      seenTitles.add(normKey);
      if (item.id) seenIds.add(String(item.id));

      const portalRecruiter = portal?.assignedMember?.trim();
      const directRecruiter = (portalRecruiter && !isExcludedRecruiterName(portalRecruiter))
        ? portalRecruiter
        : (!isExcludedRecruiterName(item.assignedRecruiter) ? item.assignedRecruiter : undefined);

      resultList.push({
        id,
        title,
        assignedRecruiter: directRecruiter,
        description: item.description,
        location: item.location || 'Remote / Hybrid',
        mode: item.workMode || item.mode || 'Hybrid',
        salary: item.salary || 'Competitive Market Rate',
        createdAt: item.createdAt || item.created_at || 'Recently',
        status: item.status || 'Active Screening',
        mandatoryRequirementsCount: item.mandatoryRequirementsCount || 3
      });
    };

    // 1. Authoritative portal JDs from sharedLinks
    const portal = sharedLinks.find(
      l => l.clientName && l.clientName.toLowerCase().trim() === cleanClient
    );
    if (portal && Array.isArray(portal.jds)) {
      portal.jds.forEach((item: any, idx: number) => {
        addJd(item, `jd-backend-${idx}`, portal.assignedMember);
      });
    }

    // 2. Local storage tasknera_client_jds_${cleanName}
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(`tasknera_client_jds_${cleanClient.replace(/\s+/g, '_')}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            parsed.forEach((item: any, idx: number) => {
              addJd(item, `jd-local-${idx}`, portal?.assignedMember);
            });
          }
        }
      } catch { }

      // 3. Local storage tasknera_created_jobs
      try {
        const rawCreated = localStorage.getItem('tasknera_created_jobs');
        if (rawCreated) {
          const createdList = JSON.parse(rawCreated);
          if (Array.isArray(createdList)) {
            createdList.forEach((cj: any, idx: number) => {
              const cjClient = String(cj.client || cj.company || '').toLowerCase().trim();
              if (cjClient === cleanClient || (cleanClient && cjClient.includes(cleanClient)) || (cleanClient && cleanClient.includes(cjClient))) {
                addJd(cj, `jd-created-${idx}`, portal?.assignedMember);
              }
            });
          }
        }
      } catch { }
    }

    // 4. ATS store jobs
    if (Array.isArray(jobs)) {
      jobs
        .filter(j => {
          const jClient = String(j.client || '').toLowerCase().trim();
          return jClient === cleanClient || (cleanClient && jClient.includes(cleanClient)) || (cleanClient && cleanClient.includes(jClient));
        })
        .forEach((j, idx) => {
          addJd(j, `jd-ats-${idx}`, portal?.assignedMember);
        });
    }

    return resultList;
  };

  // Counts JDs uploaded by this client (from backend authoritative portal, local storage, or jobs pool)
  const getClientUploadedJdsCount = (clientName: string) => {
    return getClientUploadedJds(clientName).length;
  };

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

  // Aggregate client account cards from existing jobs AND shared client portals
  const clientAccounts = useMemo(() => {
    const map = new Map<string, { name: string; jobsCount: number; jobTitles: string[] }>();
    sharedLinks.forEach(l => {
      const client = l.clientName?.trim();
      if (client && !map.has(client)) {
        map.set(client, { name: client, jobsCount: 0, jobTitles: [] });
      }
      if (client) {
        const entry = map.get(client)!;
        const uploadedJds = getClientUploadedJds(client);
        entry.jobsCount = Math.max(entry.jobsCount, uploadedJds.length);
        uploadedJds.forEach(uj => {
          if (uj.title && !entry.jobTitles.includes(uj.title)) {
            entry.jobTitles.push(uj.title);
          }
        });
      }
    });
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
  }, [jobs, sharedLinks]);

  const totalConnectedRequisitions = useMemo(() => {
    const seen = new Set<string>();
    jobs.forEach(j => seen.add(String(j.id || j.title)));
    sharedLinks.forEach(l => {
      const u = getClientUploadedJds(l.clientName);
      u.forEach(j => seen.add(String(j.id || j.title)));
    });
    return Math.max(jobs.length, seen.size);
  }, [jobs, sharedLinks]);

  const handleOpenJdViewer = (link: SharedClientLink) => {
    setActiveViewJdLink(link);
    setSelectedJdDetailIndex(0);
    setViewJdModalOpen(true);
  };

  // Helper to determine who is assigned to this client portal:
  // Strictly respects the explicit assignment on the client portal.
  // Never falls back to unrelated previous records or auto-assigns recruiters by default.
  const getAssignedMemberForClient = (link: SharedClientLink): { name: string; role?: string } | null => {
    if (!link) return null;
    const directAssigned = (link.assignedMember || '').trim();
    if (directAssigned && !isExcludedRecruiterName(directAssigned)) {
      return { name: directAssigned, role: link.assignedMemberRole || 'Technical Recruiter' };
    }
    return null;
  };

  // Automatically reconcile existing client assignments into tasknera_created_jobs
  useEffect(() => {
    if (!isClientLoaded) return;
    try {
      const stored = localStorage.getItem(CLIENT_SHARES_STORAGE_KEY);
      if (!stored) return;
      const parsed: SharedClientLink[] = JSON.parse(stored);
      if (!Array.isArray(parsed)) return;

      const rawCreated = JSON.parse(localStorage.getItem('tasknera_created_jobs') || '[]');
      const existingCreated = Array.isArray(rawCreated)
        ? rawCreated.filter((cj: any) => {
          const p = String(cj.position || cj.title || '').toLowerCase().trim();
          return p && p !== 'client requisition' && p !== 'requisition role';
        })
        : [];
      let modified = rawCreated.length !== existingCreated.length;

      parsed.forEach(link => {
        const assigned = link.assignedMember;
        if (assigned && assigned !== 'Unassigned') {
          const clientJds = getClientUploadedJds(link.clientName);
          const targetRole = link.assignedMemberRole || 'Technical Recruiter';
          const worker = {
            id: `rec-${assigned.toLowerCase().replace(/\s+/g, '-')}`,
            name: assigned,
            role: targetRole,
            action: 'Assigned Lead',
            isCreator: false
          };

          clientJds.forEach(item => {
            if (!item || !item.title) return;
            const itemTitle = String(item.title).toLowerCase().trim();
            const clientNameClean = String(link.clientName || '').toLowerCase().trim();
            const idx = existingCreated.findIndex((cj: any) =>
              (item.id && String(cj.id) === String(item.id)) ||
              (clientNameClean && (String(cj.client || '')).toLowerCase().trim() === clientNameClean &&
                (String(cj.position || cj.title || '')).toLowerCase().trim() === itemTitle)
            );

            if (idx >= 0) {
              if (existingCreated[idx].assignedRecruiter !== assigned) {
                existingCreated[idx].assignedRecruiter = assigned;
                existingCreated[idx].assignedTo = assigned;
                existingCreated[idx].workedBy = [
                  worker,
                  ...(Array.isArray(existingCreated[idx].workedBy) ? existingCreated[idx].workedBy.filter((w: any) => w.name?.toLowerCase() !== assigned.toLowerCase()) : [])
                ];
                modified = true;
              }
            } else {
              existingCreated.unshift({
                id: item.id || `job-client-${Date.now()}`,
                client: link.clientName,
                company: link.clientName,
                position: item.title,
                title: item.title,
                location: item.location || 'Remote / Hybrid',
                work_mode: item.mode || 'Hybrid',
                workMode: item.mode || 'Hybrid',
                mode: item.mode || 'Hybrid',
                salary: item.salary || 'Competitive Market Rate',
                status: 'Active',
                created_at: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                assignedRecruiter: assigned,
                assignedTo: assigned,
                workedBy: [worker],
                candidatesCount: 0,
                candidates: 0,
                topScore: 0,
                description: item.description || `Requisition intake for ${link.clientName}`
              });
              modified = true;
            }
          });
        }
      });

      if (modified) {
        localStorage.setItem('tasknera_created_jobs', JSON.stringify(existingCreated));
      }
    } catch (e) {
      console.warn('Reconcile existing client assignments error:', e);
    }
  }, [isClientLoaded]);

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

    const clientJds = getClientUploadedJds(clientName);

    // 0. Set authoritative registry assignment in tasknera_job_assignments_v1
    setJobAssignment({
      client: clientName,
      title: selectedJobScope !== 'ALL' ? clientJds.find(j => j.id === selectedJobScope)?.title : undefined,
      assignedRecruiter: targetMember,
      role: targetRole,
      assignedBy: adminName
    });

    clientJds.forEach(item => {
      if (selectedJobScope === 'ALL' || item.id === selectedJobScope) {
        setJobAssignment({
          jobId: item.id,
          client: clientName,
          title: item.title,
          assignedRecruiter: targetMember,
          role: targetRole,
          assignedBy: adminName
        });
      }
    });

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
      localStorage.setItem('tasknera_client_shares', JSON.stringify(updatedLinks));
    } catch { }

    // Sync assignment to backend API so all users across the organization see it
    (async () => {
      try {
        const backendUrl = getResolvedBackendUrl();
        const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
        await fetch(`${backendUrl}/client-portals/assign`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            clientName,
            assignedMember: targetMember,
            assignedMemberRole: targetRole,
            assignedAt: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
          })
        });
      } catch (e) {
        console.warn('Failed to sync assignment to backend API:', e);
      }
    })();

    // 2. Reassign matching jobs in atsStore & ensure all client JDs exist in atsStore
    const existingAtsJobs = atsStore.getJobs();

    // Sync each client JD into atsStore
    clientJds.forEach(item => {
      if (!item || !item.title) return;
      const itemTitleNorm = String(item.title).toLowerCase().trim();
      const clientNameNorm = String(clientName || '').toLowerCase().trim();
      if (selectedJobScope === 'ALL' || item.id === selectedJobScope) {
        const found = existingAtsJobs.find(
          j => (item.id && String(j.id) === String(item.id)) ||
            (clientNameNorm && String(j.client || '').toLowerCase().trim() === clientNameNorm &&
              String(j.title || '').toLowerCase().trim() === itemTitleNorm)
        );
        if (found) {
          atsStore.reassignJob(found.id, targetMember, adminName, targetRole);
        } else {
          try {
            atsStore.addJob({
              title: item.title,
              client: clientName,
              location: item.location || 'Remote / Hybrid',
              mode: (item.mode === 'Onsite' ? 'Onsite' : item.mode === 'Remote' ? 'Remote' : 'Hybrid'),
              salary: item.salary || 'Competitive',
              candidates: 0,
              topScore: 0,
              status: 'Active',
              assignedRecruiter: targetMember,
              workedBy: [{
                id: `rec-${targetMember.toLowerCase().replace(/\s+/g, '-')}`,
                name: targetMember,
                role: targetRole,
                action: 'Assigned Lead',
                isCreator: false
              }],
              pod: 'Client Portal Inflow',
              mandatoryRequirementsCount: item.mandatoryRequirementsCount || 3,
              totalRequirementsCount: 6,
              description: item.description || `Requisition intake for ${clientName}`
            }, adminName, 'ADMIN');
          } catch { }
        }
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
      } catch { }
    }

    // 3b. Sync assigned job(s) directly into tasknera_created_jobs & tasknera_all_jobs so it appears in the member's Jobs & Requisitions list
    if (typeof window !== 'undefined') {
      try {
        const rawCreatedJobs = JSON.parse(localStorage.getItem('tasknera_created_jobs') || '[]');
        const existingCreated = Array.isArray(rawCreatedJobs)
          ? rawCreatedJobs.filter((cj: any) => {
            const p = String(cj.position || cj.title || '').toLowerCase().trim();
            return p && p !== 'client requisition' && p !== 'requisition role';
          })
          : [];
        const updatedWorker = {
          id: `rec-${targetMember.toLowerCase().replace(/\s+/g, '-')}`,
          name: targetMember,
          role: targetRole,
          action: 'Assigned Lead',
          isCreator: false
        };

        // Only sync actual client JDs. Never insert generic 'Client Requisition' placeholders
        const targetJds = clientJds.filter(j => {
          const t = String(j.title || '').toLowerCase().trim();
          return t && t !== 'client requisition' && t !== 'requisition role';
        });

        targetJds.forEach(item => {
          if (!item || !item.title) return;
          const itemTitleNorm = String(item.title).toLowerCase().trim();
          const clientNameNorm = String(clientName || '').toLowerCase().trim();
          if (selectedJobScope === 'ALL' || item.id === selectedJobScope) {
            const existingIdx = existingCreated.findIndex((cj: any) =>
              (item.id && String(cj.id) === String(item.id)) ||
              (clientNameNorm && String(cj.client || '').toLowerCase().trim() === clientNameNorm &&
                String(cj.position || cj.title || '').toLowerCase().trim() === itemTitleNorm)
            );

            if (existingIdx >= 0) {
              const currentWorkers = Array.isArray(existingCreated[existingIdx].workedBy)
                ? existingCreated[existingIdx].workedBy
                : [];
              existingCreated[existingIdx] = {
                ...existingCreated[existingIdx],
                assignedRecruiter: targetMember,
                assignedTo: targetMember,
                workedBy: [
                  updatedWorker,
                  ...currentWorkers.filter((w: any) => w.name?.toLowerCase() !== targetMember.toLowerCase())
                ]
              };
            } else {
              const newJobEntry = {
                id: item.id || `job-client-${Date.now()}`,
                client: clientName,
                company: clientName,
                position: item.title,
                title: item.title,
                location: item.location || 'Remote / Hybrid',
                work_mode: item.mode || 'Hybrid',
                workMode: item.mode || 'Hybrid',
                mode: item.mode || 'Hybrid',
                salary: item.salary || 'Competitive Market Rate',
                status: 'Active',
                created_at: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                created_by: user?.id || 'admin',
                createdBy: user?.id || 'admin',
                assignedRecruiter: targetMember,
                assignedTo: targetMember,
                workedBy: [updatedWorker],
                candidatesCount: 0,
                candidates: 0,
                topScore: 0,
                description: item.description || `Client uploaded Job Description for ${item.title}`,
                organizationId: user?.organizationId || 'org-tasknera'
              };
              existingCreated.unshift(newJobEntry);
            }
          }
        });
        localStorage.setItem('tasknera_created_jobs', JSON.stringify(existingCreated));

        // Also update tasknera_all_jobs
        const existingAll = JSON.parse(localStorage.getItem('tasknera_all_jobs') || '[]');
        targetJds.forEach(item => {
          if (!item || !item.title) return;
          const itemTitleNorm = String(item.title).toLowerCase().trim();
          const clientNameNorm = String(clientName || '').toLowerCase().trim();
          if (selectedJobScope === 'ALL' || item.id === selectedJobScope) {
            const allIdx = existingAll.findIndex((aj: any) =>
              (item.id && String(aj.id) === String(item.id)) ||
              (clientNameNorm && String(aj.client || '').toLowerCase().trim() === clientNameNorm &&
                String(aj.position || aj.title || '').toLowerCase().trim() === itemTitleNorm)
            );
            if (allIdx >= 0) {
              existingAll[allIdx] = {
                ...existingAll[allIdx],
                assignedRecruiter: targetMember,
                workedBy: [updatedWorker, ...(Array.isArray(existingAll[allIdx].workedBy) ? existingAll[allIdx].workedBy.filter((w: any) => w.name?.toLowerCase() !== targetMember.toLowerCase()) : [])]
              };
            } else {
              const matchedCreated = existingCreated.find((c: any) => String(c.id) === String(item.id) || c.position === item.title);
              if (matchedCreated) existingAll.unshift(matchedCreated);
            }
          }
        });
        localStorage.setItem('tasknera_all_jobs', JSON.stringify(existingAll));
      } catch (e) {
        console.warn('Error syncing tasknera_created_jobs:', e);
      }
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
      } catch { }
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
      localStorage.setItem('tasknera_client_shares', JSON.stringify(updated));
    } catch {
      // ignore
    }

    // Persist new client portal to backend API
    (async () => {
      try {
        const backendUrl = getResolvedBackendUrl();
        const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
        await fetch(`${backendUrl}/client-portals`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify(newShare)
        });
      } catch (err) {
        console.warn('Failed to save client portal to backend:', err);
      }
    })();

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

  const handleOpenQuickJdModal = (link: SharedClientLink) => {
    setQuickJdClient(link);
    setQuickJdTitle('');
    setQuickJdLocation('Remote / Hybrid');
    setQuickJdMode('Hybrid');
    setQuickJdSalary('Competitive Market Rate');
    setQuickJdDescription('');
    setQuickJdRecruiter(link.assignedMember || '');
    setQuickJdModalOpen(true);
  };

  const handleSubmitQuickJd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickJdClient || !quickJdTitle.trim()) {
      showToast('Position title is required');
      return;
    }

    setIsSubmittingQuickJd(true);
    const clientName = quickJdClient.clientName;
    const effectiveRecruiter = quickJdRecruiter.trim() || quickJdClient.assignedMember || 'Technical Recruiter';
    const newJobId = `jd-portal-${Date.now()}`;

    const newJdItem = {
      id: newJobId,
      title: quickJdTitle.trim(),
      client: clientName,
      location: quickJdLocation.trim() || 'Remote / Hybrid',
      workMode: quickJdMode,
      mode: quickJdMode,
      salary: quickJdSalary.trim() || 'Competitive Market Rate',
      status: 'Active Screening',
      assignedRecruiter: effectiveRecruiter,
      createdAt: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      description: quickJdDescription.trim() || `Job Description for ${quickJdTitle.trim()}`,
      mandatoryRequirementsCount: 3,
      totalRequirementsCount: 6,
      uploadedBy: 'RECRUITER'
    };

    // 1. Add to atsStore
    try {
      atsStore.addJob(
        {
          title: newJdItem.title,
          client: clientName,
          location: newJdItem.location,
          mode: newJdItem.mode,
          salary: newJdItem.salary,
          candidates: 0,
          topScore: 0,
          status: 'Active',
          assignedRecruiter: effectiveRecruiter,
          pod: 'Client Portal Inflow',
          mandatoryRequirementsCount: 3,
          totalRequirementsCount: 6,
          description: newJdItem.description
        },
        user?.name || currentEmail || 'Agency Team',
        'AGENCY'
      );
    } catch { }

    // 2. Add to localStorage tasknera_client_jds_${clientName}
    try {
      const cleanKey = `tasknera_client_jds_${clientName.replace(/\s+/g, '_')}`;
      const existing = JSON.parse(localStorage.getItem(cleanKey) || '[]');
      const updatedList = [newJdItem, ...(Array.isArray(existing) ? existing : [])];
      localStorage.setItem(cleanKey, JSON.stringify(updatedList));
      localStorage.setItem(`tasknera_client_jds_${clientName}`, JSON.stringify(updatedList));
    } catch { }

    // 3. Add to tasknera_created_jobs
    try {
      const createdList = JSON.parse(localStorage.getItem('tasknera_created_jobs') || '[]');
      const createdEntry = {
        id: newJobId,
        client: clientName,
        company: clientName,
        position: newJdItem.title,
        title: newJdItem.title,
        location: newJdItem.location,
        work_mode: newJdItem.mode,
        mode: newJdItem.mode,
        salary: newJdItem.salary,
        status: 'Active',
        createdAt: new Date().toISOString(),
        assignedRecruiter: effectiveRecruiter,
        candidatesCount: 0,
        candidates: 0,
        topScore: 0,
        description: newJdItem.description
      };
      localStorage.setItem('tasknera_created_jobs', JSON.stringify([createdEntry, ...(Array.isArray(createdList) ? createdList : [])]));
    } catch { }

    // 4. Send to backend API so it syncs immediately to the client's live portal
    try {
      const backendUrl = getResolvedBackendUrl();
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
      await fetch(`${backendUrl}/client-portals/${quickJdClient.id}/jds`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ jd: newJdItem })
      });
    } catch (err) {
      console.warn('Failed to upload JD to backend:', err);
    }

    // 5. Update sharedLinks locally and persist to storage
    const updatedWithJd = sharedLinks.map(l => {
      if (l.id === quickJdClient.id || l.clientName.toLowerCase().trim() === clientName.toLowerCase().trim()) {
        const currentJds = Array.isArray(l.jds) ? l.jds : [];
        return {
          ...l,
          jds: [newJdItem, ...currentJds]
        };
      }
      return l;
    });
    setSharedLinks(updatedWithJd);
    try {
      localStorage.setItem(CLIENT_SHARES_STORAGE_KEY, JSON.stringify(updatedWithJd));
      localStorage.setItem('tasknera_client_shares', JSON.stringify(updatedWithJd));
    } catch {}

    setIsSubmittingQuickJd(false);
    setQuickJdModalOpen(false);
    showToast(`✓ JD "${quickJdTitle}" uploaded and synced live with ${clientName}'s portal!`);
  };

  const handleOpenEditModal = (link: SharedClientLink) => {
    setEditingLink(link);
    setEditClientName(link.clientName || '');
    setEditContactName(link.contactName || '');
    setEditClientEmail(link.clientEmail || '');
    setEditClientPhone(link.clientPhone || '');
    setEditWelcomeNote(link.welcomeNote || '');
    setEditAssignedMember(link.assignedMember || '');
    setEditExpirationOption('keep');
    setEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingLink) return;
    if (!editClientName.trim()) {
      showToast('Client company name cannot be empty');
      return;
    }

    setIsSavingEdit(true);
    const oldClientName = editingLink.clientName;
    const newClientName = editClientName.trim();

    // Determine new expiration if modified
    let newExpiresAt = editingLink.expiresAt;
    if (editExpirationOption !== 'keep') {
      if (editExpirationOption === 'never') {
        newExpiresAt = 'Never';
      } else {
        const days = parseInt(editExpirationOption, 10);
        if (!isNaN(days) && days > 0) {
          const expDate = new Date();
          expDate.setDate(expDate.getDate() + days);
          newExpiresAt = expDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        }
      }
    }

    // Determine assigned role
    let newAssignedRole = editingLink.assignedMemberRole;
    if (editAssignedMember) {
      const found = teamMembers.find(m => m.name.toLowerCase().trim() === editAssignedMember.toLowerCase().trim());
      if (found) {
        newAssignedRole = found.role;
      } else if (!newAssignedRole) {
        newAssignedRole = 'Technical Recruiter';
      }
    }

    // Update share URL query param if name changed
    let updatedShareUrl = editingLink.shareUrl;
    try {
      const u = new URL(editingLink.shareUrl);
      u.searchParams.set('client', newClientName);
      updatedShareUrl = u.toString();
    } catch {
      updatedShareUrl = editingLink.shareUrl.replace(/client=[^&]*/, `client=${encodeURIComponent(newClientName)}`);
    }

    const updatedLink: SharedClientLink = {
      ...editingLink,
      clientName: newClientName,
      contactName: editContactName.trim() || undefined,
      clientEmail: editClientEmail.trim() || undefined,
      clientPhone: editClientPhone.trim() || undefined,
      welcomeNote: editWelcomeNote.trim() || undefined,
      assignedMember: editAssignedMember.trim() || undefined,
      assignedMemberRole: editAssignedMember.trim() ? newAssignedRole : undefined,
      assignedAt: editAssignedMember.trim() ? (editingLink.assignedAt || new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })) : undefined,
      expiresAt: newExpiresAt,
      shareUrl: updatedShareUrl
    };

    const updatedLinksList = sharedLinks.map(l => (l.id === editingLink.id ? updatedLink : l));
    setSharedLinks(updatedLinksList);

    // Save to local storage
    try {
      localStorage.setItem(CLIENT_SHARES_STORAGE_KEY, JSON.stringify(updatedLinksList));
      localStorage.setItem('tasknera_client_shares', JSON.stringify(updatedLinksList));
    } catch { }

    // If client name changed, migrate client JDs cache
    if (oldClientName.toLowerCase().trim() !== newClientName.toLowerCase().trim()) {
      try {
        const oldCleanKey = `tasknera_client_jds_${oldClientName.replace(/\s+/g, '_')}`;
        const oldKey = `tasknera_client_jds_${oldClientName}`;
        const newCleanKey = `tasknera_client_jds_${newClientName.replace(/\s+/g, '_')}`;
        const newKey = `tasknera_client_jds_${newClientName}`;

        const existingJds = localStorage.getItem(oldCleanKey) || localStorage.getItem(oldKey);
        if (existingJds) {
          localStorage.setItem(newCleanKey, existingJds);
          localStorage.setItem(newKey, existingJds);
        }
      } catch { }
    }

    // Call backend API PUT /api/client-portals/:id
    try {
      const backendUrl = getResolvedBackendUrl();
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
      await fetch(`${backendUrl}/client-portals/${editingLink.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(updatedLink)
      });
    } catch (err) {
      console.warn('Failed to update client portal on backend:', err);
    }

    setIsSavingEdit(false);
    setEditModalOpen(false);
    setEditingLink(null);
    showToast(`✓ Updated client portal for ${newClientName}`);
  };

  const handleOpenDeleteConfirm = (link: SharedClientLink) => {
    setLinkToDelete(link);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!linkToDelete) return;
    setIsDeleting(true);
    const id = linkToDelete.id;
    const name = linkToDelete.clientName;

    const updated = sharedLinks.filter(l => l.id !== id);
    setSharedLinks(updated);
    try {
      localStorage.setItem(CLIENT_SHARES_STORAGE_KEY, JSON.stringify(updated));
      localStorage.setItem('tasknera_client_shares', JSON.stringify(updated));
    } catch { }

    // Clean up client JDs cache for this client
    try {
      const cleanKey = `tasknera_client_jds_${name.replace(/\s+/g, '_')}`;
      localStorage.removeItem(cleanKey);
      localStorage.removeItem(`tasknera_client_jds_${name}`);
    } catch { }

    // Call backend API to delete
    try {
      const backendUrl = getResolvedBackendUrl();
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
      await fetch(`${backendUrl}/client-portals/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
    } catch (err) {
      console.warn('Failed to delete client portal from backend:', err);
    }

    setIsDeleting(false);
    setDeleteConfirmOpen(false);
    setLinkToDelete(null);
    showToast(`✓ Revoked and deleted client portal for ${name}`);
  };

  const handleDeleteShare = (id: string, name: string) => {
    const found = sharedLinks.find(l => l.id === id);
    if (found) {
      handleOpenDeleteConfirm(found);
    } else {
      const updated = sharedLinks.filter(l => l.id !== id);
      setSharedLinks(updated);
      try {
        localStorage.setItem(CLIENT_SHARES_STORAGE_KEY, JSON.stringify(updated));
      } catch { }
      showToast(`Revoked portal link for ${name}`);
    }
  };

  const handleCopyLink = (url: string, linkId?: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setCopiedLink(true);
      if (linkId) setCopiedLinkId(linkId);
      showToast('✓ Link copied to clipboard!');
      setTimeout(() => {
        setCopiedLink(false);
        setCopiedLinkId(null);
      }, 2500);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // All authenticated users can access the Clients section
  if (false) {
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
          {sharedLinks.length > 0 && (
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
          )}
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
                    className="group bg-white border border-[#EAECF0] hover:border-[#3563E9]/40 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between relative overflow-hidden"
                  >
                    <div>
                      {/* Top Header: Client Identity & Quick Actions */}
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-white text-base shadow-xs shrink-0 ${getClientAvatarGradient(link.clientName)}`}>
                            {(link.clientName || 'C').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-base font-extrabold text-[#101828] truncate leading-tight">
                              {link.clientName}
                            </h3>
                            <p className="text-xs text-[#667085] truncate mt-0.5">
                              {link.contactName ? (
                                <span>Contact: <strong className="font-semibold text-slate-700">{link.contactName}</strong></span>
                              ) : (
                                <span className="text-slate-400">Client Talent Portal</span>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Active Link
                          </span>

                          {link.clientEmail && (
                            <a
                              href={`mailto:${link.clientEmail}?subject=${encodeURIComponent(`Hiring & JD Submission Portal: ${link.clientName}`)}&body=${encodeURIComponent(`Hello ${link.contactName || link.clientName},\n\nPlease use your secure link below to upload your Job Descriptions directly into our screening system:\n\n${link.shareUrl}\n\nBest regards,\nRecruitment Team`)}`}
                              className="p-1.5 rounded-xl text-slate-400 hover:text-[#3563E9] hover:bg-slate-100 transition-colors"
                              title={`Send email to ${link.clientEmail}`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(link)}
                            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                            title={`Edit ${link.clientName} portal details`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenDeleteConfirm(link)}
                            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title={`Delete ${link.clientName} portal`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* 2-Tile Showcase: JDs & Assigned Recruiter */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        {/* Tile 1: JDs Uploaded */}
                        <div
                          onClick={() => handleOpenJdViewer(link)}
                          className="bg-[#F8F9FC] hover:bg-[#EFF4FF] border border-[#EAECF0] hover:border-[#D1E0FF] rounded-2xl p-3.5 transition-all cursor-pointer group/tile flex flex-col justify-between"
                          title="Click to view & upload JDs"
                        >
                          <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-[#667085] group-hover/tile:text-[#3563E9]">
                            <span>Requisitions</span>
                            <span className="text-[10px] text-[#3563E9] font-bold group-hover/tile:underline">View →</span>
                          </div>
                          <div className="my-1.5 flex items-baseline gap-1.5">
                            <span className="text-xl font-black text-[#101828]">
                              {uploadedCount}
                            </span>
                            <span className="text-xs font-semibold text-[#667085]">
                              {uploadedCount === 1 ? 'Job Position' : 'Job Positions'}
                            </span>
                          </div>
                          <div className="text-[11px] font-bold text-[#3563E9] flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span>{uploadedCount > 0 ? 'Review JDs' : 'Upload First JD'}</span>
                          </div>
                        </div>

                        {/* Tile 2: Assigned Recruiter */}
                        <div
                          onClick={() => handleOpenAssignModal(link)}
                          className="bg-[#F8F9FC] hover:bg-slate-100 border border-[#EAECF0] rounded-2xl p-3.5 transition-all cursor-pointer group/rec flex flex-col justify-between"
                          title="Click to change recruiter assignment"
                        >
                          <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-[#667085]">
                            <span>Assigned To</span>
                            <svg className="w-3.5 h-3.5 text-slate-400 group-hover/rec:text-[#3563E9] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </div>
                          {assignedInfo ? (
                            <div>
                              <div className="my-1.5 flex items-center gap-1.5">
                                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold flex items-center justify-center shrink-0 border border-emerald-200">
                                  {assignedInfo.name.charAt(0)}
                                </div>
                                <span className="text-xs font-bold text-[#101828] truncate max-w-[95px]">
                                  {assignedInfo.name}
                                </span>
                              </div>
                              <div className="text-[10px] text-emerald-700 font-semibold truncate flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                <span>{assignedInfo.role || 'Technical Recruiter'}</span>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="my-1.5 text-xs font-bold text-amber-700 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-amber-400" />
                                <span>Unassigned</span>
                              </div>
                              <div className="text-[11px] font-bold text-[#3563E9] hover:underline flex items-center gap-1">
                                <span>+ Assign Lead</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Clean Share URL Bar with 1-Click Copy */}
                      <div className="mb-4 p-2.5 rounded-2xl bg-[#F8F9FC] border border-[#EAECF0] flex items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2 min-w-0 pl-1">
                          <div className="w-6 h-6 rounded-lg bg-white border border-[#EAECF0] flex items-center justify-center shrink-0 text-slate-500 shadow-2xs">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                          </div>
                          <span className="text-[11px] font-mono text-slate-600 truncate select-all" title={link.shareUrl}>
                            {link.shareUrl.replace(/^https?:\/\//, '')}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleCopyLink(link.shareUrl, link.id)}
                          className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${copiedLinkId === link.id
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white hover:bg-slate-100 text-[#101828] border border-[#EAECF0]'
                            }`}
                          title="Copy client portal link"
                        >
                          {copiedLinkId === link.id ? (
                            <>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Action Footer: Expiry + Clear Primary Actions */}
                    <div className="pt-3 border-t border-[#EAECF0] flex items-center justify-between gap-3">
                      <div className="text-[11px] text-[#667085] flex items-center gap-1">
                        <span>Expires:</span>
                        <span className="font-semibold text-slate-700">{link.expiresAt}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenJdViewer(link)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all shadow-2xs cursor-pointer"
                          title="Click to view JDs or upload a new requisition"
                        >
                          <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span>JDs ({uploadedCount})</span>
                        </button>

                        <a
                          href={link.shareUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#101828] hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                          title="Preview the exact live portal client sees"
                        >
                          <span>Preview Portal</span>
                          <svg className="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
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

                  {/* Row 5: Link Expiry */}
                  <div className="grid grid-cols-1 gap-3">
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
                        className={`shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${copiedLink
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
                          <label className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${selectedJobScope === 'ALL'
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
                              className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${selectedJobScope === job.id
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
          const safeIndex = selectedJdDetailIndex >= clientJds.length ? 0 : selectedJdDetailIndex;
          const currentJd = clientJds[safeIndex] || clientJds[0];
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
                      <div className="flex items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setViewJdModalOpen(false);
                            handleOpenQuickJdModal(activeViewJdLink);
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          <span>Upload JD for this Client</span>
                        </button>
                        <a
                          href={activeViewJdLink.shareUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#EFF4FF] text-[#3563E9] text-xs font-bold hover:bg-[#D1E0FF] transition-colors border border-[#D1E0FF]"
                        >
                          <span>Open Client Portal</span>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>
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
                                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${selectedJdDetailIndex === idx
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

                      {/* Primary Position Card - Clean & Minimal */}
                      {currentJd && (() => {
                        const cleanTitle = String(currentJd.title || '')
                          .replace(/\.(docx?|pdf|txt|rtf)(\s*\(\d+\))?$/gi, '')
                          .replace(/\s*\(\d+\)$/, '')
                          .replace(/[-_]/g, ' ')
                          .trim() || 'Job Requisition';

                        const docName = (currentJd as any).fileName || (
                          currentJd.description && currentJd.description.includes('PDF:')
                            ? currentJd.description.replace(/^.*PDF:\s*/i, '').trim()
                            : `${cleanTitle}.pdf`
                        );

                        const assignedRecruiterName = currentJd.assignedRecruiter || clientAssigned?.name;
                        const assignedRole = clientAssigned?.role || 'Technical Recruiter';

                        return (
                          <div className="space-y-4">
                            {/* Role Header & Metadata */}
                            <div className="bg-[#F8F9FC] border border-[#EAECF0] rounded-2xl p-4 space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#3563E9] bg-[#EFF4FF] px-2 py-0.5 rounded border border-[#D1E0FF]">
                                      Position #{safeIndex + 1}
                                    </span>
                                    <span className="text-[11px] font-semibold text-slate-500">
                                      {currentJd.createdAt || 'Active'}
                                    </span>
                                  </div>
                                  <h4 className="text-base font-extrabold text-[#101828]">
                                    {cleanTitle}
                                  </h4>
                                </div>
                                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0 flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  <span>{currentJd.status || 'Active Screening'}</span>
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600 pt-2 border-t border-slate-200/60">
                                <span className="px-2.5 py-1 rounded-lg bg-white border border-[#EAECF0] text-slate-700">
                                  {currentJd.mode || 'Hybrid'}
                                </span>
                                <span className="px-2.5 py-1 rounded-lg bg-white border border-[#EAECF0] text-slate-700">
                                  {currentJd.location || 'Remote / Hybrid'}
                                </span>
                                <span className="px-2.5 py-1 rounded-lg bg-white border border-[#EAECF0] text-emerald-700 font-bold">
                                  {currentJd.salary || 'Competitive Market Rate'}
                                </span>
                              </div>
                            </div>

                            {/* Recruiter Assignment Row */}
                            <div className="rounded-2xl border border-[#EAECF0] p-3.5 bg-white flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5">
                                {assignedRecruiterName ? (
                                  <>
                                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-xs flex items-center justify-center border border-emerald-200 shrink-0">
                                      {assignedRecruiterName.charAt(0)}
                                    </div>
                                    <div>
                                      <div className="text-xs font-bold text-[#101828] flex items-center gap-1.5">
                                        <span>{assignedRecruiterName}</span>
                                        <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded font-semibold border border-emerald-200">Lead</span>
                                      </div>
                                      <div className="text-[11px] text-slate-500">{assignedRole}</div>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 font-bold text-xs flex items-center justify-center border border-amber-200 shrink-0">
                                      !
                                    </div>
                                    <div>
                                      <div className="text-xs font-bold text-amber-900">Unassigned Requisition</div>
                                      <div className="text-[11px] text-amber-700">Assign a recruiter to manage candidates</div>
                                    </div>
                                  </>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setViewJdModalOpen(false);
                                  handleOpenAssignModal(activeViewJdLink);
                                }}
                                className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-800 shrink-0"
                              >
                                {assignedRecruiterName ? 'Reassign' : '+ Assign Recruiter'}
                              </button>
                            </div>

                            {/* Attached Document Card */}
                            <div className="rounded-2xl border border-[#EAECF0] p-3.5 bg-white flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#3563E9] flex items-center justify-center border border-blue-200 shrink-0">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-[#101828] truncate">{docName}</div>
                                  <div className="text-[11px] text-slate-400">Client uploaded document</div>
                                </div>
                              </div>
                              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 shrink-0">
                                Active in ATS
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>

                {/* Modal Footer - Clean & Minimal */}
                <div className="border-t border-[#EAECF0] px-6 py-3.5 flex items-center justify-between bg-slate-50/70">
                  <a
                    href={activeViewJdLink.shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#3563E9] hover:underline cursor-pointer"
                  >
                    <span>Open Live Portal</span>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setViewJdModalOpen(false)}
                      className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer transition-colors"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setViewJdModalOpen(false);
                        handleOpenQuickJdModal(activeViewJdLink);
                      }}
                      className="px-4 py-2 rounded-xl bg-[#3563E9] hover:bg-[#2851D6] text-xs font-bold text-white shadow-xs cursor-pointer transition-colors inline-flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span>Upload JD</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Quick Upload JD Modal (Direct two-way sync with client portal) */}
        {quickJdModalOpen && quickJdClient && (
          <div
            className="fixed inset-0 z-[300] flex items-center justify-center overflow-y-auto bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
            onMouseDown={e => {
              if (e.target === e.currentTarget && !isSubmittingQuickJd) setQuickJdModalOpen(false);
            }}
          >
            <div className="my-auto w-full max-w-xl rounded-2xl bg-white p-6 sm:p-7 shadow-2xl border border-[#EAECF0]">
              <div className="flex items-start justify-between border-b border-[#EAECF0] pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 shadow-xs border border-emerald-100">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-[#101828]">Upload Job Description</h2>
                    <p className="text-xs text-[#667085]">
                      Client: <span className="font-bold text-slate-800">{quickJdClient.clientName}</span> • Synchronized with live client portal
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isSubmittingQuickJd}
                  onClick={() => setQuickJdModalOpen(false)}
                  className="rounded-lg p-1.5 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleSubmitQuickJd} className="mt-5 space-y-4">
                {/* Position Title */}
                <div>
                  <label className="block text-xs font-bold text-[#101828] mb-1.5">
                    Job Title / Position Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={quickJdTitle}
                    onChange={e => setQuickJdTitle(e.target.value)}
                    placeholder="e.g. Senior Full-Stack Engineer, Product Lead, Data Scientist"
                    className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20"
                  />
                </div>

                {/* Location & Mode */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#101828] mb-1.5">
                      Location / Region
                    </label>
                    <input
                      type="text"
                      value={quickJdLocation}
                      onChange={e => setQuickJdLocation(e.target.value)}
                      placeholder="e.g. Remote, San Francisco, CA, Hybrid"
                      className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-medium text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#101828] mb-1.5">
                      Work Mode
                    </label>
                    <select
                      value={quickJdMode}
                      onChange={e => setQuickJdMode(e.target.value as any)}
                      className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20"
                    >
                      <option value="Hybrid">Hybrid</option>
                      <option value="Remote">Remote</option>
                      <option value="Onsite">Onsite</option>
                    </select>
                  </div>
                </div>

                {/* Salary & Recruiter */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#101828] mb-1.5">
                      Target Salary / Budget Range
                    </label>
                    <input
                      type="text"
                      value={quickJdSalary}
                      onChange={e => setQuickJdSalary(e.target.value)}
                      placeholder="e.g. $120,000 - $150,000 / annum"
                      className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-medium text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#101828] mb-1.5">
                      Assigned Recruiter / Owner
                    </label>
                    <select
                      value={quickJdRecruiter}
                      onChange={e => setQuickJdRecruiter(e.target.value)}
                      className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20"
                    >
                      <option value="">-- {quickJdClient.assignedMember || 'Technical Recruiter'} --</option>
                      {teamMembers.map(m => (
                        <option key={m.id} value={m.name}>
                          {m.name} • {m.role}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Description & Criteria */}
                <div>
                  <label className="block text-xs font-bold text-[#101828] mb-1.5">
                    Job Description &amp; Candidate Requirements <span className="text-[#667085] font-normal">(Optional)</span>
                  </label>
                  <textarea
                    rows={4}
                    value={quickJdDescription}
                    onChange={e => setQuickJdDescription(e.target.value)}
                    placeholder="Paste role specifications, technical requirements, must-have skills, and knockout criteria here..."
                    className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-medium text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20 resize-none font-sans"
                  />
                </div>

                <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-900 flex items-start gap-2">
                  <svg className="w-4 h-4 text-[#3563E9] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>
                    This Job Description will be immediately linked to <span className="font-bold">{quickJdClient.clientName}</span>'s portal and registered in HireIQ deterministic ATS screening.
                  </span>
                </div>

                <div className="mt-6 flex items-center justify-end gap-3 border-t border-[#EAECF0] pt-4">
                  <button
                    type="button"
                    disabled={isSubmittingQuickJd}
                    onClick={() => setQuickJdModalOpen(false)}
                    className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-semibold text-[#182230] hover:bg-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingQuickJd || !quickJdTitle.trim()}
                    className="rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSubmittingQuickJd ? (
                      <>
                        <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        <span>Uploading JD...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Upload &amp; Sync JD</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Client Portal Modal */}
        {editModalOpen && editingLink && (
          <div
            className="fixed inset-0 z-[300] flex items-center justify-center overflow-y-auto bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
            onMouseDown={e => {
              if (e.target === e.currentTarget && !isSavingEdit) setEditModalOpen(false);
            }}
          >
            <div className="my-auto w-full max-w-xl rounded-2xl bg-white p-6 sm:p-7 shadow-2xl border border-[#EAECF0]">
              <div className="flex items-start justify-between border-b border-[#EAECF0] pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#3563E9] shadow-xs border border-blue-100">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-[#101828]">Edit Client Portal</h2>
                    <p className="text-xs text-[#667085]">
                      Update client details, contact information, validity, or assigned recruiter
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={() => setEditModalOpen(false)}
                  className="rounded-lg p-1.5 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                >
                  ×
                </button>
              </div>

              <div className="mt-5 space-y-4">
                {/* Row 1: Company Name & Contact Name */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#101828] mb-1.5">
                      Client Company Name <span className="text-[#3563E9]">*</span>
                    </label>
                    <input
                      type="text"
                      value={editClientName}
                      onChange={e => setEditClientName(e.target.value)}
                      placeholder="e.g. Acme Corporation, Stripe, etc."
                      className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#101828] mb-1.5">
                      Client Contact / Hiring Manager
                    </label>
                    <input
                      type="text"
                      value={editContactName}
                      onChange={e => setEditContactName(e.target.value)}
                      placeholder="e.g. John Doe (Talent Lead)"
                      className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20"
                    />
                  </div>
                </div>

                {/* Row 2: Email & Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#101828] mb-1.5">
                      Client Email Address
                    </label>
                    <input
                      type="email"
                      value={editClientEmail}
                      onChange={e => setEditClientEmail(e.target.value)}
                      placeholder="e.g. hiring.lead@client.com"
                      className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-medium text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#101828] mb-1.5">
                      Client Phone / WhatsApp
                    </label>
                    <input
                      type="tel"
                      value={editClientPhone}
                      onChange={e => setEditClientPhone(e.target.value)}
                      placeholder="e.g. +1 (555) 019-2834"
                      className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-medium text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20"
                    />
                  </div>
                </div>

                {/* Row 3: Instructions / Welcome Note */}
                <div>
                  <label className="block text-xs font-bold text-[#101828] mb-1.5">
                    Instructions / Welcome Note for Client
                  </label>
                  <textarea
                    rows={2}
                    value={editWelcomeNote}
                    onChange={e => setEditWelcomeNote(e.target.value)}
                    placeholder="e.g. Please upload your open role descriptions here."
                    className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-medium text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20 resize-none"
                  />
                </div>

                {/* Row 4: Assigned Recruiter */}
                <div>
                  <label className="block text-xs font-bold text-[#101828] mb-1.5">
                    Assigned Requisition Owner / Recruiter
                  </label>
                  <select
                    value={editAssignedMember}
                    onChange={e => setEditAssignedMember(e.target.value)}
                    className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20"
                  >
                    <option value="">-- No Recruiter Assigned (Unassigned) --</option>
                    {teamMembers.map(m => (
                      <option key={m.id} value={m.name}>
                        {m.name} • {m.role} {m.team ? `(${m.team})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Row 5: Link Validity */}
                <div>
                  <label className="block text-xs font-bold text-[#101828] mb-1.5">
                    Link Validity / Expiration
                  </label>
                  <select
                    value={editExpirationOption}
                    onChange={e => setEditExpirationOption(e.target.value)}
                    className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20"
                  >
                    <option value="keep">Keep Current ({editingLink.expiresAt})</option>
                    <option value="14">Set / Extend by 14 Days</option>
                    <option value="30">Set / Extend by 30 Days</option>
                    <option value="60">Set / Extend by 60 Days</option>
                    <option value="90">Set / Extend by 90 Days</option>
                    <option value="never">Permanent (Never expires)</option>
                  </select>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 border-t border-[#EAECF0] pt-4">
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={() => setEditModalOpen(false)}
                  className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-semibold text-[#182230] hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={handleSaveEdit}
                  className="rounded-xl bg-[#3563E9] px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#2851D6] transition-colors cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  {isSavingEdit ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Client Portal Confirmation Modal */}
        {deleteConfirmOpen && linkToDelete && (
          <div
            className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={(e) => {
              if (e.target === e.currentTarget && !isDeleting) setDeleteConfirmOpen(false);
            }}
          >
            <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
              <div className="p-6 text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shadow-xs">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">
                  Delete Client Portal?
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                  Are you sure you want to delete the portal for <span className="font-bold text-slate-800">{linkToDelete.clientName}</span>? This will immediately revoke the public upload link and remove this client.
                </p>
                <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-left text-[11px] space-y-1">
                  <div className="flex justify-between text-slate-600">
                    <span>Client:</span>
                    <span className="font-bold text-slate-900">{linkToDelete.clientName}</span>
                  </div>
                  {linkToDelete.contactName && (
                    <div className="flex justify-between text-slate-600">
                      <span>Contact:</span>
                      <span className="font-medium text-slate-900">{linkToDelete.contactName}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600">
                    <span>Expires:</span>
                    <span className="font-medium text-slate-900">{linkToDelete.expiresAt}</span>
                  </div>
                </div>
              </div>
              <div className="border-t border-slate-100 px-6 py-4 bg-slate-50 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-xs cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  {isDeleting ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span>Confirm Delete</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

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
