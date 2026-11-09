'use client';

import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import Header from '@/components/Header';

type InterviewRound = 'Recruiter Screen' | 'Technical Interview' | 'HR Interview';
type InterviewStatus = 'scheduled' | 'feedback_due' | 'completed';

interface QueueCandidate {
  id: string;
  name: string;
  role: string;
  score: number;
  stage: 'Shortlisted' | 'Technical interview';
  requisitionId: string;
}

interface InterviewEntry {
  id: string;
  candidateId: string;
  candidateName: string;
  role: string;
  requisitionId: string;
  round: InterviewRound;
  startAt: string;
  interviewer: string;
  meetingPlace: string;
  notes: string;
  status: InterviewStatus;
}

interface InterviewOutcome {
  id: string;
  candidateName: string;
  role: string;
  requisitionId: string;
  round: InterviewRound;
  when: string;
  outcome: 'Strong Yes' | 'Yes' | 'Maybe' | 'No';
  comments: string;
}

interface InterviewActivity {
  id: string;
  title: string;
  detail: string;
  at: string;
}

interface InterviewStore {
  interviews: InterviewEntry[];
  outcomes: InterviewOutcome[];
  activity: InterviewActivity[];
}

interface ScheduleForm {
  candidateId: string;
  round: InterviewRound;
  startAt: string;
  interviewer: string;
  meetingPlace: string;
  notes: string;
}

const INTERVIEW_STORAGE_KEY = 'tasknera_interviews_frontend_v1';
const PIPELINE_STORAGE_KEY = 'tasknera_recruitment_pipeline_v1';

const demoQueue: QueueCandidate[] = [];

const roundOptions: InterviewRound[] = ['Recruiter Screen', 'Technical Interview', 'HR Interview'];

const emptyStore: InterviewStore = { interviews: [], outcomes: [], activity: [] };

function toLocalInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date pending';
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function mapPipelineQueue(): QueueCandidate[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PIPELINE_STORAGE_KEY) || 'null');
    if (Array.isArray(parsed)) {
      const mapped = parsed
        .filter((candidate: any) =>
          ['Shortlisted', 'Recruiter Screen', 'Round 1 Phase', 'Round 2 Phase'].includes(candidate?.stage)
        )
        .map((candidate: any): QueueCandidate => ({
          id: String(candidate.id),
          name: String(candidate.name || 'Candidate'),
          role: String(candidate.role || 'Position pending'),
          score: Number(candidate.score) || 0,
          stage: candidate.stage === 'Shortlisted' ? 'Shortlisted' : candidate.stage,
          requisitionId: String(candidate.requisitionId || 'other'),
        }));
      if (mapped.length > 0) return mapped;
    }
  } catch {
    // Use the built-in coordination queue until the live service is connected.
  }
  return demoQueue;
}

export default function InterviewsPage() {
  const [queueCandidates, setQueueCandidates] = useState<QueueCandidate[]>(demoQueue);
  const [store, setStore] = useState<InterviewStore>(emptyStore);
  const [requisitionFilter, setRequisitionFilter] = useState('all');
  const [isHydrated, setIsHydrated] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editingInterviewId, setEditingInterviewId] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>({
    candidateId: '',
    round: 'Recruiter Screen',
    startAt: '',
    interviewer: '',
    meetingPlace: '',
    notes: '',
  });
  const [scheduleError, setScheduleError] = useState('');
  const [feedbackInterviewId, setFeedbackInterviewId] = useState<string | null>(null);
  const [feedbackOutcome, setFeedbackOutcome] = useState<InterviewOutcome['outcome']>('Yes');
  const [feedbackComments, setFeedbackComments] = useState('');

  useEffect(() => {
    setQueueCandidates(mapPipelineQueue());
    try {
      const parsed = JSON.parse(localStorage.getItem(INTERVIEW_STORAGE_KEY) || 'null');
      if (parsed && typeof parsed === 'object') {
        setStore({
          interviews: Array.isArray(parsed.interviews) ? parsed.interviews : [],
          outcomes: Array.isArray(parsed.outcomes) ? parsed.outcomes : [],
          activity: Array.isArray(parsed.activity) ? parsed.activity : [],
        });
      }
    } catch {
      setStore(emptyStore);
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    localStorage.setItem(INTERVIEW_STORAGE_KEY, JSON.stringify(store));
  }, [isHydrated, store]);

  const requisitionOptions = useMemo(() => {
    const roles = new Map<string, string>();
    [...queueCandidates, ...store.interviews.map(interview => ({
      id: interview.candidateId,
      role: interview.role,
      requisitionId: interview.requisitionId,
    }))].forEach(candidate => {
      if (candidate.requisitionId && !roles.has(candidate.requisitionId)) {
        roles.set(candidate.requisitionId, candidate.role);
      }
    });
    return [{ id: 'all', label: 'All requisitions' }, ...Array.from(roles, ([id, label]) => ({ id, label }))];
  }, [queueCandidates, store.interviews]);

  const filteredQueue = useMemo(() => queueCandidates.filter(candidate =>
    (requisitionFilter === 'all' || candidate.requisitionId === requisitionFilter) &&
    !store.interviews.some(interview => interview.candidateId === candidate.id && interview.status !== 'completed')
  ), [queueCandidates, requisitionFilter, store.interviews]);

  const filteredInterviews = useMemo(() => store.interviews
    .filter(interview => requisitionFilter === 'all' || interview.requisitionId === requisitionFilter)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
  [store.interviews, requisitionFilter]);

  const filteredOutcomes = useMemo(() => store.outcomes
    .filter(outcome => requisitionFilter === 'all' || outcome.requisitionId === requisitionFilter)
    .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
    .slice(0, 8), [store.outcomes, requisitionFilter]);

  const todayKey = new Date().toDateString();
  const nextWeek = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const todayCount = filteredInterviews.filter(interview => new Date(interview.startAt).toDateString() === todayKey && interview.status === 'scheduled').length;
  const weekCount = filteredInterviews.filter(interview => {
    const time = new Date(interview.startAt).getTime();
    return interview.status === 'scheduled' && time >= Date.now() && time <= nextWeek;
  }).length;
  const feedbackDueCount = filteredInterviews.filter(interview => interview.status === 'feedback_due').length;
  const upcomingInterviews = filteredInterviews.filter(interview => {
    const time = new Date(interview.startAt).getTime();
    return interview.status === 'scheduled' && time >= Date.now() && time <= nextWeek;
  });

  const addActivity = (title: string, detail: string) => ({
    id: newId('activity'),
    title,
    detail,
    at: new Date().toISOString(),
  });

  const openSchedule = (candidate?: QueueCandidate, interview?: InterviewEntry) => {
    const defaultStart = new Date(Date.now() + 60 * 60 * 1000);
    defaultStart.setMinutes(0, 0, 0);
    setEditingInterviewId(interview?.id || null);
    setScheduleError('');
    setScheduleForm({
      candidateId: interview?.candidateId || candidate?.id || '',
      round: interview?.round || (candidate?.stage === 'Technical interview' ? 'Technical Interview' : 'Recruiter Screen'),
      startAt: interview?.startAt ? toLocalInputValue(new Date(interview.startAt)) : toLocalInputValue(defaultStart),
      interviewer: interview?.interviewer || '',
      meetingPlace: interview?.meetingPlace || '',
      notes: interview?.notes || '',
    });
    setScheduleOpen(true);
  };

  const saveSchedule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidate = queueCandidates.find(item => item.id === scheduleForm.candidateId) ||
      store.interviews.find(item => item.candidateId === scheduleForm.candidateId);
    if (!candidate) {
      setScheduleError('Choose a candidate to schedule.');
      return;
    }
    if (new Date(scheduleForm.startAt).getTime() < Date.now()) {
      setScheduleError('Choose a time in the future.');
      return;
    }

    const candidateName = 'name' in candidate ? candidate.name : candidate.candidateName;

    const interview: InterviewEntry = {
      id: editingInterviewId || newId('interview'),
      candidateId: candidate.id,
      candidateName,
      role: candidate.role,
      requisitionId: candidate.requisitionId,
      round: scheduleForm.round,
      startAt: new Date(scheduleForm.startAt).toISOString(),
      interviewer: scheduleForm.interviewer.trim(),
      meetingPlace: scheduleForm.meetingPlace.trim(),
      notes: scheduleForm.notes.trim(),
      status: 'scheduled',
    };

    const detail = `${candidateName} • ${interview.round} • ${formatDateTime(interview.startAt)}`;
    setStore(current => ({
      ...current,
      interviews: editingInterviewId
        ? current.interviews.map(item => item.id === editingInterviewId ? interview : item)
        : [interview, ...current.interviews],
      activity: [addActivity(editingInterviewId ? 'Interview rescheduled' : 'Interview scheduled', detail), ...current.activity].slice(0, 20),
    }));
    setScheduleOpen(false);
    setEditingInterviewId(null);
  };

  const markFeedbackDue = (interviewId: string) => {
    setStore(current => {
      const interview = current.interviews.find(item => item.id === interviewId);
      if (!interview) return current;
      return {
        ...current,
        interviews: current.interviews.map(item => item.id === interviewId ? { ...item, status: 'feedback_due' } : item),
        activity: [addActivity('Interview completed', `${interview.candidateName} • ${interview.round} • Feedback requested`), ...current.activity].slice(0, 20),
      };
    });
  };

  const saveFeedback = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const interview = store.interviews.find(item => item.id === feedbackInterviewId);
    if (!interview) return;
    const outcome: InterviewOutcome = {
      id: newId('outcome'),
      candidateName: interview.candidateName,
      role: interview.role,
      requisitionId: interview.requisitionId,
      round: interview.round,
      when: new Date().toISOString(),
      outcome: feedbackOutcome,
      comments: feedbackComments.trim(),
    };
    setStore(current => ({
      ...current,
      outcomes: [outcome, ...current.outcomes],
      interviews: current.interviews.map(item => item.id === interview.id ? { ...item, status: 'completed' } : item),
      activity: [addActivity('Interview feedback recorded', `${interview.candidateName} • ${feedbackOutcome}`), ...current.activity].slice(0, 20),
    }));
    setFeedbackInterviewId(null);
    setFeedbackComments('');
    setFeedbackOutcome('Yes');
  };

  const openFeedback = (interviewId: string) => {
    setFeedbackInterviewId(interviewId);
    setFeedbackComments('');
    setFeedbackOutcome('Yes');
  };

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#F7F8FC] px-5 pb-12 pt-24 sm:px-7 lg:px-8">
        <div className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Coordination</p>
            <h1 className="text-3xl font-bold tracking-tight text-[#172033] sm:text-[34px]">Interview dashboard</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500 sm:text-base">
              Book rounds, keep interviewers aligned and close the loop on feedback. Every change is written to the candidate timeline.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto">
            <label className="block min-w-0 flex-1 xl:w-[300px]">
              <span className="sr-only">Filter by requisition</span>
              <select
                value={requisitionFilter}
                onChange={event => setRequisitionFilter(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15"
              >
                {requisitionOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <button
              type="button"
              onClick={() => openSchedule()}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#F26943] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#e95d38]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 3v3m8-3v3M4 9h16M5.5 5h13A1.5 1.5 0 0120 6.5v12a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18.5v-12A1.5 1.5 0 015.5 5zM12 12v5m-2.5-2.5h5" />
              </svg>
              Schedule interview
            </button>
          </div>
        </div>

        <section aria-label="Interview metrics" className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Today', value: todayCount },
            { label: 'Next 7 days', value: weekCount },
            { label: 'Feedback due', value: feedbackDueCount },
            { label: 'Awaiting a round', value: filteredQueue.length },
          ].map(metric => (
            <div key={metric.label} className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-[0_2px_7px_rgba(15,23,42,0.04)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">{metric.label}</div>
              <div className="mt-2 text-[28px] font-bold leading-none text-[#172033]">{metric.value}</div>
            </div>
          ))}
        </section>

        <div className="grid grid-cols-1 items-start gap-5 2xl:grid-cols-[minmax(0,1.65fr)_minmax(360px,0.9fr)]">
          <div className="space-y-5">
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_2px_7px_rgba(15,23,42,0.04)]">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
                <div>
                  <h2 className="text-lg font-semibold text-[#172033]">Today &amp; upcoming</h2>
                  <p className="mt-1 text-sm text-slate-500">Confirmed rounds, in the candidate&apos;s local scheduling order.</p>
                </div>
                <span className="inline-flex items-center gap-1.5 pt-1 text-xs text-slate-500">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="4" y="5" width="16" height="15" rx="2" strokeWidth={1.7} /><path strokeLinecap="round" strokeWidth={1.7} d="M8 3v4m8-4v4M4 9h16" /></svg>
                  {upcomingInterviews.length} booked
                </span>
              </div>
              {upcomingInterviews.length === 0 ? (
                <p className="px-5 py-6 text-sm text-slate-500 sm:px-6">No interview is on the calendar. Schedule one from the coordination queue or the button above.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {upcomingInterviews.map(interview => (
                    <div key={interview.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-[#172033]">{interview.candidateName}</h3>
                          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">{interview.round}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{interview.role} · {formatDateTime(interview.startAt)}</p>
                        <p className="mt-1 text-xs text-slate-500">Interviewer: {interview.interviewer}{interview.meetingPlace ? ` · ${interview.meetingPlace}` : ''}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button type="button" onClick={() => openSchedule(undefined, interview)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Reschedule</button>
                        <button type="button" onClick={() => markFeedbackDue(interview.id)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700">Complete round</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {feedbackDueCount > 0 && (
                <div className="border-t border-amber-100 bg-amber-50/60 px-5 py-3 sm:px-6">
                  <p className="mb-2 text-xs font-semibold text-amber-800">Feedback due</p>
                  <div className="flex flex-wrap gap-2">
                    {filteredInterviews.filter(interview => interview.status === 'feedback_due').map(interview => (
                      <button key={interview.id} type="button" onClick={() => openFeedback(interview.id)} className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100">
                        Add feedback · {interview.candidateName}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_2px_7px_rgba(15,23,42,0.04)]">
              <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
                <h2 className="text-lg font-semibold text-[#172033]">Recent outcomes</h2>
                <p className="mt-1 text-sm text-slate-500">The last eight interview decisions in this workspace</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left">
                  <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                    <tr>
                      <th className="px-5 py-3 sm:px-6">Candidate</th>
                      <th className="px-4 py-3">Round</th>
                      <th className="px-4 py-3">When</th>
                      <th className="px-4 py-3">Outcome</th>
                      <th className="px-4 py-3">Comments</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-600">
                    {filteredOutcomes.length === 0 ? (
                      <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-500 sm:px-6">No interview outcomes recorded yet.</td></tr>
                    ) : filteredOutcomes.map(outcome => (
                      <tr key={outcome.id}>
                        <td className="px-5 py-3.5 sm:px-6"><div className="font-semibold text-slate-800">{outcome.candidateName}</div><div className="mt-0.5 text-[11px] text-slate-500">{outcome.role}</div></td>
                        <td className="px-4 py-3.5">{outcome.round}</td>
                        <td className="whitespace-nowrap px-4 py-3.5">{formatDateTime(outcome.when)}</td>
                        <td className="px-4 py-3.5"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">{outcome.outcome}</span></td>
                        <td className="max-w-[220px] px-4 py-3.5"><span className="line-clamp-2">{outcome.comments || '—'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div className="space-y-5">
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_2px_7px_rgba(15,23,42,0.04)]">
              <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
                <h2 className="text-lg font-semibold text-[#172033]">Team status updates</h2>
                <p className="mt-1 text-sm text-slate-500">Bookings, reschedules and feedback from your hiring team, newest first</p>
              </div>
              {store.activity.length === 0 ? (
                <p className="px-5 py-6 text-sm text-slate-500 sm:px-6">No interview activity recorded yet.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {store.activity.slice(0, 5).map(activity => (
                    <div key={activity.id} className="flex items-start justify-between gap-4 px-5 py-3.5 sm:px-6">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800">{activity.title}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{activity.detail}</p>
                      </div>
                      <time className="shrink-0 pt-0.5 text-[10px] text-slate-400">{formatRelativeTime(activity.at)}</time>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_2px_7px_rgba(15,23,42,0.04)]">
              <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
                <h2 className="text-lg font-semibold text-[#172033]">Coordination queue</h2>
                <p className="mt-1 text-sm text-slate-500">Shortlisted candidates with no round booked</p>
              </div>
              {filteredQueue.length === 0 ? (
                <p className="px-5 py-6 text-sm text-slate-500 sm:px-6">Everyone in this queue has an interview booked.</p>
              ) : (
                <div className="max-h-[620px] space-y-2.5 overflow-y-auto p-4 sm:p-5">
                  {filteredQueue.map(candidate => (
                    <article key={candidate.id} className="rounded-2xl border border-slate-200 p-3.5 transition hover:border-slate-300 hover:shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold text-[#172033]">{candidate.name}</h3>
                          <p className="mt-1 truncate text-xs text-slate-500">{candidate.role} · score {candidate.score}</p>
                        </div>
                        <button type="button" onClick={() => openSchedule(candidate)} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-50">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 3v3m8-3v3M4 9h16M5.5 5h13A1.5 1.5 0 0120 6.5v12a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18.5v-12A1.5 1.5 0 015.5 5zM12 12v5m-2.5-2.5h5" /></svg>
                          Schedule
                        </button>
                      </div>
                      <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${candidate.stage === 'Shortlisted' ? 'bg-violet-50 text-violet-700' : 'bg-indigo-50 text-indigo-700'}`}>
                        {candidate.stage}
                      </span>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      {scheduleOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setScheduleOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="schedule-interview-title" className="my-auto w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div><h2 id="schedule-interview-title" className="text-xl font-bold text-[#172033]">{editingInterviewId ? 'Reschedule interview' : 'Schedule interview'}</h2><p className="mt-1 text-sm text-slate-500">Add the round details for the candidate and interview team.</p></div>
              <button type="button" onClick={() => setScheduleOpen(false)} aria-label="Close" className="rounded-lg p-1 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700">×</button>
            </div>
            <form className="space-y-4" onSubmit={saveSchedule}>
              <label className="block text-xs font-semibold text-slate-700">Candidate
                <select required value={scheduleForm.candidateId} onChange={event => setScheduleForm(current => ({ ...current, candidateId: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15">
                  <option value="">Choose a candidate</option>
                  {queueCandidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.role}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-700">Round
                  <select value={scheduleForm.round} onChange={event => setScheduleForm(current => ({ ...current, round: event.target.value as InterviewRound }))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15">
                    {roundOptions.map(round => <option key={round} value={round}>{round}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-700">Date &amp; time
                  <input required type="datetime-local" value={scheduleForm.startAt} onChange={event => setScheduleForm(current => ({ ...current, startAt: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15" />
                </label>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-700">Interviewer
                  <input required value={scheduleForm.interviewer} onChange={event => setScheduleForm(current => ({ ...current, interviewer: event.target.value }))} placeholder="Name or email" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15" />
                </label>
                <label className="block text-xs font-semibold text-slate-700">Meeting link or location
                  <input value={scheduleForm.meetingPlace} onChange={event => setScheduleForm(current => ({ ...current, meetingPlace: event.target.value }))} placeholder="Video link or office" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15" />
                </label>
              </div>
              <label className="block text-xs font-semibold text-slate-700">Notes
                <textarea rows={3} value={scheduleForm.notes} onChange={event => setScheduleForm(current => ({ ...current, notes: event.target.value }))} placeholder="Optional details for the interview team" className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15" />
              </label>
              {scheduleError && <p role="alert" className="text-xs font-medium text-rose-600">{scheduleError}</p>}
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setScheduleOpen(false)} className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-200">Cancel</button>
                <button type="submit" className="rounded-xl bg-[#F26943] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#e95d38]">{editingInterviewId ? 'Save changes' : 'Confirm interview'}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {feedbackInterviewId && (
        <div className="fixed inset-0 z-[310] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setFeedbackInterviewId(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="interview-feedback-title" className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
            <h2 id="interview-feedback-title" className="text-xl font-bold text-[#172033]">Record interview feedback</h2>
            <p className="mt-1 text-sm text-slate-500">Save the outcome and comments to the recent outcomes table.</p>
            <form className="mt-5 space-y-4" onSubmit={saveFeedback}>
              <label className="block text-xs font-semibold text-slate-700">Outcome
                <select value={feedbackOutcome} onChange={event => setFeedbackOutcome(event.target.value as InterviewOutcome['outcome'])} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15">
                  {(['Strong Yes', 'Yes', 'Maybe', 'No'] as const).map(value => <option key={value}>{value}</option>)}
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-700">Comments
                <textarea rows={4} value={feedbackComments} onChange={event => setFeedbackComments(event.target.value)} placeholder="Interview feedback and next steps" className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15" />
              </label>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setFeedbackInterviewId(null)} className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-200">Cancel</button>
                <button type="submit" className="rounded-xl bg-[#F26943] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#e95d38]">Save feedback</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
