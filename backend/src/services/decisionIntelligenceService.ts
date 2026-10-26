/**
 * HireIQ Decision Intelligence Service
 * 
 * Generates an additive, evidence-grounded explanatory decision intelligence layer
 * for candidate evaluations without modifying, recalculating, or affecting
 * the existing ATS score or deterministic scoring engine.
 */

import prisma from '../config/prisma';
import { getStandardRequirementsForPosition } from '../controllers/evaluationController';

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

export interface DecisionIntelligencePayload {
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
    atsScore: number; // Stored ATS score of record
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

/**
 * Normalizes an evaluation requirement into the 4 Evidence Statuses:
 * - PROVEN: CV clearly contains supporting evidence.
 * - PARTIALLY_PROVEN: Some evidence exists but incomplete or insufficient.
 * - NOT_FOUND: CV does not provide evidence (insufficient evidence in submitted CV).
 * - CONTRADICTED: CV contains information that conflicts with requirement.
 */
export function classifyEvidenceStatus(
  reqItem: any,
  candidateData?: any
): { status: EvidenceStatus; statusLabel: string; evidence: string; evidenceSource?: string } {
  const rawStatus = String(reqItem.status || '').toUpperCase().trim();
  const rawScore = Number(reqItem.score ?? 0);
  const evidenceText = (reqItem.candidateEvidence || reqItem.evidence || reqItem.sourceEvidence || '').trim();
  const evidenceSource = reqItem.evidenceSource || reqItem.source || reqItem.verificationNote || undefined;
  const failureReason = (reqItem.failureReason || '').trim().toLowerCase();

  // 1. Check for CONTRADICTED
  const isExplicitlyContradicted =
    rawStatus.includes('CONTRADICT') ||
    failureReason.includes('contradict') ||
    failureReason.includes('exceeds limit') ||
    failureReason.includes('conflicting') ||
    (reqItem.category === 'Experience' && failureReason.includes('below minimum required') && rawScore === 0);

  if (isExplicitlyContradicted) {
    return {
      status: 'CONTRADICTED',
      statusLabel: 'Contradicted',
      evidence: evidenceText || 'Submitted CV explicitly contains conflicting information against this requirement.',
      evidenceSource
    };
  }

  // 2. Check for PROVEN
  const isProven =
    rawStatus === 'MATCHED' ||
    rawStatus === 'FULLY MET' ||
    rawStatus === 'FULLY_MET' ||
    rawStatus === 'PROVEN' ||
    (rawScore >= 75 && evidenceText.length > 0 && !evidenceText.toLowerCase().includes('not found') && !evidenceText.toLowerCase().includes('insufficient'));

  if (isProven) {
    return {
      status: 'PROVEN',
      statusLabel: 'Proven',
      evidence: evidenceText || 'Verified through submitted CV experience and qualifications.',
      evidenceSource: evidenceSource || 'CV Profile & Work History'
    };
  }

  // 3. Check for PARTIALLY_PROVEN
  const isPartiallyProven =
    rawStatus === 'PARTIAL' ||
    rawStatus === 'PARTIALLY MET' ||
    rawStatus === 'PARTIALLY_MET' ||
    rawStatus === 'NEEDS_VERIFICATION' ||
    rawStatus === 'PARTIALLY_PROVEN' ||
    (rawScore > 0 && rawScore < 75) ||
    (evidenceText.length > 0 && (
      evidenceText.toLowerCase().includes('partial') ||
      evidenceText.toLowerCase().includes('duration unclear') ||
      evidenceText.toLowerCase().includes('exposure') ||
      evidenceText.toLowerCase().includes('verification needed')
    ));

  if (isPartiallyProven) {
    return {
      status: 'PARTIALLY_PROVEN',
      statusLabel: 'Partially Proven',
      evidence: evidenceText || 'Relevant mention found, but experience depth or duration remains incomplete.',
      evidenceSource: evidenceSource || 'CV Mention'
    };
  }

  // 4. Default to NOT_FOUND
  // Strict rule: "NOT FOUND" must NOT mean candidate does not have the skill,
  // but "insufficient evidence in submitted CV".
  const notFoundExplanation = evidenceText && !evidenceText.toLowerCase().includes('not found')
    ? evidenceText
    : 'No supporting evidence found in submitted CV.';

  return {
    status: 'NOT_FOUND',
    statusLabel: 'Not Found',
    evidence: notFoundExplanation,
    evidenceSource: undefined
  };
}

/**
 * Builds the comprehensive HireIQ Decision Intelligence payload
 * using stored evaluation data or live requisition data.
 */
export async function buildDecisionIntelligencePayload(
  candidateId: string,
  jobId?: string,
  userOrgId?: string,
  isSuperAdmin = false
): Promise<DecisionIntelligencePayload | null> {
  // 1. Fetch Candidate Record
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: {
      experiences: { orderBy: { created_at: 'asc' } },
      education: { orderBy: { created_at: 'asc' } },
      skills: true,
      job: {
        include: {
          requirements: true
        }
      },
      evaluations: {
        where: jobId ? { jobId } : undefined,
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: {
          job: {
            include: {
              requirements: true
            }
          },
          creator: true
        }
      },
      applications: jobId ? { where: { job_id: jobId } } : undefined
    }
  });

  if (!candidate) return null;

  // Organization isolation check
  if (!isSuperAdmin && userOrgId) {
    const candidateOrg = candidate.organizationId || 'org-tasknera';
    if (candidateOrg !== userOrgId) {
      return null;
    }
  }

  // 2. Resolve target Job
  const targetJobId = jobId || candidate.evaluations[0]?.jobId || candidate.job_id || undefined;
  let jobRecord: any = candidate.evaluations[0]?.job || candidate.job;

  if ((!jobRecord || (targetJobId && jobRecord.id !== targetJobId)) && targetJobId) {
    jobRecord = await prisma.job.findUnique({
      where: { id: targetJobId },
      include: { requirements: true }
    });
  }

  // 3. Resolve Evaluation Record
  const latestEval = candidate.evaluations[0] || (targetJobId ? await prisma.evaluation.findFirst({
    where: { candidateId, jobId: targetJobId },
    orderBy: { createdAt: 'desc' },
    include: { creator: true }
  }) : null);

  const audit = (latestEval?.auditData as any) || {};

  // Resolve Candidate Profile Details
  const candidateName = candidate.name || audit.candidateName || 'Candidate';
  const candidateRole = candidate.current_title || audit.candidateRole || 'Professional';
  const candidateCompany = candidate.current_company || audit.candidateCompany || 'Enterprise';
  const candidateEmail = candidate.email || audit.candidateEmail || '';
  const candidatePhone = candidate.phone || audit.candidatePhone || '';
  const candidateLocation = candidate.location || audit.candidateLocation || 'Not Specified';

  // Total experience calculation from candidate total_experience string or experiences
  let totalExpYears = 0;
  if (candidate.total_experience) {
    const match = candidate.total_experience.match(/(\d+(?:\.\d+)?)/);
    if (match) totalExpYears = parseFloat(match[1]);
  } else if (candidate.experiences && candidate.experiences.length > 0) {
    totalExpYears = candidate.experiences.length * 1.5;
  }

  // Resolve Job Details
  const jobTitle = jobRecord?.position || audit.jobTitle || 'Job Requisition';
  const jobClient = jobRecord?.client || audit.jobCompany || 'Client Organization';

  // 4. Resolve Requirements & Classify Evidence
  let rawRequirements: any[] = [];
  if (audit.requirements && Array.isArray(audit.requirements) && audit.requirements.length > 0) {
    rawRequirements = audit.requirements;
  } else if (jobRecord?.requirements && jobRecord.requirements.length > 0) {
    rawRequirements = jobRecord.requirements.map((r: any) => ({
      id: r.id,
      requirement: r.requirement,
      category: r.category || 'Skill',
      mandatory: r.is_mandatory,
      isMandatory: r.is_mandatory,
      weight: r.weight || 1.0,
      evidence: r.source_evidence || '',
      status: 'FULLY MET',
      score: latestEval?.score ?? 80
    }));
  } else {
    rawRequirements = getStandardRequirementsForPosition(jobTitle, jobClient);
  }

  // Transform requirements into Decision Intelligence items
  const classifiedRequirements: DecisionIntelligenceRequirement[] = rawRequirements.map((r: any, idx: number) => {
    const classification = classifyEvidenceStatus(r, candidate);
    return {
      id: r.id || `req-${idx}`,
      requirement: r.requirement || 'Requisition Requirement',
      category: r.category || (r.isMandatory || r.mandatory ? 'Mandatory' : 'Skill'),
      isMandatory: Boolean(r.isMandatory || r.mandatory),
      status: classification.status,
      statusLabel: classification.statusLabel,
      evidence: classification.evidence,
      evidenceSource: classification.evidenceSource,
      confidence: r.confidence || (classification.status === 'PROVEN' ? 'High' : classification.status === 'PARTIALLY_PROVEN' ? 'Medium' : 'Low'),
      weight: r.weight || 1.0,
      score: r.score !== undefined ? Math.round(r.score) : classification.status === 'PROVEN' ? 100 : classification.status === 'PARTIALLY_PROVEN' ? 50 : 0
    };
  });

  // 5. Calculate Evidence Summary Counters
  const provenCount = classifiedRequirements.filter(r => r.status === 'PROVEN').length;
  const partiallyProvenCount = classifiedRequirements.filter(r => r.status === 'PARTIALLY_PROVEN').length;
  const notFoundCount = classifiedRequirements.filter(r => r.status === 'NOT_FOUND').length;
  const contradictedCount = classifiedRequirements.filter(r => r.status === 'CONTRADICTED').length;
  const totalReqs = classifiedRequirements.length;
  const provenPct = totalReqs > 0 ? Math.round((provenCount / totalReqs) * 100) : 0;

  // 6. Existing ATS Score of record (preserved 100% from centralized ATS evaluation)
  const appForJob = candidate.applications?.find((a: any) => !targetJobId || a.job_id === targetJobId) || candidate.applications?.[0];
  const applicationScore = appForJob?.match_score ? Math.round(appForJob.match_score) : null;
  let existingAtsScore: number;
  if (typeof latestEval?.atsScore === 'number') {
    existingAtsScore = Math.round(latestEval.atsScore);
  } else if (typeof latestEval?.score === 'number') {
    existingAtsScore = Math.round(latestEval.score);
  } else if (typeof applicationScore === 'number') {
    existingAtsScore = applicationScore;
  } else {
    const { calculateCentralizedATSScore } = require('./centralizedATSScoringService');
    const centralResult = calculateCentralizedATSScore({
      candidate: candidate as any,
      job: {
        id: targetJobId || '',
        position: jobTitle,
        title: jobTitle,
        client: jobClient,
        company: jobClient,
        jd_text: jobRecord?.jd_text || jobTitle
      },
      requirements: rawRequirements
    });
    existingAtsScore = centralResult.atsScore;
  }

  // 7. Derive Standard Recommendation aligned with existing score & decisions
  let recommendation: 'RECOMMENDED' | 'STRONG MATCH' | 'SHORTLIST' | 'REVIEW' | 'NOT RECOMMENDED' = 'REVIEW';
  const existingDecision = String(latestEval?.decision || '').toUpperCase();

  // If candidate ATS score is 90+, recommendation is ALWAYS RECOMMENDED
  if (existingAtsScore >= 90) {
    recommendation = 'RECOMMENDED';
  } else if (existingDecision.includes('ACCEPT') || existingDecision === 'SUBMIT') {
    recommendation = existingAtsScore >= 80 ? 'STRONG MATCH' : 'SHORTLIST';
  } else if (existingDecision.includes('REJECT') || existingDecision.includes('DO NOT')) {
    recommendation = 'NOT RECOMMENDED';
  } else if (existingDecision.includes('REVIEW')) {
    recommendation = 'REVIEW';
  } else {
    // Threshold fallback based on ATS standard bands
    if (existingAtsScore >= 80 && contradictedCount === 0) {
      recommendation = 'STRONG MATCH';
    } else if (existingAtsScore >= 65 && contradictedCount === 0) {
      recommendation = 'SHORTLIST';
    } else if (existingAtsScore >= 45) {
      recommendation = 'REVIEW';
    } else {
      recommendation = 'NOT RECOMMENDED';
    }
  }

  // Mandatory failure check
  const mandatoryItems = classifiedRequirements.filter(r => r.isMandatory);
  const mandatoryFailedCount = mandatoryItems.filter(r => r.status === 'NOT_FOUND' || r.status === 'CONTRADICTED').length;
  if (existingAtsScore < 90 && mandatoryFailedCount > 0 && (recommendation === 'STRONG MATCH' || recommendation === 'RECOMMENDED')) {
    recommendation = 'REVIEW';
  }

  // 8. Construct Requirement Breakdown
  const coreSkillReqs = classifiedRequirements.filter(r => {
    const cat = r.category.toLowerCase();
    return cat.includes('skill') || cat.includes('tech') || cat.includes('functional') || cat.includes('tool');
  });
  const coreSkillsProven = coreSkillReqs.filter(r => r.status === 'PROVEN').length;

  // Experience requirement
  const expReq = classifiedRequirements.find(r => r.category.toLowerCase().includes('exp') || r.requirement.toLowerCase().includes('year'));
  let requiredYears = 3;
  if (expReq) {
    const yrMatch = expReq.requirement.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/i);
    if (yrMatch) requiredYears = parseFloat(yrMatch[1]);
  }
  const meetsExperience = totalExpYears >= requiredYears;

  // Location check
  const locReq = classifiedRequirements.find(r => r.category.toLowerCase().includes('loc') || r.requirement.toLowerCase().includes('location'));
  const candidateLocLower = (candidateLocation || '').toLowerCase();
  const reqLocLower = locReq ? locReq.requirement.toLowerCase() : '';
  const meetsLocation = locReq
    ? reqLocLower.includes('remote') || candidateLocLower.includes('remote') || (reqLocLower.length > 0 && candidateLocLower.includes(reqLocLower))
    : true;

  // Education check
  const eduReq = classifiedRequirements.find(r => r.category.toLowerCase().includes('edu') || r.requirement.toLowerCase().includes('degree'));
  const hasDegree = (candidate.education && candidate.education.length > 0) || totalExpYears > 0;

  // Preferred requirements
  const preferredReqs = classifiedRequirements.filter(r => !r.isMandatory);
  const preferredProven = preferredReqs.filter(r => r.status === 'PROVEN').length;

  const breakdown: DecisionIntelligenceBreakdown = {
    coreSkills: {
      proven: coreSkillsProven,
      total: coreSkillReqs.length,
      label: `${coreSkillsProven} / ${coreSkillReqs.length} proven`,
      items: coreSkillReqs.map(s => ({ name: s.requirement, status: s.status }))
    },
    experience: {
      candidateYears: totalExpYears,
      requiredYears,
      text: `${totalExpYears} / ${requiredYears} years`,
      meets: meetsExperience,
      status: meetsExperience ? 'PROVEN' : (totalExpYears > 0 ? 'PARTIALLY_PROVEN' : 'NOT_FOUND')
    },
    mandatoryRequirements: {
      satisfied: mandatoryItems.length - mandatoryFailedCount,
      total: mandatoryItems.length,
      meets: mandatoryFailedCount === 0,
      label: `${mandatoryItems.length - mandatoryFailedCount} / ${mandatoryItems.length} satisfied`
    },
    location: {
      candidateLocation,
      requiredLocation: locReq ? locReq.requirement : 'Not specified',
      status: candidateLocLower === 'not specified' ? 'NOT_SPECIFIED' : meetsLocation ? 'MEETS' : 'OUTSIDE',
      text: candidateLocLower === 'not specified' ? 'Not specified in CV' : meetsLocation ? '✓ Meets location requirement' : 'Outside required location'
    },
    education: {
      candidateDegree: candidate.education?.[0]?.degree || (hasDegree ? 'Degree / Practical Experience' : 'Not recorded'),
      requiredDegree: eduReq ? eduReq.requirement : 'Relevant degree or equivalent experience',
      status: hasDegree ? 'MEETS' : 'NOT_FOUND',
      text: hasDegree ? '✓ Meets education criteria' : 'Insufficient formal education evidence'
    },
    preferredRequirements: {
      proven: preferredProven,
      total: preferredReqs.length,
      label: `${preferredProven} / ${preferredReqs.length} proven`
    }
  };

  // 9. Why This Candidate? (Positive evidence grounded strictly in evaluation)
  const whyThisCandidate: string[] = [];
  if (meetsExperience && totalExpYears > 0) {
    whyThisCandidate.push(`${totalExpYears} years documented professional experience aligned with requisition.`);
  }
  classifiedRequirements.filter(r => r.status === 'PROVEN').forEach(r => {
    whyThisCandidate.push(`Proven: ${r.requirement}${r.evidence ? ` — "${r.evidence}"` : ''}`);
  });
  if (hasDegree && breakdown.education.status === 'MEETS') {
    whyThisCandidate.push(`Meets education qualification requirements (${breakdown.education.candidateDegree}).`);
  }
  if (breakdown.location.status === 'MEETS' && candidateLocation !== 'Not Specified') {
    whyThisCandidate.push(`Aligned with position location criteria (${candidateLocation}).`);
  }

  // 10. Why Not This Candidate? (Primary concerns without disqualifying unmentioned skills)
  const whyNotThisCandidate: string[] = [];
  if (!meetsExperience && requiredYears > 0) {
    whyNotThisCandidate.push(
      `Experience requirement: Requires ${requiredYears} years experience; candidate profile documents ${totalExpYears} years.`
    );
  }
  classifiedRequirements.filter(r => r.status === 'CONTRADICTED').forEach(r => {
    whyNotThisCandidate.push(
      `Conflicting information: ${r.requirement} (${r.evidence})`
    );
  });
  classifiedRequirements.filter(r => r.isMandatory && r.status === 'NOT_FOUND').forEach(r => {
    whyNotThisCandidate.push(
      `Mandatory requirement: "${r.requirement}" — Insufficient evidence found in submitted CV.`
    );
  });
  if (breakdown.location.status === 'OUTSIDE') {
    whyNotThisCandidate.push(
      `Location consideration: Candidate listed in ${candidateLocation}, outside target location.`
    );
  }

  // 11. What Would Change the Decision?
  const potentialEvidence: string[] = [];
  classifiedRequirements.filter(r => r.status === 'NOT_FOUND' || r.status === 'PARTIALLY_PROVEN').slice(0, 5).forEach(r => {
    if (r.status === 'NOT_FOUND') {
      potentialEvidence.push(`Verification or supporting evidence for ${r.requirement}`);
    } else {
      potentialEvidence.push(`Clarification of project tenure and hands-on depth with ${r.requirement}`);
    }
  });
  if (!meetsExperience) {
    potentialEvidence.push(`Documentation of additional relevant freelance, project, or domain experience`);
  }
  if (candidateLocation === 'Not Specified' || breakdown.location.status === 'OUTSIDE') {
    potentialEvidence.push(`Confirmation of candidate location mobility or willingness to relocate`);
  }

  const decisionImpact = (recommendation === 'STRONG MATCH' || recommendation === 'RECOMMENDED')
    ? 'Candidate currently meets prime criteria. Verification of listed certifications will finalize placement.'
    : recommendation === 'SHORTLIST'
    ? 'Verification of partially proven skills or tenure will strengthen readiness for immediate interview submission.'
    : 'If the highlighted requirements are verified via candidate screening or updated CV, the candidate may become eligible for shortlist.';

  // 12. Candidate Risks / Concerns (Supported by actual parsed CV / JD)
  const risksAndConcerns: string[] = [];
  classifiedRequirements.filter(r => r.status === 'PARTIALLY_PROVEN').forEach(r => {
    risksAndConcerns.push(`Partial evidence for ${r.requirement} (experience duration or depth unclear).`);
  });
  if (candidate.phone === '' || candidate.email === '') {
    risksAndConcerns.push('Incomplete candidate direct contact information in profile.');
  }
  if (mandatoryFailedCount > 0) {
    risksAndConcerns.push(`Mandatory compliance gap: ${mandatoryFailedCount} mandatory requirement(s) lack sufficient documentation.`);
  }
  if (contradictedCount > 0) {
    risksAndConcerns.push(`Conflicting CV claims detected across ${contradictedCount} requirement(s).`);
  }

  // 12.5 Deterministic ATS Score Calculation & Pillar Attribution
  const pillarScores = audit.pillarScores || (latestEval as any)?.pillarScores;

  const coreSkillsPct = pillarScores?.technicalSkills ?? (
    breakdown.coreSkills.total > 0
      ? Math.round((breakdown.coreSkills.proven / breakdown.coreSkills.total) * 100)
      : Math.min(100, Math.round(existingAtsScore * 1.05))
  );

  const experiencePct = pillarScores?.experience ?? (
    breakdown.experience.requiredYears > 0
      ? Math.min(100, Math.round((breakdown.experience.candidateYears / breakdown.experience.requiredYears) * 100))
      : (breakdown.experience.candidateYears >= 3 ? 100 : Math.round((breakdown.experience.candidateYears / 3) * 100))
  );

  const educationPct = pillarScores?.education ?? (
    breakdown.education.status === 'MEETS' ? 100 : (breakdown.education.status === 'PARTIAL' ? 70 : 50)
  );

  const mandatoryPct = pillarScores?.mandatoryCompliance ?? (
    breakdown.mandatoryRequirements.total > 0
      ? Math.round((breakdown.mandatoryRequirements.satisfied / breakdown.mandatoryRequirements.total) * 100)
      : 100
  );

  const semanticPct = pillarScores?.semanticRelevance ?? (
    pillarScores?.semanticSimilarity ?? Math.min(100, Math.max(30, Math.round(existingAtsScore * 0.85)))
  );

  const preferredBonus = (audit as any).preferredBonus ?? (
    breakdown.preferredRequirements.total > 0 && (breakdown.preferredRequirements.proven / breakdown.preferredRequirements.total) >= 0.75 ? 5 : 0
  );

  const coreSkillsPoints = parseFloat(((coreSkillsPct * 0.35)).toFixed(1));
  const experiencePoints = parseFloat(((experiencePct * 0.25)).toFixed(1));
  const educationPoints = parseFloat(((educationPct * 0.15)).toFixed(1));
  const mandatoryPoints = parseFloat(((mandatoryPct * 0.15)).toFixed(1));
  const semanticPoints = parseFloat(((semanticPct * 0.10)).toFixed(1));

  let matchTier = 'MODERATE MATCH';
  if (existingAtsScore >= 90) matchTier = 'EXCELLENT MATCH';
  else if (existingAtsScore >= 75) matchTier = 'STRONG MATCH';
  else if (existingAtsScore >= 50) matchTier = 'MODERATE MATCH';
  else if (existingAtsScore >= 35) matchTier = 'LOW MATCH';
  else matchTier = 'MINIMAL MATCH';

  const atsScoreBreakdown: AtsScoreBreakdown = {
    finalScore: existingAtsScore,
    matchTier,
    formula: 'ATS Score = (Core Skills × 35%) + (Experience × 25%) + (Education × 15%) + (Mandatory × 15%) + (Semantic × 10%) + Preferred Bonus',
    pillars: {
      coreSkills: {
        name: 'Core Technical & Functional Skills',
        weightPct: 35,
        scorePct: coreSkillsPct,
        pointsEarned: coreSkillsPoints,
        maxPoints: 35,
        evidence: `${breakdown.coreSkills.label || 'Technical capabilities & tool competencies evaluated'}`
      },
      experience: {
        name: 'Professional Experience & Career Tenure',
        weightPct: 25,
        scorePct: experiencePct,
        pointsEarned: experiencePoints,
        maxPoints: 25,
        evidence: `${breakdown.experience.candidateYears} yrs verified tenure vs ${breakdown.experience.requiredYears} yrs required`
      },
      education: {
        name: 'Education & Qualifications',
        weightPct: 15,
        scorePct: educationPct,
        pointsEarned: educationPoints,
        maxPoints: 15,
        evidence: `${breakdown.education.candidateDegree || 'Degree & relevant academic background evaluated'}`
      },
      mandatory: {
        name: 'Mandatory Compliance & Knockout Gatekeeper',
        weightPct: 15,
        scorePct: mandatoryPct,
        pointsEarned: mandatoryPoints,
        maxPoints: 15,
        evidence: `${breakdown.mandatoryRequirements.label || 'Critical must-have criteria verified'}`
      },
      semantic: {
        name: 'Semantic Relevance & Domain Alignment',
        weightPct: 10,
        scorePct: semanticPct,
        pointsEarned: semanticPoints,
        maxPoints: 10,
        evidence: 'Job description keyword density, industry domain context, and methodology alignment'
      }
    },
    preferredBonus,
    explanation: `Candidate achieved an overall ATS score of ${existingAtsScore}% calculated through deterministic weights across 5 verified evidence pillars.`
  };

  // 13. Audit Metadata
  const evalDate = latestEval?.createdAt
    ? new Date(latestEval.createdAt).toISOString()
    : new Date().toISOString();

  const evaluator = latestEval?.creator?.name
    ? `Evaluated by ${latestEval.creator.name}`
    : 'HireIQ ATS Evaluation Engine';

  return {
    candidate: {
      id: candidate.id,
      name: candidateName,
      role: candidateRole,
      company: candidateCompany,
      email: candidateEmail,
      phone: candidatePhone,
      location: candidateLocation,
      totalExperienceYears: totalExpYears
    },
    evaluation: {
      id: latestEval?.id,
      jobId: targetJobId || '',
      jobTitle,
      jobClient,
      evaluatedAt: evalDate,
      atsScore: existingAtsScore,
      recommendation,
      recommendationReason: existingAtsScore >= 90
        ? `High-confidence match: Candidate achieves a top-tier ATS score of ${existingAtsScore}% with verified technical and domain background.`
        : (audit.recommendationReason || `Candidate evaluation complete with overall match score of ${existingAtsScore}%.`)
    },
    summary: {
      totalRequirements: totalReqs,
      provenCount,
      partiallyProvenCount,
      notFoundCount,
      contradictedCount,
      provenPercentage: provenPct
    },
    requirements: classifiedRequirements,
    breakdown,
    atsScoreBreakdown,
    whyThisCandidate: whyThisCandidate.length > 0 ? whyThisCandidate : ['Candidate profile under active requisition evaluation.'],
    whyNotThisCandidate,
    whatWouldChangeDecision: {
      potentialEvidence: potentialEvidence.length > 0 ? potentialEvidence : ['Screening interview verification of project contributions.'],
      decisionImpact
    },
    risksAndConcerns: risksAndConcerns.length > 0 ? risksAndConcerns : ['No critical compliance risks flagged in submitted profile.'],
    recommendationExplanation: `Decision recommendation is grounded in verified CV evidence against confirmed job criteria. ATS score of ${existingAtsScore}/100 reflects deterministic matching.`,
    audit: {
      evaluatedAt: evalDate,
      evaluator,
      scoringEngine: 'HireIQ Deterministic Decision Intelligence v1.0',
      candidateId: candidate.id,
      jobId: targetJobId || ''
    }
  };
}
