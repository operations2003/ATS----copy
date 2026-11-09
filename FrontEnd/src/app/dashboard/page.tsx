'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useAuth } from '@/context/AuthContext';
import { computeComprehensiveMatchScore } from '@/utils/requirementUtils';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

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
  evaluatedAt?: string;
}

interface DashboardFunnelStage {
  stage: string;
  value: number;
}

const SCORE_BUCKETS = [
  { label: '0–39', min: 0, max: 39, color: '#E83E63' },
  { label: '40–54', min: 40, max: 54, color: '#9B8AFB' },
  { label: '55–69', min: 55, max: 69, color: '#F8AC2D' },
  { label: '70–84', min: 70, max: 84, color: '#2A9BD1' },
  { label: '85–100', min: 85, max: 100, color: '#2BA783' },
];

const FUNNEL_STAGES = [
  'Screening', 'Shortlisted', 'Recruiter Name',
  'Round 1 Phase', 'Round 2 Phase', 'Selected', 'Offered', 'Joined',
];

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

export default function DashboardPage() {
  const { user, token } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN' || user?.email?.toLowerCase().trim() === 'operations@tasknera.com' || user?.email?.toLowerCase().trim() === 'admin@gmail.com';
  const canUploadJd = isSuperAdmin || user?.allowJdUpload !== false;
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [recentEvaluations, setRecentEvaluations] = useState<CandidateEvaluationItem[]>([]);
  const [dashboardFunnel, setDashboardFunnel] = useState<DashboardFunnelStage[]>(() => FUNNEL_STAGES.map(stage => ({ stage, value: 0 })));
  const [jobSearch, setJobSearch] = useState('');
  const [timeRange, setTimeRange] = useState<'today' | '7d' | '30d' | '90d'>('30d');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const uniqueCandidates = new Map<string, any>();
    const readArray = (key: string) => {
      try {
        const value = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(value) ? value : [];
      } catch {
        return [];
      }
    };

    [...readArray('tasknera_ats_candidates'), ...readArray('tasknera_candidates_pool')].forEach(candidate => {
      if (candidate?.id) uniqueCandidates.set(String(candidate.id), candidate);
    });
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith('tasknera_candidates_') || key === 'tasknera_candidates_pool' || key.startsWith('tasknera_candidates_count_')) continue;
      readArray(key).forEach(candidate => {
        if (candidate?.id) uniqueCandidates.set(String(candidate.id), candidate);
      });
    }

    const stageOverrides = new Map<string, string>();
    readArray('tasknera_recruitment_pipeline_v1').forEach(candidate => {
      if (candidate?.id && candidate?.stage) {
        stageOverrides.set(String(candidate.id), String(candidate.stage));
        uniqueCandidates.set(String(candidate.id), { ...uniqueCandidates.get(String(candidate.id)), ...candidate });
      }
    });

    const stageMembers = new Map<string, Set<string>>(FUNNEL_STAGES.map(stage => [stage, new Set<string>()] as const));
    uniqueCandidates.forEach((candidate, id) => {
      const savedStage = stageOverrides.get(id) || String(candidate.stage || candidate.pipelineStage || '');
      const status = String(candidate.stageStatus || candidate.status || '').toUpperCase();
      const normalized = savedStage.toLowerCase();
      let stage = '';
      if (normalized === 'screening' || status === 'SCREENED' || status === 'SOURCED') stage = 'Screening';
      else if (normalized === 'shortlisted' || ['SHORTLISTED', 'PENDING_TL_REVIEW', 'TL_APPROVED', 'OVERRIDDEN'].includes(status)) stage = 'Shortlisted';
      else if (normalized === 'recruiter name' || normalized === 'recruiter screen') stage = 'Recruiter Name';
      else if (normalized === 'round 1 phase' || normalized.includes('technical')) stage = 'Round 1 Phase';
      else if (normalized === 'round 2 phase' || normalized.includes('hr')) stage = 'Round 2 Phase';
      else if (normalized === 'selected') stage = 'Selected';
      else if (normalized === 'offered') stage = 'Offered';
      else if (normalized === 'joined' || status === 'JOINED') stage = 'Joined';
      if (stage) stageMembers.get(stage)?.add(id);
    });

    try {
      const interviewStore = JSON.parse(localStorage.getItem('tasknera_interviews_frontend_v1') || '{}');
      const interviews = Array.isArray(interviewStore?.interviews) ? interviewStore.interviews : [];
      interviews.forEach((interview: any, index: number) => {
        const round = String(interview?.round || '').toLowerCase();
        const candidateId = String(interview?.candidateId || interview?.id || `interview-${index}`);
        const stage = round.includes('hr') ? 'Round 2 Phase' : round.includes('technical') ? 'Round 1 Phase' : round.includes('recruiter') ? 'Recruiter Name' : '';
        if (stage && interview.status !== 'cancelled') stageMembers.get(stage)?.add(candidateId);
      });
    } catch {}

    setDashboardFunnel(FUNNEL_STAGES.map(stage => ({ stage, value: stageMembers.get(stage)?.size || 0 })));
  }, []);

  // Fetch real jobs and candidate evaluations for the authenticated user
  useEffect(() => {
    let isMounted = true;

    async function loadDashboardData() {
      try {
        setIsLoading(true);
        const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
        const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null);
        const headers: Record<string, string> = activeToken ? { Authorization: `Bearer ${activeToken}` } : {};

        const isBadJob = (j: any) => {
          const id = String(j?.id || '');
          const title = String(j?.position || j?.title || '').toLowerCase().trim();
          const client = String(j?.client || j?.company || '').toLowerCase().trim();
          return (
            client === 'test client' ||
            client.includes('test client') ||
            title === 'test engineer' ||
            title.includes('test engineer') ||
            id === '83838c13-a542-457c-a696-1289c9734869' ||
            id.startsWith('jd-')
          );
        };

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
              if (isBadJob(j)) return false;
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
              const apiJobs = Array.isArray(sumData.jobs) ? sumData.jobs : [];
              resolvedJobs = apiJobs.filter((j: any) => !isBadJob(j)).map((j: any) => ({
                id: String(j.id),
                title: formatCleanPositionTitle(j.position || j.title),
                client: j.client || j.company || 'Direct Client',
                location: j.location || 'Remote',
                mode: j.mode || 'Remote',
                candidates: typeof j.candidates === 'number' ? j.candidates : 0,
                topScore: typeof j.topScore === 'number' ? j.topScore : null,
                status: j.status || 'Active',
                created: j.created || 'Recent'
              }));
              resolvedEvals = Array.isArray(sumData.recentEvaluations) ? sumData.recentEvaluations.map((evaluation: any) => ({
                ...evaluation,
                evaluatedAt: evaluation.evaluatedAt || evaluation.createdAt || evaluation.created_at || evaluation.date || '',
              })) : [];
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
              resolvedJobs = apiJobs.filter((j: any) => !isBadJob(j)).map((j: any) => {
                const rawStatus = (j.status || 'Active').toLowerCase();
                const normalizedStatus = rawStatus === 'draft' ? 'Draft' : rawStatus === 'closed' ? 'Closed' : 'Active';
                const rawMode = (j.work_mode || j.workMode || 'Remote').trim();
                const normalizedMode = rawMode.charAt(0).toUpperCase() + rawMode.slice(1).toLowerCase();
                const count = typeof j.candidatesCount === 'number' ? j.candidatesCount : (typeof j.candidates === 'number' ? j.candidates : (Array.isArray(j.candidates) ? j.candidates.length : 0));
                return {
                  id: String(j.id),
                  title: formatCleanPositionTitle(j.position || j.title),
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
                    jobId: e.jobId,
                    evaluatedAt: e.evaluatedAt || e.createdAt || e.created_at || e.date || '',
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
          if (!isBadJob(lj) && !jobMap.has(String(lj.id))) {
            const rawStatus = (lj.status || 'Active').toLowerCase();
            const normalizedStatus = rawStatus === 'draft' ? 'Draft' : rawStatus === 'closed' ? 'Closed' : 'Active';
            const rawMode = (lj.work_mode || lj.workMode || 'Remote').trim();
            const normalizedMode = rawMode.charAt(0).toUpperCase() + rawMode.slice(1).toLowerCase();
            let count = typeof lj.candidatesCount === 'number' ? lj.candidatesCount : (typeof lj.candidates === 'number' ? lj.candidates : 0);
            jobMap.set(String(lj.id), {
              id: String(lj.id),
              title: formatCleanPositionTitle(lj.position || lj.title),
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

        // Ingest all candidate evaluations stored in localStorage across all jobs
        if (typeof window !== 'undefined') {
          try {
            // Read tasknera_candidates_pool
            const pool = JSON.parse(localStorage.getItem('tasknera_candidates_pool') || '[]');
            if (Array.isArray(pool)) {
              for (const c of pool) {
                const score = Math.round(c.matchScore ?? c.atsScore ?? c.score ?? 0);
                if (c.name && score > 0) {
                  resolvedEvals.push({
                    id: String(c.id || `eval-${resolvedEvals.length}`),
                    name: c.name,
                    role: c.currentTitle || c.role || 'Applicant',
                    match: score,
                    decision: (c.decision || (score >= 65 ? 'SUBMIT' : 'DO NOT SUBMIT')).toUpperCase(),
                    time: c.uploadedAt ? new Date(c.uploadedAt).toLocaleDateString() : 'Recently',
                    jobId: c.jobId,
                    evaluatedAt: c.evaluatedAt || c.scoredAt || c.uploadedAt || c.createdAt || '',
                  });
                }
              }
            }

            // Check all job-specific candidate storage keys
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key && key.startsWith('tasknera_candidates_') && key !== 'tasknera_candidates_pool' && !key.startsWith('tasknera_candidates_count_')) {
                const jId = key.replace('tasknera_candidates_', '');
                const candList = JSON.parse(localStorage.getItem(key) || '[]');
                if (Array.isArray(candList)) {
                  for (const c of candList) {
                    const score = Math.round(c.matchScore ?? c.atsScore ?? c.score ?? 0);
                    if (c.name && score > 0) {
                      resolvedEvals.push({
                        id: String(c.id || `eval-${resolvedEvals.length}`),
                        name: c.name,
                        role: c.currentTitle || c.role || 'Applicant',
                        match: score,
                        decision: (c.decision || (score >= 65 ? 'SUBMIT' : 'DO NOT SUBMIT')).toUpperCase(),
                        time: c.uploadedAt ? new Date(c.uploadedAt).toLocaleDateString() : 'Recently',
                        jobId: c.jobId || jId,
                        evaluatedAt: c.evaluatedAt || c.scoredAt || c.uploadedAt || c.createdAt || '',
                      });
                    }
                  }
                }
              }
            }

            // Update candidate count on each job from localStorage
            for (const [id, j] of jobMap.entries()) {
              const rawCount = localStorage.getItem(`tasknera_candidates_count_${id}`);
              if (rawCount) j.candidates = Math.max(j.candidates, parseInt(rawCount, 10) || 0);
              const localCands = JSON.parse(localStorage.getItem(`tasknera_candidates_${id}`) || '[]');
              if (Array.isArray(localCands)) j.candidates = Math.max(j.candidates, localCands.length);
            }
          } catch {}
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

  // Dynamic calculations strictly from REAL data
  const totalJobsCount = jobs.length;
  const activeJobs = useMemo(() => jobs.filter(j => j.status === 'Active'), [jobs]);

  const totalEvaluated = useMemo(() => {
    const fromRecentEvals = recentEvaluations.length;
    const fromJobApplicants = jobs.reduce((acc, j) => acc + (j.candidates || 0), 0);
    return Math.max(fromRecentEvals, fromJobApplicants);
  }, [recentEvaluations, jobs]);

  const submitCount = useMemo(() => {
    return recentEvaluations.filter(e =>
      e.decision === 'SUBMIT' || e.decision === 'ACCEPT' || (e.decision !== 'REJECT' && e.decision !== 'DO NOT SUBMIT' && e.match >= 65)
    ).length;
  }, [recentEvaluations]);

  const reviewCount = useMemo(() => {
    return recentEvaluations.filter(e =>
      e.decision === 'REVIEW' || (!['SUBMIT', 'ACCEPT', 'REJECT', 'DO NOT SUBMIT'].includes(e.decision) && e.match >= 50 && e.match < 65)
    ).length;
  }, [recentEvaluations]);

  const rejectCount = useMemo(() => {
    return recentEvaluations.filter(e =>
      e.decision === 'DO NOT SUBMIT' || e.decision === 'REJECT' || e.match < 50
    ).length;
  }, [recentEvaluations]);

  const avgMatchScore = useMemo(() => {
    if (recentEvaluations.length === 0) return null;
    const validScores = recentEvaluations.map(e => e.match).filter(s => typeof s === 'number' && !isNaN(s) && s > 0);
    if (validScores.length === 0) return null;
    const sum = validScores.reduce((acc, curr) => acc + curr, 0);
    return Math.round((sum / validScores.length) * 10) / 10;
  }, [recentEvaluations]);

  const submitRate = totalEvaluated > 0 ? ((submitCount / totalEvaluated) * 100).toFixed(1) : '0.0';
  const reviewRate = totalEvaluated > 0 ? ((reviewCount / totalEvaluated) * 100).toFixed(1) : '0.0';
  const rejectRate = totalEvaluated > 0 ? ((rejectCount / totalEvaluated) * 100).toFixed(1) : '0.0';

  const filteredJobs = useMemo(() => {
    return jobs.filter(j =>
      j.title.toLowerCase().includes(jobSearch.toLowerCase()) ||
      j.client.toLowerCase().includes(jobSearch.toLowerCase()) ||
      j.location.toLowerCase().includes(jobSearch.toLowerCase())
    );
  }, [jobs, jobSearch]);

  const stats = [
    {
      label: 'Total Evaluated',
      value: totalEvaluated.toLocaleString(),
      sub: totalJobsCount === 1 ? 'Across 1 active job' : `Across ${totalJobsCount} jobs`,
      color: 'text-slate-900',
    },
    {
      label: 'Submit Rate',
      value: `${submitRate}%`,
      sub: submitCount === 1 ? '1 candidate' : `${submitCount} candidates`,
      color: 'text-emerald-600',
    },
    {
      label: 'Review Rate',
      value: `${reviewRate}%`,
      sub: reviewCount === 1 ? '1 candidate' : `${reviewCount} candidates`,
      color: 'text-amber-600',
    },
    {
      label: 'Rejection Rate',
      value: `${rejectRate}%`,
      sub: rejectCount === 1 ? '1 candidate' : `${rejectCount} candidates`,
      color: 'text-rose-600',
    },
    {
      label: 'Avg Match Score',
      value: avgMatchScore !== null ? `${avgMatchScore}%` : '—',
      sub: avgMatchScore !== null ? 'Deterministic mean' : 'No evaluations yet',
      color: 'text-brand-orange',
    },
    {
      label: 'Conversion Percentage',
      value: `${submitRate}%`,
      sub: submitCount === 1 ? '1 candidate converted' : `${submitCount} candidates converted`,
      color: 'text-purple-600',
    },
  ];

  const pipeline = [
    { stage: 'Total Evaluated', value: totalEvaluated, color: 'bg-slate-700' },
    { stage: 'Strong Matches',  value: submitCount,    color: 'bg-emerald-500' },
    { stage: 'Needs Review',    value: reviewCount + rejectCount, color: 'bg-rose-400' },
  ];

  const screeningVolume = useMemo(() => {
    const today = new Date();
    const firstDay = new Date(today);
    firstDay.setDate(today.getDate() - 29);
    firstDay.setHours(0, 0, 0, 0);
    const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const counts = new Map<string, number>();
    for (let offset = 0; offset < 30; offset++) {
      const day = new Date(firstDay);
      day.setDate(firstDay.getDate() + offset);
      counts.set(localDateKey(day), 0);
    }
    recentEvaluations.forEach(evaluation => {
      if (!evaluation.evaluatedAt) return;
      const scoredAt = new Date(evaluation.evaluatedAt);
      if (Number.isNaN(scoredAt.getTime())) return;
      const key = localDateKey(scoredAt);
      if (counts.has(key)) counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts, ([key, count], index) => ({
      date: key,
      label: index === 29 ? 'Today' : new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { day: '2-digit', month: 'short' }),
      count,
    }));
  }, [recentEvaluations]);

  const scoreDistribution = useMemo(() => SCORE_BUCKETS.map(bucket => ({
    label: bucket.label,
    count: recentEvaluations.filter(evaluation => evaluation.match >= bucket.min && evaluation.match <= bucket.max).length,
    color: bucket.color,
  })), [recentEvaluations]);

  const maxFunnelValue = Math.max(1, ...dashboardFunnel.map(stage => stage.value));

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

        {/* Performance Stats Grid (Transferred from Reports) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          {stats.map((s, i) => (
            <div key={i} className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs transition-all hover:shadow-sm">
              <div className={`text-2xl sm:text-3xl font-black mb-1 ${s.color}`}>{s.value}</div>
              <div className="text-slate-800 text-xs font-bold">{s.label}</div>
              <div className="text-slate-500 text-[11px] mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Dashboard analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
          <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-[#172033]">Screening volume</h2>
              <p className="mt-1 text-sm text-slate-500">Evaluations scored in the last 30 days</p>
            </div>
            <div className="h-[260px] px-3 pb-3 pt-4 sm:px-5">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={screeningVolume} margin={{ top: 6, right: 4, bottom: 0, left: -14 }}>
                  <defs>
                    <linearGradient id="screeningVolumeFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FF5A36" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#FF5A36" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#E2E8F0" strokeDasharray="3 5" />
                  <XAxis dataKey="label" interval={4} tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} width={28} tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, borderColor: '#E2E8F0', fontSize: 12 }} formatter={value => [value, 'Evaluations']} />
                  <Area type="monotone" dataKey="count" stroke="#FF5A36" strokeWidth={2} fill="url(#screeningVolumeFill)" activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-[#172033]">Score distribution</h2>
              <p className="mt-1 text-sm text-slate-500">All stored evaluations</p>
            </div>
            <div className="h-[260px] px-3 pb-3 pt-4 sm:px-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreDistribution} margin={{ top: 6, right: 0, bottom: 0, left: -16 }}>
                  <CartesianGrid vertical={false} stroke="#E2E8F0" strokeDasharray="3 5" />
                  <XAxis dataKey="label" tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} width={28} tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, borderColor: '#E2E8F0', fontSize: 12 }} formatter={value => [value, 'Candidates']} />
                  <Bar dataKey="count" radius={[7, 7, 0, 0]} maxBarSize={34}>
                    {scoreDistribution.map(bucket => <Cell key={bucket.label} fill={bucket.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-[#172033]">Funnel</h2>
              <p className="mt-1 text-sm text-slate-500">Current pipeline state</p>
            </div>
            <div className="space-y-2.5 px-5 py-4">
              {dashboardFunnel.map(item => (
                <div key={item.stage} className="grid grid-cols-[minmax(95px,0.8fr)_minmax(0,1fr)_26px] items-center gap-3 text-xs">
                  <span className="truncate text-slate-500">{item.stage}</span>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    {item.value > 0 && <div className="h-full rounded-full bg-[#F07F67] transition-[width] duration-500" style={{ width: `${Math.max(3, (item.value / maxFunnelValue) * 100)}%` }} />}
                  </div>
                  <span className="text-right font-semibold text-slate-800">{item.value}</span>
                </div>
              ))}
            </div>
          </section>
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
