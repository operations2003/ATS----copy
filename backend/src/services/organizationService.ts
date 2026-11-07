import bcrypt from 'bcryptjs';
import prisma from '../config/prisma';
import { OrgStatus } from '@prisma/client';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Safely resolve a valid UUID for AuditLog.userId to avoid PostgreSQL UUID parsing errors
 */
async function resolveAuditUserId(tx: any, userId?: string | null): Promise<string | null> {
  if (!userId) return null;
  const trimmed = String(userId).trim();

  // If already a valid UUID format, check that the user exists in DB to prevent foreign key errors
  if (UUID_REGEX.test(trimmed)) {
    try {
      const exists = await tx.user.findUnique({
        where: { id: trimmed },
        select: { id: true }
      });
      if (exists) return exists.id;
    } catch {
      // Fall through to fallback
    }
  }

  // If userId is non-UUID (e.g. 'admin-user'), attempt to resolve the actual Super Admin UUID from database
  try {
    const adminUser = await tx.user.findFirst({
      where: {
        OR: [
          { email: 'operations@tasknera.com' },
          { email: 'admin@gmail.com' },
          { role: 'SUPER_ADMIN' }
        ]
      },
      select: { id: true }
    });
    if (adminUser && UUID_REGEX.test(adminUser.id)) {
      return adminUser.id;
    }
  } catch {
    // Ignore and fallback to null
  }

  return null;
}

export interface CreateOrganizationInput {
  name: string;
  companyEmail?: string;
  contactPhone?: string;
  address?: string;
  subscriptionPlan?: string;
  billingCycle?: string;
  subscriptionStart?: Date;
  subscriptionExpiry?: Date;
  maxUsers?: number;
  maxRecruiters?: number;
  maxActiveJobs?: number;
  maxResumesPerMonth?: number;
  allowJdUpload?: boolean;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  superAdminUserId?: string;
}

export interface UpdateLimitsInput {
  maxUsers?: number;
  maxRecruiters?: number;
  maxActiveJobs?: number;
  maxResumesPerMonth?: number;
}

export interface UpdateSubscriptionInput {
  subscriptionPlan?: string;
  billingCycle?: string;
  subscriptionExpiry?: Date;
  status?: OrgStatus;
}

export const PLAN_LIMITS: Record<string, {
  maxResumesPerMonth: number;
  maxUsers: number;
  maxRecruiters: number;
  maxActiveJobs: number;
}> = {
  STARTER: {
    maxResumesPerMonth: 500,
    maxUsers: 5,
    maxRecruiters: 5,
    maxActiveJobs: 20
  },
  PROFESSIONAL: {
    maxResumesPerMonth: 2500,
    maxUsers: 15,
    maxRecruiters: 15,
    maxActiveJobs: 100
  },
  ENTERPRISE: {
    maxResumesPerMonth: 999999,
    maxUsers: 999,
    maxRecruiters: 999,
    maxActiveJobs: 999
  }
};

/**
 * Concurrency-safe quota check inside a transaction or query
 */
export async function checkUserQuota(
  tx: any,
  organizationId: string,
  role: string
): Promise<{ org: any; currentUsers: number; currentRecruiters: number }> {
  const org = await tx.organization.findUnique({
    where: { id: organizationId }
  });

  if (!org) {
    throw new Error(`Organization "${organizationId}" not found.`);
  }

  if (org.status !== 'ACTIVE') {
    throw new Error(`Organization is currently ${org.status.toLowerCase()}. User provisioning is suspended.`);
  }

  // Count ALL accounts belonging to this organization (including Client Admin)
  const currentUsers = await tx.user.count({
    where: { organizationId }
  });

  if (currentUsers >= org.maxUsers) {
    throw new Error(
      `User limit reached. Your organization is allowed ${org.maxUsers} user accounts and currently has ${currentUsers}. Please contact your platform administrator to increase your limit.`
    );
  }

  const isRecruiterRole = ['RECRUITER', 'MEMBER', 'TEAM_LEADER'].includes(role.toUpperCase());
  let currentRecruiters = 0;

  if (isRecruiterRole && org.maxRecruiters > 0) {
    currentRecruiters = await tx.user.count({
      where: {
        organizationId,
        role: { in: ['RECRUITER', 'MEMBER', 'TEAM_LEADER'] }
      }
    });

    if (currentRecruiters >= org.maxRecruiters) {
      throw new Error(
        `Recruiter limit reached. Your organization is allowed ${org.maxRecruiters} recruiter accounts and currently has ${currentRecruiters}. Please contact your platform administrator to increase your limit.`
      );
    }
  }

  return { org, currentUsers, currentRecruiters };
}

/**
 * Retrieve organization quota details
 */
export async function getOrganizationQuota(organizationId: string) {
  let org = await prisma.organization.findUnique({
    where: { id: organizationId }
  });

  if (!org) {
    org = await prisma.organization.create({
      data: {
        id: organizationId,
        name: 'TaskNera Technologies',
        subscriptionPlan: 'STARTER',
        maxUsers: 5,
        maxRecruiters: 5,
        maxActiveJobs: 20,
        maxResumesPerMonth: 500,
        status: 'ACTIVE'
      }
    });
  }

  const planKey = (org.subscriptionPlan || 'STARTER').toUpperCase();
  const planDefaults = PLAN_LIMITS[planKey] || PLAN_LIMITS.STARTER;
  const maxResumesPerMonth = org.maxResumesPerMonth || planDefaults.maxResumesPerMonth;

  const totalUsers = await prisma.user.count({
    where: { organizationId }
  });

  const recruiterCount = await prisma.user.count({
    where: {
      organizationId,
      role: { in: ['RECRUITER', 'MEMBER', 'TEAM_LEADER'] }
    }
  });

  const activeJobsCount = await prisma.job.count({
    where: {
      organizationId,
      status: { in: ['active', 'published'] }
    }
  });

  // Calculate current monthly resume usage (1st of month to end of month)
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const currentMonthResumes = await prisma.candidate.count({
    where: {
      organizationId,
      created_at: {
        gte: startOfMonth,
        lte: endOfMonth
      }
    }
  });

  const availableResumes = Math.max(0, maxResumesPerMonth - currentMonthResumes);
  const percentUsed = Math.min(100, Math.round((currentMonthResumes / maxResumesPerMonth) * 100));
  const resetsOn = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return {
    organizationId: org.id,
    organizationName: org.name,
    status: org.status,
    subscriptionPlan: planKey,
    billingCycle: org.billingCycle,
    subscriptionExpiry: org.subscriptionExpiry,
    totalLimit: org.maxUsers,
    currentUsers: totalUsers,
    availableSlots: Math.max(0, org.maxUsers - totalUsers),
    maxRecruiters: org.maxRecruiters,
    currentRecruiters: recruiterCount,
    availableRecruiterSlots: Math.max(0, org.maxRecruiters - recruiterCount),
    maxActiveJobs: org.maxActiveJobs,
    currentActiveJobs: activeJobsCount,
    availableJobSlots: Math.max(0, org.maxActiveJobs - activeJobsCount),
    maxResumesPerMonth,
    currentMonthResumes,
    availableResumes,
    percentUsed,
    resetsOn
  };
}

/**
 * Atomic creation of organization, initial Client Admin, and audit log
 */
export async function createOrganizationWithAdmin(input: CreateOrganizationInput) {
  const cleanAdminEmail = input.adminEmail.toLowerCase().trim();
  const allowJdUpload = input.allowJdUpload !== undefined ? Boolean(input.allowJdUpload) : true;

  // Pre-validate uniqueness of admin email
  const existingUser = await prisma.user.findUnique({
    where: { email: cleanAdminEmail }
  });
  if (existingUser) {
    throw new Error(`User with email "${cleanAdminEmail}" already exists.`);
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Create Organization record
    const org = await tx.organization.create({
      data: {
        name: input.name.trim(),
        companyEmail: input.companyEmail ? input.companyEmail.trim().toLowerCase() : null,
        contactPhone: input.contactPhone ? input.contactPhone.trim() : null,
        address: input.address ? input.address.trim() : null,
        subscriptionPlan: input.subscriptionPlan || 'STARTER',
        billingCycle: input.billingCycle || 'monthly',
        subscriptionStart: input.subscriptionStart || new Date(),
        subscriptionExpiry: input.subscriptionExpiry || null,
        maxUsers: Number(input.maxUsers) || 5,
        maxRecruiters: Number(input.maxRecruiters) || 5,
        maxActiveJobs: Number(input.maxActiveJobs) || 20,
        maxResumesPerMonth: Number(input.maxResumesPerMonth) || 500,
        allowJdUpload: allowJdUpload,
        status: 'ACTIVE'
      }
    });

    // 2. Create initial Client Admin
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(input.adminPassword, salt);

    const clientAdmin = await tx.user.create({
      data: {
        name: input.adminName.trim(),
        email: cleanAdminEmail,
        password: hashedPassword,
        role: 'CLIENT_ADMIN',
        organizationId: org.id,
        allowJdUpload: allowJdUpload,
        isActive: true
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        organizationId: true,
        allowJdUpload: true,
        createdAt: true
      }
    });

    // 3. Record Audit Log
    const auditUserId = await resolveAuditUserId(tx, input.superAdminUserId);
    await tx.auditLog.create({
      data: {
        organizationId: org.id,
        userId: auditUserId,
        action: 'CREATE_ORGANIZATION',
        targetType: 'Organization',
        targetId: org.id,
        details: {
          organizationName: org.name,
          clientAdminEmail: clientAdmin.email,
          maxUsers: org.maxUsers,
          subscriptionPlan: org.subscriptionPlan,
          allowJdUpload: allowJdUpload
        }
      }
    });

    return { organization: org, clientAdmin };
  });
}

/**
 * Super Admin: Dynamically update organization limits
 */
export async function updateOrganizationLimits(
  organizationId: string,
  limits: UpdateLimitsInput,
  superAdminUserId?: string
) {
  return await prisma.$transaction(async (tx) => {
    const existingOrg = await tx.organization.findUnique({
      where: { id: organizationId }
    });
    if (!existingOrg) {
      throw new Error(`Organization "${organizationId}" not found`);
    }

    const updateData: any = {};
    if (limits.maxUsers !== undefined) updateData.maxUsers = Math.max(1, Number(limits.maxUsers));
    if (limits.maxRecruiters !== undefined) updateData.maxRecruiters = Math.max(1, Number(limits.maxRecruiters));
    if (limits.maxActiveJobs !== undefined) updateData.maxActiveJobs = Math.max(1, Number(limits.maxActiveJobs));
    if (limits.maxResumesPerMonth !== undefined) updateData.maxResumesPerMonth = Math.max(1, Number(limits.maxResumesPerMonth));

    const updatedOrg = await tx.organization.update({
      where: { id: organizationId },
      data: updateData
    });

    const auditUserId = await resolveAuditUserId(tx, superAdminUserId);
    await tx.auditLog.create({
      data: {
        organizationId,
        userId: auditUserId,
        action: 'UPDATE_LIMITS',
        targetType: 'Organization',
        targetId: organizationId,
        details: {
          previousLimits: {
            maxUsers: existingOrg.maxUsers,
            maxRecruiters: existingOrg.maxRecruiters,
            maxActiveJobs: existingOrg.maxActiveJobs,
            maxResumesPerMonth: existingOrg.maxResumesPerMonth
          },
          newLimits: updateData
        }
      }
    });

    return updatedOrg;
  });
}

/**
 * Super Admin: Update subscription plan and status
 */
export async function updateOrganizationSubscription(
  organizationId: string,
  subData: UpdateSubscriptionInput,
  superAdminUserId?: string
) {
  return await prisma.$transaction(async (tx) => {
    const existingOrg = await tx.organization.findUnique({
      where: { id: organizationId }
    });
    if (!existingOrg) {
      throw new Error(`Organization "${organizationId}" not found`);
    }

    const updateData: any = {};
    if (subData.subscriptionPlan) {
      const planKey = subData.subscriptionPlan.toUpperCase();
      updateData.subscriptionPlan = planKey;
      if (PLAN_LIMITS[planKey]) {
        updateData.maxResumesPerMonth = PLAN_LIMITS[planKey].maxResumesPerMonth;
        updateData.maxUsers = PLAN_LIMITS[planKey].maxUsers;
        updateData.maxRecruiters = PLAN_LIMITS[planKey].maxRecruiters;
        updateData.maxActiveJobs = PLAN_LIMITS[planKey].maxActiveJobs;
      }
    }
    if (subData.billingCycle) updateData.billingCycle = subData.billingCycle;
    if (subData.subscriptionExpiry !== undefined) updateData.subscriptionExpiry = subData.subscriptionExpiry;
    if (subData.status) updateData.status = subData.status;

    const updatedOrg = await tx.organization.update({
      where: { id: organizationId },
      data: updateData
    });

    const auditUserId = await resolveAuditUserId(tx, superAdminUserId);
    await tx.auditLog.create({
      data: {
        organizationId,
        userId: auditUserId,
        action: 'UPDATE_SUBSCRIPTION',
        targetType: 'Organization',
        targetId: organizationId,
        details: {
          previous: {
            plan: existingOrg.subscriptionPlan,
            status: existingOrg.status,
            expiry: existingOrg.subscriptionExpiry
          },
          updated: updateData
        }
      }
    });

    return updatedOrg;
  });
}

/**
 * Direct subscription plan change (Starter: 500 resumes/mo, Professional: 2500 resumes/mo)
 */
export async function changeSubscriptionPlan(
  organizationId: string,
  newPlan: string,
  userId?: string
) {
  const planKey = String(newPlan || 'STARTER').toUpperCase();
  const limits = PLAN_LIMITS[planKey] || PLAN_LIMITS.STARTER;

  return await prisma.$transaction(async (tx) => {
    const updated = await tx.organization.update({
      where: { id: organizationId },
      data: {
        subscriptionPlan: planKey,
        maxResumesPerMonth: limits.maxResumesPerMonth,
        maxUsers: limits.maxUsers,
        maxRecruiters: limits.maxRecruiters,
        maxActiveJobs: limits.maxActiveJobs,
        status: 'ACTIVE'
      }
    });

    const auditUserId = await resolveAuditUserId(tx, userId);
    await tx.auditLog.create({
      data: {
        organizationId,
        userId: auditUserId,
        action: 'CHANGE_SUBSCRIPTION_PLAN',
        targetType: 'Organization',
        targetId: organizationId,
        details: {
          newPlan: planKey,
          maxResumesPerMonth: limits.maxResumesPerMonth,
          updatedAt: new Date().toISOString()
        }
      }
    });

    return updated;
  });
}

/**
 * Super Admin: Toggle Organization status (ACTIVE, SUSPENDED, EXPIRED)
 */
export async function toggleOrganizationStatus(
  organizationId: string,
  newStatus: OrgStatus,
  superAdminUserId?: string
) {
  return await prisma.$transaction(async (tx) => {
    const updatedOrg = await tx.organization.update({
      where: { id: organizationId },
      data: { status: newStatus }
    });

    const auditUserId = await resolveAuditUserId(tx, superAdminUserId);
    await tx.auditLog.create({
      data: {
        organizationId,
        userId: auditUserId,
        action: `CHANGE_STATUS_${newStatus}`,
        targetType: 'Organization',
        targetId: organizationId,
        details: { newStatus }
      }
    });

    return updatedOrg;
  });
}

/**
 * Super Admin: Securely reset Client Admin's password
 */
export async function resetClientAdminPassword(
  organizationId: string,
  newPassword: string,
  superAdminUserId?: string
) {
  if (!newPassword || newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters long');
  }

  // Find Client Admin for this organization
  const adminUser = await prisma.user.findFirst({
    where: {
      organizationId,
      role: { in: ['CLIENT_ADMIN', 'ADMIN'] }
    }
  });

  if (!adminUser) {
    throw new Error(`Client Administrator account for organization "${organizationId}" not found`);
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: adminUser.id },
      data: { password: hashedPassword }
    });

    const auditUserId = await resolveAuditUserId(tx, superAdminUserId);
    await tx.auditLog.create({
      data: {
        organizationId,
        userId: auditUserId,
        action: 'RESET_ADMIN_PASSWORD',
        targetType: 'User',
        targetId: adminUser.id,
        details: { adminEmail: adminUser.email }
      }
    });
  });

  return { success: true, email: adminUser.email };
}

/**
 * Super Admin: Update JD Upload Permission for organization and its members
 */
export async function updateOrganizationJdPermission(
  organizationId: string,
  allowJdUpload: boolean,
  superAdminUserId?: string
) {
  return await prisma.$transaction(async (tx) => {
    const existingOrg = await tx.organization.findUnique({
      where: { id: organizationId }
    });
    if (!existingOrg) {
      throw new Error(`Organization "${organizationId}" not found`);
    }

    const updatedOrg = await tx.organization.update({
      where: { id: organizationId },
      data: { allowJdUpload }
    });

    // Synchronize permission across all user accounts in this tenant organization
    await tx.user.updateMany({
      where: { organizationId },
      data: { allowJdUpload }
    });

    const auditUserId = await resolveAuditUserId(tx, superAdminUserId);
    await tx.auditLog.create({
      data: {
        organizationId,
        userId: auditUserId,
        action: 'UPDATE_JD_UPLOAD_PERMISSION',
        targetType: 'Organization',
        targetId: organizationId,
        details: {
          organizationName: existingOrg.name,
          previousAllowJdUpload: (existingOrg as any).allowJdUpload ?? true,
          newAllowJdUpload: allowJdUpload
        }
      }
    });

    return updatedOrg;
  });
}

/**
 * Super Admin: List all client organizations with dynamic usage statistics
 */
export async function getAllOrganizationsWithStats() {
  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: 'desc' }
  });

  const orgStats = await Promise.all(
    organizations.map(async (org) => {
      // 1. Current provisioned users
      const totalUsers = await prisma.user.count({
        where: { organizationId: org.id }
      });

      // 2. Current recruiters
      const recruiterCount = await prisma.user.count({
        where: {
          organizationId: org.id,
          role: { in: ['RECRUITER', 'MEMBER', 'TEAM_LEADER'] }
        }
      });

      // 3. Active jobs count
      const activeJobsCount = await prisma.job.count({
        where: {
          organizationId: org.id,
          status: { in: ['active', 'published'] }
        }
      });

      // 4. Total evaluations / candidates processed
      const candidatesCount = await prisma.candidate.count({
        where: { organizationId: org.id }
      });

      const evaluationsCount = await prisma.evaluation.count({
        where: { organizationId: org.id }
      });

      // 5. Current month resume volume (Starter: 500, Pro: 2500)
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const currentMonthResumes = await prisma.candidate.count({
        where: {
          organizationId: org.id,
          created_at: { gte: startOfMonth }
        }
      });

      // 6. Initial / primary Client Admin
      const clientAdmin = await prisma.user.findFirst({
        where: {
          organizationId: org.id,
          role: { in: ['CLIENT_ADMIN', 'ADMIN'] }
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          allowJdUpload: true,
          createdAt: true
        }
      });

      return {
        ...org,
        allowJdUpload: (org as any).allowJdUpload ?? true,
        maxResumesPerMonth: org.maxResumesPerMonth || (PLAN_LIMITS[org.subscriptionPlan?.toUpperCase()]?.maxResumesPerMonth ?? 500),
        currentMonthResumes,
        availableResumes: Math.max(0, (org.maxResumesPerMonth || 500) - currentMonthResumes),
        currentUsers: totalUsers,
        availableUserSlots: Math.max(0, org.maxUsers - totalUsers),
        currentRecruiters: recruiterCount,
        availableRecruiterSlots: Math.max(0, org.maxRecruiters - recruiterCount),
        currentActiveJobs: activeJobsCount,
        availableJobSlots: Math.max(0, org.maxActiveJobs - activeJobsCount),
        totalCandidates: candidatesCount,
        totalEvaluations: evaluationsCount,
        clientAdmin
      };
    })
  );

  return orgStats;
}

