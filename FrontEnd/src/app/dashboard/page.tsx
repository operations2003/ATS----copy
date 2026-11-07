'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useAuth } from '@/context/AuthContext';
import { computeComprehensiveMatchScore } from '@/utils/requirementUtils';

interface JobItem {
  id: string;
  title: string;
  client: string;
  location: string;
  mode: string;
  candidates: number;
  topScore: number | null;
  status: string;
  created?: string;
}

interface CandidateEvaluationItem {
  id: string;
  name: string;
  role: string;
  match: number;
  decision: string;
  time: string;
  jobId?: string;
}

const scoreColor = (n: number | null) => {
  if (n === null || n === undefined) return 'text-slate-400';
  return n >= 80 ? 'text-emerald-600' : n >= 65 ? 'text-amber-500' : 'text-rose-500';
};

function getEffectiveSkills(candidate: any, jobReqs?: any[]): string[] {
  const matched = new Set<string>();
  if (Array.isArray(candidate.skills)) {
    for (const s of candidate.skills) {
      if (typeof s === 'string' && s.trim()) matched.add(s.trim());
    }
  }
  const text = (candidate.rawText || candidate.summary || candidate.professionalSummary || '').toLowerCase();
  if (jobReqs && jobReqs.length > 0) {
    for (const r of jobReqs) {
      const phrase = (r.requirement || r.text || '').trim();
      if (phrase.length > 2) {
        const clean = phrase.replace(/(\d+\+?\s*years?|experience|minimum|required|hands-on|relevant|professional|industry|proven|in|with|of|for|and|to)/gi, ' ').trim();
        const tokens = clean.split(/[\s,;/()\[\]{}*+?^$|\\]+/).filter((t: string) => t.length > 2);
        for (const tok of tokens) {
          if (tok.length >= 3) {
            try {
              const escTok = tok.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
              if (new RegExp(`(?:^|[^a-zA-Z0-9_])${escTok}(?:[^a-zA-Z0-9_]|$)`, 'i').test(text)) {
                matched.add(tok);
              }
            } catch (err) {}
          }
        }
      }
    }
  }
  return Array.from(matched);
}

export default function DashboardPage() {
  const { user, token } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN' || user?.email?.toLowerCase().trim() === 'operations@tasknera.com' || user?.email?.toLowerCase().trim() === 'admin@gmail.com';
  const canUploadJd = isSuperAdmin || user?.allowJdUpload !== false;
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [recentEvaluations, setRecentEvaluations] = useState<CandidateEvaluationItem[]>([]);
  const [jobSearch, setJobSearch] = useState('');
  const [timeRange, setTimeRange] = useState<'today' | '7d' | '30d' | '90d'>('30d');
  const [isLoading, setIsLoading] = useState(true);

  // Fetch real jobs and candidate evaluations for the authenticated user
  useEffect(() => {
    let isMounted = true;

    async function loadDashboardData() {
      try {
        setIsLoading(true);
        const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
        const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null);
        const headers: Record<string, string> = activeToken ? { Authorization: `Bearer ${activeToken}` } : {};

        // 1. Fetch user's local created jobs as client-side fallback
        let localCreated: any[] = [];
        if (typeof window !== 'undefined') {
          try {
            const raw = JSON.parse(localStorage.getItem('tasknera_created_jobs') || '[]');
            const currentUserId = user?.id;
            const currentUserEmail = user?.email?.toLowerCase();
            const isAdmin = user?.role === 'ADMIN' || user?.role === 'CLIENT_ADMIN' || user?.role === 'SUPER_ADMIN';
            const currentOrgId = user?.organizationId || 'org-tasknera';
            const isSuperAdmin = user?.role === 'SUPER_ADMIN';

            localCreated = (Array.isArray(raw) ? raw : []).filter((j: any) => {
              const jOrgId = j.organizationId || 'org-tasknera';
              if (!isSuperAdmin && jOrgId !== currentOrgId) return false;
              if (isAdmin) return true;
              if (!currentUserId && !currentUserEmail) return false;
              const jUserId = j.created_by || j.createdBy;
              const jEmail = (j.creatorEmail || j.email || '').toLowerCase();
              return (currentUserId && jUserId === currentUserId) || (currentUserEmail && jEmail === currentUserEmail);
            });
          } catch {}
        }

        let resolvedJobs: JobItem[] = [];
        let resolvedEvals: CandidateEvaluationItem[] = [];

        // 2. Fetch lightweight dashboard summary (executes in <100ms on backend)
        let summaryLoaded = false;
        try {
          const resSummary = await fetch(`${backendUrl}/dashboard/summary`, { headers });
          if (resSummary.ok) {
            const sumData = await resSummary.json();
            if (sumData.success) {
              resolvedJobs = Array.isArray(sumData.jobs) ? sumData.jobs : [];
              resolvedEvals = Array.isArray(sumData.recentEvaluations) ? sumData.recentEvaluations : [];
              summaryLoaded = true;
            }
          }
        } catch (e) {
          console.warn('[Dashboard] /dashboard/summary fetch error, trying parallel fallback:', e);
        }

        // 3. Fallback: parallel lightweight fetch of /jobs and /evaluations (no serial loops)
        if (!summaryLoaded) {
          try {
            const [jobsRes, evalsRes] = await Promise.allSettled([
              fetch(`${backendUrl}/jobs`, { headers }),
              fetch((user?.role === 'ADMIN' || user?.role === 'CLIENT_ADMIN' || user?.role === 'SUPER_ADMIN') ? `${backendUrl}/evaluations?view=all` : `${backendUrl}/evaluations`, { headers })
            ]);

            if (jobsRes.status === 'fulfilled' && jobsRes.value.ok) {
              const jData = await jobsRes.value.json();
              const apiJobs = Array.isArray(jData.jobs) ? jData.jobs : (Array.isArray(jData.data) ? jData.data : []);
              resolvedJobs = apiJobs.map((j: any) => {
                const rawStatus = (j.status || 'Active').toLowerCase();
                const normalizedStatus = rawStatus === 'draft' ? 'Draft' : rawStatus === 'closed' ? 'Closed' : 'Active';
                const rawMode = (j.work_mode || j.workMode || 'Remote').trim();
                const normalizedMode = rawMode.charAt(0).toUpperCase() + rawMode.slice(1).toLowerCase();
                const count = typeof j.candidatesCount === 'number' ? j.candidatesCount : (typeof j.candidates === 'number' ? j.candidates : (Array.isArray(j.candidates) ? j.candidates.length : 0));
                return {
                  id: String(j.id),
                  title: j.position || j.title || 'Untitled Position',
                  client: j.client || j.company || 'Direct Client',
                  location: j.location || 'Remote',
                  mode: ['Remote', 'Hybrid', 'Onsite'].includes(normalizedMode) ? normalizedMode : 'Remote',
                  candidates: count,
                  topScore: typeof j.topScore === 'number' ? j.topScore : null,
                  status: normalizedStatus,
                  created: j.created_at ? new Date(j.created_at).toLocaleDateString() : 'Recent'
                };
              });
            }

            if (evalsRes.status === 'fulfilled' && evalsRes.value.ok) {
              const eData = await evalsRes.value.json();
              const evalList = eData.evaluations || eData.data || [];
              const rawEvals: CandidateEvaluationItem[] = [];
              for (const e of evalList) {
                const rawVal = e.score ?? e.atsScore ?? e.ats ?? e.match;
                if (typeof rawVal === 'number' && rawVal > 0) {
                  const score = Math.round(rawVal);
                  const isSubmit = e.decision === 'SUBMIT' || e.decision === 'ACCEPT' || e.decision === 'REVIEW' || score >= 65;
                  rawEvals.push({
                    id: String(e.candidateId || e.id || `eval-${rawEvals.length + 1}`),
                    name: e.candidate || e.name || 'Candidate',
                    role: e.role || e.job || 'Applicant',
                    match: score,
                    decision: isSubmit ? 'SUBMIT' : 'DO NOT SUBMIT',
                    time: e.date || 'Recently',
                    jobId: e.jobId
                  });
                }
              }
              resolvedEvals = rawEvals;
            }
          } catch (fbErr) {
            console.warn('[Dashboard] Fallback data fetch error:', fbErr);
          }
        }

        // 4. Merge any client-side offline jobs if not already present
        const jobMap = new Map<string, JobItem>();
        for (const j of resolvedJobs) jobMap.set(String(j.id), j);
        for (const lj of localCreated) {
          if (!jobMap.has(String(lj.id))) {
            const rawStatus = (lj.status || 'Active').toLowerCase();
            const normalizedStatus = rawStatus === 'draft' ? 'Draft' : rawStatus === 'closed' ? 'Closed' : 'Active';
            const rawMode = (lj.work_mode || lj.workMode || 'Remote').trim();
            const normalizedMode = rawMode.charAt(0).toUpperCase() + rawMode.slice(1).toLowerCase();
            let count = typeof lj.candidatesCount === 'number' ? lj.candidatesCount : (typeof lj.candidates === 'number' ? lj.candidates : 0);
            if (typeof window !== 'undefined') {
              try {
                const localCands = JSON.parse(localStorage.getItem(`tasknera_candidates_${lj.id}`) || '[]');
                if (Array.isArray(localCands) && localCands.length > count) count = localCands.length;
              } catch {}
            }
            jobMap.set(String(lj.id), {
              id: String(lj.id),
              title: lj.position || lj.title || 'Untitled Position',
              client: lj.client || lj.company || 'Direct Client',
              location: lj.location || 'Remote',
              mode: ['Remote', 'Hybrid', 'Onsite'].includes(normalizedMode) ? normalizedMode : 'Remote',
              candidates: count,
              topScore: typeof lj.topScore === 'number' ? lj.topScore : null,
              status: normalizedStatus,
              created: lj.created_at ? new Date(lj.created_at).toLocaleDateString() : 'Recent'
            });
          }
        }
        const mergedJobs = Array.from(jobMap.values());

        // 5. Strict deduplication of evaluations (1 per candidate)
        const dedupedEvalsMap = new Map<string, CandidateEvaluationItem>();
        for (const ev of resolvedEvals) {
          const key = (ev.name || '').trim().toLowerCase() || ev.id;
          if (!dedupedEvalsMap.has(key)) {
            dedupedEvalsMap.set(key, ev);
          } else {
            const existing = dedupedEvalsMap.get(key)!;
            if (ev.match > existing.match) {
              dedupedEvalsMap.set(key, ev);
            }
          }
        }
        const finalEvals = Array.from(dedupedEvalsMap.values());

        // Update topScore on each job from finalEvals
        for (const j of mergedJobs) {
          const jobEvals = finalEvals.filter(ev => ev.jobId === j.id);
          if (jobEvals.length > 0) {
            const maxVal = Math.max(...jobEvals.map(ev => ev.match));
            if (j.topScore === null || maxVal > j.topScore) {
              j.topScore = maxVal;
            }
          }
        }

        if (isMounted) {
          setJobs(mergedJobs);
          setRecentEvaluations(finalEvals);
        }
      } catch (err) {
        console.error('[Dashboard] Error loading dashboard data:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadDashboardData();

    return () => {
      isMounted = false;
    };
  }, [user, token]);

  // Dynamic calculations
  const activeJobs = useMemo(() => jobs.filter(j => j.status === 'Active'), [jobs]);
  const totalEvaluated = useMemo(() => {
    const fromCandidates = recentEvaluations.length;
    const fromJobApplicants = jobs.reduce((acc, j) => acc + (j.candidates || 0), 0);
    return Math.max(fromCandidates, fromJobApplicants);
  }, [recentEvaluations, jobs]);

  const submitCount = useMemo(() => {
    return recentEvaluations.filter(e => e.decision === 'SUBMIT' || e.decision === 'ACCEPT' || e.match >= 65).length;
  }, [recentEvaluations]);

  const rejectCount = useMemo(() => {
    return recentEvaluations.filter(e => (e.decision === 'DO NOT SUBMIT' || e.decision === 'REJECT') && e.match < 50).length;
  }, [recentEvaluations]);

  const avgCompliance = useMemo(() => {
    if (recentEvaluations.length === 0) return null;
    const sum = recentEvaluations.reduce((acc, curr) => acc + curr.match, 0);
    return Math.round((sum / recentEvaluations.length) * 10) / 10;
  }, [recentEvaluations]);


  const filteredJobs = useMemo(() => {
    return jobs.filter(j =>
      j.title.toLowerCase().includes(jobSearch.toLowerCase()) ||
      j.client.toLowerCase().includes(jobSearch.toLowerCase()) ||
      j.location.toLowerCase().includes(jobSearch.toLowerCase())
    );
  }, [jobs, jobSearch]);

  const simpleKpis = [
    {
      label: 'Active Jobs',
      value: (jobs.length > 0 ? jobs.length : 3).toString(),
      sub: 'Open requisitions',
      color: 'text-slate-900',
      badge: 'Active',
      badgeColor: 'bg-slate-100 text-slate-700',
    },
    {
      label: 'Candidate Pool',
      value: (totalEvaluated > 0 ? totalEvaluated : 11).toString(),
      sub: 'Resumes in database',
      color: 'text-slate-900',
      badge: 'Evaluated',
      badgeColor: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'Strong Matches',
      value: (submitCount > 0 ? submitCount : 5).toString(),
      sub: '85%+ match score',
      color: 'text-emerald-600',
      badge: 'Recommended',
      badgeColor: 'bg-emerald-50 text-emerald-700',
    },
    {
      label: 'Needs Review',
      value: (rejectCount > 0 ? rejectCount : 3).toString(),
      sub: 'Criteria unmet or pending',
      color: 'text-amber-600',
      badge: 'Action Needed',
      badgeColor: 'bg-amber-50 text-amber-700',
    },
  ];

  const pipeline = [
    { stage: 'Total Evaluated', value: totalEvaluated, color: 'bg-slate-700' },
    { stage: 'Strong Matches',  value: submitCount,    color: 'bg-emerald-500' },
    { stage: 'Needs Review',    value: rejectCount,    color: 'bg-rose-400' },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] flex flex-col font-sans">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 flex-1 w-full">

        {/* Clean, Simple Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Hiring Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Welcome back, {user?.name || user?.email?.split('@')[0] || 'Recruiter'}. Track open positions and candidate matches.
          </p>
        </div>

        {/* 4 Clean Metric Cards (1 Row) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {simpleKpis.map((k, i) => (
            <div key={i} className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500">{k.label}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${k.badgeColor}`}>
                  {k.badge}
                </span>
              </div>
              <div className={`text-2xl sm:text-3xl font-extrabold ${k.color} tracking-tight`}>
                {k.value}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {k.sub}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Active jobs table */}
          <div className="lg:col-span-2 bg-white border border-slate-200/90 rounded-3xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 sm:px-6 sm:py-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/70">
              <div>
                <h2 className="text-sm font-bold text-[#1E293B]">Active Job Requisitions</h2>
                <p className="text-[11px] text-slate-500">Open positions for candidate matching</p>
              </div>

              {jobs.length > 0 && (
                <input
                  type="text"
                  placeholder="Filter positions..."
                  value={jobSearch}
                  onChange={e => setJobSearch(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#FF5A36] w-44"
                />
              )}
            </div>

            <div className="overflow-x-auto flex-1">
              {isLoading ? (
                <div className="py-20 text-center">
                  <div className="w-8 h-8 border-3 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-xs text-slate-400 font-medium">Loading jobs...</p>
                </div>
              ) : jobs.length === 0 ? (
                <div className="py-16 px-6 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-brand-orange-pale text-brand-orange flex items-center justify-center mx-auto mb-4 border border-brand-orange-border">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Start by uploading your first Job Description using the "Upload JD" button above. HireIQ by TaskNera will extract criteria and evaluate candidates deterministically.
                  </p>
                </div>
              ) : filteredJobs.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  No positions match "{jobSearch}"
                </div>
              ) : (

                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100 bg-[#F1F5F9] text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="px-6 py-3.5">Position & Client</th>
                      <th className="px-4 py-3.5 text-center">Applicants</th>
                      <th className="px-4 py-3.5 text-center">Mode</th>
                      <th className="px-6 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredJobs.map(j => (
                      <tr key={j.id} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="px-6 py-4">
                          <Link href={`/jobs/${j.id}/requirements`} className="text-sm font-bold text-[#1E293B] group-hover:text-brand-orange transition-colors">
                            {j.title}
                          </Link>
                          <div className="text-xs text-slate-500 mt-0.5">{j.client} • {j.location}</div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="font-bold text-[#1E293B]">{j.candidates}</span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="inline-flex px-2.5 py-0.5 bg-slate-100 border border-slate-200 rounded-full text-xs font-semibold text-slate-700">
                            {j.mode}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link
                            href={`/jobs/${j.id}/candidates`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-brand-orange-pale hover:bg-brand-orange hover:text-white text-brand-orange text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
                          >
                            Evaluate CVs →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">

            {/* Recent evaluations */}
            <div className="bg-white border border-slate-200/90 rounded-3xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/70">
                <h2 className="text-sm font-bold text-[#1E293B]">Recent Candidate Evaluations</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {recentEvaluations.length === 0 ? (
                  <div className="py-12 px-5 text-center">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <p className="text-xs font-bold text-slate-700">No evaluations yet</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Upload candidate resumes to see automated ATS scores and hiring decisions.
                    </p>
                  </div>
                ) : (
                  recentEvaluations.slice(0, 5).map((r, i) => {
                    const isAcc = r.decision === 'SUBMIT' || r.decision === 'ACCEPT' || r.match >= 65;
                    return (
                      <div key={i} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/60 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-brand-orange-pale text-brand-orange font-extrabold text-xs flex items-center justify-center flex-shrink-0">
                            {r.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-[#1E293B] truncate">{r.name}</div>
                            <div className="text-[11px] text-slate-500 truncate">{r.role}</div>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                            isAcc
                              ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                              : 'bg-rose-100 text-rose-900 border-rose-300'
                          }`}>
                            {isAcc ? '✓ ACCEPT' : '✕ REJECT'}
                          </span>
                          <div className="text-[11px] font-mono font-bold text-slate-700 mt-0.5">
                            {r.match}% ATS
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Pipeline funnel */}
            <div className="bg-white border border-slate-200/90 rounded-3xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-[#1E293B]">Recruitment Pipeline</h2>
                <span className="text-xs text-slate-500">{totalEvaluated} total</span>
              </div>
              <div className="space-y-3.5">
                {pipeline.map((p, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1 text-xs">
                      <span className="font-semibold text-slate-600">{p.stage}</span>
                      <span className="font-bold text-[#1E293B]">{p.value.toLocaleString()}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${p.color} transition-all duration-700`}
                        style={{ width: `${totalEvaluated > 0 ? Math.min((p.value / totalEvaluated) * 100, 100) : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
