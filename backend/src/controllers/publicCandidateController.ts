import { Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/authMiddleware';
import { GLOBAL_JOB_STORE } from './jobController';
import {
  CANDIDATE_STORE,
  GLOBAL_CANDIDATES,
  CandidateRecord,
  saveCandidateToPersistentPool,
  cleanFileNameForDisplay,
} from './candidateController';
import {
  extractDocumentTextViaPython,
  extractDocumentTextLocally,
  PythonDocumentResponse,
} from '../services/pythonDocumentClient';
import {
  extractStructuredCandidateFromText,
  validateCvTextQuality,
} from '../services/cvParsingService';
import { evaluateCandidateAgainstRequirements } from '../services/evaluationService';

/**
 * Generate a clean, URL-safe 10-character unique token
 */
export function generateUniquePublicToken(): string {
  // Generate random base64url string and clean it up to alphanumeric
  const raw = crypto.randomBytes(8).toString('base64url');
  const clean = raw.replace(/[^a-zA-Z0-9]/g, '');
  return clean.slice(0, 10) || `job${Date.now().toString(36)}`;
}

/**
 * Helper to construct public URL based on host/origin
 */
export function buildPublicApplyUrl(req: Request, token: string): string {
  // Check forwarded headers or origin
  const origin = req.get('origin') || req.get('referer');
  if (origin) {
    try {
      const parsed = new URL(origin);
      return `${parsed.protocol}//${parsed.host}/apply/${token}`;
    } catch {}
  }
  // Fallback to configured frontend URL or default port 3000
  const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3000';
  return `${frontendBase.replace(/\/+$/, '')}/apply/${token}`;
}

/**
 * Generate or retrieve existing public application link for a Job
 * POST /api/jobs/:id/public-link
 * Access: Private (Authenticated Recruiter / Admin)
 */
export const getOrCreateJobPublicLink = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const jobId = String(req.params.id || '').trim();
    if (!jobId) {
      res.status(400).json({ error: 'Job ID is required.' });
      return;
    }

    const callerRole = req.user?.role || 'MEMBER';
    const isSuperAdmin = callerRole === 'SUPER_ADMIN' || req.user?.email?.toLowerCase().trim() === 'operations@tasknera.com' || req.user?.email?.toLowerCase().trim() === 'admin@gmail.com';
    const isClientAdmin = callerRole === 'CLIENT_ADMIN' || callerRole === 'ADMIN';
    const userOrgId = req.user?.organizationId || 'org-tasknera';
    const currentUserId = req.user?.userId || req.user?.id;

    // Check DB job
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId);
    let job: any = null;

    if (isUuid) {
      job = await prisma.job.findUnique({
        where: { id: jobId },
        select: {
          id: true,
          position: true,
          client: true,
          created_by: true,
          organizationId: true,
          status: true,
          publicToken: true,
          isPublicLinkActive: true,
        }
      });
    }

    if (!job && GLOBAL_JOB_STORE.has(jobId)) {
      job = GLOBAL_JOB_STORE.get(jobId);
    }

    if (!job) {
      res.status(404).json({ error: `Job with ID "${jobId}" not found.` });
      return;
    }

    // Tenant & Role authorization
    const jobOrg = job.organizationId || 'org-tasknera';
    if (!isSuperAdmin) {
      if (jobOrg !== userOrgId) {
        res.status(403).json({ error: 'Forbidden: Access denied to other organization job requisition.' });
        return;
      }
      if (!isClientAdmin) {
        const jobOwner = job.created_by || job.createdBy;
        if (jobOwner && jobOwner !== currentUserId) {
          res.status(403).json({ error: 'Forbidden: Access restricted to the requisition owner.' });
          return;
        }
      }
    }

    const { isPublicLinkActive, regenerate } = req.body || {};

    let token = job.publicToken || (job as any).public_token;
    let isActive = job.isPublicLinkActive !== false;

    if (typeof isPublicLinkActive === 'boolean') {
      isActive = isPublicLinkActive;
    }

    // Generate new token if none exists or explicitly requested to regenerate
    if (!token || regenerate === true) {
      token = generateUniquePublicToken();
      // Ensure uniqueness in DB
      let isUnique = false;
      let attempts = 0;
      while (!isUnique && attempts < 5) {
        const existing = await prisma.job.findUnique({ where: { publicToken: token } }).catch(() => null);
        if (!existing || existing.id === job.id) {
          isUnique = true;
        } else {
          token = generateUniquePublicToken();
          attempts++;
        }
      }

      if (isUuid) {
        await prisma.job.update({
          where: { id: jobId },
          data: {
            publicToken: token,
            isPublicLinkActive: isActive,
          }
        }).catch((err) => console.warn('[Public Link DB Update Warning]:', err));
      }

      job.publicToken = token;
      job.isPublicLinkActive = isActive;
      GLOBAL_JOB_STORE.set(job.id, { ...job, publicToken: token, isPublicLinkActive: isActive });
    } else if (typeof isPublicLinkActive === 'boolean') {
      if (isUuid) {
        await prisma.job.update({
          where: { id: jobId },
          data: { isPublicLinkActive: isActive }
        }).catch(() => null);
      }
      job.isPublicLinkActive = isActive;
      GLOBAL_JOB_STORE.set(job.id, { ...job, isPublicLinkActive: isActive });
    }

    const publicUrl = buildPublicApplyUrl(req, token);

    res.status(200).json({
      success: true,
      jobId: job.id,
      position: job.position,
      publicToken: token,
      isPublicLinkActive: isActive,
      publicUrl,
    });
  } catch (error: any) {
    console.error('Error in getOrCreateJobPublicLink:', error);
    res.status(500).json({ error: 'Failed to generate or retrieve public application link.' });
  }
};

/**
 * Get current public application link status
 * GET /api/jobs/:id/public-link
 * Access: Private (Authenticated Recruiter / Admin)
 */
export const getJobPublicLink = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const jobId = String(req.params.id || '').trim();
    if (!jobId) {
      res.status(400).json({ error: 'Job ID is required.' });
      return;
    }

    const callerRole = req.user?.role || 'MEMBER';
    const isSuperAdmin = callerRole === 'SUPER_ADMIN' || req.user?.email?.toLowerCase().trim() === 'operations@tasknera.com' || req.user?.email?.toLowerCase().trim() === 'admin@gmail.com';
    const isClientAdmin = callerRole === 'CLIENT_ADMIN' || callerRole === 'ADMIN';
    const userOrgId = req.user?.organizationId || 'org-tasknera';
    const currentUserId = req.user?.userId || req.user?.id;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId);
    let job: any = null;

    if (isUuid) {
      job = await prisma.job.findUnique({
        where: { id: jobId },
        select: {
          id: true,
          position: true,
          client: true,
          created_by: true,
          organizationId: true,
          publicToken: true,
          isPublicLinkActive: true,
        }
      });
    }

    if (!job && GLOBAL_JOB_STORE.has(jobId)) {
      job = GLOBAL_JOB_STORE.get(jobId);
    }

    if (!job) {
      res.status(404).json({ error: `Job with ID "${jobId}" not found.` });
      return;
    }

    const jobOrg = job.organizationId || 'org-tasknera';
    if (!isSuperAdmin) {
      if (jobOrg !== userOrgId) {
        res.status(403).json({ error: 'Forbidden: Access denied to other organization job requisition.' });
        return;
      }
      if (!isClientAdmin) {
        const jobOwner = job.created_by || job.createdBy;
        if (jobOwner && jobOwner !== currentUserId) {
          res.status(403).json({ error: 'Forbidden: Access restricted to the requisition owner.' });
          return;
        }
      }
    }

    const token = job.publicToken || (job as any).public_token;
    const isActive = job.isPublicLinkActive !== false;
    const publicUrl = token ? buildPublicApplyUrl(req, token) : null;

    res.status(200).json({
      success: true,
      jobId: job.id,
      position: job.position,
      hasLink: Boolean(token),
      publicToken: token || null,
      isPublicLinkActive: isActive,
      publicUrl,
    });
  } catch (error: any) {
    console.error('Error in getJobPublicLink:', error);
    res.status(500).json({ error: 'Failed to retrieve public application link.' });
  }
};

/**
 * Toggle enable/disable public applications for a Job
 * PATCH /api/jobs/:id/public-link
 * Access: Private (Authenticated Recruiter / Admin)
 */
export const toggleJobPublicLink = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const jobId = String(req.params.id || '').trim();
    const { isPublicLinkActive } = req.body || {};

    if (typeof isPublicLinkActive !== 'boolean') {
      res.status(400).json({ error: 'isPublicLinkActive (boolean) is required in request body.' });
      return;
    }

    const callerRole = req.user?.role || 'MEMBER';
    const isSuperAdmin = callerRole === 'SUPER_ADMIN' || req.user?.email?.toLowerCase().trim() === 'operations@tasknera.com' || req.user?.email?.toLowerCase().trim() === 'admin@gmail.com';
    const isClientAdmin = callerRole === 'CLIENT_ADMIN' || callerRole === 'ADMIN';
    const userOrgId = req.user?.organizationId || 'org-tasknera';
    const currentUserId = req.user?.userId || req.user?.id;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId);
    let job: any = null;

    if (isUuid) {
      job = await prisma.job.findUnique({
        where: { id: jobId },
        select: { id: true, created_by: true, organizationId: true, publicToken: true, isPublicLinkActive: true }
      });
    }

    if (!job && GLOBAL_JOB_STORE.has(jobId)) {
      job = GLOBAL_JOB_STORE.get(jobId);
    }

    if (!job) {
      res.status(404).json({ error: `Job with ID "${jobId}" not found.` });
      return;
    }

    const jobOrg = job.organizationId || 'org-tasknera';
    if (!isSuperAdmin) {
      if (jobOrg !== userOrgId) {
        res.status(403).json({ error: 'Forbidden: Access denied to other organization job requisition.' });
        return;
      }
      if (!isClientAdmin) {
        const jobOwner = job.created_by || job.createdBy;
        if (jobOwner && jobOwner !== currentUserId) {
          res.status(403).json({ error: 'Forbidden: Access restricted to the requisition owner.' });
          return;
        }
      }
    }

    if (isUuid) {
      await prisma.job.update({
        where: { id: jobId },
        data: { isPublicLinkActive }
      });
    }

    job.isPublicLinkActive = isPublicLinkActive;
    GLOBAL_JOB_STORE.set(job.id, { ...job, isPublicLinkActive });

    res.status(200).json({
      success: true,
      jobId: job.id,
      isPublicLinkActive,
      message: isPublicLinkActive
        ? 'Public candidate applications are now OPEN.'
        : 'Public candidate applications are now PAUSED.',
    });
  } catch (error: any) {
    console.error('Error toggling public link:', error);
    res.status(500).json({ error: 'Failed to update public link status.' });
  }
};

/**
 * Public endpoint: Retrieve Job info using publicToken
 * GET /api/public/jobs/:token
 * Access: PUBLIC (No authentication required)
 */
export const getPublicJobByToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) {
      res.status(400).json({ error: 'Job token is required.' });
      return;
    }

    // 1. Search in database
    let job: any = await prisma.job.findUnique({
      where: { publicToken: token },
      include: {
        requirements: {
          select: {
            id: true,
            requirement: true,
            category: true,
            is_mandatory: true,
            weight: true,
          }
        },
        user: {
          select: {
            organizationId: true
          }
        }
      }
    });

    // 2. Fallback search in GLOBAL_JOB_STORE
    if (!job) {
      for (const j of GLOBAL_JOB_STORE.values()) {
        if (j.publicToken === token || (j as any).public_token === token) {
          job = j;
          break;
        }
      }
    }

    if (!job) {
      res.status(404).json({
        success: false,
        error: 'This application link is invalid or no longer exists. Please contact the hiring team.',
      });
      return;
    }

    // Check if job is active and accepting applications
    const isPaused = job.isPublicLinkActive === false;
    const isClosedOrArchived = job.status === 'closed' || job.status === 'archived';

    if (isPaused || isClosedOrArchived) {
      res.status(200).json({
        success: true,
        isAcceptingApplications: false,
        position: job.position,
        client: job.client,
        message: 'This job is no longer accepting applications. Thank you for your interest.',
      });
      return;
    }

    // Format safe public job description and requirements
    const safeRequirements = Array.isArray(job.requirements)
      ? job.requirements.map((r: any) => ({
          id: r.id,
          requirement: r.requirement,
          category: r.category || 'Skill',
          is_mandatory: Boolean(r.is_mandatory),
        }))
      : [];

    res.status(200).json({
      success: true,
      isAcceptingApplications: true,
      job: {
        id: job.id,
        jobId: job.id,
        token: job.publicToken || token,
        position: job.position || 'Open Requisition',
        client: job.client || 'Hiring Organization',
        location: job.location || 'Remote / Hybrid',
        work_mode: job.work_mode || 'Full-time',
        salary: job.salary || null,
        jd_text: job.jd_text || job.original_jd || null,
        requirements: safeRequirements,
        requirementsCount: safeRequirements.length,
      }
    });
  } catch (error: any) {
    console.error('Error in getPublicJobByToken:', error);
    res.status(500).json({ error: 'Server error retrieving job information.' });
  }
};

/**
 * Public endpoint: Candidate submits application with resume file
 * POST /api/public/jobs/:token/apply
 * Access: PUBLIC (No authentication required)
 */
export const applyPublicCandidate = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) {
      res.status(400).json({ error: 'Application token is required.' });
      return;
    }

    // 1. Resolve Job from token
    let job: any = await prisma.job.findUnique({
      where: { publicToken: token },
      include: {
        requirements: true,
        user: true,
      }
    });

    if (!job) {
      for (const j of GLOBAL_JOB_STORE.values()) {
        if (j.publicToken === token || (j as any).public_token === token) {
          job = j;
          break;
        }
      }
    }

    if (!job) {
      res.status(404).json({ error: 'Job not found or application link is invalid.' });
      return;
    }

    // 2. Validate Job is accepting applications
    if (job.isPublicLinkActive === false || job.status === 'closed' || job.status === 'archived') {
      res.status(400).json({
        error: 'This job is no longer accepting applications. Thank you for your interest.',
      });
      return;
    }

    // 3. Extract uploaded resume file
    let file: Express.Multer.File | undefined;
    if (req.file) {
      file = req.file;
    } else if (Array.isArray(req.files) && req.files.length > 0) {
      file = req.files[0];
    } else if (req.files && typeof req.files === 'object') {
      const filesObj = req.files as Record<string, Express.Multer.File[]>;
      for (const k of Object.keys(filesObj)) {
        if (Array.isArray(filesObj[k]) && filesObj[k].length > 0) {
          file = filesObj[k][0];
          break;
        }
      }
    }

    if (!file) {
      res.status(400).json({ error: 'Please upload your resume file (PDF, DOCX, DOC, or TXT).' });
      return;
    }

    // 4. Candidate form metadata
    const candidateName = String(req.body?.name || '').trim();
    const candidateEmail = String(req.body?.email || '').trim().toLowerCase();
    const candidatePhone = String(req.body?.phone || '').trim();

    if (!candidateName) {
      res.status(400).json({ error: 'Full name is required.' });
      return;
    }
    if (!candidateEmail || !candidateEmail.includes('@')) {
      res.status(400).json({ error: 'A valid email address is required.' });
      return;
    }

    const fileName = file.originalname || `${candidateName.replace(/\s+/g, '_')}_Resume.pdf`;
    const fileSize = file.size;
    const fileMime = file.mimetype || 'application/pdf';
    const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const fileMd5 = crypto.createHash('md5').update(file.buffer).digest('hex');

    // 5. Multi-Tenant isolation
    // Derives tenant directly from the authenticated job owner's organization
    const targetOrgId = job.organizationId || (job.user && job.user.organizationId) || 'org-tasknera';
    const jobOwnerId = job.created_by;

    console.log(`\n=============================================================`);
    console.log(`[Public Application] Candidate "${candidateName}" (${candidateEmail}) applied for "${job.position}" (${job.client})`);
    console.log(`[Public Application] Org: ${targetOrgId} | Token: ${token} | File: ${fileName} (${fileSize} bytes)`);
    console.log(`=============================================================`);

    // 6. Check duplicate candidate within this Job
    const existingJobCandidates = CANDIDATE_STORE.get(job.id) || [];
    const isDupInStore = existingJobCandidates.find(c =>
      (c.email && c.email.toLowerCase() === candidateEmail) ||
      (c.fileHash && (c.fileHash === fileHash || c.fileHash === fileMd5)) ||
      (candidatePhone && c.phone && c.phone.replace(/[^0-9]/g, '') === candidatePhone.replace(/[^0-9]/g, '') && candidatePhone.length > 5)
    );

    let existingDbCandidate: any = null;
    try {
      existingDbCandidate = await prisma.candidate.findFirst({
        where: {
          organizationId: targetOrgId,
          OR: [
            { email: { equals: candidateEmail, mode: 'insensitive' } },
            { file_hash: fileHash },
            { file_hash: fileMd5 }
          ]
        },
        include: { applications: true }
      });
    } catch {}

    const isAlreadyInThisJob = isDupInStore || (existingDbCandidate && (
      existingDbCandidate.job_id === job.id ||
      (existingDbCandidate.applications && existingDbCandidate.applications.some((a: any) => a.job_id === job.id))
    ));

    if (isAlreadyInThisJob) {
      console.log(`[Public Application Duplicate] Candidate already submitted for job ${job.id}`);
      res.status(200).json({
        success: true,
        isDuplicate: true,
        message: 'Your application has already been received for this position. Our hiring team will review your qualifications.',
      });
      return;
    }

    // 7. Extract document text via Python FastAPI service with local fallback (REUSE EXISTING PARSER)
    console.log(`[Public Application Step 1] Extracting document text for ${fileName}...`);
    let rawText = '';
    let extractionMethod = 'python-document-processor';
    let pageCount = 1;
    let ocrUsed = false;
    let charCount = 0;
    let wordCount = 0;

    const pythonResult: PythonDocumentResponse = await extractDocumentTextViaPython(
      file.buffer,
      fileName,
      fileMime
    );

    if (pythonResult.success && pythonResult.text && pythonResult.text.trim().length > 20) {
      rawText = pythonResult.normalizedText || pythonResult.text;
      extractionMethod = pythonResult.extractionMethod || 'python-service';
      pageCount = pythonResult.pageCount || 1;
      ocrUsed = pythonResult.ocrUsed || false;
      charCount = pythonResult.characterCount || rawText.length;
      wordCount = pythonResult.wordCount || rawText.split(/\s+/).filter(Boolean).length;
    } else {
      console.log(`[Public Application Fallback] Attempting direct local extraction for ${fileName}...`);
      const localFallback = await extractDocumentTextLocally(file.buffer, fileName, fileMime);
      if (localFallback.text && localFallback.text.trim().length > 20) {
        rawText = localFallback.normalizedText || localFallback.text;
        extractionMethod = localFallback.extractionMethod;
        pageCount = localFallback.pageCount;
        charCount = localFallback.characterCount;
        wordCount = localFallback.wordCount;
        ocrUsed = localFallback.ocrUsed;
      }
    }

    // 8. Quality validation
    const textQuality = validateCvTextQuality(rawText || '');
    if (!rawText || !textQuality.isValid) {
      console.warn(`[Public Application] Document text quality failed for ${fileName}: ${textQuality.reason}`);
      res.status(400).json({
        error: 'Unable to extract readable text from the uploaded resume. Please upload a clear PDF or Word document.'
      });
      return;
    }

    // 9. Structured Candidate Parsing (REUSE EXISTING STRUCTURAL PARSER)
    const structuredProfile = extractStructuredCandidateFromText(rawText, fileName, {
      fileType: fileMime,
      pageCount,
      extractionMethod,
      ocrUsed,
      characterCount: charCount,
      wordCount,
    });

    // Explicit form fields take precedence over OCR
    structuredProfile.name = candidateName;
    structuredProfile.email = candidateEmail;
    if (candidatePhone) structuredProfile.phone = candidatePhone;

    // Blend python document processor skills if any
    if (pythonResult.skills && pythonResult.skills.length > 0) {
      structuredProfile.skills = Array.from(new Set([...pythonResult.skills, ...structuredProfile.skills]));
      structuredProfile.technologies = structuredProfile.skills;
    }
    if (pythonResult.yearsOfExperience) {
      const pyYearsMatch = String(pythonResult.yearsOfExperience).match(/(\d+(?:\.\d+)?)/);
      const spYearsMatch = String(structuredProfile.totalExperience || '').match(/(\d+(?:\.\d+)?)/);
      const pyYears = pyYearsMatch ? parseFloat(pyYearsMatch[1]) : 0;
      const spYears = spYearsMatch ? parseFloat(spYearsMatch[1]) : 0;

      if (pyYears > 0 && spYears > 0) {
        const bestYears = Math.max(pyYears, spYears);
        structuredProfile.totalExperience = `${bestYears} yrs`;
        structuredProfile.relevantExperience = `${bestYears} yrs`;
        structuredProfile.totalExperienceYears = bestYears;
        structuredProfile.totalExperienceMonths = Math.round(bestYears * 12);
      } else if (pyYears > 0 && (!structuredProfile.totalExperience || structuredProfile.totalExperience === '0 yrs')) {
        structuredProfile.totalExperience = `${pyYears} yrs`;
        structuredProfile.relevantExperience = `${pyYears} yrs`;
        structuredProfile.totalExperienceYears = pyYears;
        structuredProfile.totalExperienceMonths = Math.round(pyYears * 12);
      }
    }

    const candidateId = `cand-pub-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const candidateRecord: CandidateRecord = {
      id: candidateId,
      jobId: job.id,
      organizationId: targetOrgId,
      ...structuredProfile,
      fileName,
      fileSize,
      fileHash,
      source: 'public_application',
      uploadedAt: new Date().toISOString(),
      uploadedBy: jobOwnerId || undefined,
      createdBy: jobOwnerId || undefined,
    };

    // 10. Automatically calculate ATS SCORE using the EXACT EXISTING ATS EVALUATION ENGINE!
    console.log(`[Public Application Step 2] Evaluating candidate against JD requirements...`);
    const jobData = {
      id: job.id,
      position: job.position,
      title: job.position,
      client: job.client,
      company: job.client,
      jd_text: job.jd_text || job.original_jd || undefined,
      created_by: jobOwnerId,
    };

    const reqs = job.requirements || [];
    const evalPayload = await evaluateCandidateAgainstRequirements(candidateRecord, jobData, reqs);
    const finalScore = evalPayload.overallScore ?? evalPayload.overallMatch ?? 0;
    const atsScore = evalPayload.atsScore ?? finalScore;
    const complianceStr = evalPayload.mandatoryCompliance
      ? `${evalPayload.mandatoryCompliance.met}/${evalPayload.mandatoryCompliance.total}`
      : 'N/A';
    const decision = evalPayload.recommendation || (finalScore >= 80 ? 'SUBMIT' : (finalScore >= 60 ? 'REVIEW' : 'DO NOT SUBMIT'));
    const matchLevel = evalPayload.matchLevel || (finalScore >= 80 ? 'STRONG MATCH' : (finalScore >= 55 ? 'MODERATE MATCH' : 'LOW FIT'));

    candidateRecord.matchScore = finalScore;
    candidateRecord.atsScore = atsScore;
    candidateRecord.matchLevel = matchLevel;
    candidateRecord.mandatoryCompliance = complianceStr;
    candidateRecord.decision = decision;
    candidateRecord.recommendation = decision;
    candidateRecord.evaluation = evalPayload;

    console.log(`[Public Application Result] ATS Score: ${atsScore}% | Decision: ${decision} | Match: ${matchLevel}`);

    // 11. Persist to PostgreSQL Database with source="public_application" & organizationId
    try {
      const createdDbCand = await prisma.candidate.create({
        data: {
          job_id: job.id,
          name: candidateRecord.name,
          email: candidateRecord.email,
          phone: candidateRecord.phone,
          location: candidateRecord.location,
          total_experience: candidateRecord.totalExperience,
          current_title: candidateRecord.currentTitle,
          current_company: candidateRecord.currentCompany,
          summary: candidateRecord.summary,
          resume_file_url: fileName,
          raw_text: rawText,
          file_hash: fileHash,
          parsing_status: 'PARSED',
          source: 'public_application',
          created_by: jobOwnerId,
          organizationId: targetOrgId,
        }
      });

      candidateRecord.id = createdDbCand.id;

      // Persist child skills, experiences, educations
      if (candidateRecord.skills && candidateRecord.skills.length > 0) {
        await prisma.candidateSkill.createMany({
          data: candidateRecord.skills.map(s => ({ candidate_id: createdDbCand.id, skill: s })),
          skipDuplicates: true,
        }).catch(() => null);
      }
      if (candidateRecord.experience && candidateRecord.experience.length > 0) {
        await prisma.candidateExperience.createMany({
          data: candidateRecord.experience.map(ex => ({
            candidate_id: createdDbCand.id,
            company: ex.company || 'Company',
            title: ex.title || 'Role',
            duration: ex.duration || '',
            description: ex.description || '',
            start_date: ex.startDate || '',
            end_date: ex.endDate || '',
          })),
          skipDuplicates: true,
        }).catch(() => null);
      }
      if (candidateRecord.education && candidateRecord.education.length > 0) {
        await prisma.candidateEducation.createMany({
          data: candidateRecord.education.map(e => ({
            candidate_id: createdDbCand.id,
            degree: e.degree || 'Degree',
            institution: e.institution || 'Institution',
            field: e.field || '',
          })),
          skipDuplicates: true,
        }).catch(() => null);
      }

      // Persist candidate application
      const stage = finalScore >= 80 ? 'SHORTLISTED' : (finalScore >= 55 ? 'REVIEW' : 'SOURCED');
      await prisma.candidateApplication.upsert({
        where: {
          job_id_candidate_id: {
            job_id: job.id,
            candidate_id: createdDbCand.id
          }
        },
        update: {
          match_score: finalScore,
          stage,
          status: 'active'
        },
        create: {
          job_id: job.id,
          candidate_id: createdDbCand.id,
          match_score: finalScore,
          stage,
          status: 'active'
        }
      }).catch(() => null);

      // Persist Evaluation
      await prisma.evaluation.create({
        data: {
          candidateId: createdDbCand.id,
          jobId: job.id,
          candidateJobId: job.id,
          score: finalScore,
          atsScore: atsScore,
          matchLevel,
          mandatoryCompliance: complianceStr,
          mandatoryFailed: Boolean(evalPayload.mandatoryRequirementFailed),
          decision,
          status: 'COMPLETED',
          createdByUserId: jobOwnerId,
          evaluatedBy: jobOwnerId,
          organizationId: targetOrgId,
          auditData: evalPayload as any,
        }
      }).catch((err) => console.warn('[Evaluation DB Save Notice]:', err));
    } catch (dbErr) {
      console.warn('[Public Application DB Warning] Candidate recorded in memory cache:', dbErr);
    }

    // 12. Update in-memory stores so recruiter sees it immediately in real-time
    const currentList = CANDIDATE_STORE.get(job.id) || [];
    currentList.unshift(candidateRecord);
    CANDIDATE_STORE.set(job.id, currentList);
    GLOBAL_CANDIDATES.set(candidateRecord.id, candidateRecord);
    if (candidateRecord.fileHash) GLOBAL_CANDIDATES.set(candidateRecord.fileHash, candidateRecord);

    // Save to persistent candidate pool as well
    saveCandidateToPersistentPool(candidateRecord);
    const poolStore = CANDIDATE_STORE.get('pool') || [];
    if (!poolStore.some(c => c.id === candidateRecord.id)) {
      poolStore.unshift({ ...candidateRecord });
      CANDIDATE_STORE.set('pool', poolStore);
    }

    // 13. Return clean, user-friendly response to candidate (NO ATS SCORE EXPOSED)
    res.status(201).json({
      success: true,
      message: 'Application submitted successfully! Our recruitment team will review your qualifications.',
      candidateName: candidateRecord.name,
      jobTitle: job.position,
      jobId: job.id,
      candidate: {
        id: candidateRecord.id,
        jobId: job.id,
        name: candidateRecord.name,
        email: candidateRecord.email,
        phone: candidateRecord.phone,
        location: candidateRecord.location,
        totalExperience: candidateRecord.totalExperience,
        currentTitle: candidateRecord.currentTitle,
        currentCompany: candidateRecord.currentCompany,
        summary: candidateRecord.summary,
        skills: candidateRecord.skills,
        experience: candidateRecord.experience,
        education: candidateRecord.education,
        fileName: candidateRecord.fileName,
        fileSize: candidateRecord.fileSize,
        source: 'public_application',
        uploadedAt: candidateRecord.uploadedAt,
        parsingStatus: 'PARSED'
      }
    });
  } catch (error: any) {
    console.error('Error in applyPublicCandidate:', error);
    res.status(500).json({
      error: 'An unexpected error occurred while processing your application. Please try again.',
      details: error.message || String(error)
    });
  }
};
