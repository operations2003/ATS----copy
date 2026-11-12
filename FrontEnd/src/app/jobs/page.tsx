'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useAuth } from '@/context/AuthContext';
import { atsStore } from '@/lib/atsStore';
import CandidateLinkModal from '@/components/CandidateLinkModal';

interface JobWorker {
  id: string;
  name: string;
  email?: string;
  role?: string;
  action?: string;
  isCreator?: boolean;
}

interface JobItem {
  id: string;
  title: string;
  client: string;
  location: string;
  mode: string;
  salary: string;
  candidates: number;
  topScore: number | null;
  status: string;
  created: string;
  workedBy: JobWorker[];
  assignedRecruiter?: string;
}

const modeColors: Record<string, string> = {
  Remote: 'bg-blue-50 text-blue-700 border-blue-200',
  Hybrid: 'bg-purple-50 text-purple-700 border-purple-200',
  Onsite: 'bg-amber-50 text-amber-700 border-amber-200',
};

const statusColors: Record<string, string> = {
  Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Draft:  'bg-amber-50 text-amber-700 border-amber-200',
  Closed: 'bg-slate-100 text-slate-600 border-slate-200',
};

const AVATAR_PALETTES = [
  'bg-gradient-to-br from-indigo-500 to-purple-600 text-white',
  'bg-gradient-to-br from-emerald-500 to-teal-600 text-white',
  'bg-gradient-to-br from-amber-500 to-orange-600 text-white',
  'bg-gradient-to-br from-blue-500 to-cyan-600 text-white',
  'bg-gradient-to-br from-rose-500 to-pink-600 text-white',
  'bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white',
];

function getAvatarStyle(name: string = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[index];
}

function getInitials(name: string = '') {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (name.slice(0, 2) || 'TA').toUpperCase();
}

const isExcludedWorker = (w?: JobWorker | null) => {
  if (!w) return true;
  const name = (w.name || '').toLowerCase().trim();
  const email = (w.email || '').toLowerCase().trim();
  return (
    name === 'tasknera user' ||
    name === 'tasknera' ||
    name === 'unassigned' ||
    email.startsWith('frontend_user') ||
    email.includes('frontend_user') ||
    email.includes('tasknera_user')
  );
};

function WorkedByMembers({ workers = [], isCompact = false }: { workers: JobWorker[]; isCompact?: boolean }) {
  const activeWorkers = (workers || []).filter(w => !isExcludedWorker(w));
  if (!activeWorkers || activeWorkers.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-slate-400">
        <span className="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[9px] font-bold text-slate-400">?</span>
        <span className="text-xs italic font-medium">Unassigned</span>
      </div>
    );
  }

  if (activeWorkers.length === 1) {
    const w = activeWorkers[0];
    return (
      <div className="flex items-center gap-2 group/single relative">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shadow-sm shrink-0 ${getAvatarStyle(w.name)}`}>
          {getInitials(w.name)}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-bold text-slate-800 truncate max-w-[170px]">
            {w.name}
          </div>
          <div className="text-[10px] text-slate-400 font-medium truncate max-w-[170px]">
            {w.action === 'Uploaded JD' || w.action === 'Created Requisition' ? 'Job Creator' : (w.action || (w.role === 'ADMIN' ? 'Administrator' : 'Recruiter'))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative group/team inline-block">
      <div className="flex items-center gap-2 cursor-pointer py-1 px-1.5 rounded-xl hover:bg-slate-100/90 transition-all">
        {/* Overlapping avatar cluster */}
        <div className="flex -space-x-2 overflow-hidden items-center py-0.5">
          {activeWorkers.slice(0, 3).map((w, idx) => (
            <div
              key={w.id || idx}
              title={`${w.name} (${w.action || w.role || 'Member'})`}
              className={`w-6 h-6 rounded-full ring-2 ring-white flex items-center justify-center text-[9px] font-black shadow-xs shrink-0 ${getAvatarStyle(w.name)}`}
            >
              {getInitials(w.name)}
            </div>
          ))}
          {activeWorkers.length > 3 && (
            <div className="w-6 h-6 rounded-full ring-2 ring-white bg-slate-800 text-white flex items-center justify-center text-[9px] font-bold shadow-xs shrink-0">
              +{activeWorkers.length - 3}
            </div>
          )}
        </div>

        <div className="text-left">
          <div className="text-xs font-bold text-slate-800 leading-tight">
            {activeWorkers[0].name.split(' ')[0]} <span className="text-slate-400 font-semibold">& {activeWorkers.length - 1} more</span>
          </div>
          <div className="text-[10px] font-semibold text-brand-orange">
            {activeWorkers.length} Assigned
          </div>
        </div>
      </div>

      {/* Floating interactive Popover on hover */}
      <div className="absolute left-0 bottom-full mb-2 hidden group-hover/team:block z-50 w-72 bg-slate-900 text-white rounded-2xl p-3.5 shadow-2xl border border-slate-700/90 animate-in fade-in zoom-in-95 duration-150 pointer-events-none">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-brand-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Working On This Job</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 bg-brand-orange/20 text-brand-orange border border-brand-orange/30 rounded-full font-bold">{activeWorkers.length} Members</span>
        </div>


        <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
          {activeWorkers.map((w, idx) => (
            <div key={w.id || idx} className="flex items-center gap-2.5">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shadow-xs shrink-0 ${getAvatarStyle(w.name)}`}>
                {getInitials(w.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span className="truncate">{w.name}</span>
                  {w.isCreator && (
                    <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded font-semibold shrink-0">Owner</span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                  <span>{w.action || (w.role === 'ADMIN' ? 'Administrator' : 'Recruiter')}</span>
                  {w.email && <span className="text-slate-500">• {w.email}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatCleanPositionTitle(raw?: string | null): string {
  if (!raw) return 'Untitled Position';
  let t = raw.trim();

  if (/gtm\s+planning/i.test(t)) {
    return 'Demand Generation & GTM Lead';
  }

  t = t
    .replace(/^(?:overview\s+own\s+|role\s+overview:\s*|job\s+overview:\s*|overview:\s*|overview\s+|role:\s*|position:\s*)/i, '')
    .trim();
  t = t.replace(/\s+(?:for|and|to|with|in|at)$/i, '').trim();
  if (/^own\s+/i.test(t)) {
    t = t.replace(/^own\s+/i, '').trim();
  }
  return t || raw;
}

export default function JobsPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN' || user?.email?.toLowerCase().trim() === 'operations@tasknera.com' || user?.email?.toLowerCase().trim() === 'admin@gmail.com';
  const canUploadJd = isSuperAdmin || user?.allowJdUpload !== false;
  const [allJobs, setAllJobs] = useState<JobItem[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'All' | 'MyJobs' | 'Active' | 'Draft' | 'Closed'>('All');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedJobForLink, setSelectedJobForLink] = useState<JobItem | null>(null);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);

  const fetchJobs = async () => {
    try {
      setIsLoading(true);
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;

      const isBadJob = (j: any) => {
        const id = String(j?.id || '');
        const title = String(j?.position || j?.title || '').toLowerCase().trim();
        const client = String(j?.client || j?.company || '').toLowerCase().trim();
        return (
          id === 'b069cc8a-8e5d-47e4-8444-1c9ed2a0258b' ||
          id === '83838c13-a542-457c-a696-1289c9734869' ||
          id.includes('1788597184624') ||
          id.startsWith('jd-mock') ||
          id.startsWith('jd-dummy') ||
          id.startsWith('jd-test') ||
          client === 'test client' ||
          client === 'test client 2' ||
          client.includes('test client') ||
          title === 'test engineer' ||
          title === 'test engineer 2' ||
          title.includes('test engineer') ||
          (title === 'test' && client.includes('test'))
        );
      };

      let localCreatedJobs: any[] = [];
      if (typeof window !== 'undefined') {
        try {
          const raw = JSON.parse(localStorage.getItem('tasknera_created_jobs') || '[]');
          const currentUserId = user?.id;
          const currentUserEmail = user?.email?.toLowerCase();
          const currentUserName = user?.name || (user?.email ? user.email.split('@')[0] : '');
          const isAdmin = user?.role === 'ADMIN' || user?.role === 'CLIENT_ADMIN' || user?.role === 'SUPER_ADMIN';

          // Clean legacy test/bad jobs out of localStorage permanently & sanitize messy titles
          if (Array.isArray(raw)) {
            const cleaned = raw
              .filter((j: any) => !isBadJob(j))
              .map((j: any) => {
                const pos = j.position || j.title;
                if (pos && (/gtm\s+planning/i.test(pos) || /^overview\s+own/i.test(pos))) {
                  return { ...j, position: formatCleanPositionTitle(pos), title: formatCleanPositionTitle(pos) };
                }
                return j;
              });
            localStorage.setItem('tasknera_created_jobs', JSON.stringify(cleaned));
          }

          const rawAll = JSON.parse(localStorage.getItem('tasknera_all_jobs') || '[]');
          if (Array.isArray(rawAll)) {
            const cleanedAll = rawAll
              .filter((j: any) => !isBadJob(j))
              .map((j: any) => {
                const pos = j.position || j.title;
                if (pos && (/gtm\s+planning/i.test(pos) || /^overview\s+own/i.test(pos))) {
                  return { ...j, position: formatCleanPositionTitle(pos), title: formatCleanPositionTitle(pos) };
                }
                return j;
              });
            localStorage.setItem('tasknera_all_jobs', JSON.stringify(cleanedAll));
          }

          const currentOrgId = user?.organizationId || 'org-tasknera';
          const isSuperAdmin = user?.role === 'SUPER_ADMIN';

          localCreatedJobs = (Array.isArray(raw) ? raw : []).filter((j: any) => {
            if (isBadJob(j)) return false;
            const jOrgId = j.organizationId || 'org-tasknera';
            if (!isSuperAdmin && jOrgId !== currentOrgId) return false;
            if (isAdmin) return true;
            if (!currentUserId && !currentUserEmail && !currentUserName) return false;
            const jUserId = j.created_by || j.createdBy;
            const jEmail = (j.creatorEmail || j.email || '').toLowerCase();
            const jAssigned = (j.assignedRecruiter || j.assignedTo || '').toLowerCase();
            const jWorkers = Array.isArray(j.workedBy) ? j.workedBy : [];
            const isAssigned = (
              (currentUserName && jAssigned.includes(currentUserName.toLowerCase())) ||
              (currentUserEmail && jAssigned.includes(currentUserEmail)) ||
              jWorkers.some((w: any) =>
                (currentUserName && w.name && w.name.toLowerCase().includes(currentUserName.toLowerCase())) ||
                (currentUserEmail && w.email && w.email.toLowerCase() === currentUserEmail)
              )
            );
            return (currentUserId && jUserId === currentUserId) || (currentUserEmail && jEmail === currentUserEmail) || isAssigned;
          });
        } catch (e) {}
      }

      let fetchedRaw: any[] = [];
      try {
        const res = await fetch(`${backendUrl}/jobs`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.jobs)) {
            fetchedRaw = data.jobs;
          } else if (Array.isArray(data.data)) {
            fetchedRaw = data.data;
          }
        }
      } catch (e) {
        console.warn('API fetch warning:', e);
      }

      // Merge live API jobs with any un-synced local jobs cleanly
      const combinedMap = new Map<string, any>();
      for (const item of fetchedRaw) {
        if (!isBadJob(item)) {
          combinedMap.set(String(item.id), item);
        }
      }
      for (const local of localCreatedJobs) {
        if (!isBadJob(local) && !combinedMap.has(String(local.id))) {
          // Avoid duplicate entry if a job with the same client and position title already exists
          const localTitle = (local.position || local.title || '').trim().toLowerCase();
          const localClient = (local.client || '').trim().toLowerCase();
          const existsInCombined = Array.from(combinedMap.values()).some((existing: any) => {
            const exTitle = (existing.position || existing.title || '').trim().toLowerCase();
            const exClient = (existing.client || '').trim().toLowerCase();
            return exTitle.length > 0 && exTitle === localTitle && exClient === localClient;
          });

          if (!existsInCombined) {
            combinedMap.set(String(local.id), local);
          }
        }
      }

      // Reconcile client shares and uploaded JDs so assigned client positions appear immediately in the person's jobs
      if (typeof window !== 'undefined') {
        try {
          const clientSharesRaw = localStorage.getItem('tasknera_client_shares');
          if (clientSharesRaw) {
            const clientShares = JSON.parse(clientSharesRaw);
            if (Array.isArray(clientShares)) {
              for (const share of clientShares) {
                if (share.clientName) {
                  const clientKey = `tasknera_client_jds_${share.clientName.replace(/\s+/g, '_')}`;
                  const cjRaw = localStorage.getItem(clientKey);
                  let cjList: any[] = [];
                  if (cjRaw) {
                    try { cjList = JSON.parse(cjRaw); } catch {}
                  }
                  if (!Array.isArray(cjList) || cjList.length === 0) {
                    // Check atsStore
                    const atsMatching = atsStore.getJobs().filter(j => j.client?.toLowerCase().trim() === share.clientName.toLowerCase().trim());
                    if (atsMatching.length > 0) {
                      cjList = atsMatching.map(m => ({
                        id: m.id,
                        title: m.title,
                        assignedRecruiter: m.assignedRecruiter,
                        location: m.location,
                        mode: m.mode,
                        salary: m.salary,
                        description: m.description
                      }));
                    }
                  }

                  if (Array.isArray(cjList)) {
                    for (const cj of cjList) {
                      const effectiveRecruiter = cj.assignedRecruiter || share.assignedMember;
                      const effectiveRole = cj.assignedMemberRole || share.assignedMemberRole || 'Technical Recruiter';
                      const cjTitle = cj.title || cj.name || 'Job Requisition';
                      const cjId = String(cj.id || `job-client-${share.clientName}-${cjTitle}`);

                      const alreadyInMap = Array.from(combinedMap.values()).some((existing: any) =>
                        String(existing.id) === cjId ||
                        ((existing.client || '').toLowerCase().trim() === share.clientName.toLowerCase().trim() &&
                         (existing.position || existing.title || '').toLowerCase().trim() === cjTitle.toLowerCase().trim())
                      );

                      if (!alreadyInMap && !isBadJob(cj)) {
                        const worker = effectiveRecruiter && effectiveRecruiter !== 'Unassigned' ? [{
                          id: `rec-${effectiveRecruiter.toLowerCase().replace(/\s+/g, '-')}`,
                          name: effectiveRecruiter,
                          role: effectiveRole,
                          action: 'Assigned Lead',
                          isCreator: false
                        }] : [];

                        combinedMap.set(cjId, {
                          id: cjId,
                          position: cjTitle,
                          title: cjTitle,
                          client: share.clientName,
                          company: share.clientName,
                          location: cj.location || 'Remote / Hybrid',
                          work_mode: cj.workMode || cj.mode || 'Hybrid',
                          workMode: cj.workMode || cj.mode || 'Hybrid',
                          mode: cj.workMode || cj.mode || 'Hybrid',
                          salary: cj.salary || 'Competitive Market Rate',
                          status: 'Active',
                          created_at: cj.createdAt || new Date().toISOString(),
                          createdAt: cj.createdAt || new Date().toISOString(),
                          assignedRecruiter: effectiveRecruiter && effectiveRecruiter !== 'Unassigned' ? effectiveRecruiter : undefined,
                          assignedTo: effectiveRecruiter && effectiveRecruiter !== 'Unassigned' ? effectiveRecruiter : undefined,
                          workedBy: worker,
                          candidatesCount: 0,
                          candidates: 0,
                          topScore: null,
                          description: cj.description || `Requisition intake for ${share.clientName}`
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn('Client share reconcile warning:', e);
        }
      }

      // Reconcile any remaining atsStore jobs
      try {
        const atsJobs = atsStore.getJobs();
        for (const aj of atsJobs) {
          if (!isBadJob(aj)) {
            const ajTitle = (aj.title || '').trim().toLowerCase();
            const ajClient = (aj.client || '').trim().toLowerCase();
            const alreadyExists = Array.from(combinedMap.values()).some((existing: any) => {
              const exTitle = (existing.position || existing.title || '').trim().toLowerCase();
              const exClient = (existing.client || '').trim().toLowerCase();
              return (exTitle && exTitle === ajTitle && exClient === ajClient) || String(existing.id) === String(aj.id);
            });

            if (!alreadyExists) {
              const worker = aj.assignedRecruiter ? [{
                id: `rec-${aj.assignedRecruiter.toLowerCase().replace(/\s+/g, '-')}`,
                name: aj.assignedRecruiter,
                role: 'Lead Recruiter',
                action: 'Assigned Lead',
                isCreator: false
              }] : [];

              combinedMap.set(String(aj.id), {
                id: aj.id,
                position: aj.title,
                title: aj.title,
                client: aj.client,
                company: aj.client,
                location: aj.location,
                work_mode: aj.mode,
                workMode: aj.mode,
                mode: aj.mode,
                salary: aj.salary,
                status: aj.status,
                created_at: new Date(Date.now() - (aj.createdAtDaysAgo || 0) * 86400000).toISOString(),
                assignedRecruiter: aj.assignedRecruiter,
                workedBy: aj.workedBy && aj.workedBy.length > 0 ? aj.workedBy : worker,
                candidatesCount: aj.candidates || 0,
                candidates: aj.candidates || 0,
                topScore: aj.topScore || null,
                description: aj.description
              });
            }
          }
        }
      } catch (err) {
        console.warn('atsStore merge warning:', err);
      }
      const combined = Array.from(combinedMap.values());

      const mappedJobs: JobItem[] = combined.map((j: any) => {
        const rawStatus = (j.status || 'Active').toLowerCase();
        let normalizedStatus = 'Active';
        if (rawStatus === 'draft') {
          normalizedStatus = 'Draft';
        } else if (rawStatus === 'closed' || rawStatus === 'archived') {
          normalizedStatus = 'Closed';
        } else {
          normalizedStatus = 'Active';
        }

        const rawMode = (j.work_mode || j.workMode || 'Remote').trim();
        const normalizedMode = rawMode.charAt(0).toUpperCase() + rawMode.slice(1).toLowerCase();

        // Compute workers from DB or assigned recruiter
        const currentUserName = user?.name || (user?.email ? user.email.split('@')[0] : 'Ram Charan');
        const currentUserRole = user?.role || 'MEMBER';
        const isCurrentAuthUser = (j.created_by && user?.id && j.created_by === user.id) ||
                                  (j.createdBy && user?.id && j.createdBy === user.id) ||
                                  (j.creatorEmail && user?.email && j.creatorEmail.toLowerCase() === user.email.toLowerCase());

        const rawWorkedBy: JobWorker[] = Array.isArray(j.workedBy) && j.workedBy.length > 0
          ? j.workedBy
          : (j.user
              ? [{
                  id: j.user.id || (isCurrentAuthUser ? user?.id : 'usr-creator'),
                  name: j.user.name || (j.user.email ? j.user.email.split('@')[0] : (isCurrentAuthUser ? currentUserName : 'Recruiter')),
                  email: j.user.email || (isCurrentAuthUser ? user?.email : undefined),
                  role: j.user.role || (isCurrentAuthUser ? currentUserRole : 'MEMBER'),
                  action: 'Uploaded JD',
                  isCreator: true
                }]
              : (j.assignedRecruiter
                  ? j.assignedRecruiter.split(',').map((nameStr: string, idx: number) => {
                      const trimmed = nameStr.trim();
                      return {
                        id: `rec-${idx}`,
                        name: trimmed,
                        email: `${trimmed.toLowerCase().replace(/\s+/g, '.')}@tasknera.com`,
                        role: idx === 0 ? 'Lead Recruiter' : 'Recruiter',
                        action: idx === 0 ? 'Job Lead' : 'Candidate Screener',
                        isCreator: idx === 0
                      };
                    })
                  : [{
                      id: isCurrentAuthUser ? (user?.id || 'usr-creator') : 'usr-owner',
                      name: isCurrentAuthUser ? currentUserName : (user?.name || 'Job Creator'),
                      email: isCurrentAuthUser ? user?.email : 'recruiter@tasknera.com',
                      role: isCurrentAuthUser ? currentUserRole : 'MEMBER',
                      action: 'Uploaded JD',
                      isCreator: true
                    }]
                )
            );

        const workedBy: JobWorker[] = rawWorkedBy.filter(w => !isExcludedWorker(w));
        if (workedBy.length === 0) {
          workedBy.push({
            id: user?.id || 'usr-creator',
            name: user?.name || (user?.email ? user.email.split('@')[0] : 'Ram Charan'),
            email: user?.email,
            role: user?.role || 'MEMBER',
            action: 'Uploaded JD',
            isCreator: true
          });
        }

        const validAssignedRecruiter = workedBy.map(w => w.name).join(', ') || (j.user?.name || user?.name || 'Job Creator');


        let localCandCount = 0;
        if (typeof window !== 'undefined') {
          try {
            const rawCount = localStorage.getItem(`tasknera_candidates_count_${j.id}`);
            if (rawCount) localCandCount = parseInt(rawCount, 10) || 0;

            const candList = JSON.parse(localStorage.getItem(`tasknera_candidates_${j.id}`) || '[]');
            if (Array.isArray(candList) && candList.length > localCandCount) {
              localCandCount = candList.length;
            }

            const createdList = JSON.parse(localStorage.getItem('tasknera_created_jobs') || '[]');
            const foundJob = createdList.find((cj: any) => String(cj.id) === String(j.id));
            if (foundJob) {
              const cjCount = typeof foundJob.candidatesCount === 'number' ? foundJob.candidatesCount : (typeof foundJob.candidates === 'number' ? foundJob.candidates : 0);
              if (cjCount > localCandCount) localCandCount = cjCount;
            }
          } catch {}
        }

        const apiCandCount = typeof j.candidatesCount === 'number' ? j.candidatesCount : (Array.isArray(j.candidates) ? j.candidates.length : (typeof j.candidates === 'number' ? j.candidates : 0));
        const finalCandidateCount = Math.max(apiCandCount, localCandCount);

        return {
          id: String(j.id),
          title: formatCleanPositionTitle(j.position || j.title),
          client: j.client || j.company || 'Client Not Specified',
          location: j.location || 'Location Not Specified',
          mode: ['Remote', 'Hybrid', 'Onsite'].includes(normalizedMode) ? normalizedMode : 'Remote',
          salary: j.salary || 'Competitive',
          candidates: finalCandidateCount,
          topScore: typeof j.topScore === 'number' ? j.topScore : (normalizedStatus === 'Active' ? 92 : null),
          status: normalizedStatus,
          created: j.created_at ? new Date(j.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recent',
          workedBy,
          assignedRecruiter: validAssignedRecruiter
        };
      });

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('tasknera_all_jobs', JSON.stringify(combined));
        } catch {}
      }

      setAllJobs(mappedJobs);
    } catch (err) {
      console.warn('Error fetching jobs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [user]);

  const handleDeleteJob = async (id: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete "${title}"?`)) return;
    try {
      setDeletingId(id);
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;

      // Update local storage
      if (typeof window !== 'undefined') {
        try {
          const existing = JSON.parse(localStorage.getItem('tasknera_created_jobs') || '[]');
          const updated = existing.filter((x: any) => String(x.id) !== String(id));
          localStorage.setItem('tasknera_created_jobs', JSON.stringify(updated));

          const allSaved = JSON.parse(localStorage.getItem('tasknera_all_jobs') || '[]');
          const updatedAll = allSaved.filter((x: any) => String(x.id) !== String(id));
          localStorage.setItem('tasknera_all_jobs', JSON.stringify(updatedAll));
        } catch (e) {}
      }

      // Call API
      try {
        await fetch(`${backendUrl}/jobs/${id}`, {
          method: 'DELETE',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          }
        });
      } catch (e) {
        console.warn('Backend delete error (using local removal fallback):', e);
      }

      setAllJobs(prev => prev.filter(j => j.id !== id));
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleStatusChange = async (id: string, newStatus: 'Active' | 'Draft' | 'Closed') => {
    // 1. Optimistic UI update
    setAllJobs(prev => prev.map(j => j.id === id ? { ...j, status: newStatus } : j));

    // 2. LocalStorage sync
    if (typeof window !== 'undefined') {
      try {
        const existing = JSON.parse(localStorage.getItem('tasknera_created_jobs') || '[]');
        const updated = existing.map((x: any) => String(x.id) === String(id) ? { ...x, status: newStatus } : x);
        localStorage.setItem('tasknera_created_jobs', JSON.stringify(updated));

        const allSaved = JSON.parse(localStorage.getItem('tasknera_all_jobs') || '[]');
        const updatedAll = allSaved.map((x: any) => String(x.id) === String(id) ? { ...x, status: newStatus } : x);
        localStorage.setItem('tasknera_all_jobs', JSON.stringify(updatedAll));
      } catch (e) {}
    }

    // 3. atsStore sync
    try {
      atsStore.updateJobStatus(id, newStatus, 'Recruiter Member', 'MEMBER');
    } catch (e) {}

    // 4. Backend PUT sync
    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
      await fetch(`${backendUrl}/jobs/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ status: newStatus.toLowerCase() })
      });
    } catch (e) {
      console.warn('Backend status update warning:', e);
    }
  };

  const currentUserName = user?.name || (user?.email ? user.email.split('@')[0] : '');
  const currentUserEmail = user?.email?.toLowerCase() || '';

  const isAssignedToCurrentUser = (j: JobItem) => {
    if (!currentUserName && !currentUserEmail) return true;
    const qName = currentUserName.toLowerCase();
    const hasWorked = j.workedBy && j.workedBy.some(w => 
      (qName && w.name.toLowerCase().includes(qName)) ||
      (currentUserEmail && w.email && w.email.toLowerCase() === currentUserEmail)
    );
    const hasAssigned = j.assignedRecruiter && (
      (qName && j.assignedRecruiter.toLowerCase().includes(qName)) ||
      (currentUserEmail && j.assignedRecruiter.toLowerCase().includes(currentUserEmail))
    );
    return Boolean(hasWorked || hasAssigned);
  };

  const filtered = allJobs.filter(j => {
    const q = search.toLowerCase();
    const matchesSearch =
      j.title.toLowerCase().includes(q) ||
      j.client.toLowerCase().includes(q) ||
      j.location.toLowerCase().includes(q) ||
      (j.workedBy && j.workedBy.some(w => w.name.toLowerCase().includes(q))) ||
      (j.assignedRecruiter && j.assignedRecruiter.toLowerCase().includes(q));

    let matchesFilter = true;
    if (filter === 'MyJobs') {
      matchesFilter = isAssignedToCurrentUser(j);
    } else if (filter !== 'All') {
      matchesFilter = j.status === filter;
    }
    return matchesSearch && matchesFilter;
  });

  const myJobsCount = allJobs.filter(isAssignedToCurrentUser).length;

  const counts = {
    All: allJobs.length,
    MyJobs: myJobsCount,
    Active: allJobs.filter(j => j.status === 'Active').length,
    Draft: allJobs.filter(j => j.status === 'Draft').length,
    Closed: allJobs.filter(j => j.status === 'Closed').length,
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-sans">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        {/* Top Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-orange-pale text-brand-orange text-xs font-bold uppercase tracking-wider mb-2 border border-brand-orange/20">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-pulse" />
              Jobs Directory
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Active Jobs & JDs</h1>
            <p className="text-sm text-slate-500 mt-1">Manage positions, monitor assigned TA teams, review job criteria, and run automated candidate matching</p>
          </div>

          {canUploadJd && (
            <div className="flex flex-wrap items-center gap-3">
            <Link href="/jobs/generate" className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-xs transition-all duration-200 whitespace-nowrap active:scale-95">
              <span aria-hidden="true">✦</span><span>Create JD with AI</span>
            </Link>
            <Link
              href="/jobs/create"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#3563E9] hover:bg-[#2851D6] text-white text-xs font-bold shadow-xs transition-all duration-200 whitespace-nowrap active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              <span>New Job</span>
            </Link>
            </div>
          )}
        </div>

        {/* Stats Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Jobs / JDs', value: counts.All, color: 'text-slate-900', badge: 'bg-slate-100 text-slate-700 border-slate-200', icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
            { label: 'Active Pipeline', value: counts.Active, color: 'text-emerald-600', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
            { label: 'Draft', value: counts.Draft, color: 'text-amber-600', badge: 'bg-amber-50 text-amber-700 border-amber-200', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
            { label: 'Closed / Filled', value: counts.Closed, color: 'text-slate-500', badge: 'bg-slate-50 text-slate-600 border-slate-200', icon: 'M5 13l4 4L19 7' },
          ].map(stat => (
            <div key={stat.label} className="bg-white border border-slate-200/90 rounded-3xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{stat.label}</span>
                <div className={`w-7 h-7 rounded-xl flex items-center justify-center border ${stat.badge}`}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={stat.icon} />
                  </svg>
                </div>

              </div>
              <div className={`text-3xl font-extrabold ${stat.color}`}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Filter Controls Bar */}
        <div className="bg-white border border-slate-200/90 rounded-3xl p-4 shadow-sm mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-96">
            <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by position title, client, location, or recruiter..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#F8FAFC] border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange transition-all"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            <div className="flex items-center gap-1 bg-[#F8FAFC] p-1 rounded-xl border border-slate-200">
              {([
                { key: 'All', label: 'All Jobs' },
                { key: 'MyJobs', label: 'Assigned to Me' },
                { key: 'Active', label: 'Active' },
                { key: 'Draft', label: 'Draft' },
                { key: 'Closed', label: 'Closed' },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    filter === tab.key
                      ? 'bg-brand-orange text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                  }`}
                >
                  {tab.label} ({counts[tab.key]})
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 bg-[#F8FAFC] p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white shadow-xs text-brand-orange' : 'text-slate-400 hover:text-slate-700'}`}
                title="Table View"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-xs text-brand-orange' : 'text-slate-400 hover:text-slate-700'}`}
                title="Grid View"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Content Display */}
        {isLoading ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 shadow-sm">
            <div className="w-8 h-8 border-4 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="mt-4 text-sm text-slate-500 font-medium">Fetching your jobs & JDs...</p>
          </div>

        ) : filtered.length > 0 ? (
          viewMode === 'table' ? (
          <div className="bg-white border border-slate-200/90 rounded-3xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-[#F1F5F9] text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-6 py-4">Position Title</th>
                    <th className="px-4 py-4">Assigned TA</th>
                    <th className="px-4 py-4 hidden lg:table-cell">Compensation</th>
                    <th className="px-4 py-4 text-center">Work Mode</th>
                    <th className="px-4 py-4 text-center">Applicants</th>
                    <th className="px-4 py-4 text-center">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filtered.map(j => (
                    <tr key={j.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <Link href={`/jobs/${j.id}/requirements`} className="text-sm font-bold text-[#1E293B] group-hover:text-brand-orange transition-colors">
                          {j.title}
                        </Link>
                        <div className="text-xs text-slate-500 mt-0.5">{j.client} • {j.location}</div>
                      </td>
                      <td className="px-4 py-4">
                        <WorkedByMembers workers={j.workedBy} />
                      </td>
                      <td className="px-4 py-4 hidden lg:table-cell">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600">
                          <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          {j.salary}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${modeColors[j.mode] || modeColors.Remote}`}>
                          {j.mode === 'Remote' && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />}
                          {j.mode === 'Hybrid' && <span className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block" />}
                          {j.mode === 'Onsite' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />}
                          {j.mode}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="font-bold text-[#1E293B]">{j.candidates}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="relative inline-block">
                          <select
                            value={j.status}
                            onChange={(e) => handleStatusChange(j.id, e.target.value as 'Active' | 'Draft' | 'Closed')}
                            className={`text-xs font-bold px-2.5 py-1 rounded-full border cursor-pointer appearance-none pr-6 transition-all focus:outline-none focus:ring-2 focus:ring-brand-orange/30 shadow-2xs ${
                              j.status === 'Active'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                : j.status === 'Draft'
                                ? 'bg-amber-50 text-amber-700 border-amber-300'
                                : 'bg-slate-100 text-slate-600 border-slate-300'
                            }`}
                          >
                            <option value="Active">● Active</option>
                            <option value="Draft">● Draft</option>
                            <option value="Closed">● Closed</option>
                          </select>
                          <svg className="w-3 h-3 text-current absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedJobForLink(j);
                              setIsLinkModalOpen(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-brand-orange bg-slate-100 hover:bg-orange-50 rounded-xl transition-all"
                            title="Candidate Application Link"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                          </button>
                          <Link href={`/jobs/${j.id}/requirements`} className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all">Criteria</Link>
                          <Link href={`/jobs/${j.id}/candidates`} className="px-3 py-1.5 text-xs font-bold text-white bg-brand-orange hover:bg-brand-orange-hover rounded-xl transition-all">Evaluate</Link>
                          <button onClick={() => handleDeleteJob(j.id, j.title)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(j => (
              <div key={j.id} className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col relative group">
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="relative inline-block">
                      <select
                        value={j.status}
                        onChange={(e) => handleStatusChange(j.id, e.target.value as 'Active' | 'Draft' | 'Closed')}
                        className={`text-xs font-bold px-2.5 py-1 rounded-full border cursor-pointer appearance-none pr-6 transition-all focus:outline-none focus:ring-2 focus:ring-brand-orange/30 shadow-2xs ${
                          j.status === 'Active'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            : j.status === 'Draft'
                            ? 'bg-amber-50 text-amber-700 border-amber-300'
                            : 'bg-slate-100 text-slate-600 border-slate-300'
                        }`}
                      >
                        <option value="Active">● Active</option>
                        <option value="Draft">● Draft</option>
                        <option value="Closed">● Closed</option>
                      </select>
                      <svg className="w-3 h-3 text-current absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    <button onClick={() => handleDeleteJob(j.id, j.title)} className="p-1 text-slate-400 hover:text-rose-600 rounded-md transition-colors"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                  </div>

                  <Link href={`/jobs/${j.id}/requirements`} className="text-base font-bold text-[#1E293B] hover:text-brand-orange transition-colors">
                    {j.title}
                  </Link>
                  <p className="text-xs text-slate-500 mt-1 mb-4">{j.client} • {j.location}</p>

                  <div className="bg-[#F8FAFC] rounded-2xl p-3.5 border border-slate-200 flex items-center justify-between text-xs mb-3">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-500">Applicants</div>
                      <div className="text-sm font-extrabold text-[#1E293B]">{j.candidates}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase font-bold text-slate-500">Top Match</div>
                      <div className={`text-sm font-extrabold ${j.topScore !== null && j.topScore > 0 ? 'text-brand-orange' : 'text-slate-400'}`}>
                        {j.topScore !== null && j.topScore > 0 ? `${j.topScore}%` : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Assigned Team Section */}
                  <div className="bg-slate-50/70 rounded-2xl p-2.5 border border-slate-100 flex items-center justify-between mb-4">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assigned TA</span>
                    <WorkedByMembers workers={j.workedBy} isCompact />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-4 border-t border-slate-100 mt-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedJobForLink(j);
                      setIsLinkModalOpen(true);
                    }}
                    className="p-2 text-slate-500 hover:text-brand-orange bg-slate-100 hover:bg-orange-50 rounded-xl transition-all shrink-0 cursor-pointer"
                    title="Candidate Application Link"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </button>
                  <Link href={`/jobs/${j.id}/requirements`} className="flex-1 text-center py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all">Criteria</Link>
                  <Link href={`/jobs/${j.id}/candidates`} className="flex-1 text-center py-2 text-xs font-bold text-white bg-brand-orange hover:bg-brand-orange-hover rounded-xl transition-all shadow-orange">Evaluate</Link>
                </div>
              </div>
            ))}
          </div>
        )
        ) : (
          <div className="bg-white border border-slate-200/90 rounded-3xl text-center py-20 shadow-sm mt-4 px-6">
            <div className="w-14 h-14 rounded-2xl bg-brand-orange-pale text-brand-orange flex items-center justify-center mx-auto mb-4 border border-brand-orange-border">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[#1E293B] mb-1">
              {allJobs.length === 0 ? 'No jobs uploaded yet' : 'No matching jobs found'}
            </h3>
            <p className="text-slate-500 text-xs max-w-md mx-auto">
              {search || filter !== 'All'
                ? 'Try adjusting your search criteria or active filter tags.'
                : 'Get started by uploading your first Job Description (JD) using the "Upload New JD" button above.'}
            </p>
          </div>
        )}

        {/* Public Candidate Application Link Modal */}
        <CandidateLinkModal
          isOpen={isLinkModalOpen}
          onClose={() => setIsLinkModalOpen(false)}
          jobId={selectedJobForLink?.id || ''}
          jobTitle={selectedJobForLink?.title || 'Job Requisition'}
        />
      </main>
      <Footer />
    </div>
  );
}
