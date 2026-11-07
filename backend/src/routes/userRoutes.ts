import { Router } from 'express';
import {
  getAllUsers,
  getTAMembers,
  createMember,
  updateMember,
  updateUserRole,
  assignUserTeam,
  deleteUser,
  getUserQuotaController,
  updateSubscriptionPlanController,
  toggleUserActiveController,
  getRecruiterPerformanceTrackerController
} from '../controllers/userController';
import { protect, optionalProtect, authorize } from '../middleware/authMiddleware';

const router = Router();

// GET /api/users/quota - Get organization quota and user slots
router.get('/quota', protect, getUserQuotaController);

// POST /api/users/subscription - Update subscription plan (Starter: 500, Professional: 2500)
router.post('/subscription', protect, authorize('ADMIN'), updateSubscriptionPlanController);

// GET /api/users/ta-members - Live TA members data with real database metrics
router.get('/ta-members', protect, getTAMembers);

// GET /api/users/recruiter-performance - Recruiter Performance & CV Evaluation Pipeline Tracker
router.get('/recruiter-performance', protect, getRecruiterPerformanceTrackerController);

// GET /api/users - Available for user lists
router.get('/', protect, getAllUsers);

// Protected routes (ADMIN / CLIENT_ADMIN / SUPER_ADMIN)
router.post('/create-member', protect, authorize('ADMIN'), createMember);
router.post('/', protect, authorize('ADMIN'), createMember);
router.put('/:id', protect, authorize('ADMIN'), updateMember);
router.patch('/:id', protect, authorize('ADMIN'), updateMember);
router.patch('/:id/role', protect, authorize('ADMIN'), updateUserRole);
router.patch('/:id/team', protect, authorize('ADMIN'), assignUserTeam);
router.patch('/:id/toggle-active', protect, authorize('ADMIN'), toggleUserActiveController);
router.delete('/:id', protect, authorize('ADMIN'), deleteUser);

export default router;
