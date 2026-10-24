import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import {
  createClientShare,
  listJobClientShares,
  getClientShareById,
  updateClientShareStatus,
  regenerateClientShareToken,
  addCandidatesToShare,
  removeCandidateFromShare,
  getJobCandidateActivities,
} from '../controllers/clientShareController';

const router = Router();

// Recruiter Client Candidate Sharing Management Routes
router.post('/:jobId/client-shares', protect, createClientShare);
router.get('/:jobId/client-shares', protect, listJobClientShares);
router.get('/:jobId/client-shares/:shareId', protect, getClientShareById);
router.patch('/:jobId/client-shares/:shareId/status', protect, updateClientShareStatus);
router.post('/:jobId/client-shares/:shareId/regenerate', protect, regenerateClientShareToken);
router.post('/:jobId/client-shares/:shareId/candidates', protect, addCandidatesToShare);
router.delete('/:jobId/client-shares/:shareId/candidates/:candidateId', protect, removeCandidateFromShare);

// Recruiter Candidate Activity & Interview Tracking Timeline
router.get('/:jobId/candidate-activities', protect, getJobCandidateActivities);

export default router;
