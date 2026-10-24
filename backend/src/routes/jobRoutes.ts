import {
  createBulkBatch,
  uploadFilesToBatch,
  getBatchStatus,
  retryBatchItem,
  retryAllFailedInBatch
} from '../controllers/bulkUploadController';

import { Router } from 'express';
import multer from 'multer';
import {
  createJob,
  getAllJobs,
  getJobById,
  updateJob,
  deleteJob,
  parseJobDescriptionController,
  getAvailableJobsForEvaluation,
  normalizeJobWithAiController
} from '../controllers/jobController';
import { protect, optionalProtect, authorize, checkJdUploadPermission } from '../middleware/authMiddleware';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit per file
});

const router = Router();

// Document parsing route (stateless document text extraction & analysis)
router.post('/parse', protect, checkJdUploadPermission, upload.single('file'), parseJobDescriptionController);

import {
  getRequirements,
  createRequirement,
  updateRequirement,
  deleteRequirement,
  confirmRequirements
} from '../controllers/requirementController';

import {
  uploadCandidateCVs,
  getCandidatesForJob,
  getCandidateById,
  retryCandidateParsing,
  deleteCandidate,
  updateCandidateDecision
} from '../controllers/candidateController';

// Available Jobs for Candidate Evaluation & Matching (Entry Point 2)
router.get('/available-for-evaluation', protect, getAvailableJobsForEvaluation);

import {
  getOrCreateJobPublicLink,
  getJobPublicLink,
  toggleJobPublicLink,
} from '../controllers/publicCandidateController';

import {
  getJobHiringRealityController,
  simulateJobHiringRealityController
} from '../controllers/hiringRealityController';

// Hiring Reality Engine Routes (Phase 2)
router.post('/hiring-reality/simulate', protect, simulateJobHiringRealityController);
router.get('/:id/hiring-reality', protect, getJobHiringRealityController);

// Database routes
router.post('/', protect, checkJdUploadPermission, createJob);
router.get('/', protect, getAllJobs);
router.get('/:id', protect, getJobById);
router.post('/:id/public-link', protect, getOrCreateJobPublicLink);
router.get('/:id/public-link', protect, getJobPublicLink);
router.patch('/:id/public-link', protect, toggleJobPublicLink);
router.post('/:id/normalize-ai', protect, normalizeJobWithAiController);
router.put('/:id', protect, updateJob);
router.delete('/:id', protect, deleteJob);

// Requirement CRUD & Confirmation API Routes
router.get('/:jobId/requirements', protect, getRequirements);
router.post('/:jobId/requirements', protect, createRequirement);
router.put('/:jobId/requirements/:requirementId', protect, updateRequirement);
router.delete('/:jobId/requirements/:requirementId', protect, deleteRequirement);
router.post('/:jobId/requirements/confirm', protect, confirmRequirements);

import { getCandidateEvaluation, evaluateCandidateController } from '../controllers/evaluationController';
import { getCandidateDecisionIntelligenceController } from '../controllers/decisionIntelligenceController';

import {
  getCandidateSummaryController,
  generateCandidateSummaryController,
  downloadCandidateSummaryPdfController,
  downloadCandidateSummaryDocxController
} from '../controllers/candidateSummaryController';

// Candidate CV Upload, Extraction & Status Routes
router.post('/:jobId/candidates/upload', protect, upload.any(), uploadCandidateCVs);
// ── Durable Bulk CV Upload & Background Processing Routes ───────────────────
router.post('/:jobId/candidates/batch', protect, createBulkBatch);
router.post('/:jobId/candidates/batch/:batchId/upload', protect, upload.any(), uploadFilesToBatch);
router.get('/:jobId/candidates/batch/:batchId', protect, getBatchStatus);
router.post('/:jobId/candidates/batch/:batchId/items/:itemId/retry', protect, retryBatchItem);
router.post('/:jobId/candidates/batch/:batchId/retry-failed', protect, retryAllFailedInBatch);

router.get('/:jobId/candidates', protect, getCandidatesForJob);
router.get('/:jobId/candidates/:candidateId', protect, getCandidateById);
router.patch('/:jobId/candidates/:candidateId/decision', protect, updateCandidateDecision);
router.get('/:jobId/candidates/:candidateId/evaluation', protect, getCandidateEvaluation);
router.get('/:jobId/candidates/:candidateId/decision-intelligence', protect, getCandidateDecisionIntelligenceController);

// Candidate Executive Summary & Downloadable Reports (Job-specific)
router.get('/:jobId/candidates/:candidateId/summary', protect, getCandidateSummaryController);
router.post('/:jobId/candidates/:candidateId/summary', protect, generateCandidateSummaryController);
router.get('/:jobId/candidates/:candidateId/summary/pdf', protect, downloadCandidateSummaryPdfController);
router.get('/:jobId/candidates/:candidateId/summary/docx', protect, downloadCandidateSummaryDocxController);

router.post('/:jobId/candidates/:candidateId/evaluate', protect, evaluateCandidateController);
router.post('/:jobId/candidates/:candidateId/retry', protect, retryCandidateParsing);
router.delete('/:jobId/candidates/:candidateId', protect, deleteCandidate);

export default router;
