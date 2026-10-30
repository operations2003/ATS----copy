import prisma from '../config/prisma';

export interface SubscriptionStatusInfo {
  isSubscribed: boolean;
  isTrial: boolean;
  isExpired: boolean;
  daysLeft: number;
  plan: string;
  expiresAt: string | null;
}

const DESIGNATED_ADMIN_EMAIL = 'operations@tasknera.com';
const TASKNERA_CLIENT_ADMIN_EMAIL = 'sheetalbedi@tasknera.com';

/**
 * Calculate user / organization subscription & 14-day free trial status
 */
export const calculateSubscriptionStatus = async (user: any): Promise<SubscriptionStatusInfo> => {
  const cleanEmail = (user.email || '').toLowerCase().trim();
  const isSuperAdminEmail =
    cleanEmail === DESIGNATED_ADMIN_EMAIL ||
    cleanEmail === 'admin@gmail.com' ||
    user.role === 'SUPER_ADMIN';

  const isClientAdminTasknera =
    cleanEmail === TASKNERA_CLIENT_ADMIN_EMAIL ||
    cleanEmail === 'admin@tasknera.com';

  if (isSuperAdminEmail || isClientAdminTasknera) {
    return {
      isSubscribed: true,
      isTrial: false,
      isExpired: false,
      daysLeft: 9999,
      plan: isSuperAdminEmail ? 'SUPER_ADMIN' : 'ENTERPRISE',
      expiresAt: null
    };
  }

  const TRIAL_DAYS = 14;
  const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

  let org: any = null;
  if (user.organizationId && user.organizationId !== 'org-tasknera') {
    try {
      org = await prisma.organization.findUnique({
        where: { id: user.organizationId }
      });
    } catch (e) {
      console.warn('[Subscription] Error fetching org:', e);
    }
  }

  // If organization has a paid active plan (STARTER, PROFESSIONAL, ENTERPRISE)
  const isPaidPlan = org && ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'].includes(org.subscriptionPlan);
  if (isPaidPlan && org.status === 'ACTIVE') {
    const isExpiryValid = !org.subscriptionExpiry || new Date(org.subscriptionExpiry) >= new Date();
    if (isExpiryValid) {
      const daysLeft = org.subscriptionExpiry
        ? Math.max(0, Math.ceil((new Date(org.subscriptionExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : 9999;
      return {
        isSubscribed: true,
        isTrial: false,
        isExpired: false,
        daysLeft,
        plan: org.subscriptionPlan,
        expiresAt: org.subscriptionExpiry ? new Date(org.subscriptionExpiry).toISOString() : null
      };
    }
  }

  // If org is explicitly marked SUSPENDED or EXPIRED
  if (org && (org.status === 'SUSPENDED' || org.status === 'EXPIRED')) {
    return {
      isSubscribed: false,
      isTrial: false,
      isExpired: true,
      daysLeft: 0,
      plan: org.subscriptionPlan || 'EXPIRED',
      expiresAt: org.subscriptionExpiry ? new Date(org.subscriptionExpiry).toISOString() : null
    };
  }

  // Trial duration calculation (14 days from org creation / subscription start or user creation)
  const startTime = org?.subscriptionStart
    ? new Date(org.subscriptionStart).getTime()
    : new Date(user.createdAt || Date.now()).getTime();

  const expiryTime = org?.subscriptionExpiry
    ? new Date(org.subscriptionExpiry).getTime()
    : (startTime + TRIAL_MS);

  const now = Date.now();
  const isExpired = now >= expiryTime;
  const daysLeft = Math.max(0, Math.ceil((expiryTime - now) / (1000 * 60 * 60 * 24)));

  return {
    isSubscribed: false,
    isTrial: true,
    isExpired,
    daysLeft,
    plan: org?.subscriptionPlan || 'FREE_TRIAL',
    expiresAt: new Date(expiryTime).toISOString()
  };
};

