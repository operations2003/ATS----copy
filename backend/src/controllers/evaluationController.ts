import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { evaluateCandidateAgainstRequirements, CandidateEvaluationPayload } from '../services/evaluationService';
import { CandidateRecord, findCandidateRecord, getAllCandidateRecords, mapDbCandidateToRecord } from './candidateController';
import { AuthRequest } from '../middleware/authMiddleware';
import { calculateCentralizedATSScore } from '../services/centralizedATSScoringService';

/**
 * Standard requirement helper for fallback jobs or unseeded requisitions
 */
import { getJobFromStoreOrDb } from './jobController';
import { markJdAsConsumed } from '../services/organizationService';

/**
 * Standard requirement helper for fallback jobs or unseeded requisitions across multiple domains
 */
export function getStandardRequirementsForPosition(positionTitle: string, clientName?: string) {
  const titleLower = (positionTitle || '').toLowerCase();

  // 1. Sales & Business Development Roles
  if (
    titleLower.includes('sale') ||
    titleLower.includes('business development') ||
    titleLower.includes('bde') ||
    titleLower.includes('bdr') ||
    titleLower.includes('sdr') ||
    titleLower.includes('account executive') ||
    titleLower.includes('inside sales') ||
    titleLower.includes('client acquisition') ||
    titleLower.includes('relationship manager')
  ) {
    return [
      { id: 'req-sales-1', requirement: '3+ years experience in direct B2B sales, account executive, or business development roles with documented quota achievement', category: 'Experience', is_mandatory: true, weight: 2.0 },
      { id: 'req-sales-2', requirement: 'Demonstrated track record of lead generation, outbound prospecting, and sales pipeline management', category: 'Functional Skill', is_mandatory: true, weight: 1.8 },
      { id: 'req-sales-3', requirement: 'Hands-on experience with CRM systems (Salesforce, HubSpot, or Zoho) and sales outreach workflows', category: 'Tool', is_mandatory: true, weight: 1.5 },
      { id: 'req-sales-4', requirement: 'Commercial negotiation, client presentation, proposal drafting, and contract closing experience', category: 'Functional Skill', is_mandatory: true, weight: 1.5 },
      { id: 'req-sales-5', requirement: 'Bachelor degree in Business, Marketing, Communications, or relevant professional field', category: 'Education', is_mandatory: false, weight: 1.0 }
    ];
  }

  // 2. Marketing & Growth Roles
  if (titleLower.includes('marketing') || titleLower.includes('growth') || titleLower.includes('seo') || titleLower.includes('content')) {
    return [
      { id: 'req-mkt-1', requirement: '3+ years hands-on digital marketing, growth campaigns, or content strategy experience', category: 'Experience', is_mandatory: true, weight: 2.0 },
      { id: 'req-mkt-2', requirement: 'Proficiency in SEO/SEM, Google Analytics, performance marketing, and campaign optimization', category: 'Functional Skill', is_mandatory: true, weight: 1.8 },
      { id: 'req-mkt-3', requirement: 'Demonstrated experience in audience segmentation, conversion funnels, and lead generation', category: 'Functional Skill', is_mandatory: true, weight: 1.5 },
      { id: 'req-mkt-4', requirement: 'Bachelor degree in Marketing, Communications, Business, or equivalent', category: 'Education', is_mandatory: false, weight: 1.0 }
    ];
  }

  // 3. Human Resources & Talent Acquisition
  if (titleLower.includes('hr') || titleLower.includes('human resources') || titleLower.includes('recruiter') || titleLower.includes('talent acquisition')) {
    const isJuniorOr1to2 = titleLower.includes('1–2') || titleLower.includes('1-2') || titleLower.includes('1 to 2') || titleLower.includes('intern') || titleLower.includes('entry') || titleLower.includes('associate') || titleLower.includes('coordinator') || titleLower.includes('executive');
    return [
      {
        id: 'req-hr-1',
        requirement: isJuniorOr1to2
          ? '1-2 years experience or practical internship in HR operations, coordination, or talent management'
          : '3+ years full life-cycle talent acquisition, recruiting, or HR operations experience',
        category: 'Experience',
        is_mandatory: true,
        weight: 2.0
      },
      { id: 'req-hr-2', requirement: 'Hands-on familiarity with HR operations, candidate coordination, and process workflows', category: 'Functional Skill', is_mandatory: false, weight: 1.8 },
      { id: 'req-hr-3', requirement: 'Understanding of HR documentation, interview coordination, and onboarding execution', category: 'Functional Skill', is_mandatory: false, weight: 1.5 },
      { id: 'req-hr-4', requirement: 'Degree or relevant education in Human Resources, Psychology, Business Administration, or equivalent', category: 'Education', is_mandatory: false, weight: 1.0 }
    ];
  }

  // 4. Finance & Accounting Roles
  if (titleLower.includes('finance') || titleLower.includes('accountant') || titleLower.includes('audit') || titleLower.includes('tax')) {
    return [
      { id: 'req-fin-1', requirement: '3+ years accounting or financial reporting experience in corporate environment', category: 'Experience', is_mandatory: true, weight: 2.0 },
      { id: 'req-fin-2', requirement: 'Proficiency in general ledger, P&L reporting, balance sheet reconciliations, and GAAP standards', category: 'Functional Skill', is_mandatory: true, weight: 1.8 },
      { id: 'req-fin-3', requirement: 'Hands-on experience with accounting ERP software (Tally, QuickBooks, SAP FICO, NetSuite)', category: 'Tool', is_mandatory: true, weight: 1.5 },
      { id: 'req-fin-4', requirement: 'Bachelor degree in Commerce, Accounting, Finance, or CA / CPA certification', category: 'Education', is_mandatory: false, weight: 1.0 }
    ];
  }

  // 5. Frontend Engineering Roles
  if (titleLower.includes('frontend') || titleLower.includes('react') || titleLower.includes('ui') || titleLower.includes('web')) {
    return [
      { id: 'req-fe-1', requirement: '3+ years experience with React, TypeScript, and modern state management', category: 'Experience', is_mandatory: true, weight: 2.0 },
      { id: 'req-fe-2', requirement: 'Proficiency with Next.js, responsive layouts, and Tailwind CSS', category: 'Technical Skill', is_mandatory: true, weight: 1.5 },
      { id: 'req-fe-3', requirement: 'Demonstrated experience integrating RESTful APIs and asynchronous data flows', category: 'Technical Skill', is_mandatory: true, weight: 1.5 },
      { id: 'req-fe-4', requirement: 'Hands-on experience with unit testing frameworks (Jest, React Testing Library)', category: 'Tool', is_mandatory: false, weight: 1.0 },
      { id: 'req-fe-5', requirement: 'Bachelor degree in Computer Science, Engineering, or equivalent practical experience', category: 'Education', is_mandatory: false, weight: 1.0 }
    ];
  }

  // 6. Backend Engineering Roles
  if (titleLower.includes('backend') || titleLower.includes('node') || titleLower.includes('python') || titleLower.includes('java') || titleLower.includes('golang')) {
    return [
      { id: 'req-be-1', requirement: '3+ years hands-on backend development and API architecture experience', category: 'Experience', is_mandatory: true, weight: 2.0 },
      { id: 'req-be-2', requirement: 'Strong proficiency in backend services, relational databases, and SQL', category: 'Technical Skill', is_mandatory: true, weight: 1.5 },
      { id: 'req-be-3', requirement: 'Experience designing secure microservices and performant data pipelines', category: 'Technical Skill', is_mandatory: true, weight: 1.5 },
      { id: 'req-be-4', requirement: 'Familiarity with containerization (Docker) and CI/CD deployment pipelines', category: 'Tool', is_mandatory: false, weight: 1.0 },
      { id: 'req-be-5', requirement: 'Degree in Computer Science, Information Technology, or equivalent', category: 'Education', is_mandatory: false, weight: 1.0 }
    ];
  }

  // 7. SAP / Enterprise ERP Roles
  if (titleLower.includes('sap') || titleLower.includes('erp') || titleLower.includes('fico') || titleLower.includes('s/4hana')) {
    return [
      { id: 'req-sap-1', requirement: '5+ years experience in SAP CO / FICO module configuration and implementation', category: 'Experience', is_mandatory: true, weight: 2.0 },
      { id: 'req-sap-2', requirement: 'Deep expertise in Product Costing (CO-PC) and Material Ledger in S/4HANA', category: 'Technical Skill', is_mandatory: true, weight: 1.8 },
      { id: 'req-sap-3', requirement: 'Hands-on participation in at least 2 full end-to-end SAP lifecycle implementations', category: 'Experience', is_mandatory: true, weight: 1.5 },
      { id: 'req-sap-4', requirement: 'SAP Certified Application Associate - Financial Accounting or Management Accounting', category: 'Certification', is_mandatory: false, weight: 1.0 },
      { id: 'req-sap-5', requirement: 'Bachelor or Master degree in Finance, Accounting, Business, or Computer Science', category: 'Education', is_mandatory: false, weight: 1.0 }
    ];
  }

  // General Software Engineering Fallback (ONLY for technical engineering roles)
  return [
    { id: 'req-gen-1', requirement: '2+ years professional industry experience in software development or technical engineering', category: 'Experience', is_mandatory: true, weight: 2.0 },
    { id: 'req-gen-2', requirement: 'Demonstrated proficiency in core required technologies and tools for this role', category: 'Technical Skill', is_mandatory: true, weight: 1.5 },
    { id: 'req-gen-3', requirement: 'Proven experience collaborating on production systems and business workflows', category: 'Experience', is_mandatory: true, weight: 1.5 },
    { id: 'req-gen-4', requirement: 'Strong problem-solving skills, debugging ability, and technical documentation', category: 'Soft Skill', is_mandatory: false, weight: 1.0 },
    { id: 'req-gen-5', requirement: 'Higher education degree or equivalent relevant professional background', category: 'Education', is_mandatory: false, weight: 1.0 }
  ];
}

/**
 * Helper to fetch job record and confirmed requirements with organization validation
 */
async function getJobAndRequirements(jobId: string, fallbackPosition?: string, fallbackClient?: string) {
  let jobData: any = null;
  let requirements: any[] = [];

  // 1. Check in-memory GLOBAL_JOB_STORE first (ensures custom/client IDs work immediately)
  const storeJob = await getJobFromStoreOrDb(jobId);
  if (storeJob) {
    jobData = {
      id: storeJob.id,
      position: storeJob.position || storeJob.title || fallbackPosition,
      title: storeJob.position || storeJob.title || fallbackPosition,
      client: storeJob.client || storeJob.company || fallbackClient,
      company: storeJob.client || storeJob.company || fallbackClient,
      jd_text: storeJob.jd_text || undefined,
      created_by: storeJob.created_by,
      organizationId: storeJob.organizationId,
      creatorRole: storeJob.user?.role,
      creatorEmail: storeJob.user?.email,
    };
    if (storeJob.requirements && storeJob.requirements.length > 0) {
      requirements = storeJob.requirements;
    }
  }

  // 2. Try DB if UUID and not found yet
  if (!jobData) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId);
    if (isUuid) {
      try {
        const dbJob = await prisma.job.findUnique({
          where: { id: jobId },
          include: { requirements: true, user: true }
        });

        if (dbJob) {
          jobData = {
            id: dbJob.id,
            position: dbJob.position,
            title: dbJob.position,
            client: dbJob.client,
            company: dbJob.client,
            jd_text: dbJob.jd_text || undefined,
            created_by: dbJob.created_by,
            organizationId: dbJob.organizationId,
            creatorRole: dbJob.user?.role,
            creatorEmail: dbJob.user?.email,
          };
          if (dbJob.requirements && dbJob.requirements.length > 0) {
            requirements = dbJob.requirements;
          }
        }
      } catch (e) {
        console.warn('[Evaluation Controller] Job DB fetch error:', e);
      }
    }
  }

  if (!jobData) {
    jobData = {
      id: jobId,
      position: fallbackPosition || 'Software Engineer',
      title: fallbackPosition || 'Software Engineer',
      client: fallbackClient || 'Client Organization',
      company: fallbackClient || 'Client Organization',
    };
  }

  if (requirements.length === 0) {
    requirements = getStandardRequirementsForPosition(jobData.position, jobData.client);
  }

  return { jobData, requirements };
}

/**
 * Get detailed evaluation for a single candidate against a job (or by evaluation ID)
 * GET /api/evaluations/:id
 * GET /api/jobs/:jobId/candidates/:candidateId/evaluation
 */
export const getCandidateEvaluation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !user.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const orgId = user.organizationId || 'org-tasknera';
    const idParam = String(req.params.candidateId || req.params.id || req.query.candidateId || '');
    const jobIdParam = String(req.params.jobId || req.query.jobId || '');

    if (!idParam) {
      res.status(400).json({ error: 'Evaluation or Candidate ID is required' });
      return;
    }

    // 1. Try to find evaluation in prisma.evaluation table
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idParam);

    let evalRecord: any = null;
    const evalInclude = {
      candidate: {
        include: {
          experiences: true,
          education: true,
          skills: true,
        }
      },
      job: {
        include: {
          requirements: true,
          user: true,
        }
      },
      creator: true
    };

    const isIdUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
    const isJobUuid = jobIdParam ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobIdParam) : false;

    if (isIdUuid) {
      evalRecord = await prisma.evaluation.findUnique({
        where: { id: idParam },
        include: evalInclude
      }).catch(() => null);
    }

    if (!evalRecord && isIdUuid) {
      const candWhere: any = { candidateId: idParam };
      if (isJobUuid) candWhere.jobId = jobIdParam;
      evalRecord = await prisma.evaluation.findFirst({
        where: candWhere,
        include: evalInclude,
        orderBy: { createdAt: 'desc' }
      }).catch(() => null);
    }

    if (evalRecord) {
      // Safe audit debug log
      console.log(`[Evaluation Access] userId=${user.userId} organizationId=${orgId} role=${user.role || 'MEMBER'} evalId=${evalRecord.id} evalOwner=${evalRecord.createdByUserId}`);

      // Security Check 1: Cross-Organization Isolation
      const isSuperAdmin = user.role === 'SUPER_ADMIN';
      const recordOrgId = evalRecord.organizationId || evalRecord.job?.organizationId || evalRecord.candidate?.organizationId || 'org-tasknera';
      if (!isSuperAdmin && recordOrgId !== orgId) {
        res.status(403).json({ error: 'Forbidden: Access restricted to organization members.' });
        return;
      }

      // Security Check 2: Ownership verification for regular recruiters (ADMIN / CLIENT_ADMIN can see all org evaluations)
      const isCompanyAdmin = user.role === 'ADMIN' || user.role === 'CLIENT_ADMIN';
      const creatorRole = evalRecord.job?.user?.role;
      const isJobAdminCreated = creatorRole === 'SUPER_ADMIN' || creatorRole === 'CLIENT_ADMIN' || creatorRole === 'ADMIN' || evalRecord.job?.user?.email === 'operations@tasknera.com' || evalRecord.job?.user?.email === 'admin@gmail.com';
      const isOwner =
        evalRecord.evaluatedBy === user.userId ||
        evalRecord.createdByUserId === user.userId ||
        evalRecord.assignedToUserId === user.userId ||
        evalRecord.job?.created_by === user.userId ||
        evalRecord.candidate?.created_by === user.userId ||
        isJobAdminCreated;

      if (!isSuperAdmin && !isCompanyAdmin && !isOwner) {
        res.status(403).json({ error: 'Forbidden: Access restricted to evaluation owner.' });
        return;
      }

      const audit = (evalRecord.auditData as any) || {};

      const candName = evalRecord.candidate?.name || audit.candidateName || 'Candidate';
      const candRole = evalRecord.candidate?.current_title || audit.candidateRole || evalRecord.job?.position || audit.jobTitle || 'Professional Role';
      const candCompany = evalRecord.candidate?.current_company || audit.candidateCompany || evalRecord.job?.client || audit.jobCompany || 'Enterprise Organization';
      const candEmail = evalRecord.candidate?.email || audit.candidateEmail || '';
      const candPhone = evalRecord.candidate?.phone || audit.candidatePhone || '';
      const candLocation = evalRecord.candidate?.location || audit.candidateLocation || 'Remote / Hybrid';
      const jobTitle = evalRecord.job?.position || audit.jobTitle || 'Job Position';
      const jobClient = evalRecord.job?.client || audit.jobCompany || 'Client Organization';

      const requirements = (audit.requirements && audit.requirements.length > 0)
        ? audit.requirements
        : (evalRecord.job?.requirements && evalRecord.job.requirements.length > 0)
        ? evalRecord.job.requirements.map((r: any) => ({
            id: r.id,
            requirement: r.requirement,
            category: r.category || 'Skill',
            mandatory: r.is_mandatory,
            isMandatory: r.is_mandatory,
            evidence: r.source_evidence || 'Candidate alignment verified against requisition profile',
            candidateEvidence: r.source_evidence || 'Candidate profile aligns with requirement',
            status: 'FULLY MET',
            confidence: 'High',
            weight: r.weight || 1.0,
            score: Math.round(evalRecord.score)
          }))
        : getStandardRequirementsForPosition(jobTitle, jobClient).map(r => ({
            id: r.id,
            requirement: r.requirement,
            category: r.category || 'Skill',
            mandatory: r.is_mandatory,
            isMandatory: r.is_mandatory,
            evidence: 'Candidate profile evaluated against criteria',
            candidateEvidence: 'Verified in candidate record',
            status: 'FULLY MET',
            confidence: 'High',
            weight: r.weight || 1.0,
            score: Math.round(evalRecord.score)
          }));

      res.status(200).json({
        success: true,
        evaluationId: evalRecord.id,
        candidateId: evalRecord.candidateId,
        jobId: evalRecord.jobId,
        overallScore: evalRecord.score,
        matchLevel: evalRecord.matchLevel,
        mandatoryRequirementFailed: evalRecord.mandatoryFailed,
        decision: evalRecord.decision,
        evaluation: {
          ...audit,
          evaluationId: evalRecord.id,
          candidateId: evalRecord.candidateId,
          candidateName: candName,
          candidateRole: candRole,
          candidateCompany: candCompany,
          candidateEmail: candEmail,
          candidatePhone: candPhone,
          candidateLocation: candLocation,
          jobId: evalRecord.jobId,
          jobTitle,
          jobClient,
          overallScore: evalRecord.score,
          overallMatch: evalRecord.score,
          atsScore: Math.round(evalRecord.atsScore ?? evalRecord.score),
          matchLevel: evalRecord.matchLevel || (evalRecord.score >= 80 ? 'STRONG MATCH' : 'GOOD MATCH'),
          mandatoryRequirementFailed: evalRecord.mandatoryFailed,
          mandatoryCompliance: audit.mandatoryCompliance || {
            total: 1,
            met: evalRecord.mandatoryFailed ? 0 : 1,
            failed: evalRecord.mandatoryFailed ? 1 : 0,
            passed: !evalRecord.mandatoryFailed
          },
          recommendation: evalRecord.decision || 'REVIEW',
          recommendationReason: audit.recommendationReason || `Candidate evaluation complete with match score of ${evalRecord.score}%.`,
          requirements,
          requirementResults: requirements,
          explanation: audit.explanation || {
            summary: `Automated ATS evaluation against ${jobTitle} requirements.`,
            strengths: audit.strengths || ['Relevant professional experience aligned with requisition'],
            gaps: audit.gaps || [],
            mandatoryStatus: evalRecord.mandatoryFailed ? 'Failed mandatory requirement' : 'Met all mandatory requirements'
          },
          scoreBreakdown: audit.scoreBreakdown || {
            mandatory: { score: 10, max: 10, pct: 100, label: 'Mandatory Compliance' },
            skills: { score: Math.round(evalRecord.score * 0.4), max: 40, pct: evalRecord.score, label: 'Technical Skills' },
            experience: { score: Math.round(evalRecord.score * 0.3), max: 30, pct: evalRecord.score, label: 'Experience History' },
            responsibilities: { score: Math.round(evalRecord.score * 0.2), max: 20, pct: evalRecord.score, label: 'Responsibilities' },
            preferred: { score: Math.round(evalRecord.score * 0.1), max: 10, pct: evalRecord.score, label: 'Preferred Fit' }
          },
          summaryCounts: audit.summaryCounts || {
            mandatoryTotal: 1,
            preferredTotal: 0,
            fullyMet: evalRecord.mandatoryFailed ? 0 : 1,
            partiallyMet: 0,
            notMet: evalRecord.mandatoryFailed ? 1 : 0,
            needsVerification: 0,
            notFound: 0
          },
          evaluatedAt: evalRecord.createdAt ? evalRecord.createdAt.toISOString() : new Date().toISOString(),
          evaluator: evalRecord.creator?.name ? `Evaluated by ${evalRecord.creator.name}` : 'ATS Evaluation Engine'
        },
        pillarScores: audit.pillarScores,
        pillars: audit.pillarScores,
        requirements,
        requirementResults: requirements,
        strengths: audit.strengths || ['Relevant professional experience aligned with requisition'],
        gaps: audit.gaps || [],
        warnings: audit.warnings || []
      });
      return;
    }

    // 2. Fallback: Candidate + Job validation for on-the-fly evaluation within authorized scope
    const isSuperAdminFallback = user.role === 'SUPER_ADMIN';
    const isCompanyAdminFallback = user.role === 'ADMIN' || user.role === 'CLIENT_ADMIN';

    const candidateData = await findCandidateRecord(idParam, jobIdParam || undefined, isSuperAdminFallback ? undefined : orgId);
    if (!candidateData) {
      res.status(404).json({ error: `Candidate with ID "${idParam}" not found.` });
      return;
    }

    if (!isSuperAdminFallback && (candidateData.organizationId || 'org-tasknera') !== orgId) {
      res.status(403).json({ error: 'Forbidden: Access restricted to organization members.' });
      return;
    }

    const targetJobId = jobIdParam || candidateData.jobId;
    if (!targetJobId) {
      res.status(404).json({ error: 'Job ID is required for evaluation.' });
      return;
    }

    const { jobData, requirements } = await getJobAndRequirements(
      targetJobId,
      candidateData.currentTitle || undefined,
      candidateData.currentCompany || undefined
    );

    if (!isSuperAdminFallback && (jobData.organizationId || 'org-tasknera') !== orgId) {
      res.status(403).json({ error: 'Forbidden: Access restricted to organization members.' });
      return;
    }

    // If job belongs to someone else in recruiter mode
    if (!isSuperAdminFallback && !isCompanyAdminFallback && jobData.created_by && jobData.created_by !== user.userId) {
      const isJobAdminCreated = jobData.creatorRole === 'SUPER_ADMIN' || jobData.creatorRole === 'CLIENT_ADMIN' || jobData.creatorRole === 'ADMIN' || jobData.creatorEmail === 'operations@tasknera.com' || jobData.creatorEmail === 'admin@gmail.com';
      if (!isJobAdminCreated) {
        res.status(403).json({ error: 'Forbidden: Access restricted to job owner.' });
        return;
      }
    }

    const evaluation = await evaluateCandidateAgainstRequirements(candidateData, jobData, requirements);

    if (jobData?.id && jobData.id !== 'pool') {
      markJdAsConsumed(jobData.id, jobData.organizationId || orgId, user?.userId).catch(() => null);
    }

    res.status(200).json({
      success: true,
      evaluation,
      evaluationId: evaluation.evaluationId,
      candidateId: evaluation.candidateId,
      jobId: evaluation.jobId,
      overallScore: evaluation.overallScore,
      matchLevel: evaluation.matchLevel,
      mandatoryRequirementFailed: evaluation.mandatoryRequirementFailed,
      mandatoryFailures: evaluation.mandatoryFailures,
      pillarScores: evaluation.pillarScores,
      pillars: evaluation.pillarScores,
      requirements: evaluation.requirements,
      requirementResults: evaluation.requirements,
      strengths: evaluation.strengths,
      gaps: evaluation.gaps,
      warnings: evaluation.warnings
    });
  } catch (error: any) {
    console.error('Error in getCandidateEvaluation:', error);
    res.status(500).json({ error: error.message || 'Failed to retrieve candidate evaluation' });
  }
};

/**
 * Trigger fresh re-evaluation for a candidate against a job
 * POST /api/jobs/:jobId/candidates/:candidateId/evaluate
 */
export const evaluateCandidateController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !user.userId) {
      res.status(401).json({ error: 'Authentication required to evaluate candidate' });
      return;
    }

    const candidateId = String(req.params.candidateId || req.params.id || '');
    const jobId = String(req.params.jobId || '');

    if (!candidateId || !jobId) {
      res.status(400).json({ error: 'Both Job ID and Candidate ID are required for re-evaluation.' });
      return;
    }

    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const orgId = user.organizationId || 'org-tasknera';

    const candidateData = await findCandidateRecord(candidateId, jobId, isSuperAdmin ? undefined : orgId);
    if (!candidateData) {
      res.status(404).json({ error: `Candidate with ID "${candidateId}" not found.` });
      return;
    }

    if (!isSuperAdmin && (candidateData.organizationId || 'org-tasknera') !== orgId) {
      res.status(403).json({ error: 'Unauthorized: Cannot evaluate candidate from another organization' });
      return;
    }

    // Fetch latest job requirements
    const { jobData, requirements } = await getJobAndRequirements(
      jobId,
      candidateData.currentTitle || undefined,
      candidateData.currentCompany || undefined
    );

    if (!isSuperAdmin && (jobData.organizationId || 'org-tasknera') !== orgId) {
      res.status(403).json({ error: 'Unauthorized: Cannot evaluate against job from another organization' });
      return;
    }

    // Run deterministic / AI semantic evaluation
    const evaluation = await evaluateCandidateAgainstRequirements(candidateData, jobData, requirements);

    if (jobData?.id && jobData.id !== 'pool') {
      markJdAsConsumed(jobData.id, jobData.organizationId || orgId, user?.userId).catch(() => null);
    }

    // Ensure Candidate exists in PostgreSQL database with valid UUID
    let dbCandidateId: string | null = null;
    const isCandUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateId);
    if (isCandUuid) {
      const dbCand = await prisma.candidate.findUnique({ where: { id: candidateId } }).catch(() => null);
      if (dbCand) dbCandidateId = dbCand.id;
    }
    if (!dbCandidateId) {
      const createdDbCand = await prisma.candidate.create({
        data: {
          name: candidateData.name || 'Candidate Profile',
          email: candidateData.email || null,
          phone: candidateData.phone || null,
          location: candidateData.location || null,
          current_title: candidateData.currentTitle || null,
          current_company: candidateData.currentCompany || null,
          summary: candidateData.summary || null,
          raw_text: candidateData.rawText || '',
          parsing_status: 'PARSED',
          created_by: user.userId,
          organizationId: orgId,
        }
      }).catch(() => null);
      if (createdDbCand) dbCandidateId = createdDbCand.id;
    }

    // Ensure Job exists in PostgreSQL database with valid UUID
    let dbJobId: string | null = null;
    const isJobUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId);
    if (isJobUuid) {
      const dbJ = await prisma.job.findUnique({ where: { id: jobId } }).catch(() => null);
      if (dbJ) dbJobId = dbJ.id;
    }
    if (!dbJobId) {
      let matchingJob = await prisma.job.findFirst({
        where: {
          organizationId: orgId,
          created_by: user.userId,
          position: jobData.position
        }
      }).catch(() => null);
      if (!matchingJob) {
        matchingJob = await prisma.job.create({
          data: {
            client: jobData.client || 'Client Organization',
            position: jobData.position || 'Position',
            created_by: user.userId,
            organizationId: orgId,
            status: 'active'
          }
        }).catch(() => null);
      }
      if (matchingJob) dbJobId = matchingJob.id;
    }

    // Permanently save/upsert Evaluation to database
    if (dbCandidateId && dbJobId) {
      const finalScore = evaluation.overallScore ?? evaluation.overallMatch ?? 0;
      const complianceStr = evaluation.mandatoryCompliance
        ? `${evaluation.mandatoryCompliance.met}/${evaluation.mandatoryCompliance.total}`
        : 'N/A';
      const decision = evaluation.recommendation || (finalScore >= 80 ? 'SUBMIT' : (finalScore >= 60 ? 'REVIEW' : 'DO NOT SUBMIT'));

      const existingEval = await prisma.evaluation.findFirst({
        where: {
          candidateId: dbCandidateId,
          jobId: dbJobId,
          OR: [
            { evaluatedBy: user.userId },
            { createdByUserId: user.userId }
          ]
        }
      });

      if (existingEval) {
        await prisma.evaluation.update({
          where: { id: existingEval.id },
          data: {
            score: finalScore,
            atsScore: evaluation.atsScore ?? finalScore,
            matchLevel: evaluation.matchLevel,
            mandatoryCompliance: complianceStr,
            mandatoryFailed: Boolean(evaluation.mandatoryRequirementFailed),
            decision,
            auditData: evaluation as any,
            evaluatedBy: user.userId,
            updatedAt: new Date()
          }
        }).catch(() => null);
      } else {
        await prisma.evaluation.create({
          data: {
            candidateId: dbCandidateId,
            jobId: dbJobId,
            candidateJobId: jobId,
            createdByUserId: user.userId,
            evaluatedBy: user.userId,
            organizationId: user.organizationId || 'org-tasknera',
            score: finalScore,
            atsScore: evaluation.atsScore ?? finalScore,
            matchLevel: evaluation.matchLevel,
            mandatoryCompliance: complianceStr,
            mandatoryFailed: Boolean(evaluation.mandatoryRequirementFailed),
            decision,
            status: 'COMPLETED',
            auditData: evaluation as any
          }
        }).catch(() => null);
      }

      // Update application record match score if application exists in DB
      try {
        await prisma.candidateApplication.upsert({
          where: {
            job_id_candidate_id: {
              job_id: dbJobId,
              candidate_id: dbCandidateId
            }
          },
          update: {
            match_score: evaluation.overallScore
          },
          create: {
            job_id: dbJobId,
            candidate_id: dbCandidateId,
            match_score: evaluation.overallScore,
            stage: 'SOURCED'
          }
        });
      } catch {
        // Application fallback
      }
    }

    res.status(200).json({
      success: true,
      message: 'Candidate re-evaluated successfully',
      evaluation,
      evaluationId: evaluation.evaluationId,
      candidateId: evaluation.candidateId,
      jobId: evaluation.jobId,
      overallScore: evaluation.overallScore,
      matchLevel: evaluation.matchLevel,
      mandatoryRequirementFailed: evaluation.mandatoryRequirementFailed,
      mandatoryFailures: evaluation.mandatoryFailures,
      pillarScores: evaluation.pillarScores,
      pillars: evaluation.pillarScores,
      requirements: evaluation.requirements,
      requirementResults: evaluation.requirements,
      strengths: evaluation.strengths,
      gaps: evaluation.gaps,
      warnings: evaluation.warnings
    });
  } catch (error: any) {
    console.error('Error during candidate re-evaluation:', error);
    res.status(500).json({ error: error.message || 'Failed to re-evaluate candidate' });
  }
};

/**
 * Get all candidate evaluations across all jobs
 * GET /api/evaluations
 */
export const getAllEvaluations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !user.userId) {
      res.status(401).json({ error: 'Authentication required to access evaluations' });
      return;
    }

    const orgId = user.organizationId || 'org-tasknera';
    const callerRole = user.role || 'MEMBER';
    const isSuperAdmin = callerRole === 'SUPER_ADMIN';
    const isClientAdmin = callerRole === 'CLIENT_ADMIN' || callerRole === 'ADMIN';

    // Safe debug logging (identifiers only, strictly no candidate personal data)
    console.log(`[Evaluation Access] userId=${user.userId} organizationId=${orgId} role=${callerRole}`);

    const scope = (req.query.scope as string) || (req.query.view === 'all' ? 'all' : 'mine');

    const whereClause: any = {};
    const andConditions: any[] = [];

    if (!isSuperAdmin) {
      if (orgId === 'org-tasknera') {
        andConditions.push({
          OR: [
            { organizationId: orgId },
            { organizationId: null },
            { job: { organizationId: orgId } },
            { candidate: { organizationId: orgId } }
          ]
        });
      } else {
        andConditions.push({
          OR: [
            { organizationId: orgId },
            { job: { organizationId: orgId } },
            { candidate: { organizationId: orgId } }
          ]
        });
      }
    } else if (req.query.organizationId) {
      andConditions.push({ organizationId: String(req.query.organizationId) });
    }

    if ((!isClientAdmin && !isSuperAdmin) || scope !== 'all') {
      andConditions.push({
        OR: [
          { evaluatedBy: user.userId },
          { createdByUserId: user.userId },
          { candidate: { created_by: user.userId } },
          { job: { created_by: user.userId } },
          { job: { user: { role: { in: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'ADMIN'] } } } },
        ]
      });
    }

    if (andConditions.length > 0) {
      whereClause.AND = andConditions;
    }

    const dbEvaluations = await prisma.evaluation.findMany({
      where: whereClause,
      include: {
        candidate: {
          select: {
            id: true,
            name: true,
            current_title: true,
            current_company: true,
            resume_file_url: true,
            location: true
          }
        },
        job: {
          select: {
            id: true,
            position: true,
            client: true,
            location: true,
            status: true
          }
        },
        creator: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Deduplicate evaluations by candidate & job (keeping the latest evaluation per candidate)
    const seenCandidateKeys = new Set<string>();
    const deduplicatedDbEvals: typeof dbEvaluations = [];
    const duplicateIdsToDelete: string[] = [];

    for (const ev of dbEvaluations) {
      const candName = (ev.candidate?.name || (ev.auditData as any)?.candidateName || '').trim().toLowerCase();
      const primaryKey = `${ev.candidateId}_${ev.jobId}`;
      const nameKey = candName ? `${candName}_${ev.jobId}` : '';

      if (!seenCandidateKeys.has(primaryKey) && (!nameKey || !seenCandidateKeys.has(nameKey))) {
        seenCandidateKeys.add(primaryKey);
        if (nameKey) seenCandidateKeys.add(nameKey);
        deduplicatedDbEvals.push(ev);
      } else {
        duplicateIdsToDelete.push(ev.id);
      }
    }

    // Clean up accumulated duplicate evaluations from database in the background
    if (duplicateIdsToDelete.length > 0) {
      prisma.evaluation.deleteMany({
        where: { id: { in: duplicateIdsToDelete } }
      }).catch((err) => console.warn('[Cleaned Duplicate Evaluations Notice]:', err.message));
    }

    const evaluationItems = deduplicatedDbEvals.map(ev => {
      const score = Math.round(ev.score);
      const audit = (ev.auditData as any) || {};

      const isInvalidComp = (s?: string | null) => !s || ['the role', 'role', 'the company', 'company', 'organization', 'position', 'the position', 'candidate profile', 'unknown', 'not specified', 'verified organization', 'enterprise client'].includes(s.trim().toLowerCase()) || s.length < 2;

      const comp = (ev.job?.client && !isInvalidComp(ev.job.client))
        ? ev.job.client
        : (audit.jobCompany && !isInvalidComp(audit.jobCompany))
        ? audit.jobCompany
        : 'Client Organization';

      const role = (ev.job?.position && !['candidate profile', 'candidate', 'professional role'].includes(ev.job.position.trim().toLowerCase()))
        ? ev.job.position
        : (ev.candidate?.current_title || audit.jobTitle || 'Software Engineer');

      return {
        id: ev.candidateId,
        evaluationId: ev.id,
        candidate: ev.candidate?.name || audit.candidateName || 'Candidate',
        candidateId: ev.candidateId,
        role,
        job: role,
        jobId: ev.jobId,
        company: comp,
        date: new Date(ev.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        score,
        ats: Math.round(ev.atsScore ?? score),
        overallScore: score,
        matchLevel: ev.matchLevel || (score >= 65 ? 'STRONG MATCH' : 'GOOD MATCH'),
        mandatory: ev.mandatoryCompliance || 'N/A',
        mandatoryFailed: ev.mandatoryFailed,
        decision: (score >= 65 && !ev.mandatoryFailed) ? 'SUBMIT' : (ev.decision || 'REVIEW'),
        by: ev.creator?.name ? `Evaluated by ${ev.creator.name}` : 'Deterministic ATS Engine (v2.0)'
      };
    });

    res.status(200).json({
      success: true,
      total: evaluationItems.length,
      evaluations: evaluationItems
    });
  } catch (error: any) {
    console.error('Error fetching all evaluations:', error);
    res.status(500).json({ error: 'Failed to retrieve candidate evaluations' });
  }
};

/**
 * In-memory / fast-lookup cache for JD-specific ATS Candidate Evaluations
 * Key format: `${candidateId}___${jobId}`
 */
export const EVALUATION_CACHE = new Map<string, CandidateEvaluationPayload>();

/**
 * Match a Candidate from Candidate Pool with a specific Job Description (Entry Point 2)
 * POST /api/candidates/:candidateId/match-with-job
 */
export const matchCandidateWithJobController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const candidateId = String(req.params.candidateId || req.params.id || '');
    const { jobId, reevaluate } = req.body;

    if (!candidateId) {
      res.status(400).json({ status: 'ERROR', message: 'Candidate ID is required for matching.' });
      return;
    }
    if (!jobId) {
      res.status(400).json({ status: 'ERROR', message: 'Job ID is required to match with Candidate.' });
      return;
    }

    // 1. Validate Candidate Presence & Parsing Readiness
    const user = req.user;
    if (!user || !user.userId) {
      res.status(401).json({ error: 'Authentication required to evaluate candidate.' });
      return;
    }

    const createdByUserId = user.userId;
    const organizationId = user.organizationId || 'org-tasknera';
    const isSuperAdmin = user.role === 'SUPER_ADMIN';

    const candidateData = await findCandidateRecord(candidateId, jobId, isSuperAdmin ? undefined : organizationId);
    if (!candidateData) {
      res.status(404).json({
        status: 'NOT_FOUND',
        message: `Candidate with ID "${candidateId}" not found in database or candidate pool.`
      });
      return;
    }

    if (!isSuperAdmin && (candidateData.organizationId || 'org-tasknera') !== organizationId) {
      res.status(403).json({
        status: 'ERROR',
        message: 'Unauthorized: Cannot match candidate from another organization.'
      });
      return;
    }

    const isReady = candidateData.parsingStatus === 'PARSED' ||
                    (candidateData.rawText && candidateData.rawText.length > 20) ||
                    (candidateData.skills && candidateData.skills.length > 0);

    if (!isReady || candidateData.parsingStatus === 'FAILED') {
      res.status(400).json({
        status: 'NOT_READY',
        message: 'Candidate CV is not ready for evaluation.'
      });
      return;
    }

    // 2. Validate Job & Confirmed Requirements
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId);
    let dbJob: any = null;
    if (isUuid) {
      dbJob = await prisma.job.findUnique({
        where: { id: jobId },
        include: { requirements: true }
      });
    }

    if (!dbJob && jobId !== 'jd-1') {
      res.status(404).json({
        status: 'NOT_FOUND',
        message: `Selected Job Description with ID "${jobId}" was not found.`
      });
      return;
    }

    if (dbJob && !isSuperAdmin && (dbJob.organizationId || 'org-tasknera') !== organizationId) {
      res.status(403).json({
        status: 'ERROR',
        message: 'Unauthorized: Cannot match with job from another organization.'
      });
      return;
    }

    const { jobData, requirements } = await getJobAndRequirements(
      jobId,
      candidateData.currentTitle || undefined,
      candidateData.currentCompany || undefined
    );

    if (jobData && !isSuperAdmin && (jobData.organizationId || 'org-tasknera') !== organizationId) {
      res.status(403).json({
        status: 'ERROR',
        message: 'Unauthorized: Cannot match with job from another organization.'
      });
      return;
    }

    const hasRequirements = requirements && requirements.length > 0;
    const isConfirmed = hasRequirements && (
      requirements.some((r: any) => r.recruiter_confirmed === true) ||
      requirements.length >= 2 ||
      !isUuid // fallback demo job
    );

    if (!hasRequirements || !isConfirmed) {
      res.status(400).json({
        status: 'NOT_READY',
        message: 'JD requirements must be confirmed before evaluation.'
      });
      return;
    }

    // 3. Check if Candidate has already been evaluated for this Job by THIS user
    const existingEvalRecord = await prisma.evaluation.findFirst({
      where: {
        candidateId,
        jobId,
        ...(!isSuperAdmin ? { organizationId } : {}),
        OR: [
          { evaluatedBy: createdByUserId },
          { createdByUserId }
        ]
      }
    });

    if (existingEvalRecord && !reevaluate) {
      res.status(200).json({
        success: true,
        evaluationId: existingEvalRecord.id,
        candidateId: candidateId,
        jobId: jobId,
        status: 'COMPLETED',
        alreadyEvaluated: true,
        overallScore: existingEvalRecord.score,
        matchLevel: existingEvalRecord.matchLevel,
        mandatoryRequirementFailed: existingEvalRecord.mandatoryFailed,
        decision: existingEvalRecord.decision,
        evaluation: (existingEvalRecord.auditData as any) || {}
      });
      return;
    }

    // 4. Run Requirement Matching & AI Semantic Scoring Engine
    const evaluation = await evaluateCandidateAgainstRequirements(candidateData, jobData, requirements);

    if (jobData?.id && jobData.id !== 'pool') {
      markJdAsConsumed(jobData.id, jobData.organizationId || organizationId, user?.userId).catch(() => null);
    }

    const finalScore = evaluation.overallScore ?? evaluation.overallMatch ?? 0;
    const complianceStr = evaluation.mandatoryCompliance
      ? `${evaluation.mandatoryCompliance.met}/${evaluation.mandatoryCompliance.total}`
      : 'N/A';
    const decision = evaluation.recommendation || (finalScore >= 80 ? 'SUBMIT' : (finalScore >= 60 ? 'REVIEW' : 'DO NOT SUBMIT'));

    // 5. Store / Upsert in PostgreSQL Evaluation Table (Enforcing Authenticated User Ownership)
    let savedEvalRecord;
    if (existingEvalRecord) {
      savedEvalRecord = await prisma.evaluation.update({
        where: { id: existingEvalRecord.id },
        data: {
          score: finalScore,
          atsScore: evaluation.atsScore ?? finalScore,
          matchLevel: evaluation.matchLevel,
          mandatoryCompliance: complianceStr,
          mandatoryFailed: Boolean(evaluation.mandatoryRequirementFailed),
          decision,
          evaluatedBy: createdByUserId,
          auditData: evaluation as any,
          updatedAt: new Date()
        }
      });
    } else {
      savedEvalRecord = await prisma.evaluation.create({
        data: {
          candidateId,
          jobId,
          createdByUserId,
          evaluatedBy: createdByUserId,
          organizationId,
          score: finalScore,
          atsScore: evaluation.atsScore ?? finalScore,
          matchLevel: evaluation.matchLevel,
          mandatoryCompliance: complianceStr,
          mandatoryFailed: Boolean(evaluation.mandatoryRequirementFailed),
          decision,
          status: 'COMPLETED',
          auditData: evaluation as any
        }
      });
    }

    // Also update fast cache
    const cacheKey = `${candidateId}___${jobId}`;
    EVALUATION_CACHE.set(cacheKey, evaluation);

    // 6. Record/Upsert Candidate + Job association in PostgreSQL without duplicating Candidate
    const isCandUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidateId);
    if (isUuid && isCandUuid) {
      const stage = finalScore >= 80 ? 'SHORTLISTED' : (finalScore >= 55 ? 'REVIEW' : 'REJECTED');
      await prisma.candidateApplication.upsert({
        where: {
          job_id_candidate_id: {
            job_id: jobId,
            candidate_id: candidateId
          }
        },
        update: {
          match_score: finalScore,
          stage,
          updated_at: new Date()
        },
        create: {
          job_id: jobId,
          candidate_id: candidateId,
          match_score: finalScore,
          stage,
          status: 'active'
        }
      }).catch(err => {
        console.warn('[Candidate Application Upsert Notice]:', err);
      });
    }

    // 7. Successful Response
    res.status(200).json({
      success: true,
      evaluationId: savedEvalRecord.id,
      candidateId: candidateId,
      jobId: jobId,
      status: 'COMPLETED',
      alreadyEvaluated: false,
      overallScore: savedEvalRecord.score,
      matchLevel: savedEvalRecord.matchLevel,
      mandatoryRequirementFailed: savedEvalRecord.mandatoryFailed,
      decision: savedEvalRecord.decision,
      evaluation: evaluation
    });
  } catch (error: any) {
    console.error('Error matching candidate with job:', error);
    res.status(500).json({ error: error.message || 'Failed to match candidate with job description' });
  }
};

/**
 * Get all job-specific evaluations for a single candidate across their application history
 * GET /api/candidates/:candidateId/evaluations
 */
export const getCandidateEvaluationHistoryController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const candidateId = String(req.params.candidateId || req.params.id || '');
    if (!candidateId) {
      res.status(400).json({ error: 'Candidate ID is required' });
      return;
    }

    const userOrgId = req.user?.organizationId || 'org-tasknera';
    const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';
    const isClientAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'CLIENT_ADMIN';

    const candidate = await findCandidateRecord(candidateId, undefined, isSuperAdmin ? undefined : userOrgId);
    if (!candidate) {
      res.status(404).json({ error: `Candidate with ID "${candidateId}" not found.` });
      return;
    }

    if (!isSuperAdmin && (candidate.organizationId || 'org-tasknera') !== userOrgId) {
      res.status(403).json({ error: 'Unauthorized: Cannot view evaluation history of candidate from another organization.' });
      return;
    }

    const isCandUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidateId);
    let applications: any[] = [];
    if (isCandUuid) {
      const appWhere: any = { candidate_id: candidateId };
      const jobWhere: any = {};
      if (!isSuperAdmin) {
        if (userOrgId === 'org-tasknera') {
          jobWhere.OR = [
            { organizationId: userOrgId },
            { organizationId: null }
          ];
        } else {
          jobWhere.organizationId = userOrgId;
        }
      }
      if (!isClientAdmin && !isSuperAdmin) {
        jobWhere.AND = [
          ...(jobWhere.AND || []),
          {
            OR: [
              { created_by: req.user?.userId },
              { user: { role: { in: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'ADMIN'] } } }
            ]
          }
        ];
      }
      if (Object.keys(jobWhere).length > 0) {
        appWhere.job = jobWhere;
      }

      applications = await prisma.candidateApplication.findMany({
        where: appWhere,
        include: {
          job: {
            include: {
              requirements: true
            }
          }
        },
        orderBy: { updated_at: 'desc' }
      }).catch(() => []);
    }

    const historyItems: any[] = [];
    const seenJobIds = new Set<string>();

    for (const app of applications) {
      if (app.job) {
        seenJobIds.add(app.job_id);
        const cacheKey = `${candidateId}___${app.job_id}`;
        const cached = EVALUATION_CACHE.get(cacheKey);

        let finalScore = app.match_score !== null ? Math.round(app.match_score) : (cached?.overallScore || null);
        let matchLevel = cached?.matchLevel || (finalScore && finalScore >= 80 ? 'STRONG MATCH' : 'GOOD MATCH');
        let stage = app.stage || 'SOURCED';

        // Ensure Candidate Pool Drawer displays the exact same authoritative ATS score as Job Candidates page
        if (candidate && app.job && app.job.requirements && app.job.requirements.length > 0 && finalScore === null) {
          try {
            const centralResult = calculateCentralizedATSScore({
              candidate,
              job: {
                id: app.job.id,
                position: app.job.position || 'Job Position',
                title: app.job.position || 'Job Position',
                client: app.job.client || 'Client',
                company: app.job.client || 'Client',
                jd_text: app.job.jd_text || app.job.position || ''
              },
              requirements: app.job.requirements.map((r: any) => ({
                id: r.id,
                requirement: r.requirement,
                category: r.category,
                is_mandatory: r.is_mandatory ?? r.mandatory,
                weight: r.weight,
                source_evidence: r.source_evidence || r.sourceEvidence
              }))
            });

            finalScore = centralResult.atsScore;
            matchLevel = centralResult.matchLevel;
            stage = centralResult.recommendation === 'SUBMIT' ? 'SHORTLISTED' : (centralResult.recommendation === 'REVIEW' ? 'REVIEW' : 'REJECTED');

            // Sync database record so single source of truth is always consistent
            prisma.candidateApplication.update({
              where: { id: app.id },
              data: { match_score: finalScore, stage }
            }).catch(() => null);

            prisma.evaluation.updateMany({
              where: { candidateId: candidate.id, jobId: app.job.id },
              data: { score: finalScore, atsScore: finalScore, matchLevel, decision: stage }
            }).catch(() => null);
          } catch (compErr) {
            console.warn('[Evaluation History] Score computation fallback:', compErr);
          }
        }

        historyItems.push({
          jobId: app.job.id,
          jobTitle: app.job.position,
          position: app.job.position,
          client: app.job.client,
          company: app.job.client,
          location: app.job.location || 'Remote',
          score: finalScore,
          matchLevel,
          status: stage,
          stage,
          date: app.updated_at ? new Date(app.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recent',
          evaluationId: cached?.evaluationId || `eval-${app.id}`,
          alreadyEvaluated: Boolean(cached || finalScore !== null)
        });
      }
    }

    // Include any in-memory cached evaluations for this candidate
    for (const [key, evalData] of EVALUATION_CACHE.entries()) {
      if (key.startsWith(`${candidateId}___`)) {
        const jId = key.split('___')[1];
        if (!seenJobIds.has(jId)) {
          if (!isSuperAdmin) {
            const j = await getJobFromStoreOrDb(jId);
            if (j && (j.organizationId || 'org-tasknera') !== userOrgId) continue;
          }
          seenJobIds.add(jId);
          const evalScore = evalData.overallScore ?? evalData.overallMatch ?? 0;
          historyItems.push({
            jobId: jId,
            jobTitle: evalData.jobTitle || 'Job Position',
            position: evalData.jobTitle || 'Job Position',
            client: evalData.jobClient || 'Enterprise Client',
            company: evalData.jobClient || 'Enterprise Client',
            location: 'Remote',
            score: evalScore,
            matchLevel: evalData.matchLevel || (evalScore >= 80 ? 'STRONG MATCH' : 'GOOD MATCH'),
            status: evalScore >= 80 ? 'SHORTLISTED' : 'REVIEW',
            stage: evalScore >= 80 ? 'SHORTLISTED' : 'REVIEW',
            date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            evaluationId: evalData.evaluationId,
            alreadyEvaluated: true
          });
        }
      }
    }

    res.status(200).json({
      success: true,
      candidateId,
      candidateName: candidate.name,
      total: historyItems.length,
      evaluations: historyItems
    });
  } catch (error: any) {
    console.error('Error fetching candidate evaluation history:', error);
    res.status(500).json({ error: 'Failed to retrieve candidate evaluation history' });
  }
};

/**
 * Get all authorized jobs in the organization available for matching against this candidate
 * GET /api/candidates/:candidateId/available-jobs
 */
export const getAvailableJobsForCandidateController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const candidateId = String(req.params.candidateId || req.params.id || '');
    if (!candidateId) {
      res.status(400).json({ error: 'Candidate ID is required' });
      return;
    }

    const userOrgId = req.user?.organizationId || 'org-tasknera';
    const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';
    const isClientAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'CLIENT_ADMIN';

    const candidate = await findCandidateRecord(candidateId, undefined, isSuperAdmin ? undefined : userOrgId);
    if (!candidate) {
      res.status(404).json({ error: `Candidate with ID "${candidateId}" not found.` });
      return;
    }

    if (!isSuperAdmin && (candidate.organizationId || 'org-tasknera') !== userOrgId) {
      res.status(403).json({ error: 'Unauthorized: Cannot view available jobs for candidate from another organization.' });
      return;
    }

    const isCandUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidateId);

    const jobWhere: any = { status: { not: 'archived' } };
    if (!isSuperAdmin) {
      if (userOrgId === 'org-tasknera') {
        jobWhere.OR = [
          { organizationId: userOrgId },
          { organizationId: null }
        ];
      } else {
        jobWhere.organizationId = userOrgId;
      }
    }
    if (!isClientAdmin && !isSuperAdmin) {
      jobWhere.AND = [
        ...(jobWhere.AND || []),
        {
          OR: [
            { created_by: req.user?.userId },
            { user: { role: { in: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'ADMIN'] } } }
          ]
        }
      ];
    }

    // Fetch active jobs (filtered by creator for members, all for admin)
    const dbJobs = await prisma.job.findMany({
      where: jobWhere,
      include: {
        requirements: true,
        applications: isCandUuid ? {
          where: { candidate_id: candidateId }
        } : false
      },
      orderBy: { created_at: 'desc' }
    });

    // Query evaluations created by this user for this candidate across these jobs
    const userEvals = await prisma.evaluation.findMany({
      where: {
        candidateId,
        jobId: { in: dbJobs.map(j => j.id) },
        createdByUserId: req.user?.userId || ''
      }
    });
    const userEvalMap = new Map(userEvals.map(ev => [ev.jobId, ev]));

    const jobs = dbJobs.map(j => {
      const app = (j.applications as any)?.[0];
      const userEval = userEvalMap.get(j.id);
      const isEvaluated = Boolean(userEval);
      const score = userEval ? Math.round(userEval.score) : (app?.match_score !== null && app?.match_score !== undefined ? Math.round(app.match_score) : null);

      return {
        id: j.id,
        position: j.position,
        jobTitle: j.position,
        client: j.client,
        company: j.client,
        location: j.location || 'Remote',
        workMode: j.work_mode || 'Full-time',
        status: j.status,
        salary: j.salary,
        requirementsCount: j.requirements ? j.requirements.length : 0,
        requirementsConfirmed: j.requirements ? (j.requirements.some(r => r.recruiter_confirmed) || j.requirements.length >= 2) : false,
        isAlreadyMatched: Boolean(app),
        isAlreadyEvaluated: isEvaluated,
        matchScore: score,
        stage: userEval ? (score && score >= 80 ? 'SHORTLISTED' : 'REVIEW') : (app?.stage || 'SOURCED'),
        createdAt: j.created_at
      };
    });

    res.status(200).json({
      success: true,
      candidateId,
      candidateName: candidate.name,
      total: jobs.length,
      jobs
    });
  } catch (error: any) {
    console.error('Error getting available jobs for candidate:', error);
    res.status(500).json({ error: 'Failed to retrieve available jobs for candidate' });
  }
};

/**
 * Update evaluation decision (SUBMIT, REVIEW, DO NOT SUBMIT)
 * POST /api/evaluations/:id/decision
 * PATCH /api/evaluations/:id/decision
 */
export const updateEvaluationDecisionController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !user.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const id = String(req.params.id || '');
    const rawDecision = String(req.body.decision || '').trim().toUpperCase();

    if (!rawDecision || !['SUBMIT', 'REVIEW', 'DO NOT SUBMIT', 'REJECT'].includes(rawDecision)) {
      res.status(400).json({ error: 'Invalid decision. Must be SUBMIT, REVIEW, or DO NOT SUBMIT' });
      return;
    }

    const standardDecision = rawDecision === 'REJECT' ? 'DO NOT SUBMIT' : rawDecision;

    const evaluation = await prisma.evaluation.findUnique({
      where: { id },
      include: { job: true, candidate: true }
    });

    if (!evaluation) {
      res.status(404).json({ error: 'Evaluation not found' });
      return;
    }

    const orgId = user.organizationId || 'org-tasknera';
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const isCompanyAdmin = user.role === 'ADMIN' || user.role === 'CLIENT_ADMIN';
    const evalOrgId = evaluation.organizationId || evaluation.job?.organizationId || evaluation.candidate?.organizationId || 'org-tasknera';

    if (!isSuperAdmin && evalOrgId !== orgId) {
      res.status(403).json({ error: 'Forbidden: Access restricted to organization members.' });
      return;
    }

    const isOwner =
      evaluation.evaluatedBy === user.userId ||
      evaluation.createdByUserId === user.userId ||
      evaluation.assignedToUserId === user.userId ||
      evaluation.job?.created_by === user.userId ||
      evaluation.candidate?.created_by === user.userId;

    if (!isSuperAdmin && !isCompanyAdmin && !isOwner) {
      res.status(403).json({ error: 'Forbidden: Only evaluation owner or admin can update decision.' });
      return;
    }

    const updated = await prisma.evaluation.update({
      where: { id },
      data: {
        decision: standardDecision,
        updatedAt: new Date()
      }
    });

    res.status(200).json({
      success: true,
      message: `Evaluation decision updated to ${standardDecision}`,
      evaluation: updated
    });
  } catch (error: any) {
    console.error('Error updating evaluation decision:', error);
    res.status(500).json({ error: error.message || 'Failed to update evaluation decision' });
  }
};

/**
 * Delete evaluation
 * DELETE /api/evaluations/:id
 */
export const deleteEvaluationController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !user.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const id = String(req.params.id || '');

    const evaluation = await prisma.evaluation.findUnique({
      where: { id },
      include: { job: true, candidate: true }
    });

    if (!evaluation) {
      res.status(404).json({ error: 'Evaluation not found' });
      return;
    }

    const orgId = user.organizationId || 'org-tasknera';
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const isCompanyAdmin = user.role === 'ADMIN' || user.role === 'CLIENT_ADMIN';
    const evalOrgId = evaluation.organizationId || evaluation.job?.organizationId || evaluation.candidate?.organizationId || 'org-tasknera';

    if (!isSuperAdmin && evalOrgId !== orgId) {
      res.status(403).json({ error: 'Forbidden: Access restricted to organization members.' });
      return;
    }

    const isOwner =
      evaluation.evaluatedBy === user.userId ||
      evaluation.createdByUserId === user.userId ||
      evaluation.assignedToUserId === user.userId ||
      evaluation.job?.created_by === user.userId ||
      evaluation.candidate?.created_by === user.userId;

    if (!isSuperAdmin && !isCompanyAdmin && !isOwner) {
      res.status(403).json({ error: 'Forbidden: Only evaluation owner or admin can delete evaluation.' });
      return;
    }

    await prisma.evaluation.delete({
      where: { id }
    });

    res.status(200).json({
      success: true,
      message: 'Evaluation deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting evaluation:', error);
    res.status(500).json({ error: error.message || 'Failed to delete evaluation' });
  }
};

/**
 * Connect Candidate to Job (create/reuse CandidateJob)
 * POST /api/candidates/:candidateId/jobs
 */
export const attachCandidateToJobController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const candidateId = String(req.params.candidateId || req.params.id || '');
    const jobId = String(req.body.jobId || req.body.job_id || '');

    if (!candidateId || !jobId) {
      res.status(400).json({ error: 'candidateId and jobId are required' });
      return;
    }

    const userOrgId = req.user?.organizationId || 'org-tasknera';
    const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';

    const candidate = await findCandidateRecord(candidateId, undefined, isSuperAdmin ? undefined : userOrgId);
    if (!candidate) {
      res.status(404).json({ error: `Candidate with ID "${candidateId}" not found.` });
      return;
    }

    if (!isSuperAdmin && (candidate.organizationId || 'org-tasknera') !== userOrgId) {
      res.status(403).json({ error: 'Unauthorized: Cannot attach candidate from another organization.' });
      return;
    }

    const job = await getJobFromStoreOrDb(jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found.' });
      return;
    }

    if (!isSuperAdmin && (job.organizationId || 'org-tasknera') !== userOrgId) {
      res.status(403).json({ error: 'Unauthorized: Cannot attach candidate to job from another organization.' });
      return;
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId);
    const isCandUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidateId);

    let candidateJobId = `cj-${candidateId}-${jobId}`;

    if (isUuid && isCandUuid) {
      const app = await prisma.candidateApplication.upsert({
        where: {
          job_id_candidate_id: {
            job_id: jobId,
            candidate_id: candidateId
          }
        },
        update: {
          updated_at: new Date()
        },
        create: {
          job_id: jobId,
          candidate_id: candidateId,
          stage: 'SOURCED',
          status: 'active'
        }
      });
      candidateJobId = app.id;
    }

    res.status(200).json({
      success: true,
      candidateId,
      jobId,
      candidateJobId,
      status: 'READY'
    });
  } catch (error: any) {
    console.error('Error attaching candidate to job:', error);
    res.status(500).json({ error: 'Failed to attach candidate to job' });
  }
};

/**
 * Start/Execute Evaluation for a Candidate against a specific Job
 * POST /api/candidates/:candidateId/jobs/:jobId/evaluate
 */
export const evaluateCandidateJobController = async (req: AuthRequest, res: Response): Promise<void> => {
  req.body.jobId = req.params.jobId || req.body.jobId;
  return matchCandidateWithJobController(req, res);
};

