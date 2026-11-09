'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Header from '@/components/Header';

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

interface PipelineCandidate {
  id: string;
  name: string;
  role: string;
  score: number;
  stage: PipelineStage;
  requisitionId: string;
  decision?: 'SUBMIT' | 'REVIEW' | 'DO NOT SUBMIT';
}

const STORAGE_KEY = 'tasknera_recruitment_pipeline_v1';

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

const requisitions = [
  { id: 'all', label: 'All requisitions' },
  { id: 'sales-manager-gcc', label: 'Sales Manager - GCC (Qualitrix)' },
  { id: 'data-platform-architect', label: 'Data Platform Architect' },
  { id: 'senior-python-engineer', label: 'Senior Python Engineer' },
  { id: 'sap-co-lead-consultant', label: 'SAP CO Lead Consultant' },
];

const initialCandidates: PipelineCandidate[] = [
  { id: 'meera-iyer', name: 'Meera Iyer', role: 'Senior Python Engineer', score: 91.5, stage: 'Sourced', requisitionId: 'senior-python-engineer', decision: 'SUBMIT' },
  { id: 'arjun-deshpande', name: 'Arjun Deshpande', role: 'SAP CO Lead Consultant', score: 93.75, stage: 'Sourced', requisitionId: 'sap-co-lead-consultant', decision: 'SUBMIT' },
  { id: 'karthik-subramanian', name: 'Karthik Subramanian', role: 'Data Platform Architect', score: 71.79, stage: 'Screening', requisitionId: 'data-platform-architect', decision: 'REVIEW' },
  { id: 'priya-raman', name: 'Priya Raman', role: 'Senior Python Engineer', score: 69.79, stage: 'Screening', requisitionId: 'senior-python-engineer', decision: 'REVIEW' },
  { id: 'michael-chen', name: 'Michael Chen', role: 'SAP CO Lead Consultant', score: 80.63, stage: 'Screening', requisitionId: 'sap-co-lead-consultant', decision: 'REVIEW' },
  { id: 'ananya-bose', name: 'Ananya Bose', role: 'Data Platform Architect', score: 89, stage: 'Shortlisted', requisitionId: 'data-platform-architect', decision: 'SUBMIT' },
  { id: 'rahul-menon', name: 'Rahul Menon', role: 'Senior Python Engineer', score: 85.5, stage: 'Shortlisted', requisitionId: 'senior-python-engineer', decision: 'SUBMIT' },
  { id: 'sarah-mitchell', name: 'Sarah Mitchell', role: 'SAP CO Lead Consultant', score: 91.88, stage: 'Shortlisted', requisitionId: 'sap-co-lead-consultant', decision: 'SUBMIT' },
  { id: 'elena-petrova', name: 'Elena Petrova', role: 'Data Platform Architect', score: 18.22, stage: 'Round 1 Phase', requisitionId: 'data-platform-architect', decision: 'DO NOT SUBMIT' },
  { id: 'daniel-okafor', name: 'Daniel Okafor', role: 'Senior Python Engineer', score: 32.5, stage: 'Round 1 Phase', requisitionId: 'senior-python-engineer', decision: 'DO NOT SUBMIT' },
  { id: 'jennifer-lopez', name: 'Jennifer Lopez', role: 'SAP CO Lead Consultant', score: 29.77, stage: 'Round 1 Phase', requisitionId: 'sap-co-lead-consultant', decision: 'DO NOT SUBMIT' },
];

function getMatchPresentation(candidate: PipelineCandidate) {
  if (candidate.decision === 'DO NOT SUBMIT' || candidate.score < 65) {
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
  const [candidates, setCandidates] = useState<PipelineCandidate[]>(initialCandidates);
  const [requisitionFilter, setRequisitionFilter] = useState('all');
  const [readyToPersist, setReadyToPersist] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const validCandidates = parsed.filter((candidate): candidate is PipelineCandidate =>
            candidate &&
            typeof candidate.id === 'string' &&
            typeof candidate.name === 'string' &&
            typeof candidate.role === 'string' &&
            typeof candidate.score === 'number' &&
            stages.includes(candidate.stage) &&
            typeof candidate.requisitionId === 'string'
          );
          if (validCandidates.length > 0 || parsed.length === 0) {
            setCandidates(validCandidates);
          }
        }
      }
    } catch {
      // Keep the sample board available if local browser data is malformed.
    }
    setReadyToPersist(true);
  }, []);

  useEffect(() => {
    if (!readyToPersist) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(candidates));
  }, [candidates, readyToPersist]);

  const filteredCandidates = useMemo(
    () => candidates.filter(candidate => requisitionFilter === 'all' || candidate.requisitionId === requisitionFilter),
    [candidates, requisitionFilter]
  );

  const moveCandidate = (candidateId: string, direction: -1 | 1) => {
    setCandidates(current => current.map(candidate => {
      if (candidate.id !== candidateId) return candidate;
      const currentIndex = stages.indexOf(candidate.stage);
      const nextStage = stages[currentIndex + direction];
      return nextStage ? { ...candidate, stage: nextStage } : candidate;
    }));
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
              Move candidates through the hiring stages. Every move is saved to this browser for now.
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
      </main>
    </>
  );
}
