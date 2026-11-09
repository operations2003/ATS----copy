'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Header from '@/components/Header';
import { useAuth } from '@/context/AuthContext';

interface CandidateRecord {
  id: string;
  name: string;
  jobId: string;
  requisition: string;
  score: number | null;
  decision: string;
  mandatoryFailed: boolean;
  failedRequirement: string;
  recruiter: string;
  skills: string[];
  stage: string;
  createdAt: string;
  scoreBreakdown: any;
  raw: any;
}

interface RequisitionRecord {
  id: string;
  title: string;
  status: string;
}

interface ReportData {
  candidates: CandidateRecord[];
  requisitions: RequisitionRecord[];
  interviewRecords: any[];
  pipelineStages: Record<string, string>;
}

const DATE_RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
];

const MAX_SCORES = [
  { key: 'mandatoryCompliance', label: 'Mandatory', maximum: 50 },
  { key: 'coreSkills', label: 'Core skill', maximum: 20 },
  { key: 'relevantExperience', label: 'Experience', maximum: 15 },
  { key: 'responsibilities', label: 'Responsibility', maximum: 10 },
  { key: 'preferredRequirements', label: 'Preferred', maximum: 5 },
];

const EMPTY_REPORT_DATA: ReportData = { candidates: [], requisitions: [], interviewRecords: [], pipelineStages: {} };

function readStoredArray(key: string): any[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readWorkspaceData(): ReportData {
  const jobs = [
    ...readStoredArray('tasknera_ats_jobs'),
    ...readStoredArray('tasknera_created_jobs'),
  ];
  const jobMap = new Map<string, any>();
  jobs.forEach(job => {
    const id = String(job.id || job.jobId || '');
    if (id && !jobMap.has(id)) jobMap.set(id, job);
  });

  const rawCandidates = [
    ...readStoredArray('tasknera_ats_candidates'),
    ...readStoredArray('tasknera_candidates_pool'),
  ];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key || !key.startsWith('tasknera_candidates_') || key.startsWith('tasknera_candidates_count_') || key === 'tasknera_candidates_pool') continue;
    rawCandidates.push(...readStoredArray(key));
  }

  const pipelineRows = readStoredArray('tasknera_recruitment_pipeline_v1');
  const pipelineStages: Record<string, string> = {};
  pipelineRows.forEach(candidate => {
    if (candidate?.id) pipelineStages[String(candidate.id)] = String(candidate.stage || '');
  });
  rawCandidates.push(...pipelineRows);

  const seenCandidates = new Set<string>();
  const candidates: CandidateRecord[] = [];
  rawCandidates.forEach((candidate: any, index) => {
    if (!candidate || typeof candidate !== 'object') return;
    const id = String(candidate.id || candidate.candidateId || candidate.email || `${candidate.name || candidate.fileName || 'candidate'}-${index}`);
    const jobId = String(candidate.jobId || candidate.job_id || candidate.requisitionId || '');
    const identity = `${id.toLowerCase()}::${jobId.toLowerCase()}`;
    if (seenCandidates.has(identity)) return;
    seenCandidates.add(identity);

    const job = jobMap.get(jobId);
    const scoreValue = candidate.finalScore ?? candidate.atsScore ?? candidate.matchScore ?? candidate.match ?? candidate.score ?? candidate.evaluation?.finalScore ?? candidate.evaluationAudit?.finalScore;
    const score = typeof scoreValue === 'number' && Number.isFinite(scoreValue) ? scoreValue : Number.isFinite(Number(scoreValue)) && scoreValue !== null && scoreValue !== '' ? Number(scoreValue) : null;
    const decision = String(candidate.decision || candidate.recommendation || candidate.evaluation?.recommendation || candidate.evaluationAudit?.recommendation || '').toUpperCase();
    const failed = candidate.mandatoryFailed === true || candidate.mandatoryPassed === false || String(candidate.mandatoryCompliance || '').toUpperCase() === 'NOT MET' || decision === 'DO NOT SUBMIT';
    const failures = candidate.mandatoryFailures || candidate.failedRequirements || candidate.missingMandatorySkills || candidate.failed_mandatory_requirements;
    const failureList = Array.isArray(failures) ? failures.map((item: any) => typeof item === 'string' ? item : item?.requirement || item?.name || '').filter(Boolean) : [];
    const skills = Array.isArray(candidate.skills)
      ? candidate.skills.map((item: any) => typeof item === 'string' ? item : item?.skill_name || item?.name || item?.skill || '').filter(Boolean)
      : Array.isArray(candidate.technicalSkills) ? candidate.technicalSkills.map(String) : [];
    const stage = pipelineStages[id] || String(candidate.stage || candidate.pipelineStage || candidate.stageStatus || '');
    candidates.push({
      id,
      name: String(candidate.name || candidate.fullName || candidate.fileName || `Candidate #${id.slice(-4)}`),
      jobId,
      requisition: String(candidate.jobTitle || candidate.job_title || candidate.position || candidate.requisition || job?.position || job?.title || job?.jobTitle || candidate.role || 'Unassigned requisition'),
      score,
      decision,
      mandatoryFailed: failed,
      failedRequirement: failureList.join('; ') || String(candidate.flagReason || candidate.mandatoryFailureReason || candidate.failedRequirement || (failed ? 'Mandatory knock-out requirement' : '')),
      recruiter: String(candidate.assignedRecruiter || candidate.recruiterName || candidate.screenedBy || candidate.uploadedBy || candidate.createdBy || ''),
      skills: Array.from(new Set(skills.map((skill: string) => skill.trim()).filter(Boolean))),
      stage,
      createdAt: String(candidate.evaluatedAt || candidate.scoredAt || candidate.uploadedAt || candidate.createdAt || candidate.created_at || candidate.updatedAt || candidate.evaluationAudit?.evaluatedAt || ''),
      scoreBreakdown: candidate.scoreBreakdown || candidate.evaluation?.scoreBreakdown || candidate.evaluationAudit?.scoreBreakdown || candidate.audit?.scoreBreakdown || candidate.evaluation?.auditData?.scoreBreakdown || null,
      raw: candidate,
    });
  });

  const requisitionMap = new Map<string, RequisitionRecord>();
  jobMap.forEach((job, id) => {
    const title = String(job.position || job.title || job.jobTitle || 'Untitled requisition');
    requisitionMap.set(id, { id, title, status: String(job.status || 'Active') });
  });
  candidates.forEach(candidate => {
    const id = candidate.jobId || `title:${candidate.requisition.toLowerCase()}`;
    if (!requisitionMap.has(id)) requisitionMap.set(id, { id, title: candidate.requisition, status: 'Active' });
  });

  let interviewRecords: any[] = [];
  try {
    const stored = JSON.parse(localStorage.getItem('tasknera_interviews_frontend_v1') || '{}');
    interviewRecords = Array.isArray(stored.interviews) ? stored.interviews : [];
  } catch {
    interviewRecords = [];
  }

  return { candidates, requisitions: Array.from(requisitionMap.values()), interviewRecords, pipelineStages };
}

function escapeCsv(value: unknown) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const content = [headers, ...rows].map(row => row.map(escapeCsv).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function ExportButton({ label, onClick }: { label: 'CSV' | 'PDF'; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 print:hidden">
      {label === 'CSV' ? (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></svg>
      ) : (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 3h7l5 5v13H7a2 2 0 01-2-2V5a2 2 0 012-2zM14 3v5h5M8 13h8M8 17h8" /></svg>
      )}
      {label}
    </button>
  );
}

function ReportCard({ title, description, actions, children, className = '' }: {
  title: string;
  description: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_2px_7px_rgba(15,23,42,0.04)] ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div><h2 className="text-lg font-semibold text-[#172033]">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export default function ReportsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<ReportData>(EMPTY_REPORT_DATA);
  const [isLoaded, setIsLoaded] = useState(false);
  const [requisitionFilter, setRequisitionFilter] = useState('all');
  const [dateRange, setDateRange] = useState('30');

  useEffect(() => {
    setData(readWorkspaceData());
    setIsLoaded(true);
  }, []);

  const filteredCandidates = useMemo(() => {
    const cutoff = dateRange === 'all' ? null : Date.now() - Number(dateRange) * 24 * 60 * 60 * 1000;
    return data.candidates.filter(candidate => {
      const requisitionMatches = requisitionFilter === 'all' || candidate.jobId === requisitionFilter || `title:${candidate.requisition.toLowerCase()}` === requisitionFilter;
      if (!requisitionMatches) return false;
      if (cutoff === null || !candidate.createdAt) return true;
      const timestamp = new Date(candidate.createdAt).getTime();
      return Number.isNaN(timestamp) || timestamp >= cutoff;
    });
  }, [data.candidates, requisitionFilter, dateRange]);

  const requisitionRows = useMemo(() => {
    const requisitions = data.requisitions.filter(item => requisitionFilter === 'all' || item.id === requisitionFilter || `title:${item.title.toLowerCase()}` === requisitionFilter);
    const rows = requisitions.map(requisition => {
      const candidates = filteredCandidates.filter(candidate => candidate.jobId === requisition.id || (!candidate.jobId && candidate.requisition.toLowerCase() === requisition.title.toLowerCase()));
      const scored = candidates.filter(candidate => candidate.score !== null);
      const rejected = candidates.filter(candidate => candidate.mandatoryFailed || candidate.decision.includes('DO NOT SUBMIT') || candidate.decision === 'REJECT');
      return {
        requisition: requisition.title,
        status: requisition.status.toLowerCase(),
        candidates: candidates.length,
        scored: scored.length,
        strong: scored.filter(candidate => candidate.score! >= 85 && !candidate.mandatoryFailed).length,
        match: scored.filter(candidate => candidate.score! >= 70 && candidate.score! < 85 && !candidate.mandatoryFailed).length,
        borderline: scored.filter(candidate => candidate.score! >= 65 && candidate.score! < 70 && !candidate.mandatoryFailed).length,
        rejected: rejected.length,
        average: scored.length ? scored.reduce((sum, candidate) => sum + (candidate.score || 0), 0) / scored.length : null,
      };
    });
    return rows.sort((a, b) => b.candidates - a.candidates || a.requisition.localeCompare(b.requisition));
  }, [data.requisitions, filteredCandidates, requisitionFilter]);

  const mandatoryFailures = useMemo(() => filteredCandidates.filter(candidate => candidate.mandatoryFailed || candidate.decision.includes('DO NOT SUBMIT')).map(candidate => ({
    candidate: candidate.name,
    requisition: candidate.requisition,
    failedRequirement: candidate.failedRequirement || 'Mandatory knock-out requirement',
    finalScore: candidate.score,
    recommendation: candidate.decision || 'DO NOT SUBMIT',
  })), [filteredCandidates]);

  const recruiterRows = useMemo(() => {
    const groups = new Map<string, { recruiter: string; candidates: number; shortlisted: number; interviews: number; joined: number }>();
    const interviewCounts = new Map<string, number>();
    data.interviewRecords.forEach(interview => {
      const interviewTime = new Date(interview?.startAt || interview?.when || '').getTime();
      const cutoff = dateRange === 'all' ? null : Date.now() - Number(dateRange) * 24 * 60 * 60 * 1000;
      if (cutoff !== null && Number.isFinite(interviewTime) && interviewTime < cutoff) return;
      if (requisitionFilter !== 'all' && interview?.requisitionId !== requisitionFilter) return;
      if (interview?.candidateId) interviewCounts.set(String(interview.candidateId), (interviewCounts.get(String(interview.candidateId)) || 0) + 1);
    });
    filteredCandidates.forEach(candidate => {
      const recruiter = candidate.recruiter || user?.name || 'Unassigned';
      const row = groups.get(recruiter) || { recruiter, candidates: 0, shortlisted: 0, interviews: 0, joined: 0 };
      row.candidates++;
      if (candidate.stage.toLowerCase().includes('shortlist') || candidate.decision === 'SUBMIT') row.shortlisted++;
      row.interviews += interviewCounts.get(candidate.id) || (candidate.stage.toLowerCase().includes('interview') ? 1 : 0);
      if (candidate.stage.toLowerCase() === 'joined' || String(candidate.raw.status || '').toLowerCase() === 'joined') row.joined++;
      groups.set(recruiter, row);
    });
    return Array.from(groups.values()).sort((a, b) => b.candidates - a.candidates || a.recruiter.localeCompare(b.recruiter));
  }, [filteredCandidates, data.interviewRecords, user?.name, dateRange, requisitionFilter]);

  const skillRows = useMemo(() => {
    const counts = new Map<string, Set<string>>();
    filteredCandidates.forEach(candidate => candidate.skills.forEach(skill => {
      const key = skill.trim();
      if (!key) return;
      const ids = counts.get(key) || new Set<string>();
      ids.add(candidate.id);
      counts.set(key, ids);
    }));
    return Array.from(counts, ([skill, candidates]) => ({ skill, candidates: candidates.size }))
      .sort((a, b) => b.candidates - a.candidates || a.skill.localeCompare(b.skill));
  }, [filteredCandidates]);

  const categoryRows = useMemo(() => MAX_SCORES.map(category => {
    const values = filteredCandidates.map(candidate => {
      const breakdown = candidate.scoreBreakdown?.[category.key];
      const value = typeof breakdown === 'number' ? breakdown : Number(breakdown?.score);
      return Number.isFinite(value) ? value : null;
    }).filter((value): value is number => value !== null);
    return {
      category: category.label,
      average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
      maximum: category.maximum,
    };
  }), [filteredCandidates]);

  const exportRequisitions = () => downloadCsv('job-wise-candidate-report.csv', ['Requisition', 'Status', 'Candidates', 'Scored', 'Strong', 'Match', 'Borderline', 'Rejected', 'Average score'], requisitionRows.map(row => [row.requisition, row.status, row.candidates, row.scored, row.strong, row.match, row.borderline, row.rejected, row.average?.toFixed(1) ?? '']));
  const exportFailures = () => downloadCsv('mandatory-failure-report.csv', ['Candidate', 'Requisition', 'Failed requirement', 'Final score', 'Recommendation'], mandatoryFailures.map(row => [row.candidate, row.requisition, row.failedRequirement, row.finalScore ?? '', row.recommendation]));
  const exportRecruiters = () => downloadCsv('recruiter-performance.csv', ['Recruiter', 'Candidates', 'Shortlisted', 'Interviews', 'Joined'], recruiterRows.map(row => [row.recruiter, row.candidates, row.shortlisted, row.interviews, row.joined]));
  const exportSkills = () => downloadCsv('skills-availability.csv', ['Skill', 'Candidates'], skillRows.map(row => [row.skill, row.candidates]));
  const exportCategories = () => downloadCsv('scoring-category-averages.csv', ['Category', 'Average awarded', 'Maximum'], categoryRows.map(row => [row.category, row.average?.toFixed(1) ?? '', row.maximum]));
  const exportPdf = () => window.print();

  const printButtons = (csv: () => void) => <><ExportButton label="CSV" onClick={csv} /><ExportButton label="PDF" onClick={exportPdf} /></>;

  return (
    <>
      <Header />
      <style jsx global>{`
        @media print {
          body.has-left-sidebar > aside,
          body.has-left-sidebar > header { display: none !important; }
          body.has-left-sidebar main {
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            padding-top: 0 !important;
          }
        }
      `}</style>
      <main className="min-h-screen bg-[#F7F8FC] px-5 pb-12 pt-24 sm:px-7 lg:px-8 print:bg-white print:px-0 print:pt-0">
        <div className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between print:hidden">
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Reports</p>
            <h1 className="text-3xl font-bold tracking-tight text-[#172033] sm:text-[34px]">Recruitment reports</h1>
            <p className="mt-1.5 text-sm text-slate-500 sm:text-base">Every report is generated from stored records in this workspace. Export the current filtered view.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto">
            <select value={requisitionFilter} onChange={event => setRequisitionFilter(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-brand-orange sm:min-w-[270px] xl:w-[275px]">
              <option value="all">All requisitions</option>
              {data.requisitions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
            <select value={dateRange} onChange={event => setDateRange(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-brand-orange sm:min-w-[170px] xl:w-[185px]">
              {DATE_RANGES.map(range => <option key={range.value} value={range.value}>{range.label}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-5">
          <ReportCard title="Job-wise candidate report" description="Volume, quality and knock-out distribution per requisition" actions={printButtons(exportRequisitions)}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500"><tr>
                  {['Requisition', 'Status', 'Candidates', 'Scored', 'Strong', 'Match', 'Borderline', 'Rejected', 'Avg score'].map(header => <th key={header} className="whitespace-nowrap px-4 py-3 first:pl-5 sm:first:pl-6">{header}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {requisitionRows.length === 0 ? <tr><td colSpan={9} className="px-5 py-8 text-center text-sm text-slate-500">{isLoaded ? 'No requisition or candidate records found for this view.' : 'Loading saved workspace records…'}</td></tr> : requisitionRows.map(row => <tr key={row.requisition}>
                    <td className="px-4 py-3.5 pl-5 font-medium text-slate-800 sm:pl-6">{row.requisition}</td><td className="px-4 py-3.5">{row.status}</td><td className="px-4 py-3.5">{row.candidates}</td><td className="px-4 py-3.5">{row.scored}</td><td className="px-4 py-3.5">{row.strong}</td><td className="px-4 py-3.5">{row.match}</td><td className="px-4 py-3.5">{row.borderline}</td><td className="px-4 py-3.5">{row.rejected}</td><td className="px-4 py-3.5">{row.average === null ? '—' : row.average.toFixed(1)}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </ReportCard>

          <ReportCard title="Mandatory failure report" description="Candidates blocked by a mandatory knock-out, regardless of overall score" actions={printButtons(exportFailures)}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500"><tr>
                  {['Candidate', 'Requisition', 'Failed requirement', 'Final score', 'Recommendation'].map(header => <th key={header} className="whitespace-nowrap px-4 py-3 first:pl-5 sm:first:pl-6">{header}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {mandatoryFailures.length === 0 ? <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-500">No mandatory failures in this view.</td></tr> : mandatoryFailures.map((row, index) => <tr key={`${row.candidate}-${index}`}>
                    <td className="px-4 py-3.5 pl-5 font-medium text-slate-800 sm:pl-6">{row.candidate}</td><td className="px-4 py-3.5">{row.requisition}</td><td className="max-w-[420px] px-4 py-3.5">{row.failedRequirement}</td><td className="px-4 py-3.5">{row.finalScore === null ? '—' : row.finalScore.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}</td><td className="px-4 py-3.5 font-semibold text-rose-600">{row.recommendation}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </ReportCard>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <ReportCard title="Recruiter performance" description="Outcome counts per recruiter" actions={<ExportButton label="CSV" onClick={exportRecruiters} />}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left">
                  <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500"><tr>{['Recruiter', 'Candidates', 'Shortlisted', 'Interviews', 'Joined'].map(header => <th key={header} className="whitespace-nowrap px-4 py-3 first:pl-5 sm:first:pl-6">{header}</th>)}</tr></thead>
                </table>
                <div className="max-h-[250px] overflow-y-auto">
                  <table className="w-full min-w-[560px] text-left"><tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                    {recruiterRows.length === 0 ? <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-500">No recruiter outcomes in this view.</td></tr> : recruiterRows.map(row => <tr key={row.recruiter}><td className="px-4 py-3.5 pl-5 font-medium text-slate-800 sm:pl-6">{row.recruiter}</td><td className="px-4 py-3.5">{row.candidates}</td><td className="px-4 py-3.5">{row.shortlisted}</td><td className="px-4 py-3.5">{row.interviews}</td><td className="px-4 py-3.5">{row.joined}</td></tr>)}
                  </tbody></table>
                </div>
              </div>
            </ReportCard>

            <ReportCard title="Skills availability" description="Most frequent candidate skills in this period" actions={<ExportButton label="CSV" onClick={exportSkills} />}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left"><thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500"><tr><th className="px-4 py-3 pl-5 sm:pl-6">Skill</th><th className="px-4 py-3">Candidates</th></tr></thead></table>
                <div className="max-h-[250px] overflow-y-auto">
                  <table className="w-full min-w-[420px] text-left"><tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                    {skillRows.length === 0 ? <tr><td colSpan={2} className="px-5 py-8 text-center text-sm text-slate-500">No candidate skills in this view.</td></tr> : skillRows.map(row => <tr key={row.skill}><td className="px-4 py-3.5 pl-5 font-medium text-slate-800 sm:pl-6">{row.skill}</td><td className="px-4 py-3.5">{row.candidates}</td></tr>)}
                  </tbody></table>
                </div>
              </div>
            </ReportCard>
          </div>

          <ReportCard title="Scoring category averages" description="How the candidate pool scores against each tier of the rubric" actions={<ExportButton label="CSV" onClick={exportCategories} />}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500"><tr><th className="px-4 py-3 pl-5 sm:pl-6">Category</th><th className="px-4 py-3">Average awarded</th><th className="px-4 py-3">Maximum</th></tr></thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">{categoryRows.map(row => <tr key={row.category}><td className="px-4 py-3.5 pl-5 font-medium text-slate-800 sm:pl-6">{row.category}</td><td className="px-4 py-3.5">{row.average === null ? '—' : row.average.toFixed(1)}</td><td className="px-4 py-3.5">{row.maximum}</td></tr>)}</tbody>
              </table>
            </div>
          </ReportCard>
        </div>
      </main>
    </>
  );
}
