import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import {
  getClientPortals,
  saveClientPortal,
  assignClientPortal,
  deleteClientPortal
} from '../controllers/clientPortalController';

const router = Router();

// Get all client portals visible to the authenticated user
router.get('/', protect, getClientPortals);

// Save or sync a client portal link
router.post('/', protect, saveClientPortal);

// Assign a client portal to a recruiter/member
router.post('/assign', protect, assignClientPortal);

// Delete client portal (ADMIN ONLY - enforced in controller)
router.delete('/:id', protect, deleteClientPortal);

export default router;
