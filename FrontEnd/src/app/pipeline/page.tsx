'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Header from '@/components/Header';
import { useAuth } from '@/context/AuthContext';
import { atsStore } from '@/lib/atsStore';

type PipelineStage =
  | 'Sourced'
  | 'Screening'
  | 'Shortlisted'
  | 'Recruiter Screen'
  | 'Round 1 Phase'
  | 'Round 2 Phase'
  | 'Selected'
  | 'Offered'
  | 'Joined';

type InterviewRound =
  | 'Recruiter Screen'
  | 'Technical Interview'
  | 'Technical Interview (Round 1)'
  | 'Technical Interview (Round 2)'
  | 'Managerial / System Design'
  | 'Leadership / HR Round'
  | 'HR Interview'
  | string;

interface PipelineCandidate {
  id: string;
  name: string;
  role: string;
  score: number;
  stage: PipelineStage;
  requisitionId: string;
  requisitionTitle?: string;
  decision?: 'SUBMIT' | 'REVIEW' | 'DO NOT SUBMIT';
}

interface ScheduleForm {
  round: InterviewRound;
  startAt: string;
  interviewer: string;
  meetingPlace: string;
  notes: string;
}

const STORAGE_KEY = 'tasknera_recruitment_pipeline_v1';
const INTERVIEW_STORAGE_KEY = 'tasknera_interviews_frontend_v1';

const stages: PipelineStage[] = [
  'Sourced',
  'Screening',
  'Shortlisted',
  'Recruiter Screen',
  'Round 1 Phase',
  'Round 2 Phase',
  'Selected',
  'Offered',
  'Joined',
];

// Explicit list of dummy IDs to purge permanently
const DUMMY_IDS = new Set([
  'meera-iyer',
  'arjun-deshpande',
  'karthik-subramanian',
  'priya-raman',
  'michael-chen',
  'ananya-bose',
  'rahul-menon',
  'sarah-mitchell',
  'elena-petrova',
  'daniel-okafor',
  'jennifer-lopez',
  'cand-1',
  'cand-2',
  'cand-3',
  'cand-4',
  'cand-5',
  'cand-6',
]);

function getDefaultStartAt(): string {
  const target = new Date();
  target.setDate(target.getDate() + 1);
  target.setHours(15, 0, 0, 0);
  const local = new Date(target.getTime() - target.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function getMatchPresentation(candidate: PipelineCandidate) {
  if (candidate.decision === 'DO NOT SUBMIT' || candidate.score < 60) {
    return { label: 'DO NOT SUBMIT', className: 'border-rose-200 bg-rose-50 text-rose-600', dot: true };
  }
  if (candidate.score < 70) {
    return { label: 'BORDERLINE', className: 'border-amber-200 bg-amber-50 text-amber-700', dot: false };
  }
  if (candidate.score < 85) {
    return { label: 'MATCH', className: 'border-sky-200 bg-sky-50 text-sky-600', dot: false };
  }
  return { label: 'STRONG MATCH', className: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: false };
}

export default function PipelinePage() {
  const { user } = useAuth();
  const [candidates, setCandidates] = useState<PipelineCandidate[]>([]);
  const [requisitions, setRequisitions] = useState<Array<{ id: string; label: string }>>([
    { id: 'all', label: 'All requisitions' },
  ]);
  const [requisitionFilter, setRequisitionFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);

  // Schedule Interview Modal State (triggered when moving to Round 1 Phase or Round 2 Phase)
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [schedulingCandidate, setSchedulingCandidate] = useState<PipelineCandidate | null>(null);
  const [schedulingTargetStage, setSchedulingTargetStage] = useState<PipelineStage>('Round 1 Phase');
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>({
    round: 'Technical Interview (Round 1)',
    startAt: getDefaultStartAt(),
    interviewer: '',
    meetingPlace: '',
    notes: '',
  });

  // Load real requisitions and parsed candidates
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setIsLoading(true);
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const currentOrgId = user?.organizationId || 'org-tasknera';
      const isSuperAdmin =
        user?.role === 'SUPER_ADMIN' ||
        user?.email?.toLowerCase().trim() === 'operations@tasknera.com' ||
        user?.email?.toLowerCase().trim() === 'admin@gmail.com';

      // 1. Fetch Real Requisitions (Jobs)
      const jobMap = new Map<string, string>();
      try {
        const res = await fetch(`${backendUrl}/jobs`, { headers }).catch(() => null);
        if (res && res.ok) {
          const data = await res.json().catch(() => ({}));
          const list = Array.isArray(data.jobs) ? data.jobs : Array.isArray(data.data) ? data.data : [];
          for (const j of list) {
            const id = String(j.id);
            const title = String(j.position || j.title || j.client || 'Untitled Requisition');
            jobMap.set(id, title);
          }
        }
      } catch (err) {
        console.warn('[Pipeline] Could not fetch jobs from API:', err);
      }

      // Merge local storage jobs
      if (typeof window !== 'undefined') {
        try {
          const localJobs = JSON.parse(localStorage.getItem('tasknera_created_jobs') || '[]');
          if (Array.isArray(localJobs)) {
            for (const j of localJobs) {
              if (j && j.id && !jobMap.has(j.id)) {
                jobMap.set(j.id, j.position || j.title || 'Untitled Requisition');
              }
            }
          }
        } catch {}

        try {
          const atsJobs = atsStore.getJobs();
          for (const j of atsJobs) {
            if (j && j.id && !jobMap.has(j.id)) {
              jobMap.set(j.id, j.title || j.client || 'Untitled Requisition');
            }
          }
        } catch {}
      }

      const reqOptions: Array<{ id: string; label: string }> = [
        { id: 'all', label: 'All requisitions' },
      ];
      for (const [id, label] of jobMap.entries()) {
        reqOptions.push({ id, label });
      }

      // 2. Fetch Parsed Candidates
      let rawCandidates: any[] = [];
      try {
        let res = await fetch(`${backendUrl}/jobs/all/candidates`, { headers }).catch(() => null);
        if (!res || !res.ok) {
          res = await fetch(`${backendUrl}/candidates`, { headers }).catch(() => null);
        }
        if (res && res.ok) {
          const data = await res.json().catch(() => ({}));
          rawCandidates = Array.isArray(data.candidates) ? data.candidates : Array.isArray(data.data) ? data.data : [];
        }
      } catch (err) {
        console.warn('[Pipeline] Could not fetch candidates from API:', err);
      }

      // Merge candidates saved in browser localStorage across jobs and pool
      if (typeof window !== 'undefined') {
        try {
          const localPool = JSON.parse(localStorage.getItem('tasknera_candidates_pool') || '[]');
          if (Array.isArray(localPool)) {
            for (const lc of localPool) {
              const lcOrgId = lc.organizationId || 'org-tasknera';
              if (!isSuperAdmin && lcOrgId !== currentOrgId) continue;
              if (!rawCandidates.some((r: any) => r.id === lc.id || (r.fileName && r.fileName === lc.fileName))) {
                rawCandidates.unshift(lc);
              }
            }
          }

          // Scan all job-specific storage keys
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('tasknera_candidates_') && key !== 'tasknera_candidates_pool') {
              try {
                const jobCands = JSON.parse(localStorage.getItem(key) || '[]');
                if (Array.isArray(jobCands)) {
                  for (const jc of jobCands) {
                    const jcOrgId = jc.organizationId || 'org-tasknera';
                    if (!isSuperAdmin && jcOrgId !== currentOrgId) continue;
                    if (!rawCandidates.some((r: any) => r.id === jc.id || (r.fileName && r.fileName === jc.fileName))) {
                      rawCandidates.push(jc);
                    }
                  }
                }
              } catch {}
            }
          }

          // Ingest from atsStore
          const storeCands = atsStore.getCandidates();
          for (const sc of storeCands) {
            if (!rawCandidates.some((r: any) => r.id === sc.id)) {
              rawCandidates.push(sc);
            }
          }
        } catch {}
      }

      // 3. Load Saved Stage Overrides from LocalStorage
      const stageOverrides: Record<string, PipelineStage> = {};
      if (typeof window !== 'undefined') {
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
              for (const c of parsed) {
                if (c && c.id && !DUMMY_IDS.has(c.id) && stages.includes(c.stage)) {
                  stageOverrides[c.id] = c.stage;
                }
              }
            } else if (parsed && typeof parsed === 'object') {
              for (const [cId, cStage] of Object.entries(parsed)) {
                if (!DUMMY_IDS.has(cId) && stages.includes(cStage as PipelineStage)) {
                  stageOverrides[cId] = cStage as PipelineStage;
                }
              }
            }
          }
        } catch {}
      }

      // 4. Map Parsed Candidates & Assign Initial Stages
      // Rule: Parsed CVs are shown in "Sourced", and any falling in the category of "SUBMIT" are in "Screening"
      const mappedCandidates: PipelineCandidate[] = [];
      const seenIds = new Set<string>();

      for (const c of rawCandidates) {
        const id = String(c.id || '');
        if (!id || seenIds.has(id) || DUMMY_IDS.has(id)) continue;
        seenIds.add(id);

        const name = String(c.name || c.fileName || 'Candidate Profile').trim();
        const role = String(c.current_title || c.currentTitle || c.role || c.jobTitle || 'Candidate').trim();

        // Calculate score
        let score = 0;
        if (typeof c.atsScore === 'number') {
          score = Math.round(c.atsScore * 10) / 10;
        } else if (typeof c.matchScore === 'number') {
          score = Math.round(c.matchScore * 10) / 10;
        } else if (typeof c.match === 'number') {
          score = Math.round(c.match * 10) / 10;
        } else if (typeof c.score === 'number') {
          score = Math.round(c.score * 10) / 10;
        }

        // Determine decision category
        const rawDecision = String(c.decision || c.recommendation || '').toUpperCase().trim();
        let decision: 'SUBMIT' | 'REVIEW' | 'DO NOT SUBMIT' = 'REVIEW';
        if (rawDecision === 'SUBMIT' || rawDecision === 'TL_APPROVED' || score >= 85) {
          decision = 'SUBMIT';
        } else if (rawDecision === 'DO NOT SUBMIT' || rawDecision === 'REJECTED' || (score > 0 && score < 60)) {
          decision = 'DO NOT SUBMIT';
        }

        // Requisition assignment
        const requisitionId = String(c.job_id || c.jobId || 'all');
        const requisitionTitle = jobMap.get(requisitionId) || c.jobTitle || undefined;

        // Stage placement rule:
        // - Honored if manually moved by recruiter
        // - Otherwise: SUBMIT goes to "Screening", all other parsed CVs go to "Sourced"
        let stage: PipelineStage = 'Sourced';
        if (stageOverrides[id]) {
          stage = stageOverrides[id];
        } else if (decision === 'SUBMIT') {
          stage = 'Screening';
        } else {
          stage = 'Sourced';
        }

        mappedCandidates.push({
          id,
          name,
          role,
          score,
          stage,
          requisitionId,
          requisitionTitle,
          decision,
        });
      }

      if (isMounted) {
        setRequisitions(reqOptions);
        setCandidates(mappedCandidates);
        setIsLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [user]);

  // Filter candidates by requisition
  const filteredCandidates = useMemo(
    () =>
      candidates.filter(
        candidate => requisitionFilter === 'all' || candidate.requisitionId === requisitionFilter
      ),
    [candidates, requisitionFilter]
  );

  // Core helper to commit a stage move to state and localStorage
  const applyStageMove = (candidateId: string, newStage: PipelineStage) => {
    setCandidates(current => {
      const updated = current.map(candidate => {
        if (candidate.id !== candidateId) return candidate;
        return { ...candidate, stage: newStage };
      });

      try {
        // Save full candidate array for compatibility with /interviews page
        const cleanedForStorage = updated.filter(c => !DUMMY_IDS.has(c.id));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanedForStorage));
      } catch (e) {
        console.warn('[Pipeline] Could not save stage:', e);
      }

      return updated;
    });
  };

  // Move candidate between stages
  const moveCandidate = (candidateId: string, direction: -1 | 1) => {
    const candidate = candidates.find(c => c.id === candidateId);
    if (!candidate) return;

    const currentIndex = stages.indexOf(candidate.stage);
    const nextStage = stages[currentIndex + direction];
    if (!nextStage) return;

    // ── SPECIFIC TRIGGER: When moving to Round 1 Phase OR Round 2 Phase, show Schedule Interview modal ──
    if (nextStage === 'Round 1 Phase' || nextStage === 'Round 2 Phase') {
      setSchedulingCandidate(candidate);
      setSchedulingTargetStage(nextStage);
      setScheduleError('');
      setScheduleForm({
        round: nextStage === 'Round 2 Phase' ? 'Technical Interview (Round 2)' : 'Technical Interview (Round 1)',
        startAt: getDefaultStartAt(),
        interviewer: user?.name || user?.email || '',
        meetingPlace: '',
        notes: '',
      });
      setIsScheduleOpen(true);
      return;
    }

    applyStageMove(candidateId, nextStage);
  };

  // Handle interview scheduling form submit
  const handleConfirmSchedule = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schedulingCandidate) return;

    if (!scheduleForm.interviewer.trim()) {
      setScheduleError('Please provide interviewer name or email.');
      return;
    }

    if (!scheduleForm.startAt) {
      setScheduleError('Please select interview date & time.');
      return;
    }

    if (!scheduleForm.meetingPlace.trim()) {
      setScheduleError('Please provide interview meeting link or location.');
      return;
    }

    try {
      // 1. Create interview entry
      const interviewId = `interview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const newInterview = {
        id: interviewId,
        candidateId: schedulingCandidate.id,
        candidateName: schedulingCandidate.name,
        role: schedulingCandidate.role,
        requisitionId: schedulingCandidate.requisitionId,
        round: scheduleForm.round as any,
        startAt: new Date(scheduleForm.startAt).toISOString(),
        interviewer: scheduleForm.interviewer.trim(),
        meetingPlace: scheduleForm.meetingPlace.trim(),
        notes: scheduleForm.notes.trim(),
        status: 'scheduled' as const,
      };

      const roundLabel = schedulingTargetStage === 'Round 2 Phase' ? 'Round 2' : 'Round 1';
      const activityItem = {
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: `${roundLabel} Interview scheduled`,
        detail: `${schedulingCandidate.name} • ${scheduleForm.round} • ${new Date(scheduleForm.startAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`,
        at: new Date().toISOString(),
      };

      // 2. Persist to tasknera_interviews_frontend_v1
      const rawStore = localStorage.getItem(INTERVIEW_STORAGE_KEY);
      let store: any = { interviews: [], outcomes: [], activity: [] };
      if (rawStore) {
        try {
          store = JSON.parse(rawStore);
        } catch {}
      }

      store.interviews = [newInterview, ...(store.interviews || [])];
      store.activity = [activityItem, ...(store.activity || [])].slice(0, 25);
      localStorage.setItem(INTERVIEW_STORAGE_KEY, JSON.stringify(store));
    } catch (saveErr) {
      console.warn('[Pipeline] Could not save scheduled interview:', saveErr);
    }

    // 3. Move candidate to targeted stage (Round 1 Phase or Round 2 Phase)
    applyStageMove(schedulingCandidate.id, schedulingTargetStage);

    // 4. Close modal
    setIsScheduleOpen(false);
    setSchedulingCandidate(null);
  };

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#F7F8FC] px-5 pb-10 pt-24 sm:px-7 lg:px-8">
        <div className="mb-7 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Pipeline</p>
            <h1 className="text-3xl font-bold tracking-tight text-[#172033] sm:text-[34px]">Recruitment pipeline</h1>
            <p className="mt-1.5 text-sm text-slate-500 sm:text-base">
              Move parsed candidates through the hiring stages. Parsed CVs appear in Sourced, and recommended candidates start in Screening.
            </p>
          </div>
          <label className="block w-full xl:w-[325px]">
            <span className="sr-only">Filter by requisition</span>
            <select
              value={requisitionFilter}
              onChange={event => setRequisitionFilter(event.target.value)}
              className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15"
            >
              {requisitions.map(requisition => (
                <option key={requisition.id} value={requisition.id}>{requisition.label}</option>
              ))}
            </select>
          </label>
        </div>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
              <svg className="h-5 w-5 animate-spin text-brand-orange" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Loading recruitment pipeline...
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto pb-4">
            <div className="grid w-max grid-flow-col auto-cols-[292px] gap-4">
              {stages.map((stage, stageIndex) => {
                const stageCandidates = filteredCandidates.filter(candidate => candidate.stage === stage);
                return (
                  <section key={stage} aria-label={`${stage} stage`} className="min-w-0">
                    <div className="mb-3 flex h-7 items-center justify-between gap-2 px-1">
                      <h2 className="truncate text-[12px] font-bold uppercase tracking-[0.12em] text-slate-500">{stage}</h2>
                      <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-100 px-2 text-[11px] font-bold text-slate-600">
                        {stageCandidates.length}
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {stageCandidates.length === 0 ? (
                        <div className="flex h-[102px] items-center justify-center rounded-2xl bg-slate-100/75 text-xs font-medium text-slate-400">
                          Empty
                        </div>
                      ) : stageCandidates.map(candidate => {
                        const match = getMatchPresentation(candidate);
                        return (
                          <article key={candidate.id} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_2px_7px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-md">
                            <h3 className="truncate text-[14px] font-bold leading-5 text-[#172033]" title={candidate.name}>{candidate.name}</h3>
                            <p className="mt-1 truncate text-[12px] text-slate-500" title={candidate.role}>{candidate.role}</p>

                            <div className="mt-2.5 flex items-center justify-between gap-2">
                              <span className={`inline-flex max-w-[205px] items-center gap-1.5 truncate rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] ${match.className}`}>
                                {match.dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />}
                                {match.label}
                              </span>
                              <span className="shrink-0 text-[13px] font-bold tabular-nums text-slate-800">{candidate.score}</span>
                            </div>

                            <div className="mt-2.5 flex items-center justify-between">
                              <button
                                type="button"
                                onClick={() => moveCandidate(candidate.id, -1)}
                                disabled={stageIndex === 0}
                                aria-label={`Move ${candidate.name} to previous stage`}
                                title="Move to previous stage"
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 12H5m0 0 6 6m-6-6 6-6" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => moveCandidate(candidate.id, 1)}
                                disabled={stageIndex === stages.length - 1}
                                aria-label={`Move ${candidate.name} to next stage`}
                                title="Move to next stage"
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 12h14m0 0-6-6m6 6-6 6" />
                                </svg>
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* ── SCHEDULE INTERVIEW MODAL (ON MOVE TO ROUND 1 PHASE) ── */}
      {isScheduleOpen && schedulingCandidate && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4"
          onMouseDown={event => {
            if (event.target === event.currentTarget) {
              setIsScheduleOpen(false);
              setSchedulingCandidate(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-interview-title"
            className="my-auto w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="schedule-interview-title" className="text-xl font-bold text-[#172033]">
                  {schedulingTargetStage === 'Round 2 Phase' ? 'Schedule Round 2 interview' : 'Schedule interview'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {schedulingTargetStage === 'Round 2 Phase'
                    ? 'Add the round 2 details, new date & time, and meeting link.'
                    : 'Add the round details for the candidate and interview team.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsScheduleOpen(false);
                  setSchedulingCandidate(null);
                }}
                aria-label="Close"
                className="rounded-lg p-1 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ×
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleConfirmSchedule}>
              <label className="block text-xs font-semibold text-slate-700">
                Candidate
                <div className="mt-1.5 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-3 text-sm font-bold text-slate-800">
                  <span>{schedulingCandidate.name}</span>
                  <span className="text-xs font-medium text-slate-500">{schedulingCandidate.role}</span>
                </div>
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Round
                  <select
                    value={scheduleForm.round}
                    onChange={event =>
                      setScheduleForm(current => ({
                        ...current,
                        round: event.target.value as InterviewRound,
                      }))
                    }
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15"
                  >
                    {schedulingTargetStage === 'Round 2 Phase' ? (
                      <>
                        <option value="Technical Interview (Round 2)">Technical Interview (Round 2)</option>
                        <option value="Managerial / System Design">Managerial / System Design</option>
                        <option value="Leadership / HR Round">Leadership / HR Round</option>
                      </>
                    ) : (
                      <>
                        <option value="Technical Interview (Round 1)">Technical Interview (Round 1)</option>
                        <option value="Recruiter Screen">Recruiter Screen</option>
                        <option value="HR Interview">HR Interview</option>
                      </>
                    )}
                  </select>
                </label>

                <label className="block text-xs font-semibold text-slate-700">
                  Date &amp; time
                  <input
                    required
                    type="datetime-local"
                    value={scheduleForm.startAt}
                    onChange={event =>
                      setScheduleForm(current => ({ ...current, startAt: event.target.value }))
                    }
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Interviewer
                  <input
                    required
                    value={scheduleForm.interviewer}
                    onChange={event =>
                      setScheduleForm(current => ({ ...current, interviewer: event.target.value }))
                    }
                    placeholder="Name or email"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15"
                  />
                </label>

                <label className="block text-xs font-semibold text-slate-700">
                  Meeting link or location
                  <input
                    required
                    value={scheduleForm.meetingPlace}
                    onChange={event =>
                      setScheduleForm(current => ({ ...current, meetingPlace: event.target.value }))
                    }
                    placeholder="Video link (e.g. Google Meet / Zoom) or office"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15"
                  />
                </label>
              </div>

              <label className="block text-xs font-semibold text-slate-700">
                Notes
                <textarea
                  rows={3}
                  value={scheduleForm.notes}
                  onChange={event =>
                    setScheduleForm(current => ({ ...current, notes: event.target.value }))
                  }
                  placeholder="Optional details for the interview team"
                  className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15"
                />
              </label>

              {scheduleError && (
                <p role="alert" className="text-xs font-medium text-rose-600">
                  {scheduleError}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    // Option to advance to target stage directly without booking interview
                    applyStageMove(schedulingCandidate.id, schedulingTargetStage);
                    setIsScheduleOpen(false);
                    setSchedulingCandidate(null);
                  }}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  Move without scheduling
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsScheduleOpen(false);
                      setSchedulingCandidate(null);
                    }}
                    className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-[#F26943] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#e95d38]"
                  >
                    {schedulingTargetStage === 'Round 2 Phase' ? 'Confirm Round 2 interview' : 'Confirm interview'}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
