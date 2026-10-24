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
  getAllCandidates,
  getCandidateById,
  deleteCandidate,
  uploadCandidateCVs,
  updateCandidateDecision
} from '../controllers/candidateController';
import {
  matchCandidateWithJobController,
  getCandidateEvaluationHistoryController,
  getAvailableJobsForCandidateController,
  attachCandidateToJobController,
  evaluateCandidateJobController
} from '../controllers/evaluationController';
import { getCandidateDecisionIntelligenceController } from '../controllers/decisionIntelligenceController';

import { protect, optionalProtect } from '../middleware/authMiddleware';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit per file
});

const router = Router();

// Retrieve all candidates in central candidate pool (scoped to organization)
router.get('/', protect, getAllCandidates);

// Bulk upload CVs directly to candidate pool
router.post('/upload', protect, upload.any(), uploadCandidateCVs);
// ── Durable Bulk CV Upload & Background Processing Routes (Talent Pool) ───────
router.post('/batch', protect, createBulkBatch);
router.post('/batch/:batchId/upload', protect, upload.any(), uploadFilesToBatch);
router.get('/batch/:batchId', protect, getBatchStatus);
router.post('/batch/:batchId/items/:itemId/retry', protect, retryBatchItem);
router.post('/batch/:batchId/retry-failed', protect, retryAllFailedInBatch);


// Available jobs in organization for matching against a candidate (filtered by permissions)
router.get('/:candidateId/available-jobs', protect, getAvailableJobsForCandidateController);

// Attach candidate to a job (create/reuse CandidateJob)
router.post('/:candidateId/jobs', protect, attachCandidateToJobController);

// Evaluate candidate against a specific job
router.post('/:candidateId/jobs/:jobId/evaluate', protect, evaluateCandidateJobController);

// Match candidate from pool with a specific Job Description (Entry Point 2)
router.post('/:candidateId/match-with-job', protect, matchCandidateWithJobController);

// Candidate evaluation history across multiple jobs
router.get('/:candidateId/evaluations', protect, getCandidateEvaluationHistoryController);

// HireIQ Decision Intelligence explanatory layer
router.get('/:candidateId/decision-intelligence', protect, getCandidateDecisionIntelligenceController);

import {
  getCandidateSummaryController,
  generateCandidateSummaryController,
  downloadCandidateSummaryPdfController,
  downloadCandidateSummaryDocxController
} from '../controllers/candidateSummaryController';

// Candidate Executive Summary & Downloadable PDF / DOCX Reports
router.get('/:candidateId/summary', protect, getCandidateSummaryController);
router.post('/:candidateId/summary', protect, generateCandidateSummaryController);
router.get('/:candidateId/summary/pdf', protect, downloadCandidateSummaryPdfController);
router.post('/:candidateId/summary/pdf', protect, downloadCandidateSummaryPdfController);
router.get('/:candidateId/summary/docx', protect, downloadCandidateSummaryDocxController);
router.post('/:candidateId/summary/docx', protect, downloadCandidateSummaryDocxController);

// Single candidate lookup, decision update & delete
router.get('/:candidateId', protect, getCandidateById);
router.patch('/:candidateId/decision', protect, updateCandidateDecision);
router.delete('/:candidateId', protect, deleteCandidate);

export default router;
