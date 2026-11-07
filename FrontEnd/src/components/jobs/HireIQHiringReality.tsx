'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';

export interface ConstraintImpact {
  id: string;
  name: string;
  type: 'SKILL' | 'EXPERIENCE' | 'LOCATION' | 'NOTICE_PERIOD' | 'SALARY' | 'MANDATORY_DENSITY';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  poolReductionPercent: number;
  potentialGainPercent: number;
  explanation: string;
  suggestedRelaxation: string;
}

export interface HiringRealityReport {
  jobTitle: string;
  client: string;
  realityScore: number;
  difficulty: 'REALISTIC' | 'MODERATE' | 'DIFFICULT';
  difficultyLabel: string;
  difficultyColor: 'green' | 'amber' | 'red';
  summaryHeadline: string;
  summaryDescription: string;
  estimatedTimeToHireDays: number;
  optimizedTimeToHireDays: number;
  baselinePoolIndex: number;
  simulatedPoolGainPercent: number;
  constraints: ConstraintImpact[];
  recommendations: Array<{
    title: string;
    impact: string;
    gain: number;
    actionableText: string;
  }>;
  clientAdvisoryNote: string;
  evaluatedAt: string;
}

interface HireIQHiringRealityProps {
  jobId?: string; // If analyzing a saved job
  jobTitle?: string;
  client?: string;
  location?: string;
  workMode?: string;
  salary?: string;
  jdText?: string;
  requirements?: Array<{
    id?: string;
    requirement: string;
    category?: string;
    isMandatory?: boolean;
    mandatory?: boolean;
    weight?: number;
  }>;
}

export default function HireIQHiringReality({
  jobId,
  jobTitle,
  client,
  location,
  workMode,
  salary,
  jdText,
  requirements
}: HireIQHiringRealityProps) {
  const { token } = useAuth();
  const [report, setReport] = useState<HiringRealityReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeAdjustments, setActiveAdjustments] = useState<Set<string>>(new Set());
  const [copiedNote, setCopiedNote] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

  const fetchRealityAnalysis = useCallback(async (adjustmentsSet: Set<string> = activeAdjustments) => {
    setIsLoading(true);
    setError(null);
    try {
      let res: Response;
      const adjustmentsList = Array.from(adjustmentsSet);

      if (jobId) {
        // Fetch saved job reality analysis
        res = await fetch(`${backendUrl}/jobs/${jobId}/hiring-reality`, {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          }
        });
      } else {
        // Simulate on-the-fly for parsed/draft JD
        res = await fetch(`${backendUrl}/jobs/hiring-reality/simulate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            jobTitle: jobTitle || 'Position Requisition',
            client: client || 'Client Organization',
            location,
            workMode,
            salary,
            jdText,
            requirements,
            activeAdjustments: adjustmentsList
          })
        });
      }

      if (!res.ok) {
        throw new Error('Unable to run Hiring Reality stress test.');
      }

      const data = await res.json();
      if (data.report) {
        setReport(data.report);
      }
    } catch (err: any) {
      console.error('[Hiring Reality Engine Error]:', err);
      setError(err.message || 'Error analyzing hiring feasibility.');
    } finally {
      setIsLoading(false);
    }
  }, [backendUrl, jobId, jobTitle, client, location, workMode, salary, jdText, requirements, token, activeAdjustments]);

  useEffect(() => {
    fetchRealityAnalysis();
  }, [fetchRealityAnalysis]);

  const toggleAdjustment = (constraintId: string) => {
    const nextSet = new Set(activeAdjustments);
    if (nextSet.has(constraintId)) {
      nextSet.delete(constraintId);
    } else {
      nextSet.add(constraintId);
    }
    setActiveAdjustments(nextSet);
    fetchRealityAnalysis(nextSet);
  };

  const handleCopyNote = () => {
    if (!report?.clientAdvisoryNote) return;
    navigator.clipboard.writeText(report.clientAdvisoryNote);
    setCopiedNote(true);
    setTimeout(() => setCopiedNote(false), 2500);
  };

  if (isLoading && !report) {
    return (
      <div className="p-8 bg-slate-900 border border-slate-800 rounded-3xl text-center space-y-3 animate-pulse">
        <div className="w-10 h-10 border-3 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto" />
        <h4 className="text-white font-bold text-sm">HireIQ Hiring Reality Engine™</h4>
        <p className="text-slate-400 text-xs">Simulating market talent density & requirement bottleneck impact...</p>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-3xl text-xs text-rose-800">
        <strong className="font-bold block mb-1">Reality Stress Test Unavailable:</strong>
        {error}
      </div>
    );
  }

  if (!report) return null;

  const difficultyBadgeStyle =
    report.difficulty === 'DIFFICULT'
      ? 'bg-rose-50 text-rose-800 border-rose-200'
      : report.difficulty === 'MODERATE'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : 'bg-emerald-50 text-emerald-800 border-emerald-200';

  const difficultyDotStyle =
    report.difficulty === 'DIFFICULT'
      ? 'bg-rose-500'
      : report.difficulty === 'MODERATE'
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  const cleanJobTitle = (report.jobTitle || 'Role Requisition')
    .replace(/^overview\s+/i, '')
    .trim();

  const simulatedPool = 100 + report.simulatedPoolGainPercent;

  return (
    <div className="space-y-6">
      {/* ── TOP BANNER: BRANDING ── */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white rounded-3xl p-6 shadow-sm border border-slate-800 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-brand-orange/20 to-transparent pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-brand-orange text-white">
                HireIQ Phase 2
              </span>
              <span className="text-[11px] font-bold text-slate-300">
                Pre-Sourcing Role Feasibility Stress Test
              </span>
            </div>
            <h2 className="text-xl font-extrabold text-white mt-1.5 tracking-tight flex items-center gap-2">
              <span>Hiring Reality Engine™</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-slate-300 font-normal">
                Market Talent Supply Simulation
              </span>
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Stress-test the Job Description <em>before</em> sourcing candidates. Identify which requirements compete for the same narrow candidate pool and simulate relaxation gains.
            </p>
          </div>

          <div className="flex-shrink-0 flex items-center gap-2.5">
            <button
              onClick={() => fetchRealityAnalysis(activeAdjustments)}
              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition-all cursor-pointer border border-white/10"
              title="Refresh reality calculation"
            >
              ↻ Re-Run Stress Test
            </button>
          </div>
        </div>
      </div>

      {/* ── SECTION 1: REALITY SCORE & TIME-TO-HIRE GAUGE ── */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
          {/* Card 1: Reality Score Dial */}
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between overflow-hidden">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
              Hiring Reality Rating
            </span>
            <div className="flex items-center gap-4 py-1">
              {/* Dial with strictly fixed dimensions */}
              <div
                className="relative flex-shrink-0"
                style={{ width: '80px', height: '80px', minWidth: '80px', maxWidth: '80px' }}
              >
                <svg
                  className="transform -rotate-90"
                  style={{ width: '80px', height: '80px' }}
                  viewBox="0 0 36 36"
                >
                  <path
                    className="text-slate-200"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className={
                      report.realityScore >= 75
                        ? 'text-emerald-500'
                        : report.realityScore >= 52
                        ? 'text-amber-500'
                        : 'text-rose-500'
                    }
                    strokeDasharray={`${report.realityScore}, 100`}
                    strokeLinecap="round"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl font-black font-mono text-slate-900 leading-none">
                    {report.realityScore}
                  </span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">/ 100</span>
                </div>
              </div>

              {/* Status & Job Info */}
              <div className="min-w-0 flex-1 space-y-1.5 overflow-hidden">
                <div>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border whitespace-nowrap ${difficultyBadgeStyle}`}
                  >
                    {report.difficultyLabel}
                  </span>
                </div>
                <div className="space-y-0.5">
                  <p
                    className="text-xs font-semibold text-slate-800 truncate"
                    title={cleanJobTitle}
                  >
                    {cleanJobTitle}
                  </p>
                  {report.client && (
                    <p
                      className="text-[11px] font-medium text-slate-500 truncate"
                      title={report.client}
                    >
                      {report.client}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Time-to-Hire Projection */}
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
              Estimated Time-to-Fill
            </span>
            <div className="my-auto py-1">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black font-mono tracking-tight text-slate-900">
                  ~{report.estimatedTimeToHireDays} Days
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">baseline</span>
              </div>
            </div>
            <div className="pt-2.5 border-t border-slate-200/70 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                <span>🚀</span>
                <span>With relaxations:</span>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold border border-emerald-200/70 font-mono text-[11px]">
                ~{report.optimizedTimeToHireDays} Days
              </span>
            </div>
          </div>

          {/* Card 3: Sourcing Summary */}
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
              Candidate Pool Verdict
            </span>
            <div className="space-y-1.5 my-auto">
              <h4 className="text-xs font-bold text-slate-900 leading-snug">
                {report.summaryHeadline}
              </h4>
              <p className="text-[11px] text-slate-600 leading-relaxed" title={report.summaryDescription}>
                {report.summaryDescription}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 2: CONSTRAINT IMPACT BREAKDOWN (% POOL SHRUNK) ── */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
            Requirement Impact on Addressable Candidate Pool
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Measured talent supply shrinkage caused by each mandatory condition in this Job Description:
          </p>
        </div>

        <div className="space-y-3">
          {report.constraints.map(c => {
            const isRelaxed = activeAdjustments.has(c.id);
            return (
              <div
                key={c.id}
                className={`p-4 rounded-2xl border transition-all ${
                  isRelaxed
                    ? 'bg-emerald-50/50 border-emerald-300 shadow-2xs'
                    : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                        c.severity === 'HIGH'
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : c.severity === 'MEDIUM'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-blue-100 text-blue-800 border border-blue-200'
                      }`}>
                        {c.severity} Impact
                      </span>
                      <h4 className="text-xs font-bold text-slate-900">
                        {c.name}
                      </h4>
                    </div>
                    <p className="text-[11.5px] text-slate-600 mt-1 leading-relaxed">
                      {c.explanation}
                    </p>
                    <p className="text-[11px] text-slate-500 font-medium mt-1">
                      💡 <strong>Recommended Adjustment:</strong> {c.suggestedRelaxation}
                    </p>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 flex-shrink-0">
                    <div className="text-right">
                      <span className="text-[11px] font-bold text-slate-400 block uppercase">
                        Pool Reduction
                      </span>
                      <span className="text-base font-black font-mono text-rose-600">
                        -{c.poolReductionPercent}%
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleAdjustment(c.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                        isRelaxed
                          ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-brand-orange hover:text-brand-orange'
                      }`}
                    >
                      {isRelaxed ? '✓ Relaxed (+ ' + c.potentialGainPercent + '% Pool)' : 'Simulate Relaxation'}
                    </button>
                  </div>
                </div>

                {/* Progress bar showing visual drop */}
                <div className="w-full bg-slate-200 rounded-full h-1.5 mt-3 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${isRelaxed ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    style={{ width: `${Math.min(100, c.poolReductionPercent * 2.5)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── SECTION 3: WHAT-IF SIMULATOR: "SHOW ME WHAT I GAIN" ── */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-3xl p-6 shadow-sm border border-slate-800 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-500 text-slate-950">
              Interactive Simulator
            </span>
            <h3 className="text-base font-extrabold text-white mt-1.5 tracking-tight">
              “Show Me What I Gain” — Requirement Relaxation Simulator
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Click the relaxation toggles above to observe compounding pool expansion:
            </p>
          </div>

          <div className="flex items-center gap-3 bg-white/10 px-4 py-2.5 rounded-2xl border border-white/10">
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Current Pool Index</span>
              <span className="text-base font-black font-mono text-white">100% baseline</span>
            </div>
            <div className="h-8 w-px bg-white/20" />
            <div>
              <span className="text-[10px] uppercase font-bold text-emerald-400 block">Simulated Pool</span>
              <span className="text-xl font-black font-mono text-emerald-400">
                {simulatedPool}% <span className="text-xs font-bold text-emerald-300">(+{report.simulatedPoolGainPercent}%)</span>
              </span>
            </div>
          </div>
        </div>

        {/* Dynamic Visual Pool Bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-bold text-slate-300">
            <span>Baseline Sourcing Pool (100%)</span>
            <span className="text-emerald-400">
              {report.simulatedPoolGainPercent > 0
                ? `Expanded Sourcing Pool: +${report.simulatedPoolGainPercent}% Wider Pool`
                : 'Select requirements above to simulate pool expansion'}
            </span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden flex">
            <div className="bg-slate-400 h-3" style={{ width: `${Math.round((100 / simulatedPool) * 100)}%` }} title="Baseline Pool" />
            <div className="bg-emerald-400 h-3 animate-pulse transition-all duration-500" style={{ width: `${Math.round((report.simulatedPoolGainPercent / simulatedPool) * 100)}%` }} title="Simulated Expansion" />
          </div>
        </div>

        {/* Actionable Advice Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          {report.recommendations.map((rec, idx) => (
            <div key={idx} className="p-3.5 bg-white/5 border border-white/10 rounded-2xl space-y-1">
              <span className="text-[10px] font-black uppercase text-brand-orange tracking-wider block">
                {rec.impact}
              </span>
              <h5 className="text-xs font-bold text-white leading-snug">
                {rec.title}
              </h5>
              <p className="text-[11px] text-slate-300 leading-relaxed line-clamp-2">
                {rec.actionableText}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── SECTION 4: CLIENT ADVISORY PUSHBACK REPORT (THE WEAPON) ── */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-brand-orange font-bold text-sm">📄</span>
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                Client Advisory Pushback Summary
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Send this structured feasibility report to the client or hiring manager on Day 1 to align expectations and avoid prolonged sourcing delays:
            </p>
          </div>

          <button
            type="button"
            onClick={handleCopyNote}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs ${
              copiedNote
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-900 hover:bg-slate-800 text-white'
            }`}
          >
            {copiedNote ? (
              <>
                <span>✓</span>
                <span>Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <span>📋</span>
                <span>Copy Client Advisory Note</span>
              </>
            )}
          </button>
        </div>

        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
          {report.clientAdvisoryNote}
        </div>
      </div>
    </div>
  );
}

