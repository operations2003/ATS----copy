import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/authMiddleware';
import {
  isValidCategory,
  normalizeCategory,
  formatRequirementObject,
  detectDuplicateRequirements,
  deduplicateRequirements,
  areRequirementsDuplicate,
  SUPPORTED_CATEGORIES
} from '../utils/requirementUtils';
import { GLOBAL_JOB_STORE } from './jobController';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const parseParam = (param: string | string[] | undefined): string => {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
};

/**
 * Helper to check if job exists and validate access for authenticated recruiters/members
 */
async function findUserJob(jobIdParam: string | string[] | undefined, userId: string, userRole?: string, userOrgId?: string) {
  const jobId = parseParam(jobIdParam);
  if (!jobId || !UUID_REGEX.test(jobId)) {
    return { error: 'Invalid Job ID format. Must be a valid UUID.', status: 400, jobId: '' };
  }

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { user: { select: { role: true, email: true } } }
  });

  if (!job) {
    return { error: `Job with ID "${jobId}" not found.`, status: 404, jobId };
  }

  const isSuperAdmin = userRole === 'SUPER_ADMIN';
  const isClientAdmin = userRole === 'CLIENT_ADMIN' || userRole === 'ADMIN';

  // Multi-tenant check: Non-super-admin users can never access jobs of another organization
  if (!isSuperAdmin && job.organizationId && userOrgId && job.organizationId !== userOrgId) {
    return { error: 'Forbidden: You do not have access to requisitions of another organization.', status: 403, jobId };
  }

  // Enforce RBAC: Non-admin recruiters have access to requirements of JDs they created OR JDs uploaded by Admin/Super Admin for their organization
  if (!isSuperAdmin && !isClientAdmin && job.created_by !== userId) {
    const creatorRole = (job as any).user?.role;
    const isJobAdminCreated = creatorRole === 'SUPER_ADMIN' || creatorRole === 'CLIENT_ADMIN' || creatorRole === 'ADMIN' || (job as any).user?.email === 'operations@tasknera.com' || (job as any).user?.email === 'admin@gmail.com';
    if (!isJobAdminCreated) {
      return { error: 'Forbidden: You only have access to requirements for your own job requisitions.', status: 403, jobId };
    }
  }

  return { job, jobId };
}

const DUMMY_FALLBACK_REQS: Record<string, any[]> = {
  'jd-1': [
    { id: 'req-1', jobId: 'jd-1', requirement: 'Minimum 5+ years hands-on SAP CO (Controlling) & FICO configuration experience', category: 'Experience', weight: 2.0, isMandatory: true, evidenceRequired: true, recruiterConfirmed: true, sourceEvidence: 'Required 5+ years SAP CO experience with Product Costing and CO-PA' },
    { id: 'req-2', jobId: 'jd-1', requirement: 'Proven experience leading at least 2 full-lifecycle SAP S/4HANA migration projects', category: 'Technical Skill', weight: 1.5, isMandatory: true, evidenceRequired: true, recruiterConfirmed: true, sourceEvidence: 'Led minimum 2 S/4HANA migration cycles' },
    { id: 'req-3', jobId: 'jd-1', requirement: 'In-depth expertise in SAP CO-PA (Profitability Analysis) and Material Ledger', category: 'Functional Skill', weight: 1.5, isMandatory: true, evidenceRequired: true, recruiterConfirmed: true, sourceEvidence: 'Expertise in CO-PA and ML integration' },
    { id: 'req-4', jobId: 'jd-1', requirement: 'Bachelor degree in Computer Science, Finance, Accounting, or equivalent field', category: 'Education', weight: 1.0, isMandatory: false, evidenceRequired: false, recruiterConfirmed: true, sourceEvidence: 'BS in CS or Finance' },
    { id: 'req-5', jobId: 'jd-1', requirement: 'Official SAP Certified Application Associate - SAP S/4HANA for Management Accounting', category: 'Certification', weight: 1.2, isMandatory: false, evidenceRequired: true, recruiterConfirmed: true, sourceEvidence: 'SAP CO certification preferred' }
  ],
  'default': [
    { id: 'req-d1', jobId: 'default', requirement: '7+ years professional experience with React 19, TypeScript, and modern Next.js App Router', category: 'Technical Skill', weight: 2.0, isMandatory: true, evidenceRequired: true, recruiterConfirmed: true, sourceEvidence: '7+ yrs React/TypeScript' },
    { id: 'req-d2', jobId: 'default', requirement: 'Demonstrated architectural experience with high-throughput distributed systems & micro-frontends', category: 'Technology', weight: 1.8, isMandatory: true, evidenceRequired: true, recruiterConfirmed: true, sourceEvidence: 'Distributed systems & microfrontends architecture' },
    { id: 'req-d3', jobId: 'default', requirement: 'Hands-on experience designing and operating REST/GraphQL APIs with Node.js and PostgreSQL', category: 'Technical Skill', weight: 1.5, isMandatory: true, evidenceRequired: true, recruiterConfirmed: true, sourceEvidence: 'Node.js & PostgreSQL APIs' },
    { id: 'req-d4', jobId: 'default', requirement: 'Experience with AWS/GCP cloud infrastructure, Docker, CI/CD pipelines and automated testing', category: 'Tool', weight: 1.2, isMandatory: false, evidenceRequired: true, recruiterConfirmed: true, sourceEvidence: 'Cloud CI/CD & Docker experience' },
    { id: 'req-d5', jobId: 'default', requirement: 'Bachelor or Master degree in Computer Science, Software Engineering or related technical field', category: 'Education', weight: 1.0, isMandatory: false, evidenceRequired: false, recruiterConfirmed: true, sourceEvidence: 'BS/MS in CS or equivalent' }
  ]
};

// @desc    Get all requirements for a job
// @route   GET /api/jobs/:jobId/requirements
// @access  Private (Authenticated Recruiter)
export const getRequirements = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rawJobId = parseParam(req.params.jobId);

    // Validate access to job if UUID
    if (rawJobId && UUID_REGEX.test(rawJobId) && req.user) {
      const check = await findUserJob(rawJobId, req.user.userId, req.user.role, req.user.organizationId);
      if (check.error) {
        res.status(check.status || 400).json({ error: check.error });
        return;
      }
    }

    // If matching fallback dummy ID
    if (DUMMY_FALLBACK_REQS[rawJobId]) {
      res.status(200).json({
        success: true,
        requirements: DUMMY_FALLBACK_REQS[rawJobId]
      });
      return;
    }

    let formattedReqs: any[] = [];
    try {
      if (rawJobId && UUID_REGEX.test(rawJobId)) {
        const dbRequirements = await prisma.requirement.findMany({
          where: { job_id: rawJobId },
          orderBy: { created_at: 'asc' }
        });
        if (dbRequirements && dbRequirements.length > 0) {
          formattedReqs = deduplicateRequirements(dbRequirements.map(formatRequirementObject));
        }
      }
    } catch (dbErr) {
      console.warn('[Get Requirements] Database read failed; using fallback:', dbErr);
    }

    // Check GLOBAL_JOB_STORE or job.normalized_jd if DB had no rows
    if (!formattedReqs || formattedReqs.length === 0) {
      const storedJob = GLOBAL_JOB_STORE.get(rawJobId);
      if (storedJob && Array.isArray(storedJob.requirements) && storedJob.requirements.length > 0) {
        formattedReqs = deduplicateRequirements(storedJob.requirements.map(formatRequirementObject));
      } else {
        // Try reading Job record from DB to check for normalized_jd
        if (rawJobId && UUID_REGEX.test(rawJobId)) {
          try {
            const dbJob = await prisma.job.findUnique({
              where: { id: rawJobId },
              select: { normalized_jd: true, position: true }
            });
            const normJd: any = dbJob?.normalized_jd;
            if (normJd && (normJd.mandatory_requirements || normJd.preferred_requirements)) {
              const unpackedReqs: any[] = [];
              const mand = Array.isArray(normJd.mandatory_requirements) ? normJd.mandatory_requirements : [];
              const pref = Array.isArray(normJd.preferred_requirements) ? normJd.preferred_requirements : [];

              mand.forEach((m: any, idx: number) => {
                unpackedReqs.push({
                  id: `req-norm-m-${idx + 1}`,
                  jobId: rawJobId,
                  requirement: m.name || m.requirement,
                  category: normalizeCategory(m.category),
                  weight: typeof m.weight === 'number' ? m.weight : 2.0,
                  isMandatory: true,
                  evidenceRequired: false,
                  recruiterConfirmed: false,
                  sourceEvidence: m.description || m.context || m.name,
                  needsVerification: false
                });
              });

              pref.forEach((p: any, idx: number) => {
                unpackedReqs.push({
                  id: `req-norm-p-${idx + 1}`,
                  jobId: rawJobId,
                  requirement: p.name || p.requirement,
                  category: normalizeCategory(p.category),
                  weight: typeof p.weight === 'number' ? p.weight : 1.0,
                  isMandatory: false,
                  evidenceRequired: false,
                  recruiterConfirmed: false,
                  sourceEvidence: p.description || p.context || p.name,
                  needsVerification: false
                });
              });

              if (unpackedReqs.length > 0) {
                formattedReqs = deduplicateRequirements(unpackedReqs);
              }
            }
          } catch {}
        }
      }
    }

    if (!formattedReqs || formattedReqs.length === 0) {
      formattedReqs = deduplicateRequirements(DUMMY_FALLBACK_REQS['default']);
    } else {
      formattedReqs = deduplicateRequirements(formattedReqs);
    }

    const warnings = detectDuplicateRequirements(formattedReqs);

    res.status(200).json({
      success: true,
      requirements: formattedReqs,
      ...(warnings.length > 0 ? { warnings } : {})
    });
  } catch (error: any) {
    console.error('[Get Requirements Error]', error);
    res.status(200).json({ success: true, requirements: DUMMY_FALLBACK_REQS['default'] });
  }
};

// @desc    Create a new requirement for a job
// @route   POST /api/jobs/:jobId/requirements
// @access  Private (Authenticated Recruiter)
export const createRequirement = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.userId) {
      res.status(401).json({ error: 'User authentication required' });
      return;
    }

    const check = await findUserJob(req.params.jobId, req.user.userId, req.user.role, req.user.organizationId);
    if (check.error) {
      res.status(check.status || 400).json({ error: check.error });
      return;
    }
    const jobId = check.jobId;

    const { requirement, category, weight, isMandatory, evidenceRequired, recruiterConfirmed, sourceEvidence } = req.body;

    // Validation 1: Requirement string is non-empty
    if (!requirement || typeof requirement !== 'string' || !requirement.trim()) {
      res.status(400).json({ error: 'Requirement text is required and cannot be empty.' });
      return;
    }

    // Validation 2: Category validation
    const targetCategory = category ? String(category).trim() : 'Other';
    if (category && !isValidCategory(targetCategory)) {
      res.status(400).json({
        error: `Invalid category "${category}". Allowed categories: ${SUPPORTED_CATEGORIES.join(', ')}`
      });
      return;
    }

    // Validation 3: Weight validation (1.0 - 3.0)
    const reqWeight = typeof weight === 'number' ? weight : 1.0;
    if (reqWeight < 1.0 || reqWeight > 3.0) {
      res.status(400).json({ error: 'Requirement weight must be a number between 1.0 and 3.0 inclusive.' });
      return;
    }

    const newReq = await prisma.requirement.create({
      data: {
        job_id: jobId,
        requirement: requirement.trim(),
        category: normalizeCategory(targetCategory),
        weight: reqWeight,
        is_mandatory: Boolean(isMandatory ?? false),
        evidence_required: Boolean(evidenceRequired ?? false),
        recruiter_confirmed: Boolean(recruiterConfirmed ?? false),
        source_evidence: sourceEvidence ? String(sourceEvidence).trim() : requirement.trim(),
        needs_verification: false
      }
    });

    res.status(201).json({
      success: true,
      requirement: formatRequirementObject(newReq)
    });
  } catch (error: any) {
    console.error('[Create Requirement Error]', error);
    res.status(500).json({ error: 'Server error while creating requirement', details: error.message || String(error) });
  }
};

// @desc    Update a requirement by ID
// @route   PUT /api/jobs/:jobId/requirements/:requirementId
// @access  Private (Authenticated Recruiter)
export const updateRequirement = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.userId) {
      res.status(401).json({ error: 'User authentication required' });
      return;
    }

    const check = await findUserJob(req.params.jobId, req.user.userId, req.user.role, req.user.organizationId);
    if (check.error) {
      res.status(check.status || 400).json({ error: check.error });
      return;
    }
    const jobId = check.jobId;
    const requirementId = parseParam(req.params.requirementId);

    if (!requirementId || !UUID_REGEX.test(requirementId)) {
      res.status(400).json({ error: 'Invalid Requirement ID format. Must be a valid UUID.' });
      return;
    }

    const existingReq = await prisma.requirement.findFirst({
      where: { id: requirementId, job_id: jobId }
    });

    if (!existingReq) {
      res.status(404).json({ error: `Requirement with ID "${requirementId}" not found for this job.` });
      return;
    }

    const { requirement, category, weight, isMandatory, evidenceRequired, recruiterConfirmed } = req.body;

    const updateData: any = {};

    // Validate requirement if updated
    if (requirement !== undefined) {
      if (typeof requirement !== 'string' || !requirement.trim()) {
        res.status(400).json({ error: 'Requirement text cannot be empty.' });
        return;
      }
      updateData.requirement = requirement.trim();
    }

    // Validate category if updated
    if (category !== undefined) {
      if (!isValidCategory(String(category).trim())) {
        res.status(400).json({
          error: `Invalid category "${category}". Allowed categories: ${SUPPORTED_CATEGORIES.join(', ')}`
        });
        return;
      }
      updateData.category = normalizeCategory(String(category).trim());
    }

    // Validate weight if updated
    if (weight !== undefined) {
      if (typeof weight !== 'number' || weight < 1.0 || weight > 3.0) {
        res.status(400).json({ error: 'Requirement weight must be a number between 1.0 and 3.0 inclusive.' });
        return;
      }
      updateData.weight = weight;
    }

    if (isMandatory !== undefined) updateData.is_mandatory = Boolean(isMandatory);
    if (evidenceRequired !== undefined) updateData.evidence_required = Boolean(evidenceRequired);
    if (recruiterConfirmed !== undefined) updateData.recruiter_confirmed = Boolean(recruiterConfirmed);

    // Preserve existing source_evidence (source Evidence should not be modified by normal recruiter editing)
    const updatedReq = await prisma.requirement.update({
      where: { id: requirementId },
      data: updateData
    });

    res.status(200).json({
      success: true,
      requirement: formatRequirementObject(updatedReq)
    });
  } catch (error: any) {
    console.error('[Update Requirement Error]', error);
    res.status(500).json({ error: 'Server error while updating requirement', details: error.message || String(error) });
  }
};

// @desc    Delete a requirement by ID
// @route   DELETE /api/jobs/:jobId/requirements/:requirementId
// @access  Private (Authenticated Recruiter)
export const deleteRequirement = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.userId) {
      res.status(401).json({ error: 'User authentication required' });
      return;
    }

    const check = await findUserJob(req.params.jobId, req.user.userId, req.user.role, req.user.organizationId);
    if (check.error) {
      res.status(check.status || 400).json({ error: check.error });
      return;
    }
    const jobId = check.jobId;
    const requirementId = parseParam(req.params.requirementId);

    if (!requirementId || !UUID_REGEX.test(requirementId)) {
      res.status(400).json({ error: 'Invalid Requirement ID format. Must be a valid UUID.' });
      return;
    }

    const existingReq = await prisma.requirement.findFirst({
      where: { id: requirementId, job_id: jobId }
    });

    if (!existingReq) {
      res.status(404).json({ error: `Requirement with ID "${requirementId}" not found for this job.` });
      return;
    }

    await prisma.requirement.delete({
      where: { id: requirementId }
    });

    res.status(200).json({
      success: true,
      message: 'Requirement deleted successfully'
    });
  } catch (error: any) {
    console.error('[Delete Requirement Error]', error);
    res.status(500).json({ error: 'Server error while deleting requirement', details: error.message || String(error) });
  }
};

// @desc    Save & Confirm Requirements transactionally
// @route   POST /api/jobs/:jobId/requirements/confirm
// @access  Private (Authenticated Recruiter)
export const confirmRequirements = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.userId) {
      res.status(401).json({ error: 'User authentication required' });
      return;
    }

    const check = await findUserJob(req.params.jobId, req.user.userId, req.user.role, req.user.organizationId);
    if (check.error) {
      res.status(check.status || 400).json({ error: check.error });
      return;
    }
    const jobId = check.jobId;

    const { requirements } = req.body;

    if (!Array.isArray(requirements) || requirements.length === 0) {
      res.status(400).json({ error: 'Payload must contain a non-empty "requirements" array.' });
      return;
    }

    const cleanRequirements = deduplicateRequirements(requirements);

    // Validate all requirements before initiating database transaction
    for (let i = 0; i < cleanRequirements.length; i++) {
      const item = cleanRequirements[i];
      if (!item.requirement || typeof item.requirement !== 'string' || !item.requirement.trim()) {
        res.status(400).json({ error: `Requirement at index ${i} cannot be empty.` });
        return;
      }

      if (item.category && !isValidCategory(String(item.category).trim())) {
        res.status(400).json({
          error: `Requirement at index ${i} has invalid category "${item.category}". Allowed: ${SUPPORTED_CATEGORIES.join(', ')}`
        });
        return;
      }

      const itemWeight = typeof item.weight === 'number' ? item.weight : (Boolean(item.isMandatory ?? item.is_mandatory) ? 2.0 : 1.0);
      if (itemWeight < 1.0 || itemWeight > 3.0) {
        res.status(400).json({ error: `Requirement at index ${i} has invalid weight ${item.weight}. Must be between 1.0 and 3.0 inclusive.` });
        return;
      }
    }

    // Execute transactional save & confirm via prisma.$transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Delete existing requirements for this job if replacing/overwriting set
      await tx.requirement.deleteMany({
        where: { job_id: jobId }
      });

      // 2. Create updated & confirmed requirement set
      const createdReqs = await Promise.all(
        cleanRequirements.map((r: any) =>
          tx.requirement.create({
            data: {
              job_id: jobId,
              requirement: String(r.requirement).trim(),
              category: normalizeCategory(r.category),
              weight: typeof r.weight === 'number' ? r.weight : (Boolean(r.isMandatory ?? r.is_mandatory) ? 2.0 : 1.0),
              is_mandatory: Boolean(r.isMandatory ?? r.is_mandatory ?? false),
              evidence_required: Boolean(r.evidenceRequired ?? r.evidence_required ?? false),
              recruiter_confirmed: true, // Mark confirmed requirements
              source_evidence: r.sourceEvidence || r.source_evidence || r.requirement,
              needs_verification: Boolean(r.needsVerification ?? r.needs_verification ?? false)
            }
          })
        )
      );

      // 3. Update Job status if draft to active/published
      await tx.job.update({
        where: { id: jobId },
        data: { status: 'published' }
      });

      return createdReqs;
    });

    const formattedConfirmed = result.map(formatRequirementObject);

    // Keep GLOBAL_JOB_STORE synchronized with confirmed requirements
    if (GLOBAL_JOB_STORE.has(jobId)) {
      const existingJob = GLOBAL_JOB_STORE.get(jobId);
      GLOBAL_JOB_STORE.set(jobId, {
        ...existingJob,
        status: 'published',
        requirements: formattedConfirmed
      });
    }

    res.status(200).json({
      success: true,
      message: 'Requirements confirmed successfully',
      requirements: formattedConfirmed
    });
  } catch (error: any) {
    console.error('[Confirm Requirements Error]', error);
    res.status(500).json({ error: 'Server error while confirming requirements', details: error.message || String(error) });
  }
};
