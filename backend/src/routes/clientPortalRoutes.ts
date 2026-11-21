import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import {
  getClientPortals,
  saveClientPortal,
  assignClientPortal,
  deleteClientPortal,
  updateClientPortal,
  getPublicClientPortal,
  addJdToClientPortalPublic,
  addJdToClientPortalAuth,
  getClientPortalJds
} from '../controllers/clientPortalController';

const router = Router();

// Public client portal endpoints (accessible by clients without login)
router.get('/share/:token', getPublicClientPortal);
router.post('/share/:token/jds', addJdToClientPortalPublic);

// Authenticated client portal endpoints (used by recruiters and admins in ATS)
router.get('/', protect, getClientPortals);
router.post('/', protect, saveClientPortal);
router.post('/assign', protect, assignClientPortal);
router.get('/:id/jds', protect, getClientPortalJds);
router.post('/:id/jds', protect, addJdToClientPortalAuth);
router.put('/:id', protect, updateClientPortal);
router.delete('/:id', protect, deleteClientPortal);

export default router;
