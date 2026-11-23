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

/**
 * Calculate user / organization subscription status - all users have full access
 */
export const calculateSubscriptionStatus = async (user: any): Promise<SubscriptionStatusInfo> => {
  return {
    isSubscribed: true,
    isTrial: false,
    isExpired: false,
    daysLeft: 9999,
    plan: 'ENTERPRISE',
    expiresAt: null
  };
};

