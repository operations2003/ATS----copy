import { Router } from 'express';
import {
  getPublicClientShare,
  updateCandidateStatusAndFeedback,
  downloadCandidateCv,
} from '../controllers/publicClientShareController';

const router = Router();

// Public Client Candidate Sharing Endpoints (Secured by cryptographic link token)
router.get('/:token', getPublicClientShare);
router.post('/:token/candidates/:candidateId/status', updateCandidateStatusAndFeedback);
router.get('/:token/candidates/:candidateId/cv', downloadCandidateCv);

export default router;
