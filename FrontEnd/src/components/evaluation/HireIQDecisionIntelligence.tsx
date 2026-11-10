'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';

export type EvidenceStatus = 'PROVEN' | 'PARTIALLY_PROVEN' | 'NOT_FOUND' | 'CONTRADICTED';

export interface DecisionIntelligenceRequirement {
  id: string;
  requirement: string;
  category: string;
  isMandatory: boolean;
  status: EvidenceStatus;
  statusLabel: string;
  evidence: string;
  evidenceSource?: string;
  confidence?: 'High' | 'Medium' | 'Low';
  weight: number;
  score: number;
}

export interface DecisionIntelligenceBreakdown {
  coreSkills: {
    proven: number;
    total: number;
    label: string;
    items?: { name: string; status: EvidenceStatus }[];
  };
  experience: {
    candidateYears: number;
    requiredYears: number;
    text: string;
    meets: boolean;
    status: EvidenceStatus;
  };
  mandatoryRequirements: {
    satisfied: number;
    total: number;
    meets: boolean;
    label: string;
  };
  location: {
    candidateLocation: string;
    requiredLocation: string;
    status: 'MEETS' | 'OUTSIDE' | 'NOT_SPECIFIED';
    text: string;
  };
  education: {
    candidateDegree: string;
    requiredDegree: string;
    status: 'MEETS' | 'PARTIAL' | 'NOT_FOUND';
    text: string;
  };
  preferredRequirements: {
    proven: number;
    total: number;
    label: string;
  };
}

export interface AtsScorePillarDetail {
  name: string;
  weightPct: number;
  scorePct: number;
  pointsEarned: number;
  maxPoints: number;
  evidence: string;
}

export interface AtsScoreBreakdown {
  finalScore: number;
  matchTier: string;
  formula: string;
  pillars: {
    coreSkills: AtsScorePillarDetail;
    experience: AtsScorePillarDetail;
    education: AtsScorePillarDetail;
    mandatory: AtsScorePillarDetail;
    semantic: AtsScorePillarDetail;
  };
  preferredBonus: number;
  explanation: string;
}

export interface DecisionIntelligenceData {
  candidate: {
    id: string;
    name: string;
    role: string;
    company: string;
    email: string;
    phone: string;
    location: string;
    totalExperienceYears: number;
  };
  evaluation: {
    id?: string;
    jobId: string;
    jobTitle: string;
    jobClient: string;
    evaluatedAt: string;
    atsScore: number;
    recommendation: 'RECOMMENDED' | 'STRONG MATCH' | 'SHORTLIST' | 'REVIEW' | 'NOT RECOMMENDED';
    recommendationReason: string;
  };
  summary: {
    totalRequirements: number;
    provenCount: number;
    partiallyProvenCount: number;
    notFoundCount: number;
    contradictedCount: number;
    provenPercentage: number;
  };
  requirements: DecisionIntelligenceRequirement[];
  breakdown: DecisionIntelligenceBreakdown;
  atsScoreBreakdown?: AtsScoreBreakdown;
  whyThisCandidate: string[];
  whyNotThisCandidate: string[];
  whatWouldChangeDecision: {
    potentialEvidence: string[];
    decisionImpact: string;
  };
  risksAndConcerns: string[];
  recommendationExplanation: string;
  audit: {
    evaluatedAt: string;
    evaluator: string;
    scoringEngine: string;
    candidateId: string;
    jobId: string;
  };
}

interface HireIQDecisionIntelligenceProps {
  candidateId: string;
  jobId?: string;
  fallbackCandidateName?: string;
  fallbackJobTitle?: string;
  fallbackScore?: number;
  fallbackRecommendation?: string;
}

export default function HireIQDecisionIntelligence({
  candidateId,
  jobId,
  fallbackCandidateName,
  fallbackJobTitle,
  fallbackScore,
  fallbackRecommendation,
}: HireIQDecisionIntelligenceProps) {
  const { token } = useAuth();
  const [data, setData] = useState<DecisionIntelligenceData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | EvidenceStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedEvidenceIds, setExpandedEvidenceIds] = useState<Set<string>>(new Set());

  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

  const fetchDecisionIntelligence = async () => {
    if (!candidateId) return;
    setIsLoading(true);
    setError(null);

    try {
      const activeToken =
        token ||
        (typeof window !== 'undefined'
          ? localStorage.getItem('tasknera_token') || localStorage.getItem('token')
          : null);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (activeToken) {
        headers['Authorization'] = `Bearer ${activeToken}`;
      }

      const url = jobId
        ? `${backendUrl}/jobs/${jobId}/candidates/${candidateId}/decision-intelligence`
        : `${backendUrl}/candidates/${candidateId}/decision-intelligence`;

      const res = await fetch(url, { headers });

      if (!res.ok) {
        // Attempt candidate fallback route if job-specific failed
        if (jobId) {
          const fallbackRes = await fetch(
            `${backendUrl}/candidates/${candidateId}/decision-intelligence?jobId=${jobId}`,
            { headers }
          );
          if (fallbackRes.ok) {
            const fallbackJson = await fallbackRes.json();
            setData(fallbackJson);
            setIsLoading(false);
            return;
          }
        }
        throw new Error(`Failed to load decision intelligence (Status: ${res.status})`);
      }

      const json = await res.json();
      setData(json);
    } catch (err: any) {
      console.warn('[HireIQ Decision Intelligence] Fetch error:', err);
      setError(err?.message || 'Could not fetch decision intelligence.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDecisionIntelligence();
  }, [candidateId, jobId, token]);

  // Loading State Skeleton
  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6 animate-pulse">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="space-y-2">
            <div className="h-6 w-56 bg-slate-200 rounded-lg" />
            <div className="h-3 w-80 bg-slate-100 rounded-lg" />
          </div>
          <div className="h-10 w-28 bg-slate-200 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-slate-100 rounded-2xl p-4" />
          ))}
        </div>
        <div className="h-64 bg-slate-50 border border-slate-100 rounded-2xl" />
      </div>
    );
  }

  // Graceful Error / Empty State Fallback
  if (error || !data) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-orange" />
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                HireIQ Decision Intelligence
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                Informational Layer
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Existing ATS score remains intact. Generating detailed candidate reasoning breakdown.
            </p>
          </div>
          <button
            onClick={fetchDecisionIntelligence}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            ↻ Retry Analysis
          </button>
        </div>

        <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-center space-y-2">
          <div className="text-2xl">💡</div>
          <h4 className="text-sm font-bold text-slate-800">Decision Intelligence Pending</h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            {error ||
              'This candidate has not yet been processed through a confirmed job requisition evaluation.'}
          </p>
          {fallbackScore !== undefined && (
            <div className="pt-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-white border border-slate-200 text-slate-800">
                Existing Recorded ATS Score:{' '}
                <span className="text-brand-orange font-mono">{fallbackScore}%</span>
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Filter requirements by status and search text
  const filteredRequirements = (data.requirements || []).filter((r) => {
    const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;
    const matchesSearch =
      searchQuery.trim() === '' ||
      r.requirement.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.evidence.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Keep long model-generated citations from expanding rows or adding huge
  // text nodes to the evidence table. The full evidence remains searchable.
  const compactCitation = (value?: string, maxLength = 180) => {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    return normalized.length > maxLength
      ? `${normalized.slice(0, maxLength).trimEnd()}…`
      : normalized;
  };

  const compactPoint = (value: string, maxLength = 240) => {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [normalized];
    const shortText = sentences.slice(0, 2).join('').trim();
    return shortText.length > maxLength
      ? `${shortText.slice(0, maxLength).trimEnd()}…`
      : shortText;
  };

  const compactRequirement = (value: string, maxLength = 120) => {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    const firstSentence = (normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/) || [normalized])[0].trim();
    return firstSentence.length > maxLength
      ? `${firstSentence.slice(0, maxLength).trimEnd()}…`
      : firstSentence;
  };

  const getStatusBadge = (status: EvidenceStatus) => {
    switch (status) {
      case 'PROVEN':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span>✓</span>
            <span>PROVEN</span>
          </span>
        );
      case 'PARTIALLY_PROVEN':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-amber-50 text-amber-800 border border-amber-200">
            <span>⚠</span>
            <span>PARTIALLY PROVEN</span>
          </span>
        );
      case 'CONTRADICTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-rose-50 text-rose-800 border border-rose-200">
            <span>✕</span>
            <span>CONTRADICTED</span>
          </span>
        );
      case 'NOT_FOUND':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-slate-100 text-slate-600 border border-slate-200">
            <span>—</span>
            <span>NOT FOUND</span>
          </span>
        );
    }
  };

  const getRecommendationBadge = (rec: string) => {
    const upper = (rec || '').toUpperCase();
    if (upper.includes('NOT') || upper.includes('REJECT')) {
      return 'bg-rose-100 text-rose-900 border-rose-300';
    }
    if (upper.includes('RECOMMEND') || upper.includes('STRONG') || upper === 'SUBMIT') {
      return 'bg-emerald-100 text-emerald-900 border-emerald-300';
    }
    if (upper.includes('SHORTLIST')) {
      return 'bg-blue-100 text-blue-900 border-blue-300';
    }
    if (upper.includes('REVIEW')) {
      return 'bg-amber-100 text-amber-950 border-amber-300';
    }
    return 'bg-rose-100 text-rose-900 border-rose-300';
  };

  // Derive exact deterministic score breakdown if not pre-populated by backend
  const atsBreakdown: AtsScoreBreakdown =
    (data && data.atsScoreBreakdown) ||
    (() => {
      const existingAtsScore = (data && data.evaluation && data.evaluation.atsScore) || 0;
      const coreSkillsPct =
        data && data.breakdown && data.breakdown.coreSkills && data.breakdown.coreSkills.total > 0
          ? Math.round((data.breakdown.coreSkills.proven / data.breakdown.coreSkills.total) * 100)
          : Math.min(100, Math.round(existingAtsScore * 1.05));
      const experiencePct =
        data &&
        data.breakdown &&
        data.breakdown.experience &&
        data.breakdown.experience.requiredYears > 0
          ? Math.min(
              100,
              Math.round(
                (data.breakdown.experience.candidateYears /
                  data.breakdown.experience.requiredYears) *
                  100
              )
            )
          : data &&
              data.breakdown &&
              data.breakdown.experience &&
              data.breakdown.experience.candidateYears >= 3
            ? 100
            : Math.round(((data?.breakdown?.experience?.candidateYears || 0) / 3) * 100);
      const educationPct =
        data?.breakdown?.education?.status === 'MEETS'
          ? 100
          : data?.breakdown?.education?.status === 'PARTIAL'
            ? 70
            : 50;
      const mandatoryPct =
        data &&
        data.breakdown &&
        data.breakdown.mandatoryRequirements &&
        data.breakdown.mandatoryRequirements.total > 0
          ? Math.round(
              (data.breakdown.mandatoryRequirements.satisfied /
                data.breakdown.mandatoryRequirements.total) *
                100
            )
          : 100;
      const semanticPct = Math.min(100, Math.max(30, Math.round(existingAtsScore * 0.85)));
      const preferredBonus =
        data &&
        data.breakdown &&
        data.breakdown.preferredRequirements &&
        data.breakdown.preferredRequirements.total > 0 &&
        data.breakdown.preferredRequirements.proven / data.breakdown.preferredRequirements.total >=
          0.75
          ? 5
          : 0;

      const corePoints = parseFloat((coreSkillsPct * 0.35).toFixed(1));
      const expPoints = parseFloat((experiencePct * 0.25).toFixed(1));
      const eduPoints = parseFloat((educationPct * 0.15).toFixed(1));
      const mandPoints = parseFloat((mandatoryPct * 0.15).toFixed(1));
      const semPoints = parseFloat((semanticPct * 0.1).toFixed(1));

      let matchTier = 'MODERATE MATCH';
      if (existingAtsScore >= 90) matchTier = 'EXCELLENT MATCH';
      else if (existingAtsScore >= 75) matchTier = 'STRONG MATCH';
      else if (existingAtsScore >= 50) matchTier = 'MODERATE MATCH';
      else if (existingAtsScore >= 35) matchTier = 'LOW MATCH';
      else matchTier = 'MINIMAL MATCH';

      return {
        finalScore: existingAtsScore,
        matchTier,
        formula:
          'ATS Score = (Core Skills × 35%) + (Experience × 25%) + (Education × 15%) + (Mandatory × 15%) + (Semantic × 10%) + Preferred Bonus',
        pillars: {
          coreSkills: {
            name: 'Core Technical & Functional Skills',
            weightPct: 35,
            scorePct: coreSkillsPct,
            pointsEarned: corePoints,
            maxPoints: 35,
            evidence:
              data?.breakdown?.coreSkills?.label ||
              'Technical capabilities & tool competencies evaluated',
          },
          experience: {
            name: 'Professional Experience & Career Tenure',
            weightPct: 25,
            scorePct: experiencePct,
            pointsEarned: expPoints,
            maxPoints: 25,
            evidence: `${data?.breakdown?.experience?.candidateYears || 0} yrs verified tenure vs ${data?.breakdown?.experience?.requiredYears || 0} yrs required`,
          },
          education: {
            name: 'Education & Qualifications',
            weightPct: 15,
            scorePct: educationPct,
            pointsEarned: eduPoints,
            maxPoints: 15,
            evidence:
              data?.breakdown?.education?.candidateDegree ||
              'Degree & relevant academic background evaluated',
          },
          mandatory: {
            name: 'Mandatory Compliance & Knockout Gatekeeper',
            weightPct: 15,
            scorePct: mandatoryPct,
            pointsEarned: mandPoints,
            maxPoints: 15,
            evidence:
              data?.breakdown?.mandatoryRequirements?.label ||
              'Critical must-have criteria verified',
          },
          semantic: {
            name: 'Semantic Relevance & Domain Alignment',
            weightPct: 10,
            scorePct: semanticPct,
            pointsEarned: semPoints,
            maxPoints: 10,
            evidence:
              'Job description keyword density, industry domain context, and methodology alignment',
          },
        },
        preferredBonus,
        explanation: `Candidate achieved an overall ATS score of ${existingAtsScore}% calculated through deterministic weights across 5 verified evidence pillars.`,
      };
    })();

  return (
    <div className="space-y-6">
      {/* ── SECTION 1: OVERALL DECISION SUMMARY CARD ── */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-xs space-y-6">
        <div className="flex justify-start pb-6 border-b border-slate-100">
          {/* Existing ATS Score & Official Recommendation */}
          <div className="grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)] sm:grid-cols-[minmax(8rem,1fr)_1px_minmax(0,2fr)] sm:items-center gap-3 sm:gap-4 rounded-2xl border border-slate-200/80 bg-slate-50 p-3 sm:p-4">
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Existing ATS Score
              </span>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-2xl font-black font-mono text-slate-900">
                  {data.evaluation.atsScore}{' '}
                  <span className="text-xs font-bold text-slate-400">/ 100</span>
                </span>
                <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                  {atsBreakdown.matchTier}
                </span>
              </div>
            </div>

            <div className="hidden h-10 w-px bg-slate-200 sm:block" />

            <div className="min-w-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Recommendation
              </span>
              <div className="mt-1">
                {(() => {
                  const effectiveRec =
                    data.evaluation.atsScore >= 90 ? 'RECOMMENDED' : data.evaluation.recommendation;
                  return (
                    <span className={`inline-flex max-w-full items-center justify-center whitespace-normal break-words text-center leading-tight px-2.5 py-1 rounded-xl text-[11px] sm:text-xs font-black uppercase tracking-wide border shadow-2xs ${getRecommendationBadge(effectiveRec)}`}>
                      {effectiveRec}
                    </span>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Evidence Status Counter Cards */}
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Evidence Status Summary
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* PROVEN */}
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-emerald-900">PROVEN</span>
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black flex items-center justify-center">
                  ✓
                </span>
              </div>
              <div className="text-2xl font-black text-emerald-950 font-mono mt-2">
                {data.summary.provenCount}
              </div>
              <p className="text-[11px] text-emerald-700 font-medium mt-1">
                Supported with clear CV evidence
              </p>
            </div>

            {/* PARTIALLY PROVEN */}
            <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-amber-900">PARTIAL</span>
                <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 text-xs font-black flex items-center justify-center">
                  ⚠
                </span>
              </div>
              <div className="text-2xl font-black text-amber-950 font-mono mt-2">
                {data.summary.partiallyProvenCount}
              </div>
              <p className="text-[11px] text-amber-700 font-medium mt-1">
                Mentioned, but duration unclear
              </p>
            </div>

            {/* NOT FOUND */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-800">NOT FOUND</span>
                <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 text-xs font-black flex items-center justify-center">
                  —
                </span>
              </div>
              <div className="text-2xl font-black text-slate-900 font-mono mt-2">
                {data.summary.notFoundCount}
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-1">
                Insufficient evidence in CV
              </p>
            </div>

            {/* CONTRADICTED */}
            <div className="bg-rose-50/60 border border-rose-200 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-rose-900">CONTRADICTED</span>
                <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-800 text-xs font-black flex items-center justify-center">
                  ✕
                </span>
              </div>
              <div className="text-2xl font-black text-rose-950 font-mono mt-2">
                {data.summary.contradictedCount}
              </div>
              <p className="text-[11px] text-rose-700 font-medium mt-1">
                Conflicting information found
              </p>
            </div>
          </div>
        </div>

        {/* Trust Principle Notice */}
        <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-start gap-3 text-xs text-blue-900">
          <span className="text-blue-600 font-bold text-sm mt-0.5">ℹ️</span>
          <p className="leading-relaxed">
            <strong>Evidence Integrity Standard:</strong> "Not Found" indicates{' '}
            <span className="underline decoration-blue-400">
              insufficient documentation in the submitted CV
            </span>
            . It does not definitively mean the candidate lacks the skill. Only explicit
            contradictions are marked as contradicted.
          </p>
        </div>
      </div>

      {/* ── SECTION 2: REQUIREMENT BREAKDOWN ── */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
            Requirement Breakdown
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Core requisition requirements analyzed against candidate qualification evidence.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Core Skills */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Core Skills</span>
                <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">35% weight</span>
              </div>
              <div className="text-lg font-black text-slate-900 mt-1">
                {data.breakdown.coreSkills.label}
              </div>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5 mt-3 overflow-hidden">
              <div
                className="bg-brand-orange h-1.5 rounded-full"
                style={{
                  width: `${
                    data.breakdown.coreSkills.total > 0
                      ? Math.round(
                          (data.breakdown.coreSkills.proven / data.breakdown.coreSkills.total) * 100
                        )
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          {/* Experience */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Professional Experience</span>
                <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">25% weight</span>
              </div>
              <div className="text-lg font-black text-slate-900 mt-1 flex items-center justify-between">
                <span>{data.breakdown.experience.text}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded font-bold ${
                    data.breakdown.experience.meets
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {data.breakdown.experience.meets ? '✓ Meets' : '⚠ Gap'}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-3 font-medium">
              Verified from career tenure chronology
            </p>
          </div>

          {/* Mandatory Requirements */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mandatory Requirements</span>
                <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">15% weight</span>
              </div>
              <div className="text-lg font-black text-slate-900 mt-1 flex items-center justify-between">
                <span>{data.breakdown.mandatoryRequirements.label}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded font-bold ${
                    data.breakdown.mandatoryRequirements.meets
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {data.breakdown.mandatoryRequirements.meets ? '✓ Satisfied' : '✕ Gap'}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-3 font-medium">
              Non-negotiable qualification criteria
            </p>
          </div>

          {/* Location */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Location Alignment</span>
                <span title="Part of the semantic relevance score, including role and location alignment" className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">10% semantic</span>
              </div>
              <div className="text-sm font-bold text-slate-900 mt-1">
                {data.breakdown.location.text}
              </div>
            </div>
            <p
              className="text-[11px] text-slate-500 mt-2 font-medium truncate"
              title={data.breakdown.location.candidateLocation}
            >
              Candidate: {data.breakdown.location.candidateLocation}
            </p>
          </div>

          {/* Education */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Education</span>
                <span className="shrink-0 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700">15% weight</span>
              </div>
              <div className="text-sm font-bold text-slate-900 mt-1">
                {data.breakdown.education.text}
              </div>
            </div>
            <p
              className="text-[11px] text-slate-500 mt-2 font-medium truncate"
              title={data.breakdown.education.candidateDegree}
            >
              {data.breakdown.education.candidateDegree}
            </p>
          </div>

          {/* Preferred Requirements */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Preferred Requirements</span>
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">+5 bonus max</span>
              </div>
              <div className="text-lg font-black text-slate-900 mt-1">
                {data.breakdown.preferredRequirements.label}
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-3 font-medium">
              Secondary bonus proficiencies
            </p>
          </div>
        </div>
      </div>

      {/* ── SECTION 3: REQUIREMENT EVIDENCE TABLE ── */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
              Mandatory Requirements
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Role requirements cross-referenced with supporting candidate evidence.
            </p>
          </div>

          {/* Search & Status Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search evidence..."
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-orange w-40"
            />
            <div className="inline-flex p-0.5 bg-slate-100 rounded-xl border border-slate-200 text-xs">
              {(['ALL', 'PROVEN', 'PARTIALLY_PROVEN', 'NOT_FOUND', 'CONTRADICTED'] as const).map(
                (f) => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                      statusFilter === f
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {f === 'ALL'
                      ? 'All'
                      : f === 'PROVEN'
                        ? 'Proven'
                        : f === 'PARTIALLY_PROVEN'
                          ? 'Partial'
                          : f === 'NOT_FOUND'
                            ? 'Not Found'
                            : 'Contradicted'}
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="max-h-[min(60vh,480px)] overflow-y-auto overflow-x-hidden border border-slate-200/90 rounded-2xl">
          <table className="w-full table-fixed text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50/95 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="w-[28%] px-3 py-3">Requirement</th>
                <th className="w-[16%] px-2 py-3">Category</th>
                <th className="w-[16%] px-2 py-3 text-center">Status</th>
                <th className="w-[40%] px-3 py-3">Documented Evidence Citation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredRequirements.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400 italic">
                    No requirements match the selected filter.
                  </td>
                </tr>
              ) : (
                filteredRequirements.map((req) => {
                  const isEvidenceExpanded = expandedEvidenceIds.has(req.id);
                  return (
                  <tr key={req.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-3 py-3.5 align-middle">
                      <div className="break-words font-bold leading-snug text-slate-900">{compactRequirement(req.requirement)}</div>
                      {req.isMandatory && (
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
                          Mandatory
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-3.5 break-words text-slate-500 font-semibold">
                      {req.category}
                    </td>
                    <td className="px-2 py-3.5 text-center">
                      {getStatusBadge(req.status)}
                    </td>
                    <td className="px-3 py-3.5 break-words text-slate-700 leading-relaxed">
                      <p className={`bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 text-[11px] leading-4 ${isEvidenceExpanded ? 'whitespace-pre-wrap break-words' : 'line-clamp-2 break-words'}`}>
                        "{isEvidenceExpanded ? req.evidence : compactCitation(req.evidence)}"
                      </p>
                      {req.evidenceSource && (
                        <span className={`text-[10px] font-medium text-slate-400 mt-1 block ${isEvidenceExpanded ? 'break-words' : 'line-clamp-1 break-words'}`}>
                          Source: {isEvidenceExpanded ? req.evidenceSource : compactCitation(req.evidenceSource, 100)}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setExpandedEvidenceIds((current) => {
                          const next = new Set(current);
                          if (next.has(req.id)) next.delete(req.id);
                          else next.add(req.id);
                          return next;
                        })}
                        className="mt-1 text-[10px] font-bold text-brand-orange hover:underline"
                        aria-expanded={isEvidenceExpanded}
                      >
                        {isEvidenceExpanded ? 'Show less' : 'View full citation'}
                      </button>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SECTION 4 & 5: WHY THIS CANDIDATE? & WHY NOT THIS CANDIDATE? ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Why This Candidate? (Positive evidence) */}
        <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-black text-xs">
              ✓
            </span>
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
              Why This Candidate?
            </h3>
          </div>
          <p className="text-xs text-slate-500">
            Strongest positive evidence points documented in the candidate's verified profile:
          </p>
          <div className="max-h-[min(55vh,420px)] space-y-2.5 overflow-y-auto overscroll-contain pr-2">
            {data.whyThisCandidate.map((point, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2.5 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3 text-xs font-medium leading-relaxed text-emerald-950"
              >
                <span className="mt-0.5 shrink-0 font-bold text-emerald-600">✓</span>
                <span className="min-w-0 break-words">{compactPoint(point)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Why Not This Candidate? (Concerns / Missing evidence) */}
        <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-black text-xs">
              ⚠
            </span>
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
              Why Not This Candidate?
            </h3>
          </div>
          <p className="text-xs text-slate-500">
            Identified gaps or missing documentation in submitted CV (without automatic skill
            rejection):
          </p>
          {data.whyNotThisCandidate && data.whyNotThisCandidate.length > 0 ? (
            <div className="max-h-[min(55vh,420px)] space-y-2.5 overflow-y-auto overscroll-contain pr-2">
              {data.whyNotThisCandidate.map((concern, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 rounded-2xl border border-amber-100 bg-amber-50/50 p-3 text-xs font-medium leading-relaxed text-amber-950"
                >
                  <span className="mt-0.5 shrink-0 font-bold text-amber-600">⚠</span>
                  <span className="min-w-0 break-words">{compactPoint(concern)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-600 text-center italic">
              No critical disqualifying concerns flagged against requisition criteria.
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION 6: WHAT WOULD CHANGE THE DECISION? ── */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
            What Would Change the Decision?
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Key evidence that, if verified during a screening call or portfolio review, could
            elevate the recommendation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 md:items-start gap-4">
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
              Potential Decision-Changing Evidence:
            </span>
            <div className="max-h-[300px] space-y-2 overflow-y-auto overscroll-contain pr-2">
              {data.whatWouldChangeDecision.potentialEvidence.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-medium leading-relaxed text-slate-800"
                >
                  <span className="mt-0.5 shrink-0 font-bold text-brand-orange">→</span>
                  <span className="min-w-0 break-words">{compactPoint(item, 140)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="self-start rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
              Decision Impact Projection
            </span>
            <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-800">
              {compactPoint(data.whatWouldChangeDecision.decisionImpact, 260)}
            </p>
            <p className="mt-3 border-t border-slate-200 pt-2 text-[11px] leading-relaxed text-slate-500">
              Informational only. The ATS score changes only after re-evaluation.
            </p>
          </div>
        </div>
      </div>

      {/* ── SECTION 7: RISKS / CONCERNS ── */}
      {data.risksAndConcerns && data.risksAndConcerns.length > 0 && (
        <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-amber-600 text-sm font-bold">🛡️</span>
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
              Candidate Risks / Concerns
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.risksAndConcerns.map((risk, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-slate-50 border border-slate-200/90 rounded-2xl flex items-start gap-2.5 text-xs text-slate-800 leading-relaxed font-medium"
              >
                <span className="text-amber-500 font-bold mt-0.5">⚠</span>
                <span>{risk}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SECTION 8: HOW THE ATS SCORE WAS CALCULATED (Exact Formula & Pillar Breakdown) ── */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
              How Was the ATS Score Calculated?
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
          <span className="font-extrabold text-slate-600 uppercase tracking-wider text-[11px]">
            Evaluation Formula
          </span>
          <span className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium leading-relaxed text-slate-700">
              (Core Skills × 35%) + (Experience × 25%) + (Education × 15%) + (Mandatory × 15%) +
              (Semantic × 10%) + Bonus
          </span>
        </div>



      </div>

    </div>
  );
}
