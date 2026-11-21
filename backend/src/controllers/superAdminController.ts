import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import prisma from '../config/prisma';
import {
  createOrganizationWithAdmin,
  updateOrganizationLimits,
  updateOrganizationSubscription,
  updateOrganizationJdPermission,
  toggleOrganizationStatus,
  resetClientAdminPassword,
  getAllOrganizationsWithStats,
  deleteOrganization,
  deleteAllOrganizations
} from '../services/organizationService';

/**
 * Super Admin: Get all client organizations with metrics & limits
 * GET /api/super-admin/organizations
 */
export const getOrganizations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orgs = await getAllOrganizationsWithStats();
    res.status(200).json({
      success: true,
      count: orgs.length,
      organizations: orgs
    });
  } catch (error: any) {
    console.error('[SuperAdmin Controller] Error fetching organizations:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch client organizations' });
  }
};

/**
 * Super Admin: Create new client organization and initial Client Admin credentials
 * POST /api/super-admin/organizations
 */
export const createOrganization = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      name,
      companyEmail,
      contactPhone,
      address,
      subscriptionPlan,
      billingCycle,
      subscriptionStart,
      subscriptionExpiry,
      maxUsers,
      maxRecruiters,
      maxActiveJobs,
      maxResumesPerMonth,
      allowJdUpload,
      adminName,
      adminEmail,
      adminPassword
    } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Organization name is required.' });
      return;
    }

    if (!adminEmail || !adminPassword) {
      res.status(400).json({ error: 'Client Admin email and temporary password are required.' });
      return;
    }

    if (String(adminPassword).length < 8) {
      res.status(400).json({ error: 'Client Admin temporary password must be at least 8 characters long.' });
      return;
    }

    const result = await createOrganizationWithAdmin({
      name: name.trim(),
      companyEmail,
      contactPhone,
      address,
      subscriptionPlan,
      billingCycle,
      subscriptionStart: subscriptionStart ? new Date(subscriptionStart) : undefined,
      subscriptionExpiry: subscriptionExpiry ? new Date(subscriptionExpiry) : undefined,
      maxUsers: maxUsers ? Number(maxUsers) : 5,
      maxRecruiters: maxRecruiters ? Number(maxRecruiters) : 5,
      maxActiveJobs: maxActiveJobs ? Number(maxActiveJobs) : 20,
      maxResumesPerMonth: maxResumesPerMonth ? Number(maxResumesPerMonth) : 500,
      allowJdUpload: allowJdUpload !== undefined ? Boolean(allowJdUpload) : true,
      adminName: adminName || `${name.trim()} Admin`,
      adminEmail,
      adminPassword,
      superAdminUserId: req.user?.userId
    });

    res.status(201).json({
      success: true,
      message: `Organization "${result.organization.name}" and Client Admin created successfully.`,
      organization: result.organization,
      clientAdmin: result.clientAdmin
    });
  } catch (error: any) {
    console.error('[SuperAdmin Controller] Error creating organization:', error);
    res.status(400).json({ error: error.message || 'Failed to create organization' });
  }
};

/**
 * Super Admin: Edit client organization limits anytime
 * PATCH /api/super-admin/organizations/:id/limits
 */
export const updateLimits = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const organizationId = String(req.params.id);
    const { maxUsers, maxRecruiters, maxActiveJobs, maxResumesPerMonth } = req.body;

    const updatedOrg = await updateOrganizationLimits(
      organizationId,
      {
        maxUsers: maxUsers !== undefined ? Number(maxUsers) : undefined,
        maxRecruiters: maxRecruiters !== undefined ? Number(maxRecruiters) : undefined,
        maxActiveJobs: maxActiveJobs !== undefined ? Number(maxActiveJobs) : undefined,
        maxResumesPerMonth: maxResumesPerMonth !== undefined ? Number(maxResumesPerMonth) : undefined
      },
      req.user?.userId
    );

    res.status(200).json({
      success: true,
      message: `Limits for "${updatedOrg.name}" updated successfully.`,
      organization: updatedOrg
    });
  } catch (error: any) {
    console.error('[SuperAdmin Controller] Error updating limits:', error);
    res.status(400).json({ error: error.message || 'Failed to update organization limits' });
  }
};

/**
 * Super Admin: Update subscription details
 * PATCH /api/super-admin/organizations/:id/subscription
 */
export const updateSubscription = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const organizationId = String(req.params.id);
    const { subscriptionPlan, billingCycle, subscriptionExpiry, status } = req.body;

    const updatedOrg = await updateOrganizationSubscription(
      organizationId,
      {
        subscriptionPlan,
        billingCycle,
        subscriptionExpiry: subscriptionExpiry ? new Date(subscriptionExpiry) : undefined,
        status
      },
      req.user?.userId
    );

    res.status(200).json({
      success: true,
      message: `Subscription for "${updatedOrg.name}" updated successfully.`,
      organization: updatedOrg
    });
  } catch (error: any) {
    console.error('[SuperAdmin Controller] Error updating subscription:', error);
    res.status(400).json({ error: error.message || 'Failed to update subscription' });
  }
};

/**
 * Super Admin: Suspend or activate organization
 * POST /api/super-admin/organizations/:id/toggle-status
 */
export const toggleStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const organizationId = String(req.params.id);
    const { status } = req.body;

    if (!['ACTIVE', 'SUSPENDED', 'EXPIRED'].includes(status)) {
      res.status(400).json({ error: 'Invalid status. Must be ACTIVE, SUSPENDED, or EXPIRED.' });
      return;
    }

    const updatedOrg = await toggleOrganizationStatus(organizationId, status, req.user?.userId);

    res.status(200).json({
      success: true,
      message: `Organization "${updatedOrg.name}" status changed to ${status}.`,
      organization: updatedOrg
    });
  } catch (error: any) {
    console.error('[SuperAdmin Controller] Error toggling status:', error);
    res.status(400).json({ error: error.message || 'Failed to toggle status' });
  }
};

/**
 * Super Admin: Reset Client Admin's password
 * POST /api/super-admin/organizations/:id/reset-admin-password
 */
export const resetAdminPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const organizationId = String(req.params.id);
    const { newPassword } = req.body;

    if (!newPassword || String(newPassword).length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters long.' });
      return;
    }

    const result = await resetClientAdminPassword(organizationId, newPassword, req.user?.userId);

    res.status(200).json({
      success: true,
      message: `Client Admin password for ${result.email} reset successfully.`
    });
  } catch (error: any) {
    console.error('[SuperAdmin Controller] Error resetting admin password:', error);
    res.status(400).json({ error: error.message || 'Failed to reset admin password' });
  }
};

/**
 * Super Admin: Platform-level usage statistics
 * GET /api/super-admin/stats
 */
export const getPlatformStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const totalOrganizations = await prisma.organization.count();
    const activeOrganizations = await prisma.organization.count({ where: { status: 'ACTIVE' } });
    const suspendedOrganizations = await prisma.organization.count({ where: { status: 'SUSPENDED' } });
    const totalUsers = await prisma.user.count();
    const totalJobs = await prisma.job.count();
    const totalCandidates = await prisma.candidate.count();
    const totalEvaluations = await prisma.evaluation.count();

    res.status(200).json({
      success: true,
      stats: {
        totalOrganizations,
        activeOrganizations,
        suspendedOrganizations,
        totalUsers,
        totalJobs,
        totalCandidates,
        totalEvaluations
      }
    });
  } catch (error: any) {
    console.error('[SuperAdmin Controller] Error fetching platform stats:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch platform stats' });
  }
};

/**
 * Super Admin: Audit logs
 * GET /api/super-admin/audit-logs
 */
export const getAuditLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const logs = await prisma.auditLog.findMany({
      include: {
        organization: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    res.status(200).json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (error: any) {
    console.error('[SuperAdmin Controller] Error fetching audit logs:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch audit logs' });
  }
};

/**
 * Super Admin: Update JD Upload Permission for a client organization
 * PATCH /api/super-admin/organizations/:id/jd-permission
 */
export const updateJdPermission = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const organizationId = String(req.params.id);
    const { allowJdUpload } = req.body;

    if (allowJdUpload === undefined || typeof allowJdUpload !== 'boolean') {
      res.status(400).json({ error: 'Field "allowJdUpload" (boolean) is required.' });
      return;
    }

    const updatedOrg = await updateOrganizationJdPermission(
      organizationId,
      allowJdUpload,
      req.user?.userId
    );

    res.status(200).json({
      success: true,
      message: `JD Upload Permission for "${updatedOrg.name}" has been ${allowJdUpload ? 'ENABLED' : 'DISABLED'}.`,
      organization: updatedOrg
    });
  } catch (error: any) {
    console.error('[SuperAdmin Controller] Error updating JD permission:', error);
    res.status(400).json({ error: error.message || 'Failed to update JD upload permission' });
  }
};

/**
 * Super Admin: Delete a single client organization and its associated accounts/data
 * DELETE /api/super-admin/organizations/:id
 */
export const removeOrganization = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const organizationId = String(req.params.id);
    const result = await deleteOrganization(organizationId, req.user?.userId);
    res.status(200).json({
      success: true,
      message: `Organization "${result.name}" and its associated accounts have been removed.`,
      organizationId
    });
  } catch (error: any) {
    console.error('[SuperAdmin Controller] Error deleting organization:', error);
    res.status(400).json({ error: error.message || 'Failed to remove organization' });
  }
};

/**
 * Super Admin: Remove ALL client organizations and accounts from the system
 * DELETE /api/super-admin/organizations
 */
export const removeAllOrganizations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await deleteAllOrganizations(req.user?.userId);
    res.status(200).json({
      success: true,
      message: `All (${result.deletedCount}) client organizations and accounts have been removed.`,
      deletedCount: result.deletedCount
    });
  } catch (error: any) {
    console.error('[SuperAdmin Controller] Error deleting all organizations:', error);
    res.status(400).json({ error: error.message || 'Failed to remove all organizations' });
  }
};

