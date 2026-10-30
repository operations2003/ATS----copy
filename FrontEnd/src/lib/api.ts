export function getApiBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && envUrl.trim() !== '') {
    return envUrl.replace(/\/+$/, '');
  }
  if (
    typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    return '/api';
  }
  return 'http://localhost:5000/api';
}

const API_BASE_URL = getApiBaseUrl();

export type UserRole = 'SUPER_ADMIN' | 'CLIENT_ADMIN' | 'RECRUITER' | 'ADMIN' | 'MEMBER' | 'TEAM_LEADER' | 'USER' | 'TEAM_LEAD' | 'RECRUITER_MEMBER';

export interface SubscriptionStatus {
  isSubscribed: boolean;
  isTrial: boolean;
  isExpired: boolean;
  daysLeft: number;
  plan: string;
  expiresAt?: string | null;
}

export interface User {
  id: string;
  name?: string | null;
  email: string;
  role?: UserRole;
  isActive?: boolean;
  organizationId?: string;
  avatarUrl?: string | null;
  teamName?: string;
  createdAt?: string;
  updatedAt?: string;
  password?: string;
  allowJdUpload?: boolean;
  subscription?: SubscriptionStatus;
}

export interface OrganizationQuota {
  organizationId: string;
  organizationName: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
  subscriptionPlan: string;
  billingCycle: string;
  subscriptionExpiry?: string | null;
  totalLimit: number;
  currentUsers: number;
  availableSlots: number;
  maxRecruiters: number;
  currentRecruiters: number;
  availableRecruiterSlots: number;
  maxActiveJobs: number;
  currentActiveJobs: number;
  availableJobSlots: number;
  maxResumesPerMonth: number;
}

export interface ClientOrganization {
  id: string;
  name: string;
  companyEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
  subscriptionPlan: string;
  billingCycle: string;
  subscriptionStart: string;
  subscriptionExpiry?: string | null;
  maxUsers: number;
  maxRecruiters: number;
  maxActiveJobs: number;
  maxResumesPerMonth: number;
  createdAt: string;
  updatedAt: string;
  currentUsers: number;
  availableUserSlots: number;
  currentRecruiters: number;
  availableRecruiterSlots: number;
  currentActiveJobs: number;
  availableJobSlots: number;
  totalCandidates: number;
  totalEvaluations: number;
  allowJdUpload?: boolean;
  clientAdmin?: {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: string;
    allowJdUpload?: boolean;
  } | null;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

export interface ApiError {
  error: string;
}

export async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const baseUrl = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // Avoid duplicate /api/api if baseUrl ends with /api
  const primaryUrl =
    baseUrl.endsWith('/api') && cleanEndpoint.startsWith('/api/')
      ? `${baseUrl}${cleanEndpoint.slice(4)}`
      : `${baseUrl}${cleanEndpoint}`;

  let response: Response;
  try {
    response = await fetch(primaryUrl, {
      ...options,
      headers,
    });
  } catch (err: any) {
    // If remote connection fails and we are running in browser, fallback to same-origin /api
    if (
      typeof window !== 'undefined' &&
      !primaryUrl.startsWith('/api') &&
      !primaryUrl.startsWith(window.location.origin + '/api')
    ) {
      const fallbackUrl = cleanEndpoint.startsWith('/api') ? cleanEndpoint : `/api${cleanEndpoint}`;
      response = await fetch(fallbackUrl, {
        ...options,
        headers,
      });
    } else {
      throw err;
    }
  }

  // If external server returned 404 and wasn't already same-origin /api, fallback to Next.js same-origin API
  if (
    response.status === 404 &&
    typeof window !== 'undefined' &&
    !primaryUrl.startsWith('/api') &&
    !primaryUrl.startsWith(window.location.origin + '/api')
  ) {
    try {
      const fallbackUrl = cleanEndpoint.startsWith('/api') ? cleanEndpoint : `/api${cleanEndpoint}`;
      const fallbackRes = await fetch(fallbackUrl, {
        ...options,
        headers,
      });
      if (fallbackRes.ok || fallbackRes.status !== 404) {
        response = fallbackRes;
      }
    } catch {
      // Keep original response if fallback fails
    }
  }

  let data: any = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data as T;
}
