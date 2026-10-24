/**
 * Bulk Upload Orchestration Service for HireIQ ATS
 *
 * Implements high-throughput, fault-tolerant batch CV processing:
 * - Up to 100+ files per batch with zero memory exhaustion (streamed to temp disk)
 * - Safe per-CV state machine (UPLOADED -> QUEUED -> EXTRACTING -> VALIDATING -> SCORING -> COMPLETED)
 * - Gemini rate-limited extraction with deterministic fallbacks
 * - Exact Centralized ATS Scoring preservation
 * - Safe tenant isolation and JD-specific duplicate rules
 * - Per-CV retry and resume from earliest incomplete stage
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import prisma from '../config/prisma';
import { bulkQueue } from './bulkQueueService';
import { extractCvWithGemini } from './geminiCvService';
import {
  extractDocumentTextViaPython,
  extractDocumentTextLocally,
  PythonDocumentResponse
} from './pythonDocumentClient';
import {
  extractStructuredCandidateFromText,
  validateCvTextQuality,
  calculateNonOverlappingExperienceMonths
} from './cvParsingService';
import {
  CandidateRecord,
  saveCandidateToPersistentPool,
  CANDIDATE_STORE,
  GLOBAL_CANDIDATES
} from '../controllers/candidateController';
import { calculateCentralizedATSScore } from './centralizedATSScoringService';
import { getStandardRequirementsForPosition } from '../controllers/evaluationController';

const STORAGE_ROOT = process.env.STORAGE_DIR || path.resolve(process.cwd(), 'uploads', 'batches');
const MAX_BATCH_SIZE = parseInt(process.env.MAX_BATCH_SIZE || '250', 10);
const MAX_FILE_SIZE_BYTES = parseInt(process.env.MAX_FILE_SIZE_MB || '15', 10) * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt'];

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_ROOT)) {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true });
}

export interface CreateBatchInput {
  jobId?: string | null;
  organizationId: string;
  uploadedBy: string;
  totalFiles?: number;
}

export class BulkUploadService {
  constructor() {
    // Register the processor with the durable queue
    bulkQueue.setProcessor(this.processBatchItem.bind(this));
  }

  /**
   * Create a new bulk upload batch session.
   */
  async createBatch(input: CreateBatchInput) {
    const isPool = !input.jobId || input.jobId === 'pool' || input.jobId === 'all';
    const dbJobId = (!isPool && input.jobId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.jobId))
      ? input.jobId
      : null;

    const batch = await prisma.bulkUploadBatch.create({
      data: {
        jobId: dbJobId,
        organizationId: input.organizationId || 'org-tasknera',
        uploadedBy: input.uploadedBy,
        totalFiles: input.totalFiles || 0,
        status: 'PENDING',
      },
    });

    const batchDir = path.join(STORAGE_ROOT, batch.id);
    if (!fs.existsSync(batchDir)) {
      fs.mkdirSync(batchDir, { recursive: true });
    }

    return batch;
  }

  /**
   * Add an uploaded file into a batch session and enqueue it for background processing.
   */
  async addFileToBatch(
    batchId: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
    userOrgId: string
  ) {
    const batch = await prisma.bulkUploadBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new Error('Batch not found');
    }

    if (batch.organizationId !== userOrgId) {
      throw new Error('Unauthorized access to batch');
    }

    const ext = '.' + (file.originalname.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new Error(`Unsupported file type: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(`File exceeds maximum size limit of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`);
    }

    if (file.size === 0) {
      throw new Error('Empty file received');
    }

    const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const batchDir = path.join(STORAGE_ROOT, batchId);
    if (!fs.existsSync(batchDir)) {
      fs.mkdirSync(batchDir, { recursive: true });
    }

    const safeFileName = `${Date.now()}_${path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const storagePath = path.join(batchDir, safeFileName);
    fs.writeFileSync(storagePath, file.buffer);

    // Create item in DB with UPLOADED status, then transition to QUEUED
    const item = await prisma.bulkCvItem.create({
      data: {
        batchId,
        fileName: file.originalname,
        fileSize: file.size,
        fileMime: file.mimetype || 'application/pdf',
        fileHash,
        storagePath,
        status: 'QUEUED',
        validationStatus: 'PENDING',
      },
    });

    // Update batch metrics
    await prisma.bulkUploadBatch.update({
      where: { id: batchId },
      data: {
        totalFiles: { increment: 1 },
        uploadedCount: { increment: 1 },
        queuedCount: { increment: 1 },
        status: 'PROCESSING',
      },
    });

    // Notify queue worker to process
    bulkQueue.kick();

    return item;
  }

  /**
   * Pipeline worker executing per-CV state machine:
   * UPLOADED -> QUEUED -> EXTRACTING -> VALIDATING -> SCORING -> COMPLETED
   */
  async processBatchItem(itemId: string): Promise<void> {
    const item = await prisma.bulkCvItem.findUnique({
      where: { id: itemId },
      include: { batch: true },
    });

    if (!item) return;

    const { batch } = item;
    const jobId = batch.jobId || 'pool';
    const userOrgId = batch.organizationId;
    const defaultUserId = batch.uploadedBy;

    try {
      console.log(`\n[Bulk Pipeline] Processing item ${item.id}: ${item.fileName}`);

      // ── STAGE 1: EXTRACTING ────────────────────────────────────────────────
      await this.updateItemStatus(item.id, 'EXTRACTING');

      // 1. Verify file exists
      if (!item.storagePath || !fs.existsSync(item.storagePath)) {
        await this.failItemPermanently(item.id, 'FILE_NOT_FOUND', 'Uploaded file is missing from storage');
        await this.syncBatchCounts(batch.id);
        return;
      }

      const fileBuffer = fs.readFileSync(item.storagePath);
      const fileHash = item.fileHash || crypto.createHash('sha256').update(fileBuffer).digest('hex');
      const fileMd5 = crypto.createHash('md5').update(fileBuffer).digest('hex');

      // 2. Duplicate Detection
      const duplicateResult = await this.checkDuplicate(
        item.fileName,
        fileHash,
        fileMd5,
        jobId,
        userOrgId
      );

      if (duplicateResult.isDuplicateInJob) {
        console.log(`[Bulk Pipeline] Duplicate detected for ${item.fileName} in job ${jobId}`);
        await prisma.bulkCvItem.update({
          where: { id: item.id },
          data: {
            status: 'DUPLICATE',
            candidateId: duplicateResult.candidateId,
            candidateName: duplicateResult.candidateName,
            candidateEmail: duplicateResult.candidateEmail,
            atsScore: duplicateResult.atsScore,
            errorMessage: 'This CV is already uploaded to this JD.',
            completedAt: new Date(),
          },
        });
        await this.syncBatchCounts(batch.id);
        this.cleanUpStorageFile(item.storagePath);
        return;
      }

      // 3. Document Text Extraction (Python microservice preferred, local fallback)
      let rawText = '';
      let extractionMethod = 'direct-text';
      let pageCount = 1;
      let ocrUsed = false;

      // Check if intermediate text is already available (e.g. from prior retry)
      const cached = item.intermediateResult as any;
      if (cached?.rawText && typeof cached.rawText === 'string' && cached.rawText.length > 20) {
        rawText = cached.rawText;
        extractionMethod = cached.extractionMethod || 'cached';
        pageCount = cached.pageCount || 1;
        ocrUsed = cached.ocrUsed || false;
      } else {
        const pythonResult: PythonDocumentResponse = await extractDocumentTextViaPython(
          fileBuffer,
          item.fileName,
          item.fileMime
        );

        if (pythonResult.success && pythonResult.text && pythonResult.text.trim().length > 20) {
          rawText = pythonResult.normalizedText || pythonResult.text;
          extractionMethod = pythonResult.extractionMethod || 'python-direct';
          pageCount = pythonResult.pageCount || 1;
          ocrUsed = pythonResult.ocrUsed || false;
        } else {
          // Local fallback
          const localFallback = await extractDocumentTextLocally(fileBuffer, item.fileName, item.fileMime);
          if (localFallback.text && localFallback.text.trim().length > 20) {
            rawText = localFallback.normalizedText || localFallback.text;
            extractionMethod = localFallback.extractionMethod;
            pageCount = localFallback.pageCount;
            ocrUsed = localFallback.ocrUsed;
          }
        }
      }

      // 4. Quality threshold check on extracted text
      const textQuality = validateCvTextQuality(rawText);
      if (!rawText || !textQuality.isValid) {
        console.warn(`[Bulk Pipeline] Text quality rejected for ${item.fileName}: ${textQuality.reason}`);
        await this.failItemPermanently(item.id, 'CORRUPT_DOCUMENT', textQuality.reason || 'Document text unreadable or empty.');
        await this.syncBatchCounts(batch.id);
        this.cleanUpStorageFile(item.storagePath);
        return;
      }

      // 5. Structured Data Extraction via Gemini (with rate limiting & fallback)
      let structuredProfile: any = null;
      let extractionWarnings: Record<string, string> = {};

      if (cached?.structuredProfile) {
        structuredProfile = cached.structuredProfile;
        extractionWarnings = cached.fieldWarnings || {};
      } else {
        const geminiResult = await extractCvWithGemini(rawText, item.fileName);

        if (geminiResult.isQuotaExhausted) {
          // Defer and mark as FAILED_RETRYABLE so user can retry once quota resets
          await prisma.bulkCvItem.update({
            where: { id: item.id },
            data: {
              status: 'FAILED_RETRYABLE',
              errorCode: 'QUOTA_EXHAUSTED',
              errorMessage: 'Gemini daily API quota exhausted. Resume processing when quota resets.',
              intermediateResult: { rawText, extractionMethod, pageCount, ocrUsed },
            },
          });
          await this.syncBatchCounts(batch.id);
          return;
        }

        if (geminiResult.success && geminiResult.profile) {
          structuredProfile = geminiResult.profile;
          extractionWarnings = geminiResult.fieldWarnings;
        } else {
          // Deterministic fallback parser
          console.log(`[Bulk Pipeline] Engaging deterministic extraction fallback for ${item.fileName}`);
          const fallbackProfile = extractStructuredCandidateFromText(rawText, item.fileName, {
            fileType: item.fileMime,
            pageCount,
            extractionMethod: 'deterministic-fallback',
            ocrUsed,
            characterCount: rawText.length,
            wordCount: rawText.split(/\s+/).filter(Boolean).length,
          });
          structuredProfile = fallbackProfile;
          extractionWarnings = { fallback: 'Extracted using deterministic fallback rules.' };
        }

        // Cache intermediate result for resilient retry
        await prisma.bulkCvItem.update({
          where: { id: item.id },
          data: {
            intermediateResult: {
              rawText,
              extractionMethod,
              pageCount,
              ocrUsed,
              structuredProfile,
              fieldWarnings: extractionWarnings,
            },
          },
        });
      }

      // ── STAGE 2: VALIDATING ────────────────────────────────────────────────
      await this.updateItemStatus(item.id, 'VALIDATING');

      // Calculate non-overlapping experience
      const experiences = Array.isArray(structuredProfile.experience) ? structuredProfile.experience : [];
      if (experiences.length > 0) {
        const nonOverlap = calculateNonOverlappingExperienceMonths(experiences.map((e: any) => ({
          title: e.title || '',
          company: e.company || '',
          startDate: e.startDate || e.start_date,
          endDate: e.endDate || e.end_date,
          duration: e.duration || '',
        })));

        const nonOverlapYrs = parseFloat((nonOverlap.totalMonths / 12).toFixed(1));
        if (!structuredProfile.totalExperience || structuredProfile.totalExperience === '0 yrs') {
          structuredProfile.totalExperience = `${nonOverlapYrs} yrs`;
          structuredProfile.totalExperienceMonths = nonOverlap.totalMonths;
          structuredProfile.totalExperienceYears = nonOverlapYrs;
        } else if (typeof structuredProfile.totalExperienceYears === 'number' && nonOverlapYrs > structuredProfile.totalExperienceYears) {
          structuredProfile.totalExperience = `${nonOverlapYrs} yrs`;
          structuredProfile.totalExperienceMonths = nonOverlap.totalMonths;
          structuredProfile.totalExperienceYears = nonOverlapYrs;
        }
      }

      // Determine Validation Status (NEEDS_REVIEW if key fields missing)
      let validationStatus: 'VALID' | 'NEEDS_REVIEW' | 'INVALID' = 'VALID';
      const hasName = Boolean(structuredProfile.name && structuredProfile.name.trim().length > 1);
      const hasContact = Boolean(structuredProfile.email || structuredProfile.phone);
      const hasSkillsOrExp = (structuredProfile.skills && structuredProfile.skills.length > 0) || experiences.length > 0;

      if (!hasName || !hasContact || !hasSkillsOrExp) {
        validationStatus = 'NEEDS_REVIEW';
      }

      // Update candidate details on item
      await prisma.bulkCvItem.update({
        where: { id: item.id },
        data: {
          candidateName: structuredProfile.name || 'Candidate Profile',
          candidateEmail: structuredProfile.email || null,
          validationStatus,
          fieldWarnings: extractionWarnings,
        },
      });

      // ── STAGE 3: SCORING ───────────────────────────────────────────────────
      let finalAtsScore: number | null = null;
      let matchLevel: string | null = null;
      let mandatoryCompliance: string | null = null;
      let decision: string = 'REVIEW';
      let evaluationAudit: any = null;

      if (jobId && jobId !== 'pool') {
        await this.updateItemStatus(item.id, 'SCORING');

        try {
          const jobRecord = await prisma.job.findUnique({
            where: { id: jobId },
            include: { requirements: true },
          });

          if (jobRecord) {
            const reqs = jobRecord.requirements || [];
            const scoringInputCandidate: CandidateRecord = {
              id: item.id,
              jobId,
              organizationId: userOrgId,
              name: structuredProfile.name || item.fileName,
              email: structuredProfile.email || '',
              phone: structuredProfile.phone || '',
              location: structuredProfile.location || '',
              totalExperience: structuredProfile.totalExperience || '0 yrs',
              relevantExperience: structuredProfile.totalExperience || '0 yrs',
              currentTitle: structuredProfile.currentTitle || '',
              currentCompany: structuredProfile.currentCompany || '',
              summary: structuredProfile.summary || '',
              skills: structuredProfile.skills || [],
              technologies: structuredProfile.technologies || structuredProfile.skills || [],
              tools: structuredProfile.tools || [],
              industries: structuredProfile.industries || [],
              education: structuredProfile.education || [],
              certifications: structuredProfile.certifications || [],
              languages: structuredProfile.languages || [],
              experience: structuredProfile.experience || [],
              responsibilities: structuredProfile.responsibilities || [],
              achievements: structuredProfile.achievements || [],
              projects: structuredProfile.projects || [],
              rawText,
              parsingStatus: 'PARSED',
              validationErrors: [],
              parsingMetadata: {
                fileName: item.fileName,
                fileType: item.fileMime,
                pageCount,
                extractionMethod,
                ocrUsed,
                characterCount: rawText.length,
                wordCount: rawText.split(/\s+/).filter(Boolean).length,
              },
              fileName: item.fileName,
              fileSize: item.fileSize,
              fileHash,
              uploadedAt: new Date().toISOString(),
            };

            const scoringResult = calculateCentralizedATSScore({
              candidate: scoringInputCandidate,
              job: {
                id: jobRecord.id,
                position: jobRecord.position,
                title: jobRecord.position,
                client: jobRecord.client,
                jd_text: jobRecord.jd_text || '',
                normalized_jd: jobRecord.normalized_jd,
              },
              requirements: reqs.map((r: any) => ({
                id: r.id,
                requirement: r.requirement,
                category: r.category,
                weight: r.weight,
                is_mandatory: r.is_mandatory,
                source_evidence: r.source_evidence,
                aliases: r.aliases,
                context: r.context,
              })),
            });

            finalAtsScore = scoringResult.finalScore;
            matchLevel = scoringResult.matchLevel;
            mandatoryCompliance = scoringResult.mandatoryCompliance?.passed ? 'MET' : 'NOT MET';
            decision = scoringResult.recommendation;
            evaluationAudit = scoringResult;
          }
        } catch (scoringErr: any) {
          console.warn(`[Bulk Pipeline] Scoring calculation notice for ${item.fileName}:`, scoringErr?.message || scoringErr);
        }
      }

      // ── STAGE 4: PERSIST CANDIDATE & EVALUATION ─────────────────────────────
      // Persist authoritative Candidate entity into database
      const dbCandidate = await prisma.candidate.create({
        data: {
          job_id: (jobId !== 'pool' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) ? jobId : null,
          organizationId: userOrgId,
          name: structuredProfile.name || 'Candidate Profile',
          email: structuredProfile.email || null,
          phone: structuredProfile.phone || null,
          location: structuredProfile.location || null,
          total_experience: structuredProfile.totalExperience || '0 yrs',
          current_title: structuredProfile.currentTitle || null,
          current_company: structuredProfile.currentCompany || null,
          summary: structuredProfile.summary || null,
          resume_file_url: item.fileName,
          raw_text: rawText,
          file_hash: fileHash,
          parsing_status: 'PARSED',
          created_by: defaultUserId,
          source: 'bulk_upload',
        },
      });

      // Persist relational child records
      if (Array.isArray(structuredProfile.skills) && structuredProfile.skills.length > 0) {
        await prisma.candidateSkill.createMany({
          data: structuredProfile.skills.map((s: string) => ({ candidate_id: dbCandidate.id, skill: s })),
          skipDuplicates: true,
        }).catch(() => null);
      }

      if (Array.isArray(structuredProfile.experience) && structuredProfile.experience.length > 0) {
        await prisma.candidateExperience.createMany({
          data: structuredProfile.experience.map((ex: any) => ({
            candidate_id: dbCandidate.id,
            company: ex.company || 'Company',
            title: ex.title || 'Role',
            duration: ex.duration || '',
            description: ex.description || '',
            start_date: ex.startDate || ex.start_date || '',
            end_date: ex.endDate || ex.end_date || '',
          })),
          skipDuplicates: true,
        }).catch(() => null);
      }

      if (Array.isArray(structuredProfile.education) && structuredProfile.education.length > 0) {
        await prisma.candidateEducation.createMany({
          data: structuredProfile.education.map((edu: any) => ({
            candidate_id: dbCandidate.id,
            degree: edu.degree || 'Degree',
            institution: edu.institution || 'Institution',
            field: edu.field || '',
          })),
          skipDuplicates: true,
        }).catch(() => null);
      }

      // Link application if associated with a job
      if (jobId && jobId !== 'pool' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
        await prisma.candidateApplication.upsert({
          where: {
            job_id_candidate_id: {
              job_id: jobId,
              candidate_id: dbCandidate.id,
            },
          },
          update: {
            match_score: finalAtsScore,
            stage: 'PARSED',
            status: 'active',
          },
          create: {
            job_id: jobId,
            candidate_id: dbCandidate.id,
            match_score: finalAtsScore,
            stage: 'PARSED',
            status: 'active',
          },
        }).catch(() => null);

        // Persist Evaluation record
        if (finalAtsScore !== null) {
          await prisma.evaluation.create({
            data: {
              organizationId: userOrgId,
              candidateId: dbCandidate.id,
              jobId,
              createdByUserId: defaultUserId,
              score: finalAtsScore,
              atsScore: finalAtsScore,
              matchLevel,
              mandatoryCompliance,
              mandatoryFailed: mandatoryCompliance === 'NOT MET',
              decision,
              status: 'COMPLETED',
              auditData: evaluationAudit,
            },
          }).catch((evalErr) => {
            console.warn('[Bulk Pipeline] Evaluation record creation notice:', evalErr?.message || evalErr);
          });
        }
      }

      // Also persist to memory store & JSON pool for existing UI components
      const candidateRecord: CandidateRecord = {
        id: dbCandidate.id,
        jobId,
        organizationId: userOrgId,
        name: dbCandidate.name,
        email: dbCandidate.email || '',
        phone: dbCandidate.phone || '',
        location: dbCandidate.location || '',
        totalExperience: dbCandidate.total_experience || '0 yrs',
        currentTitle: dbCandidate.current_title || '',
        currentCompany: dbCandidate.current_company || '',
        summary: dbCandidate.summary || '',
        skills: structuredProfile.skills || [],
        technologies: structuredProfile.technologies || structuredProfile.skills || [],
        tools: structuredProfile.tools || [],
        industries: structuredProfile.industries || [],
        education: structuredProfile.education || [],
        certifications: structuredProfile.certifications || [],
        languages: structuredProfile.languages || [],
        experience: structuredProfile.experience || [],
        responsibilities: [],
        achievements: [],
        projects: structuredProfile.projects || [],
        rawText,
        parsingStatus: 'PARSED',
        validationErrors: [],
        parsingMetadata: {
          fileName: item.fileName,
          fileType: item.fileMime,
          pageCount,
          extractionMethod,
          ocrUsed,
          characterCount: rawText.length,
          wordCount: rawText.split(/\s+/).filter(Boolean).length,
        },
        fileName: item.fileName,
        fileSize: item.fileSize,
        fileHash,
        uploadedAt: dbCandidate.created_at.toISOString(),
        atsScore: finalAtsScore ?? undefined,
        matchScore: finalAtsScore ?? undefined,
        matchLevel: matchLevel || undefined,
        decision,
        mandatoryCompliance: mandatoryCompliance || undefined,
        evaluation: evaluationAudit,
      };

      saveCandidateToPersistentPool(candidateRecord);
      GLOBAL_CANDIDATES.set(fileHash, candidateRecord);
      GLOBAL_CANDIDATES.set(dbCandidate.id, candidateRecord);

      const jobCandidates = CANDIDATE_STORE.get(jobId) || [];
      jobCandidates.unshift(candidateRecord);
      CANDIDATE_STORE.set(jobId, jobCandidates);

      // Final item completion update
      const finalStatus = validationStatus === 'NEEDS_REVIEW' ? 'NEEDS_REVIEW' : 'COMPLETED';
      await prisma.bulkCvItem.update({
        where: { id: item.id },
        data: {
          status: finalStatus,
          candidateId: dbCandidate.id,
          candidateName: dbCandidate.name,
          candidateEmail: dbCandidate.email,
          atsScore: finalAtsScore,
          validationStatus,
          completedAt: new Date(),
        },
      });

      console.log(`[Bulk Pipeline] Finished processing ${item.fileName} -> ${finalStatus} (ATS Score: ${finalAtsScore})`);
      await this.syncBatchCounts(batch.id);
      this.cleanUpStorageFile(item.storagePath);
    } catch (err: any) {
      console.error(`[Bulk Pipeline] Error processing item ${item.id}:`, err);
      const isRetryable = item.attemptCount < item.maxAttempts;
      await prisma.bulkCvItem.update({
        where: { id: item.id },
        data: {
          status: isRetryable ? 'FAILED_RETRYABLE' : 'FAILED_PERMANENTLY',
          errorCode: 'PROCESSING_ERROR',
          errorMessage: err?.message || 'Processing error occurred',
        },
      });
      await this.syncBatchCounts(batch.id);
    }
  }

  /**
   * Duplicate detection logic matching existing application rules.
   */
  private async checkDuplicate(
    fileName: string,
    fileHash: string,
    fileMd5: string,
    jobId: string,
    userOrgId: string
  ): Promise<{
    isDuplicateInJob: boolean;
    candidateId?: string;
    candidateName?: string;
    candidateEmail?: string;
    atsScore?: number;
  }> {
    try {
      const existingCandidate = await prisma.candidate.findFirst({
        where: {
          organizationId: userOrgId,
          OR: [
            { file_hash: fileHash },
            { file_hash: fileMd5 },
            { resume_file_url: fileName },
          ],
        },
        include: {
          applications: true,
          evaluations: true,
        },
      });

      if (!existingCandidate) {
        return { isDuplicateInJob: false };
      }

      // If uploading to a specific Job, check if candidate is already in this job
      if (jobId && jobId !== 'pool') {
        const isInJob = existingCandidate.job_id === jobId ||
          (existingCandidate.applications && existingCandidate.applications.some((a: any) => a.job_id === jobId));

        if (isInJob) {
          const evalScore = existingCandidate.evaluations?.find((e: any) => e.jobId === jobId)?.atsScore;
          return {
            isDuplicateInJob: true,
            candidateId: existingCandidate.id,
            candidateName: existingCandidate.name || undefined,
            candidateEmail: existingCandidate.email || undefined,
            atsScore: evalScore ? Number(evalScore) : undefined,
          };
        }
      } else {
        // Pool upload duplicate check
        return {
          isDuplicateInJob: true,
          candidateId: existingCandidate.id,
          candidateName: existingCandidate.name || undefined,
          candidateEmail: existingCandidate.email || undefined,
        };
      }
    } catch (err) {
      console.warn('[Bulk Pipeline] Duplicate check notice:', err);
    }

    return { isDuplicateInJob: false };
  }

  /**
   * Retry processing for a single failed CV item.
   * Resumes from the earliest safe incomplete stage.
   */
  async retryItem(itemId: string, userOrgId: string) {
    const item = await prisma.bulkCvItem.findUnique({
      where: { id: itemId },
      include: { batch: true },
    });

    if (!item) throw new Error('CV item not found');
    if (item.batch.organizationId !== userOrgId) throw new Error('Unauthorized');

    // Reset status to QUEUED and increment maxAttempts if necessary
    const updated = await prisma.bulkCvItem.update({
      where: { id: itemId },
      data: {
        status: 'QUEUED',
        maxAttempts: Math.max(item.maxAttempts, item.attemptCount + 2),
        errorCode: null,
        errorMessage: null,
      },
    });

    await this.syncBatchCounts(item.batchId);
    bulkQueue.kick();

    return updated;
  }

  /**
   * Retry all failed items in a batch.
   */
  async retryAllFailedInBatch(batchId: string, userOrgId: string) {
    const batch = await prisma.bulkUploadBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) throw new Error('Batch not found');
    if (batch.organizationId !== userOrgId) throw new Error('Unauthorized');

    const result = await prisma.bulkCvItem.updateMany({
      where: {
        batchId,
        status: { in: ['FAILED_RETRYABLE', 'FAILED_PERMANENTLY', 'NEEDS_REVIEW'] },
      },
      data: {
        status: 'QUEUED',
        errorCode: null,
        errorMessage: null,
      },
    });

    await this.syncBatchCounts(batchId);
    bulkQueue.kick();

    return { retriedCount: result.count };
  }

  /**
   * Retrieve real-time batch metrics and per-file item list.
   */
  async getBatchDetails(batchId: string, userOrgId: string) {
    const batch = await prisma.bulkUploadBatch.findUnique({
      where: { id: batchId },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            fileName: true,
            fileSize: true,
            status: true,
            candidateId: true,
            candidateName: true,
            candidateEmail: true,
            atsScore: true,
            validationStatus: true,
            attemptCount: true,
            maxAttempts: true,
            errorCode: true,
            errorMessage: true,
            fieldWarnings: true,
            createdAt: true,
            completedAt: true,
          },
        },
      },
    });

    if (!batch) throw new Error('Batch not found');
    if (batch.organizationId !== userOrgId) throw new Error('Unauthorized');

    const items = batch.items;
    const totalFiles = items.length;
    const uploadedCount = items.length;
    const queuedCount = items.filter(i => i.status === 'QUEUED').length;
    const processingCount = items.filter(i => ['EXTRACTING', 'VALIDATING', 'SCORING'].includes(i.status)).length;
    const parsedCount = items.filter(i => ['COMPLETED', 'NEEDS_REVIEW'].includes(i.status)).length;
    const scoredCount = items.filter(i => i.atsScore !== null && i.atsScore !== undefined).length;
    const failedCount = items.filter(i => ['FAILED_RETRYABLE', 'FAILED_PERMANENTLY'].includes(i.status)).length;
    const reviewCount = items.filter(i => i.status === 'NEEDS_REVIEW').length;
    const duplicateCount = items.filter(i => i.status === 'DUPLICATE').length;

    const finishedCount = parsedCount + failedCount + duplicateCount;
    const progress = totalFiles > 0 ? Math.round((finishedCount / totalFiles) * 100) : 0;

    return {
      id: batch.id,
      jobId: batch.jobId,
      status: batch.status,
      metrics: {
        totalFiles,
        uploadedCount,
        queuedCount,
        processingCount,
        parsedCount,
        scoredCount,
        failedCount,
        reviewCount,
        duplicateCount,
        progress,
      },
      items,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    };
  }

  private async updateItemStatus(itemId: string, status: any): Promise<void> {
    await prisma.bulkCvItem.update({
      where: { id: itemId },
      data: { status },
    }).catch(() => null);
  }

  private async failItemPermanently(itemId: string, errorCode: string, errorMessage: string): Promise<void> {
    await prisma.bulkCvItem.update({
      where: { id: itemId },
      data: {
        status: 'FAILED_PERMANENTLY',
        errorCode,
        errorMessage,
        completedAt: new Date(),
      },
    }).catch(() => null);
  }

  private async syncBatchCounts(batchId: string): Promise<void> {
    try {
      const items = await prisma.bulkCvItem.findMany({
        where: { batchId },
        select: { status: true, atsScore: true },
      });

      const totalFiles = items.length;
      const queuedCount = items.filter(i => i.status === 'QUEUED').length;
      const processingCount = items.filter(i => ['EXTRACTING', 'VALIDATING', 'SCORING'].includes(i.status)).length;
      const parsedCount = items.filter(i => ['COMPLETED', 'NEEDS_REVIEW'].includes(i.status)).length;
      const scoredCount = items.filter(i => i.atsScore !== null && i.atsScore !== undefined).length;
      const failedCount = items.filter(i => ['FAILED_RETRYABLE', 'FAILED_PERMANENTLY'].includes(i.status)).length;
      const reviewCount = items.filter(i => i.status === 'NEEDS_REVIEW').length;
      const duplicateCount = items.filter(i => i.status === 'DUPLICATE').length;

      let status = 'PROCESSING';
      if (processingCount === 0 && queuedCount === 0) {
        if (failedCount === 0) status = 'COMPLETED';
        else if (parsedCount > 0) status = 'PARTIAL_SUCCESS';
        else status = 'FAILED';
      }

      await prisma.bulkUploadBatch.update({
        where: { id: batchId },
        data: {
          totalFiles,
          uploadedCount: totalFiles,
          queuedCount,
          processingCount,
          parsedCount,
          scoredCount,
          failedCount,
          reviewCount,
          duplicateCount,
          status,
        },
      });
    } catch (err) {
      console.warn('[Bulk Pipeline] Batch count sync notice:', err);
    }
  }

  private cleanUpStorageFile(filePath?: string | null): void {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn('[Bulk Pipeline] Storage cleanup notice:', err);
      }
    }
  }
}

export const bulkUploadService = new BulkUploadService();

