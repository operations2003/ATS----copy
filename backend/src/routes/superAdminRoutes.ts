import { Router } from 'express';
import { protect, authorize } from '../middleware/authMiddleware';
import {
  getOrganizations,
  createOrganization,
  updateLimits,
  updateSubscription,
  toggleStatus,
  resetAdminPassword,
  updateJdPermission,
  getPlatformStats,
  getAuditLogs,
  removeOrganization,
  removeAllOrganizations
} from '../controllers/superAdminController';

const router = Router();

// All super-admin routes are strictly protected and restricted to SUPER_ADMIN (or platform admin)
router.use(protect);
router.use(authorize('SUPER_ADMIN'));

router.get('/organizations', getOrganizations);
router.post('/organizations', createOrganization);
router.delete('/organizations/:id', removeOrganization);
router.delete('/organizations', removeAllOrganizations);
router.patch('/organizations/:id/limits', updateLimits);
router.patch('/organizations/:id/subscription', updateSubscription);
router.post('/organizations/:id/toggle-status', toggleStatus);
router.post('/organizations/:id/reset-admin-password', resetAdminPassword);
router.patch('/organizations/:id/jd-permission', updateJdPermission);
router.post('/organizations/:id/jd-permission', updateJdPermission);
router.put('/organizations/:id/jd-permission', updateJdPermission);
router.get('/stats', getPlatformStats);
router.get('/audit-logs', getAuditLogs);

export default router;

