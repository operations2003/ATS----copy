import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma';
import { calculateSubscriptionStatus } from '../utils/subscriptionUtils';

export type UserRole = 'SUPER_ADMIN' | 'CLIENT_ADMIN' | 'RECRUITER' | 'ADMIN' | 'MEMBER' | 'TEAM_LEADER';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    id?: string;
    email: string;
    role?: UserRole;
    organizationId?: string;
    allowJdUpload?: boolean;
    createdAt?: Date | string;
  };
}

interface JwtDecoded {
  userId: string;
  email: string;
  role?: UserRole;
  organizationId?: string;
  allowJdUpload?: boolean;
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization header missing or invalid format (Bearer token expected)' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const secret = process.env.JWT_SECRET || 'ats_tasknera_super_secret_jwt_key_2026';
    const decoded = jwt.verify(token, secret) as JwtDecoded;

    const cleanEmail = decoded.email ? decoded.email.toLowerCase().trim() : '';
    const isSuperAdminEmail = cleanEmail === 'operations@tasknera.com' || cleanEmail === 'admin@gmail.com';
    const isUuid = decoded.userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded.userId);

    // Look up authoritative user record from PostgreSQL
    let dbUser: any = null;
    try {
      dbUser = await prisma.user.findFirst({
        where: {
          OR: [
            ...(isUuid ? [{ id: decoded.userId }] : []),
            ...(cleanEmail ? [{ email: cleanEmail }] : [])
          ]
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          organizationId: true,
          allowJdUpload: true,
          createdAt: true
        }
      });
    } catch (dbErr) {
      console.warn('[Auth Middleware] Database user query notice:', dbErr);
    }

    if (!dbUser && !isSuperAdminEmail) {
      res.status(401).json({ error: 'User account not found or has been removed' });
      return;
    }

    if (dbUser) {
      decoded.userId = dbUser.id;
      decoded.email = dbUser.email;
      decoded.role = isSuperAdminEmail ? 'SUPER_ADMIN' : (dbUser.role as UserRole);
      decoded.organizationId = dbUser.organizationId || 'org-tasknera';
      decoded.allowJdUpload = isSuperAdminEmail ? true : (dbUser.allowJdUpload ?? true);

      if (dbUser.isActive === false && decoded.role !== 'SUPER_ADMIN') {
        res.status(403).json({
          error: 'Your user account has been deactivated. Please contact your organization administrator.'
        });
        return;
      }
    } else if (isSuperAdminEmail) {
      decoded.role = 'SUPER_ADMIN';
      decoded.organizationId = decoded.organizationId || 'org-tasknera';
      decoded.allowJdUpload = true;
    }

    req.user = {
      ...decoded,
      createdAt: dbUser?.createdAt
    };

    // Check organization subscription & 14-day free trial status if not super admin
    if (decoded.role !== 'SUPER_ADMIN' && !isSuperAdminEmail) {
      const isExemptPath =
        req.path === '/me' ||
        req.path === '/change-password' ||
        req.path === '/subscription-inquiry' ||
        req.path.startsWith('/public');

      if (!isExemptPath) {
        try {
          const sub = await calculateSubscriptionStatus(req.user);
          if (sub.isExpired) {
            res.status(403).json({
              error: 'Your 14-day free trial has expired. Please choose a subscription model to continue using HireIQ.',
              trialExpired: true,
              subscriptionRequired: true,
              subscription: sub
            });
            return;
          }
        } catch (subErr) {
          console.warn('[AuthMiddleware] Subscription check warning:', subErr);
        }
      }

      const orgId = decoded.organizationId;
      if (orgId) {
        try {
          const org = await prisma.organization.findUnique({
            where: { id: orgId },
            select: { status: true, subscriptionExpiry: true, allowJdUpload: true }
          });

          if (org) {
            if (org.allowJdUpload === false) {
              decoded.allowJdUpload = false;
              if (req.user) req.user.allowJdUpload = false;
            }
            if (orgId !== 'org-tasknera') {
              if (org.status === 'SUSPENDED') {
                res.status(403).json({
                  error: 'Your organization account has been suspended. Please contact your platform administrator.'
                });
                return;
              }
            }
          }
        } catch (orgErr) {
          // Non-fatal org status check
        }
      }
    }

    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
};

export const optionalProtect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const secret = process.env.JWT_SECRET || 'ats_tasknera_super_secret_jwt_key_2026';
      const decoded = jwt.verify(token, secret) as JwtDecoded;
      const cleanEmail = decoded.email ? decoded.email.toLowerCase().trim() : '';
      const isSuperAdminEmail = cleanEmail === 'operations@tasknera.com' || cleanEmail === 'admin@gmail.com';
      const isUuid = decoded.userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded.userId);

      try {
        const dbUser = await prisma.user.findFirst({
          where: {
            OR: [
              ...(isUuid ? [{ id: decoded.userId }] : []),
              ...(cleanEmail ? [{ email: cleanEmail }] : [])
            ]
          },
          select: { id: true, email: true, role: true, organizationId: true, isActive: true, allowJdUpload: true, createdAt: true }
        });

        if (dbUser) {
          decoded.userId = dbUser.id;
          decoded.email = dbUser.email;
          decoded.role = isSuperAdminEmail ? 'SUPER_ADMIN' : (dbUser.role as UserRole);
          decoded.organizationId = dbUser.organizationId || 'org-tasknera';
          decoded.allowJdUpload = isSuperAdminEmail ? true : (dbUser.allowJdUpload ?? true);
        } else if (isSuperAdminEmail) {
          decoded.role = 'SUPER_ADMIN';
          decoded.organizationId = decoded.organizationId || 'org-tasknera';
          decoded.allowJdUpload = true;
        }
      } catch {}

      req.user = decoded;
    } catch (error) {
      // Ignore token decode errors in optional mode
    }
  }
  next();
};

/**
 * Role-Based Access Control (RBAC) authorization middleware
 * @param allowedRoles Array of roles permitted to access the route
 */
export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    let userRole = req.user.role || 'MEMBER';
    if (req.user.email?.toLowerCase().trim() === 'operations@tasknera.com' || req.user.email?.toLowerCase().trim() === 'admin@gmail.com') {
      userRole = 'SUPER_ADMIN';
    }

    // SUPER_ADMIN has full platform authorization for administrative routes
    if (userRole === 'SUPER_ADMIN') {
      next();
      return;
    }

    // If route allows ADMIN, both SUPER_ADMIN and CLIENT_ADMIN qualify
    if (allowedRoles.includes('ADMIN') && (userRole === 'CLIENT_ADMIN' || userRole === 'ADMIN')) {
      next();
      return;
    }

    if (!allowedRoles.includes(userRole)) {
      res.status(403).json({
        error: `Forbidden: Access restricted. Role "${userRole}" is not authorized for this resource.`,
        requiredRoles: allowedRoles
      });
      return;
    }

    next();
  };
};

/**
 * Middleware: Verify that authenticated user has permission to create or upload JDs.
 * - SUPER_ADMIN is always permitted.
 * - For Client Admin & Recruiters: both organization.allowJdUpload and user.allowJdUpload must not be false.
 */
export const checkJdUploadPermission = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const cleanEmail = req.user.email ? req.user.email.toLowerCase().trim() : '';
  const isSuperAdmin = req.user.role === 'SUPER_ADMIN' || cleanEmail === 'operations@tasknera.com' || cleanEmail === 'admin@gmail.com';

  if (isSuperAdmin) {
    next();
    return;
  }

  let allowed = req.user.allowJdUpload !== false;

  const orgId = req.user.organizationId;
  if (allowed && orgId) {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { allowJdUpload: true }
      });
      if (org && org.allowJdUpload === false) {
        allowed = false;
      }
    } catch {
      // Non-fatal
    }
  }

  if (!allowed) {
    res.status(403).json({
      error: 'JD Upload Permission is disabled for your client account. Only the Super Admin is authorized to upload and manage Job Descriptions for this organization.',
      code: 'JD_UPLOAD_PERMISSION_DENIED'
    });
    return;
  }

  next();
};
