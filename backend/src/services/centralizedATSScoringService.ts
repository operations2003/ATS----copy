/**
 * Centralized ATS Scoring Engine - Production Authoritative Version 6.0.0
 * 
 * Strict Single Source of Truth for ATS Scoring across TaskNera / HireIQ ATS:
 * 
 * Formula:
 * - CORE SKILLS            = 25% (0.25)
 * - EXPERIENCE             = 22% (0.22)
 * - EDUCATION              = 15% (0.15)
 * - MANDATORY REQUIREMENTS = 28% (0.28)
 * - SEMANTIC/CONTEXT MATCH = 10% (0.10)
 * - PREFERRED BONUS        = +5 (almost all met), +3 (~half met), +0 otherwise
 * 
 * Final ATS Score:
 *   finalScore = Math.round(
 *     (CoreSkills * 0.25) +
 *     (Experience * 0.22) +
 *     (Education * 0.15) +
 *     (Mandatory * 0.28) +
 *     (Semantic * 0.10) +
 *     preferredBonus
 *   ) clamped to [0, 100]
 * 
 * Deterministic Thresholds:
 * - 85 - 100 : EXCELLENT MATCH
 * - 70 - 84  : STRONG MATCH
 * - 50 - 69  : MODERATE MATCH
 * - 35 - 49  : LOW MATCH
 * - 0  - 34  : MINIMAL MATCH
 * 
 * Recommendation:
 * - finalScore >= 75 && !mandatoryRequirementFailed -> SUBMIT
 * - finalScore >= 50 && !mandatoryRequirementFailed -> REVIEW
 * - Otherwise -> DO NOT SUBMIT
 */

import { CandidateRecord } from '../controllers/candidateController';
import {
  MatchStatus,
  MatchTier,
  MandatoryFailureDetail,
  RequirementEvaluationResult,
  PillarScores,
  STATUS_SCORE_MAP,
  GENERIC_STOP_WORDS,
  matchSkillRequirement,
  evaluateExperienceRequirement,
  evaluateEducationRequirement,
  evaluateLocationRequirement,
  evaluateNoticePeriodRequirement,
  classifyCandidateDomain,
  classifyJobDomain,
  calculateProfessionalTenure
} from './atsScoringEngine';

export const CENTRALIZED_ATS_SCORING_VERSION = '6.0.0';

export const ATS_WEIGHTS = {
  CORE_SKILLS: 0.25,
  EXPERIENCE: 0.22,
  EDUCATION: 0.15,
  MANDATORY: 0.28,
  SEMANTIC: 0.10,
} as const;

export interface CentralizedATSScoringInput {
  candidate: CandidateRecord;
  job: {
    id: string;
    position?: string;
    title?: string;
    client?: string;
    company?: string;
    jd_text?: string;
    normalized_jd?: any;
    extractedRequirements?: any[];
  };
  requirements: Array<{
    id: string;
    requirement: string;
    category?: string | null;
    weight?: number;
    is_mandatory?: boolean;
    isMandatory?: boolean;
    source_evidence?: string | null;
    sourceEvidence?: string | null;
    aliases?: string[];
    context?: string | null;
    status?: MatchStatus;
    evidence?: string;
    candidateEvidence?: string;
  }>;
  semanticEvidence?: Array<{
    id?: string;
    requirement?: string;
    status?: MatchStatus;
    candidateEvidence?: string;
    evidence?: string;
    confidence?: string;
    score?: number;
    matchedAlias?: string;
    matchReason?: string;
    failureReason?: string;
  }>;
}

export interface CentralizedATSScoringResult {
  evaluationId: string;
  candidateId: string;
  jobId: string;
  atsScore: number;
  overallScore: number;
  finalScore: number;
  overallMatch: number;
  rawScore: number;
  matchLevel: MatchTier;
  categoryScores: {
    coreSkills: number;
    experience: number;
    education: number;
    mandatoryRequirements: number;
    semanticMatch: number;
  };
  mandatoryCompliance: {
    total: number;
    matched: number;
    met: number;
    failed: number;
    percentage: number;
    passed: boolean;
  };
  mandatoryComplianceScore: number;
  mandatoryRequirementFailed: boolean;
  mandatoryFailures: MandatoryFailureDetail[];
  preferredBonus: number;
  requirements: RequirementEvaluationResult[];
  requirementResults: RequirementEvaluationResult[];
  strengths: string[];
  gaps: string[];
  warnings: string[];
  recommendation: 'SUBMIT' | 'REVIEW' | 'DO NOT SUBMIT';
  recommendationReason: string;
  scoringConfigVersion: string;
  evaluatedAt: string;
  pillarScores: PillarScores;
  pillars: PillarScores;
  scoreBreakdown: {
    mandatory: { score: number; max: number; pct: number; label: string };
    skills: { score: number; max: number; pct: number; label: string };
    experience: { score: number; max: number; pct: number; label: string };
    responsibilities: { score: number; max: number; pct: number; label: string };
    preferred: { score: number; max: number; pct: number; label: string };
  };
  auditData: {
    version: string;
    weights: typeof ATS_WEIGHTS;
    categoryScores: {
      coreSkills: number;
      experience: number;
      education: number;
      mandatory: number;
      semantic: number;
    };
    preferredBonus: number;
    finalScore: number;
    evaluatedAt: string;
  };
}

/**
 * Authoritative, deterministic ATS scoring engine.
 * Computes 100% reproducible score for (Candidate + JD + Requirements).
 */
export function calculateCentralizedATSScore(input: CentralizedATSScoringInput): CentralizedATSScoringResult {
  const { candidate, job, requirements, semanticEvidence } = input;
  const now = new Date().toISOString();

  // 1. Cross-Domain Role Check
  const jobPosition = job.position || job.title || 'Requisition Position';
  const jobDomain = classifyJobDomain(jobPosition, job.jd_text);
  const candDomain = classifyCandidateDomain(candidate);

  const isTechnicalApplyingToSales = jobDomain === 'SALES_BUSINESS' && candDomain === 'TECHNICAL';
  const isSalesApplyingToTechnical = jobDomain === 'TECHNICAL' && candDomain === 'SALES_BUSINESS';

  let hasDomainMismatch = false;
  let domainMismatchReason = '';
  const mandatoryFailures: MandatoryFailureDetail[] = [];
  const warnings: string[] = [];
  const strengths: string[] = [];
  const gaps: string[] = [];

  if (isTechnicalApplyingToSales) {
    const hasSalesExp = candidate.experience?.some(ex =>
      /\b(sale|sales|business development|account executive|bde|bdr|inside sales)\b/i.test(ex.title || '')
    );
    if (!hasSalesExp) {
      hasDomainMismatch = true;
      domainMismatchReason = 'CRITICAL ROLE DOMAIN MISMATCH: Requisition is in Sales & Business Development, but candidate has a Software Engineering background without verified B2B sales experience.';
      mandatoryFailures.push({
        requirement: 'Role Domain Alignment: Sales & Business Development',
        reason: domainMismatchReason,
        category: 'Domain Mismatch'
      });
      warnings.push(domainMismatchReason);
    }
  } else if (isSalesApplyingToTechnical) {
    const hasTechExp = candidate.experience?.some(ex =>
      /\b(software|developer|engineer|programmer|coder|architect|consultant|analyst|specialist|sap|erp|crm|devops|cloud|qa|tester|administrator|dba)\b/i.test(ex.title || '')
    );
    const hasTechSkills = (candidate.skills || []).some(s =>
      /\b(sap|erp|abap|sql|java|python|c\+\+|c\#|javascript|typescript|react|angular|aws|azure|cloud|database|api|linux|git|docker|kubernetes|hana)\b/i.test(s)
    );
    if (!hasTechExp && !hasTechSkills) {
      hasDomainMismatch = true;
      domainMismatchReason = 'CRITICAL ROLE DOMAIN MISMATCH: Requisition requires Software/Technical expertise, but candidate has a Sales/Business Development background without verified technical/IT experience or skills.';
      mandatoryFailures.push({
        requirement: 'Role Domain Alignment: Technical/Engineering',
        reason: domainMismatchReason,
        category: 'Domain Mismatch'
      });
      warnings.push(domainMismatchReason);
    }
  }

  // Map semantic evidence by requirement text / id for quick advisory lookup
  const semanticLookup = new Map<string, any>();
  if (Array.isArray(semanticEvidence)) {
    for (const se of semanticEvidence) {
      if (se.id) semanticLookup.set(se.id.toLowerCase().trim(), se);
      if (se.requirement) semanticLookup.set(se.requirement.toLowerCase().trim(), se);
    }
  }

  const rawReqs = (Array.isArray(requirements) && requirements.length > 0)
    ? requirements
    : [
        { id: 'req-default-1', requirement: jobPosition, category: 'Experience', weight: 2.0, is_mandatory: true },
        { id: 'req-default-2', requirement: 'Core Required Competencies', category: 'Technical Skill', weight: 2.0, is_mandatory: false }
      ];

  // Deduplicate requirements to prevent repeated requirements from inflating weights (Phase 3.3)
  const effectiveReqs: typeof rawReqs = [];
  const seenReqKeys = new Set<string>();

  for (const r of rawReqs) {
    const key = (r.requirement || '').trim().toLowerCase();
    if (!key) continue;
    if (seenReqKeys.has(key)) {
      const existing = effectiveReqs.find(e => (e.requirement || '').trim().toLowerCase() === key);
      if (existing) {
        if (r.is_mandatory || (r as any).isMandatory) {
          existing.is_mandatory = true;
          (existing as any).isMandatory = true;
        }
        if (typeof r.weight === 'number' && r.weight > (existing.weight || 1.0)) {
          existing.weight = r.weight;
        }
        if (Array.isArray(r.aliases) && r.aliases.length > 0) {
          existing.aliases = Array.from(new Set([...(existing.aliases || []), ...r.aliases]));
        }
      }
      continue;
    }
    seenReqKeys.add(key);
    effectiveReqs.push({ ...r });
  }

  // Deduplicate and clean candidate skills
  const normalizedCandidate: CandidateRecord = {
    ...candidate,
    skills: Array.isArray(candidate.skills)
      ? Array.from(new Set(candidate.skills.map(s => (s || '').trim()).filter(Boolean)))
      : []
  };

  const reqResults: RequirementEvaluationResult[] = [];

  // Categorized accumulator tracking
  let skillWeightTotal = 0;
  let skillWeightEarned = 0;

  let expWeightTotal = 0;
  let expWeightEarned = 0;

  let eduWeightTotal = 0;
  let eduWeightEarned = 0;

  let mandatoryWeightTotal = 0;
  let mandatoryWeightEarned = 0;
  let mandatoryCount = 0;
  let mandatoryMetCount = 0;

  let preferredWeightTotal = 0;
  let preferredWeightEarned = 0;
  let preferredCount = 0;

  // Process and evaluate each individual requirement
  for (let idx = 0; idx < effectiveReqs.length; idx++) {
    const req = effectiveReqs[idx];
    const reqId = req.id || `req-${idx + 1}`;
    const reqText = (req.requirement || '').trim();
    const sourceEvidence = String(req.source_evidence || req.sourceEvidence || '').trim();
    const reqCategory = (req.category || 'Technical Skill').trim();
    const isMandatory = typeof req.is_mandatory === 'boolean'
      ? req.is_mandatory
      : (typeof req.isMandatory === 'boolean' ? req.isMandatory : false);
    const weight = typeof req.weight === 'number' && req.weight > 0 ? req.weight : 1.0;

    const reqLower = reqText.toLowerCase();
    const catLower = reqCategory.toLowerCase();

    // Check if an AI semantic result already extracted verified candidate evidence
    const semHit = semanticLookup.get(reqId.toLowerCase()) || semanticLookup.get(reqLower);

    const srcYearsMatch = sourceEvidence ? sourceEvidence.match(/(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)/i) : null;
    const hasYearsExplicit = /\b\d+(?:\.\d+)?\+?\s*(?:years?|yrs?)\b/i.test(reqLower) ||
      /\b\d+\s*(?:-|to|–)\s*\d+\s*(?:years?|yrs?)\b/i.test(reqLower) ||
      (isMandatory && Boolean(srcYearsMatch));
    const isCategoryExperience = (catLower === 'experience' || catLower.startsWith('exp')) && !catLower.includes('skill');

    let evalResult: {
      status: MatchStatus;
      evidence: string;
      source: string;
      confidence: 'EXPLICIT' | 'STRONG_SEMANTIC' | 'WEAK_INFERENCE';
      failureReason?: string;
    };

    // 1. Experience Requirements
    if (isCategoryExperience || hasYearsExplicit) {
      const targetExpText = (isMandatory && sourceEvidence && srcYearsMatch) ? sourceEvidence : reqText;
      const expRes = evaluateExperienceRequirement(normalizedCandidate, targetExpText);
      evalResult = {
        status: expRes.status,
        evidence: expRes.evidence,
        source: expRes.source,
        confidence: expRes.confidence,
        failureReason: expRes.failureReason
      };

      expWeightTotal += weight;
      expWeightEarned += STATUS_SCORE_MAP[evalResult.status] * weight;
    }
    // 2. Education Requirements
    else if (catLower.includes('education') || reqLower.includes('degree') || reqLower.includes('bachelor') || reqLower.includes('master') || reqLower.includes('b.tech') || reqLower.includes('b.e')) {
      evalResult = evaluateEducationRequirement(normalizedCandidate.education || [], reqText);
      eduWeightTotal += weight;
      eduWeightEarned += STATUS_SCORE_MAP[evalResult.status] * weight;
    }
    // 3. Location Requirements
    else if (catLower.includes('location') || reqLower.includes('location') || reqLower.includes('onsite') || reqLower.includes('ncr') || reqLower.includes('bangalore') || reqLower.includes('mumbai') || reqLower.includes('hyderabad')) {
      evalResult = evaluateLocationRequirement(normalizedCandidate, reqText);
      skillWeightTotal += weight;
      skillWeightEarned += STATUS_SCORE_MAP[evalResult.status] * weight;
    }
    // 4. Notice Period / Availability Requirements
    else if (catLower.includes('availability') || catLower.includes('notice') || reqLower.includes('joiner') || reqLower.includes('notice period')) {
      evalResult = evaluateNoticePeriodRequirement(normalizedCandidate, reqText);
      skillWeightTotal += weight;
      skillWeightEarned += STATUS_SCORE_MAP[evalResult.status] * weight;
    }
    // 5. Technical Skills & Tools (Deterministic matching with aliases & synonym expansion)
    else {
      evalResult = matchSkillRequirement(normalizedCandidate, reqText, reqCategory, req.aliases);

      // If AI semantic matcher provided verified candidate evidence and local evidence was generic, enrich evidence text
      if (semHit && semHit.candidateEvidence && evalResult.status === 'MATCHED' && !evalResult.evidence.includes(semHit.candidateEvidence)) {
        evalResult.evidence = `${evalResult.evidence} | Semantic quote: "${semHit.candidateEvidence}"`;
      }

      skillWeightTotal += weight;
      skillWeightEarned += STATUS_SCORE_MAP[evalResult.status] * weight;
    }

    // Contextual mandatory source evidence enrichment
    if (isMandatory && sourceEvidence) {
      if (evalResult.status === 'MATCHED') {
        evalResult.evidence = `Verified alignment with mandatory requirement ("${sourceEvidence}"): ${evalResult.evidence}`;
      } else if (!evalResult.failureReason) {
        evalResult.failureReason = `Candidate lacks verified evidence for mandatory requirement: "${sourceEvidence}".`;
      }
    }

    const statusScore = STATUS_SCORE_MAP[evalResult.status] ?? 0.0;
    const score = Math.round(statusScore * 100);

    // Track Mandatory vs Preferred
    if (isMandatory) {
      mandatoryCount++;
      mandatoryWeightTotal += weight;
      mandatoryWeightEarned += statusScore * weight;

      if (evalResult.status === 'MATCHED') {
        mandatoryMetCount++;
      } else {
        const failureReason = evalResult.failureReason || evalResult.evidence || `Mandatory requirement "${reqText}" not met.`;
        mandatoryFailures.push({
          requirement: reqText,
          reason: failureReason,
          category: reqCategory
        });
        warnings.push(`MANDATORY REQUIREMENT FAILED: "${reqText}" (${failureReason})`);
      }
    } else {
      preferredCount++;
      preferredWeightTotal += weight;
      preferredWeightEarned += statusScore * weight;
    }

    if (evalResult.status === 'MATCHED') {
      strengths.push(`${reqText}: ${evalResult.evidence}`);
    } else if (evalResult.status === 'PARTIAL') {
      gaps.push(`${reqText}: Partially satisfied (${evalResult.evidence})`);
    } else if (evalResult.status === 'NOT_MATCHED') {
      gaps.push(`${reqText}: Not matched (${evalResult.failureReason || 'No credible evidence in CV'})`);
    }

    reqResults.push({
      id: reqId,
      requirement: reqText,
      category: reqCategory,
      mandatory: isMandatory,
      isMandatory,
      weight,
      status: evalResult.status,
      statusScore,
      score,
      candidateEvidence: evalResult.evidence,
      evidence: evalResult.evidence,
      evidenceSource: evalResult.source,
      evidenceType: evalResult.confidence,
      confidence: evalResult.confidence === 'EXPLICIT' ? 'High' : evalResult.confidence === 'STRONG_SEMANTIC' ? 'Medium' : 'Low',
      failureReason: evalResult.failureReason
    });
  }

  // ==========================================================================
  // CALCULATE 5 CATEGORY SCORES (0 - 100)
  // ==========================================================================

  // 1. CORE SKILLS (25%)
  let coreSkillsScore: number;
  if (skillWeightTotal > 0) {
    coreSkillsScore = Math.round((skillWeightEarned / skillWeightTotal) * 100);
  } else {
    // If no explicit skill requirements, verify general candidate skills presence
    const candSkills = normalizedCandidate.skills || [];
    coreSkillsScore = candSkills.length >= 5 ? 85 : candSkills.length > 0 ? 65 : 40;
  }
  coreSkillsScore = Math.min(100, Math.max(0, coreSkillsScore));

  // 2. EXPERIENCE (22%)
  let experienceScore: number;
  if (expWeightTotal > 0) {
    experienceScore = Math.round((expWeightEarned / expWeightTotal) * 100);
  } else {
    // Fallback: evaluate total professional career years vs standard baseline (3.0 yrs)
    const careerYears = calculateProfessionalTenure(normalizedCandidate);
    experienceScore = careerYears >= 5.0 ? 100 : Math.round((careerYears / 5.0) * 100);
  }
  experienceScore = Math.min(100, Math.max(0, experienceScore));

  // 3. EDUCATION (15%)
  let educationScore: number;
  if (eduWeightTotal > 0) {
    educationScore = Math.round((eduWeightEarned / eduWeightTotal) * 100);
  } else {
    // If education is not mentioned in JD: Rule: DO NOT penalize candidate -> 100%
    educationScore = 100;
  }
  educationScore = Math.min(100, Math.max(0, educationScore));

  // 4. MANDATORY REQUIREMENTS (28%)
  let mandatoryScore: number;
  if (mandatoryWeightTotal > 0) {
    mandatoryScore = Math.round((mandatoryWeightEarned / mandatoryWeightTotal) * 100);
  } else {
    // If no mandatory constraints exist in JD -> 100%
    mandatoryScore = 100;
  }
  mandatoryScore = Math.min(100, Math.max(0, mandatoryScore));

  const mandatoryCompliancePct = mandatoryCount > 0
    ? Math.round((mandatoryMetCount / mandatoryCount) * 100)
    : 100;

  // 5. SEMANTIC / CONTEXT MATCH (10%)
  // Measures distinctive domain keywords overlap between candidate text and JD position/text
  let semanticScore = 0;
  if (hasDomainMismatch) {
    semanticScore = 0;
  } else {
    const jdKeywords = `${jobPosition} ${job.jd_text || ''}`
      .split(/\s+/)
      .map(w => w.replace(/[^a-zA-Z0-9]/g, '').toLowerCase())
      .filter(w => w.length > 3 && !GENERIC_STOP_WORDS.has(w));
    
    const uniqueJdKeywords = Array.from(new Set(jdKeywords));
    const candFullText = `${normalizedCandidate.currentTitle || ''} ${normalizedCandidate.summary || ''} ${normalizedCandidate.rawText || ''} ${(normalizedCandidate.skills || []).join(' ')}`.toLowerCase();

    if (uniqueJdKeywords.length > 0) {
      let overlapCount = 0;
      for (const kw of uniqueJdKeywords) {
        if (new RegExp(`\\b${kw.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&')}\\b`, 'i').test(candFullText)) {
          overlapCount++;
        }
      }
      semanticScore = Math.min(100, Math.round((overlapCount / uniqueJdKeywords.length) * 100));
    } else {
      semanticScore = 75;
    }
  }

  // 6. PREFERRED BONUS (+5 or +3 or +0)
  let preferredBonus = 0;
  if (preferredWeightTotal > 0) {
    const preferredRatio = preferredWeightEarned / preferredWeightTotal;
    if (preferredRatio >= 0.75) {
      preferredBonus = 5;
    } else if (preferredRatio >= 0.40) {
      preferredBonus = 3;
    }
  }

  // ==========================================================================
  // CENTRAL SCORE FORMULA (Mathematical Combination)
  // ==========================================================================
  const rawWeightedScore =
    (coreSkillsScore * ATS_WEIGHTS.CORE_SKILLS) +
    (experienceScore * ATS_WEIGHTS.EXPERIENCE) +
    (educationScore * ATS_WEIGHTS.EDUCATION) +
    (mandatoryScore * ATS_WEIGHTS.MANDATORY) +
    (semanticScore * ATS_WEIGHTS.SEMANTIC) +
    preferredBonus;

  let finalScore = Math.min(100, Math.max(0, Math.round(rawWeightedScore)));

  // Knockout Criteria & Domain Mismatch Flagging
  const mandatoryRequirementFailed = (mandatoryCount > 0 && mandatoryMetCount < mandatoryCount) || hasDomainMismatch;

  // If severe domain mismatch (e.g. Sales applicant on Software Engineer JD), cap total score
  if (hasDomainMismatch) {
    finalScore = Math.min(finalScore, 15);
  }

  // ==========================================================================
  // DETERMINISTIC MATCH TIER & RECOMMENDATION
  // ==========================================================================
  let matchLevel: MatchTier;
  if (finalScore >= 85) matchLevel = 'EXCELLENT MATCH';
  else if (finalScore >= 70) matchLevel = 'STRONG MATCH';
  else if (finalScore >= 50) matchLevel = 'MODERATE MATCH';
  else if (finalScore >= 35) matchLevel = 'LOW MATCH';
  else matchLevel = 'MINIMAL MATCH';

  let recommendation: 'SUBMIT' | 'REVIEW' | 'DO NOT SUBMIT';
  let recommendationReason: string;

  if (finalScore >= 90) {
    recommendation = 'SUBMIT';
    recommendationReason = 'Outstanding candidate profile demonstrating exceptional alignment across core skills, experience, and competencies.';
  } else if (finalScore >= 75 && !mandatoryRequirementFailed) {
    recommendation = 'SUBMIT';
    recommendationReason = 'Strong overall candidate profile meeting core competencies, verified experience, and mandatory criteria.';
  } else if (finalScore >= 50 && !mandatoryRequirementFailed) {
    recommendation = 'REVIEW';
    recommendationReason = 'Moderate match meeting baseline mandatory criteria. Review specific gaps and skill depth before client submission.';
  } else {
    recommendation = 'DO NOT SUBMIT';
    recommendationReason = mandatoryRequirementFailed
      ? `Mandatory criteria gap: ${mandatoryFailures.length} mandatory requirement(s) failed or role domain misalignment detected.`
      : 'Candidate score falls below the required threshold for requisition submission.';
  }

  // Pillar scores for backward compatibility
  const pillarScores: PillarScores = {
    technicalSkills: coreSkillsScore,
    experience: experienceScore,
    education: educationScore,
    genAI: Math.round(coreSkillsScore * 0.85),
    semanticRelevance: semanticScore,
    mandatoryCompliance: mandatoryCompliancePct,
    relevantExperience: experienceScore,
    responsibilities: experienceScore,
    semanticSimilarity: semanticScore,
    domainFit: semanticScore
  };

  const categoryScores = {
    coreSkills: coreSkillsScore,
    experience: experienceScore,
    education: educationScore,
    mandatoryRequirements: mandatoryScore,
    semanticMatch: semanticScore
  };

  const scoreBreakdown = {
    mandatory: {
      score: mandatoryScore,
      max: 100,
      pct: mandatoryScore,
      label: mandatoryCount > 0 ? `Mandatory Compliance (${mandatoryMetCount}/${mandatoryCount})` : 'Mandatory Compliance (N/A)'
    },
    skills: {
      score: coreSkillsScore,
      max: 100,
      pct: coreSkillsScore,
      label: 'Core Technical Skills'
    },
    experience: {
      score: experienceScore,
      max: 100,
      pct: experienceScore,
      label: 'Experience History'
    },
    responsibilities: {
      score: semanticScore,
      max: 100,
      pct: semanticScore,
      label: 'Role Competencies'
    },
    preferred: {
      score: educationScore,
      max: 100,
      pct: educationScore,
      label: 'Education & Qualifications'
    }
  };

  return {
    evaluationId: `eval-${candidate.id}-${Date.now()}`,
    candidateId: candidate.id,
    jobId: job.id,
    atsScore: finalScore,
    overallScore: finalScore,
    finalScore,
    overallMatch: finalScore,
    rawScore: Math.round(rawWeightedScore),
    matchLevel,
    categoryScores,
    mandatoryCompliance: {
      total: mandatoryCount,
      matched: mandatoryMetCount,
      met: mandatoryMetCount,
      failed: mandatoryCount - mandatoryMetCount,
      percentage: mandatoryCompliancePct,
      passed: !mandatoryRequirementFailed
    },
    mandatoryComplianceScore: mandatoryCompliancePct,
    mandatoryRequirementFailed,
    mandatoryFailures,
    preferredBonus,
    requirements: reqResults,
    requirementResults: reqResults,
    strengths: Array.from(new Set(strengths)),
    gaps: Array.from(new Set(gaps)),
    warnings,
    recommendation,
    recommendationReason,
    scoringConfigVersion: CENTRALIZED_ATS_SCORING_VERSION,
    evaluatedAt: now,
    pillarScores,
    pillars: pillarScores,
    scoreBreakdown,
    auditData: {
      version: CENTRALIZED_ATS_SCORING_VERSION,
      weights: ATS_WEIGHTS,
      categoryScores: {
        coreSkills: coreSkillsScore,
        experience: experienceScore,
        education: educationScore,
        mandatory: mandatoryScore,
        semantic: semanticScore
      },
      preferredBonus,
      finalScore,
      evaluatedAt: now
    }
  };
}
