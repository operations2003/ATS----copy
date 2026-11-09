'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Header from '@/components/Header';
import { useAuth } from '@/context/AuthContext';
import { atsStore } from '@/lib/atsStore';

type PipelineStage =
  | 'Screening'
  | 'Shortlisted'
  | 'Recruiter Name'
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
  recruiterName?: string;
}

interface ScheduleForm {
  round: InterviewRound;
  startAt: string;
  interviewer: string;
  meetingPlace: string;
  notes: string;
}

export interface InterviewFeedbackRatings {
  technicalKnowledge: number;
  communication: number;
  problemSolving: number;
  roleSpecificSkills: number;
  experience: number;
}

const defaultFeedbackRatings: InterviewFeedbackRatings = {
  technicalKnowledge: 4,
  communication: 4,
  problemSolving: 4,
  roleSpecificSkills: 4,
  experience: 4,
};

const STORAGE_KEY = 'tasknera_recruitment_pipeline_v1';
const INTERVIEW_STORAGE_KEY = 'tasknera_interviews_frontend_v1';

const stages: PipelineStage[] = [
  'Screening',
  'Shortlisted',
  'Recruiter Name',
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

  // Interviewer Feedback Modal State (for Round 1 Phase and Round 2 Phase)
  const [feedbackCandidate, setFeedbackCandidate] = useState<PipelineCandidate | null>(null);
  const [feedbackRound, setFeedbackRound] = useState<string>('Technical Interview (Round 1)');
  const [feedbackRatings, setFeedbackRatings] = useState<InterviewFeedbackRatings>(defaultFeedbackRatings);
  const [feedbackRecommendation, setFeedbackRecommendation] = useState<'Strong Hire' | 'Hire' | 'Hold' | 'Do Not Hire'>('Hire');
  const [feedbackComments, setFeedbackComments] = useState('');
  const [feedbackOutcomesMap, setFeedbackOutcomesMap] = useState<Record<string, { averageRating: number; recommendation: string; round: string }>>({});

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
                if (c && c.id && !DUMMY_IDS.has(c.id)) {
                  // Legacy migrations: 'Sourced' -> 'Screening', 'Recruiter Screen' -> 'Recruiter Name'
                  const mappedStage =
                    c.stage === 'Sourced'
                      ? 'Screening'
                      : c.stage === 'Recruiter Screen'
                      ? 'Recruiter Name'
                      : c.stage;
                  if (stages.includes(mappedStage)) {
                    stageOverrides[c.id] = mappedStage;
                  }
                }
              }
            } else if (parsed && typeof parsed === 'object') {
              for (const [cId, cStage] of Object.entries(parsed)) {
                if (!DUMMY_IDS.has(cId)) {
                  const mappedStage =
                    cStage === 'Sourced'
                      ? 'Screening'
                      : cStage === 'Recruiter Screen'
                      ? 'Recruiter Name'
                      : (cStage as PipelineStage);
                  if (stages.includes(mappedStage)) {
                    stageOverrides[cId] = mappedStage;
                  }
                }
              }
            }
          }
        } catch {}
      }

      // 4. Map Parsed Candidates & Assign Initial Stages
      // Rule: Sourced section removed - all parsed candidates start directly in "Screening"
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
        // - All parsed CVs start directly in "Screening"
        let stage: PipelineStage = 'Screening';
        if (stageOverrides[id]) {
          stage = stageOverrides[id];
        } else {
          stage = 'Screening';
        }

        // Resolve Recruiter Name who added / parsed this candidate
        const isUuid = (val?: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val || '');
        let recruiterName =
          c.recruiterName ||
          c.user?.name ||
          c.uploadedByName ||
          c.assignedRecruiter ||
          c.recruiter ||
          c.screenedBy;
        if (!recruiterName && c.user?.email) {
          recruiterName = c.user.email;
        }
        if (!recruiterName || isUuid(recruiterName)) {
          if (c.uploadedBy && !isUuid(c.uploadedBy)) {
            recruiterName = c.uploadedBy;
          } else if (c.createdBy && !isUuid(c.createdBy)) {
            recruiterName = c.createdBy;
          } else {
            recruiterName = user?.name || user?.email || 'Recruiter';
          }
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
          recruiterName,
        });
      }

      // 5. Ingest existing interview outcomes / feedback
      const outMap: Record<string, { averageRating: number; recommendation: string; round: string }> = {};
      if (typeof window !== 'undefined') {
        try {
          const rawStore = localStorage.getItem(INTERVIEW_STORAGE_KEY);
          if (rawStore) {
            const parsedStore = JSON.parse(rawStore);
            if (parsedStore && Array.isArray(parsedStore.outcomes)) {
              for (const o of parsedStore.outcomes) {
                if (o) {
                  const entry = {
                    averageRating: typeof o.averageRating === 'number' ? o.averageRating : 4.0,
                    recommendation: o.finalRecommendation || o.outcome || 'Hire',
                    round: o.round || 'Interview Round',
                  };
                  if (o.candidateId) outMap[String(o.candidateId).toLowerCase()] = entry;
                  if (o.candidateName) outMap[String(o.candidateName).toLowerCase()] = entry;
                }
              }
            }
          }
        } catch {}
      }

      if (isMounted) {
        setRequisitions(reqOptions);
        setCandidates(mappedCandidates);
        setFeedbackOutcomesMap(outMap);
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

  // Handle Interviewer Feedback form submit
  const handleSavePipelineFeedback = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!feedbackCandidate) return;

    const sum =
      feedbackRatings.technicalKnowledge +
      feedbackRatings.communication +
      feedbackRatings.problemSolving +
      feedbackRatings.roleSpecificSkills +
      feedbackRatings.experience;
    const avgScore = Math.round((sum / 5) * 10) / 10;

    const outcome = {
      id: `outcome-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      candidateId: feedbackCandidate.id,
      candidateName: feedbackCandidate.name,
      role: feedbackCandidate.role,
      requisitionId: feedbackCandidate.requisitionId,
      round: feedbackRound,
      when: new Date().toISOString(),
      outcome:
        feedbackRecommendation === 'Strong Hire'
          ? 'Strong Yes'
          : feedbackRecommendation === 'Hire'
          ? 'Yes'
          : feedbackRecommendation === 'Hold'
          ? 'Maybe'
          : 'No',
      finalRecommendation: feedbackRecommendation,
      ratings: feedbackRatings,
      averageRating: avgScore,
      comments: feedbackComments.trim(),
    };

    try {
      const rawStore = localStorage.getItem(INTERVIEW_STORAGE_KEY);
      let store: any = { interviews: [], outcomes: [], activity: [] };
      if (rawStore) {
        try {
          store = JSON.parse(rawStore);
        } catch {}
      }

      store.outcomes = [outcome, ...(store.outcomes || [])];
      if (Array.isArray(store.interviews)) {
        store.interviews = store.interviews.map((item: any) =>
          item.candidateId === feedbackCandidate.id || item.candidateName === feedbackCandidate.name
            ? { ...item, status: 'completed' }
            : item
        );
      }

      const activityItem = {
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: `${feedbackRound} feedback recorded`,
        detail: `${feedbackCandidate.name} • ${feedbackRecommendation} (★ ${avgScore})`,
        at: new Date().toISOString(),
      };
      store.activity = [activityItem, ...(store.activity || [])].slice(0, 25);
      localStorage.setItem(INTERVIEW_STORAGE_KEY, JSON.stringify(store));

      const cid = feedbackCandidate.id.toLowerCase();
      const cname = feedbackCandidate.name.toLowerCase();
      setFeedbackOutcomesMap(prev => ({
        ...prev,
        [cid]: { averageRating: avgScore, recommendation: feedbackRecommendation, round: feedbackRound },
        [cname]: { averageRating: avgScore, recommendation: feedbackRecommendation, round: feedbackRound },
      }));
    } catch (saveErr) {
      console.warn('[Pipeline] Could not save feedback:', saveErr);
    }

    setFeedbackCandidate(null);
    setFeedbackComments('');
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
              Move candidates through the hiring stages. All parsed CVs start directly in Screening.
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

                            {/* Recruiter who added this candidate */}
                            {stage === 'Recruiter Name' ? (
                              <div className="mt-2.5 rounded-xl border border-indigo-100 bg-indigo-50/80 px-2.5 py-1.5 text-[11px] text-indigo-900 shadow-xs">
                                <div className="flex items-center gap-1.5 font-semibold">
                                  <svg className="h-3.5 w-3.5 shrink-0 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                  </svg>
                                  <span className="truncate">Added by: <strong className="font-bold text-indigo-700">{candidate.recruiterName || user?.name || 'Recruiter'}</strong></span>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400">
                                <svg className="h-3 w-3 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                <span className="truncate">{candidate.recruiterName || user?.name || 'Recruiter'}</span>
                              </div>
                            )}

                            <div className="mt-2.5 flex items-center justify-between gap-2">
                              <span className={`inline-flex max-w-[205px] items-center gap-1.5 truncate rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] ${match.className}`}>
                                {match.dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />}
                                {match.label}
                              </span>
                              <span className="shrink-0 text-[13px] font-bold tabular-nums text-slate-800">{candidate.score}</span>
                            </div>

                            {/* Round 1 & Round 2 Interviewer Feedback Action */}
                            {(stage === 'Round 1 Phase' || stage === 'Round 2 Phase') && (() => {
                              const outcome =
                                feedbackOutcomesMap[candidate.id.toLowerCase()] ||
                                feedbackOutcomesMap[candidate.name.toLowerCase()];
                              return (
                                <div className="mt-2.5 flex items-center justify-between gap-1.5 border-t border-slate-100 pt-2 text-xs">
                                  {outcome ? (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                                      <span className="text-amber-500">★</span> {outcome.averageRating.toFixed(1)} · {outcome.recommendation}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-medium text-slate-400">Feedback pending</span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFeedbackCandidate(candidate);
                                      setFeedbackRound(stage === 'Round 2 Phase' ? 'Technical Interview (Round 2)' : 'Technical Interview (Round 1)');
                                      setFeedbackRatings(defaultFeedbackRatings);
                                      setFeedbackRecommendation(outcome?.recommendation === 'Strong Hire' || outcome?.recommendation === 'Hire' || outcome?.recommendation === 'Hold' || outcome?.recommendation === 'Do Not Hire' ? outcome.recommendation : 'Hire');
                                      setFeedbackComments('');
                                    }}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition shadow-2xs"
                                  >
                                    <svg className="h-3 w-3 text-[#F26943]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    {outcome ? 'Edit feedback' : 'Record feedback'}
                                  </button>
                                </div>
                              );
                            })()}

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

      {/* ── INTERVIEWER FEEDBACK MODAL (FOR ROUND 1 & ROUND 2) ── */}
      {feedbackCandidate && (() => {
        const sum =
          feedbackRatings.technicalKnowledge +
          feedbackRatings.communication +
          feedbackRatings.problemSolving +
          feedbackRatings.roleSpecificSkills +
          feedbackRatings.experience;
        const avgScore = Math.round((sum / 5) * 10) / 10;
        const kpis = [
          { key: 'technicalKnowledge' as const, label: 'Technical knowledge rating', desc: 'Understanding of core architecture, concepts, and technical depth' },
          { key: 'communication' as const, label: 'Communication rating', desc: 'Clarity of articulation, active listening, and structured delivery' },
          { key: 'problemSolving' as const, label: 'Problem-solving rating', desc: 'Analytical thinking, handling edge-cases, and logical reasoning' },
          { key: 'roleSpecificSkills' as const, label: 'Role-specific skills rating', desc: 'Hands-on competency with required tools, domain knowledge & tasks' },
          { key: 'experience' as const, label: 'Experience rating', desc: 'Depth of relevant track record, seniority, and demonstrated impact' },
        ];

        return (
          <div
            className="fixed inset-0 z-[320] flex items-center justify-center bg-slate-950/50 p-3 sm:p-4"
            onMouseDown={event => {
              if (event.target === event.currentTarget) {
                setFeedbackCandidate(null);
              }
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="pipeline-feedback-title"
              className="flex flex-col w-full max-w-2xl max-h-[90vh] rounded-3xl bg-white shadow-2xl overflow-hidden"
            >
              {/* Pinned Header */}
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4 sm:px-7 sm:py-4 bg-white shrink-0">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF1EB] px-2.5 py-0.5 text-[11px] font-bold text-[#F26943]">
                    Interviewer Feedback Form
                  </div>
                  <h2 id="pipeline-feedback-title" className="mt-1 text-xl font-bold text-[#172033]">
                    {feedbackCandidate.name} — {feedbackRound}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {feedbackCandidate.role} · Current Stage: {feedbackCandidate.stage}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFeedbackCandidate(null)}
                  aria-label="Close"
                  className="rounded-lg p-1.5 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  ×
                </button>
              </div>

              {/* Scrollable Form Body with Visible Scrollbar */}
              <form
                id="pipeline-feedback-form"
                className="flex-1 overflow-y-auto px-6 py-4 sm:px-7 space-y-4"
                style={{
                  scrollbarWidth: 'thin',
                  scrollbarColor: '#CBD5E1 #F8FAFC',
                }}
                onSubmit={handleSavePipelineFeedback}
              >
                {/* Round selection */}
                <label className="block text-xs font-bold text-slate-700">
                  Interview Round
                  <select
                    value={feedbackRound}
                    onChange={e => setFeedbackRound(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15"
                  >
                    <option value="Technical Interview (Round 1)">Round 1: Technical Interview (Round 1)</option>
                    <option value="Technical Interview (Round 2)">Round 2: Technical Interview (Round 2)</option>
                    <option value="Managerial / System Design">Round 2: Managerial / System Design</option>
                    <option value="Leadership / HR Round">Leadership / HR Round</option>
                  </select>
                </label>

                {/* 1. KPIs Section */}
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Evaluation KPIs</h3>
                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-orange-50 px-2.5 py-0.5 text-xs font-bold text-[#F26943] border border-orange-100">
                      Overall KPI Average: {avgScore.toFixed(1)} / 5.0
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {kpis.map(kpi => {
                      const currentValue = feedbackRatings[kpi.key];
                      return (
                        <div key={kpi.key} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3 sm:py-2.5 sm:px-3.5 transition hover:border-slate-300">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="min-w-0">
                              <label className="text-xs font-bold text-slate-800">{kpi.label}</label>
                              <p className="text-[11px] text-slate-500 leading-tight">{kpi.desc}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {[1, 2, 3, 4, 5].map(num => {
                                const isSelected = currentValue === num;
                                return (
                                  <button
                                    key={num}
                                    type="button"
                                    onClick={() => setFeedbackRatings(prev => ({ ...prev, [kpi.key]: num }))}
                                    className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold transition-all ${
                                      isSelected
                                        ? 'bg-[#F26943] text-white shadow-sm ring-2 ring-[#F26943]/20 scale-105'
                                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                                    }`}
                                  >
                                    {num}
                                  </button>
                                );
                              })}
                              <span className="ml-1 text-[11px] font-semibold text-slate-600 w-16 text-right">
                                {currentValue === 1 ? 'Poor' : currentValue === 2 ? 'Fair' : currentValue === 3 ? 'Good' : currentValue === 4 ? 'Very Good' : 'Excellent'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Comments */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Comments &amp; interviewer notes
                  </label>
                  <textarea
                    rows={3}
                    value={feedbackComments}
                    onChange={event => setFeedbackComments(event.target.value)}
                    placeholder="Provide specific observations, candidate strengths, potential concerns, and next steps..."
                    className="w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15 placeholder:text-slate-400"
                  />
                </div>

                {/* 3. Final Recommendation */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Final recommendation
                  </label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { val: 'Strong Hire', label: 'Strong Hire', sub: 'Strong Yes', bg: 'border-emerald-300 bg-emerald-50/70 text-emerald-800' },
                      { val: 'Hire', label: 'Hire', sub: 'Yes / Meets Bar', bg: 'border-teal-300 bg-teal-50/70 text-teal-800' },
                      { val: 'Hold', label: 'Hold', sub: 'Maybe / Borderline', bg: 'border-amber-300 bg-amber-50/70 text-amber-800' },
                      { val: 'Do Not Hire', label: 'Do Not Hire', sub: 'No', bg: 'border-rose-300 bg-rose-50/70 text-rose-800' },
                    ].map(rec => {
                      const isSelected = feedbackRecommendation === rec.val;
                      return (
                        <button
                          key={rec.val}
                          type="button"
                          onClick={() => setFeedbackRecommendation(rec.val as any)}
                          className={`flex flex-col items-center justify-center rounded-2xl border p-2.5 text-center transition-all ${
                            isSelected
                              ? `${rec.bg} ring-2 ring-brand-orange shadow-sm font-bold`
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span className="text-xs font-bold leading-tight">{rec.label}</span>
                          <span className="text-[10px] opacity-75 mt-0.5">{rec.sub}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </form>

              {/* Pinned Footer */}
              <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-3.5 sm:px-7 bg-white shrink-0 shadow-[0_-4px_16px_rgba(0,0,0,0.03)]">
                <div className="text-xs font-semibold text-slate-500">
                  Overall: <span className="text-sm font-bold text-[#F26943]">★ {avgScore.toFixed(1)}</span> <span className="text-[11px] text-slate-400">/ 5.0</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFeedbackCandidate(null)}
                    className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="pipeline-feedback-form"
                    className="rounded-xl bg-[#F26943] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#e95d38]"
                  >
                    Save round feedback
                  </button>
                </div>
              </div>
            </section>
          </div>
        );
      })()}
    </>
  );
}
