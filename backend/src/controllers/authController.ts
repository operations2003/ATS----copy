import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import prisma from '../config/prisma';
import { AuthRequest, UserRole } from '../middleware/authMiddleware';
import { calculateSubscriptionStatus, SubscriptionStatusInfo } from '../utils/subscriptionUtils';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateToken = (userId: string, email: string, role: UserRole, organizationId: string = 'org-tasknera'): string => {
  const secret = process.env.JWT_SECRET || 'ats_tasknera_super_secret_jwt_key_2026';
  const expiresIn = process.env.JWT_EXPIRES_IN || '24h';
  return jwt.sign({ userId, email, role, organizationId }, secret, { expiresIn: expiresIn as any });
};

const DESIGNATED_ADMIN_EMAIL = 'operations@tasknera.com';
const DESIGNATED_ADMIN_PASSWORD = 'Asad@9312506515';
const TASKNERA_CLIENT_ADMIN_EMAIL = 'sheetalbedi@tasknera.com';
const TASKNERA_CLIENT_ADMIN_PASSWORD = 'Tasknera@9312506515';

export { SubscriptionStatusInfo, calculateSubscriptionStatus };

/**
 * Ensure default admin account exists in PostgreSQL
 */
export const ensureDefaultAdmin = async (): Promise<void> => {
  try {
    const adminEmail = DESIGNATED_ADMIN_EMAIL.toLowerCase().trim();
    const hashedPassword = await bcrypt.hash(DESIGNATED_ADMIN_PASSWORD, 10);

    // 1. Ensure designated admin exists with SUPER_ADMIN role
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: adminEmail },
          { email: 'admin@gmail.com' }
        ]
      }
    });
    if (!existing) {
      await prisma.user.create({
        data: {
          name: 'Super Admin',
          email: adminEmail,
          password: hashedPassword,
          role: 'SUPER_ADMIN' as any,
          organizationId: 'org-tasknera'
        } as any
      });
      console.log(`[Auth] Designated Administrator account (${adminEmail}) initialized as SUPER_ADMIN in database.`);
    } else {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: 'Super Admin',
          email: adminEmail,
          role: 'SUPER_ADMIN' as any,
          password: hashedPassword
        } as any
      });
      console.log(`[Auth] Designated Administrator account (${adminEmail}) verified as SUPER_ADMIN in database.`);
    }

    // 2. Ensure Tasknera Global Client Admin exists
    const taskneraOrgAdminEmail = TASKNERA_CLIENT_ADMIN_EMAIL.toLowerCase().trim();
    const taskneraOrgAdminPassword = await bcrypt.hash(TASKNERA_CLIENT_ADMIN_PASSWORD, 10);
    const existingOrgAdmin = await prisma.user.findFirst({
      where: {
        OR: [
          { email: taskneraOrgAdminEmail },
          { email: 'admin@tasknera.com' }
        ]
      }
    });
    if (!existingOrgAdmin) {
      await prisma.user.create({
        data: {
          name: 'Sheetal Bedi',
          email: taskneraOrgAdminEmail,
          password: taskneraOrgAdminPassword,
          role: 'CLIENT_ADMIN' as any,
          organizationId: 'org-tasknera',
          isActive: true
        } as any
      });
      console.log(`[Auth] Tasknera Global Client Admin (${taskneraOrgAdminEmail}) initialized.`);
    } else {
      await prisma.user.update({
        where: { id: existingOrgAdmin.id },
        data: {
          name: 'Sheetal Bedi',
          email: taskneraOrgAdminEmail,
          role: 'CLIENT_ADMIN' as any,
          organizationId: 'org-tasknera',
          password: taskneraOrgAdminPassword,
          isActive: true
        } as any
      });
      console.log(`[Auth] Tasknera Global Client Admin (${taskneraOrgAdminEmail}) updated.`);
    }

    // 3. Demote any other accounts that were previous admins
    const designatedAdmins = [adminEmail, taskneraOrgAdminEmail, 'shubham@tasknera.com'];
    await prisma.user.updateMany({
      where: {
        email: { notIn: designatedAdmins },
        role: 'ADMIN'
      },
      data: {
        role: 'MEMBER'
      }
    });

    // 4. Permanently purge any user accounts matching Harsh or Aditya
    try {
      const purgedUsers = await prisma.user.findMany({
        where: {
          OR: [
            { email: { contains: 'harsh', mode: 'insensitive' } },
            { name: { contains: 'harsh', mode: 'insensitive' } },
            { email: { contains: 'aditya', mode: 'insensitive' } },
            { name: { contains: 'aditya', mode: 'insensitive' } }
          ]
        },
        select: { id: true, name: true, email: true }
      });

      for (const u of purgedUsers) {
        if (u.email.toLowerCase().trim() === adminEmail) continue;
        await prisma.evaluation.deleteMany({
          where: {
            OR: [
              { createdByUserId: u.id },
              { evaluatedBy: u.id },
              { assignedToUserId: u.id }
            ]
          }
        });
        await prisma.candidate.deleteMany({ where: { created_by: u.id } });
        await prisma.job.deleteMany({ where: { created_by: u.id } });
        await prisma.user.delete({ where: { id: u.id } });
        console.log(`[Auth] Purged user ${u.name} (${u.email}) from database.`);
      }
    } catch (purgeErr) {
      console.warn('[Auth] Note on user purge:', purgeErr);
    }
  } catch (err) {
    console.error('[Auth] Failed to initialize default admin account:', err);
  }
};

// @desc    Register a new user with 14-day free trial
// @route   POST /api/auth/signup
// @access  Public
export const signup = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, companyName, role } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Please provide email and password' });
      return;
    }

    const cleanEmail = email.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      res.status(400).json({ error: 'Please provide a valid email address' });
      return;
    }

    if (String(password).length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters long' });
      return;
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail }
    });

    if (existingUser) {
      res.status(400).json({ error: 'An account with this email already exists. Please sign in.' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(String(password), salt);

    const displayName = (name || cleanEmail.split('@')[0]).trim();
    const orgName = (companyName || `${displayName}'s Workspace`).trim();

    // 14 days free trial expiry
    const trialStart = new Date();
    const trialExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    // Create organization for this new user with 14-day free trial
    const newOrg = await prisma.organization.create({
      data: {
        name: orgName,
        companyEmail: cleanEmail,
        status: 'ACTIVE',
        subscriptionPlan: 'FREE_TRIAL',
        billingCycle: 'monthly',
        subscriptionStart: trialStart,
        subscriptionExpiry: trialExpiry,
        maxUsers: 5,
        maxRecruiters: 5,
        maxActiveJobs: 20,
        maxResumesPerMonth: 500,
        allowJdUpload: true
      }
    });

    // Default self-signup role to CLIENT_ADMIN so they can manage their workspace
    const assignedRole: UserRole = (role === 'RECRUITER' || role === 'MEMBER') ? (role as UserRole) : 'CLIENT_ADMIN';

    // Create user in database
    const newUser = await prisma.user.create({
      data: {
        name: displayName,
        email: cleanEmail,
        password: hashedPassword,
        role: assignedRole,
        organizationId: newOrg.id,
        allowJdUpload: true,
        isActive: true
      }
    });

    const token = generateToken(newUser.id, newUser.email, newUser.role as UserRole, newOrg.id);

    const subscription: SubscriptionStatusInfo = {
      isSubscribed: false,
      isTrial: true,
      isExpired: false,
      daysLeft: 14,
      plan: 'FREE_TRIAL',
      expiresAt: trialExpiry.toISOString()
    };

    res.status(201).json({
      message: 'Account created successfully with a 14-day free trial',
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        organizationId: newOrg.id,
        allowJdUpload: true,
        createdAt: newUser.createdAt,
        subscription
      }
    });
  } catch (error: any) {
    console.error('[Auth] Signup Error:', error);
    res.status(500).json({ error: error.message || 'Server error during signup' });
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/signin
// @access  Public
export const signin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Please provide email and password' });
      return;
    }

    const cleanEmail = email.toLowerCase().trim();

    // 1. Direct validation for designated admin (ensures login works even if DB is initializing or offline)
    if (cleanEmail === DESIGNATED_ADMIN_EMAIL && password === DESIGNATED_ADMIN_PASSWORD) {
      let adminId = 'd2a446f3-7d0f-4114-96fc-cc2ba0d0381c';
      try {
        const dbAdmin = await prisma.user.findUnique({ where: { email: cleanEmail } });
        if (dbAdmin) {
          adminId = dbAdmin.id;
        }
      } catch (e) {
        console.warn('[Auth] Designated admin DB lookup failed, falling back:', e);
      }

      const orgId = 'org-tasknera';
      const userRole: UserRole = 'SUPER_ADMIN';
      const token = generateToken(adminId, DESIGNATED_ADMIN_EMAIL, userRole, orgId);

      res.status(200).json({
        message: 'Signed in successfully',
        token,
        user: {
          id: adminId,
          name: 'Super Admin',
          email: DESIGNATED_ADMIN_EMAIL,
          role: userRole,
          organizationId: orgId,
          createdAt: new Date().toISOString(),
          subscription: {
            isSubscribed: true,
            isTrial: false,
            isExpired: false,
            daysLeft: 9999,
            plan: 'SUPER_ADMIN',
            expiresAt: null
          }
        }
      });
      return;
    }

    // Direct validation for Tasknera client admin (ensures login works reliably even during DB sync)
    if (cleanEmail === TASKNERA_CLIENT_ADMIN_EMAIL.toLowerCase().trim() && password === TASKNERA_CLIENT_ADMIN_PASSWORD) {
      let adminId = '19841361-84ef-43ae-a856-df82ed997a32';
      try {
        const dbAdmin = await prisma.user.findFirst({
          where: {
            OR: [
              { email: TASKNERA_CLIENT_ADMIN_EMAIL },
              { email: 'admin@tasknera.com' }
            ]
          }
        });
        if (dbAdmin) {
          adminId = dbAdmin.id;
        }
      } catch (e) {
        console.warn('[Auth] Tasknera client admin DB lookup failed, falling back:', e);
      }

      const orgId = 'org-tasknera';
      const userRole: UserRole = 'CLIENT_ADMIN';
      let sheetalAllowJd = true;
      try {
        const org = await prisma.organization.findUnique({
          where: { id: orgId },
          select: { allowJdUpload: true }
        });
        if (org && org.allowJdUpload === false) {
          sheetalAllowJd = false;
        }
      } catch {}

      const token = generateToken(adminId, TASKNERA_CLIENT_ADMIN_EMAIL, userRole, orgId);

      res.status(200).json({
        message: 'Signed in successfully',
        token,
        user: {
          id: adminId,
          name: 'Sheetal Bedi',
          email: TASKNERA_CLIENT_ADMIN_EMAIL,
          role: userRole,
          organizationId: orgId,
          allowJdUpload: sheetalAllowJd,
          createdAt: new Date().toISOString(),
          subscription: {
            isSubscribed: true,
            isTrial: false,
            isExpired: false,
            daysLeft: 9999,
            plan: 'ENTERPRISE',
            expiresAt: null
          }
        }
      });
      return;
    }

    // Query real user from database
    let user: any = null;
    try {
      user = await prisma.user.findUnique({
        where: { email: cleanEmail }
      });
    } catch (dbErr) {
      console.warn('[Auth] Database query failed during signin:', dbErr);
    }

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Compare submitted password against hashed database password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const orgId = user.organizationId || 'org-tasknera';
    let userRole = user.role as UserRole;
    if (user.email.toLowerCase().trim() === DESIGNATED_ADMIN_EMAIL) {
      userRole = 'SUPER_ADMIN';
    }
    const token = generateToken(user.id, user.email, userRole, orgId);

    let userAllowJdUpload = userRole === 'SUPER_ADMIN' ? true : (user.allowJdUpload !== false);
    if (userRole !== 'SUPER_ADMIN' && orgId) {
      try {
        const org = await prisma.organization.findUnique({
          where: { id: orgId },
          select: { allowJdUpload: true }
        });
        if (org && org.allowJdUpload === false) {
          userAllowJdUpload = false;
        }
      } catch {}
    }

    // Calculate subscription status
    const subscription = await calculateSubscriptionStatus(user);

    res.status(200).json({
      message: 'Signed in successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: userRole,
        teamId: user.teamId,
        organizationId: orgId,
        allowJdUpload: userAllowJdUpload,
        createdAt: user.createdAt,
        subscription
      }
    });
  } catch (error) {
    console.error('Signin Error:', error);
    if (req.body?.email?.toLowerCase().trim() === DESIGNATED_ADMIN_EMAIL && req.body?.password === DESIGNATED_ADMIN_PASSWORD) {
      let adminId = 'admin-user';
      try {
        const dbAdmin = await prisma.user.findUnique({ where: { email: DESIGNATED_ADMIN_EMAIL } });
        if (dbAdmin) {
          adminId = dbAdmin.id;
        }
      } catch (e) {
        console.warn('[Auth] Designated admin DB lookup failed on error fallback:', e);
      }

      const orgId = 'org-tasknera';
      const userRole: UserRole = 'SUPER_ADMIN';
      const token = generateToken(adminId, DESIGNATED_ADMIN_EMAIL, userRole, orgId);
      res.status(200).json({
        message: 'Signed in successfully',
        token,
        user: {
          id: adminId,
          name: 'Super Admin',
          email: DESIGNATED_ADMIN_EMAIL,
          role: userRole,
          organizationId: orgId,
          createdAt: new Date().toISOString(),
          subscription: {
            isSubscribed: true,
            isTrial: false,
            isExpired: false,
            daysLeft: 9999,
            plan: 'SUPER_ADMIN',
            expiresAt: null
          }
        }
      });
      return;
    }
    res.status(500).json({ error: 'Server error during signin' });
  }
};

// @desc    Get current logged in user profile
// @route   GET /api/auth/me
export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authorized' });
      return;
    }

    let user: any = null;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.user.userId || '');
    
    if (isUuid) {
      user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          teamId: true,
          organizationId: true,
          allowJdUpload: true,
          createdAt: true,
          updatedAt: true
        }
      });
    }

    if (!user && req.user.email) {
      user = await prisma.user.findUnique({
        where: { email: req.user.email.toLowerCase().trim() },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          teamId: true,
          organizationId: true,
          allowJdUpload: true,
          createdAt: true,
          updatedAt: true
        }
      });
    }

    if (!user && req.user.email?.toLowerCase().trim() === DESIGNATED_ADMIN_EMAIL) {
      user = {
        id: req.user.userId || 'admin-user',
        name: 'Super Admin',
        email: DESIGNATED_ADMIN_EMAIL,
        role: 'SUPER_ADMIN',
        organizationId: 'org-tasknera',
        createdAt: new Date().toISOString()
      };
    }

    if (!user) {
      res.status(404).json({ error: 'User not found in database' });
      return;
    }

    if (user.email?.toLowerCase().trim() === DESIGNATED_ADMIN_EMAIL || user.role === 'SUPER_ADMIN') {
      user.role = 'SUPER_ADMIN';
      user.allowJdUpload = true;
    } else {
      let isAllowed = user.allowJdUpload !== false;
      if (user.organizationId) {
        try {
          const org = await prisma.organization.findUnique({
            where: { id: user.organizationId },
            select: { allowJdUpload: true }
          });
          if (org && org.allowJdUpload === false) {
            isAllowed = false;
          }
        } catch {}
      }
      user.allowJdUpload = isAllowed;
    }

    const subscription = await calculateSubscriptionStatus(user);

    res.status(200).json({ user: { ...user, subscription } });
  } catch (error) {
    console.error('GetMe Error:', error);
    if (req.user?.email?.toLowerCase().trim() === DESIGNATED_ADMIN_EMAIL) {
      res.status(200).json({
        user: {
          id: req.user.userId || 'admin-user',
          name: 'Super Admin',
          email: DESIGNATED_ADMIN_EMAIL,
          role: 'SUPER_ADMIN',
          organizationId: 'org-tasknera',
          createdAt: new Date().toISOString(),
          subscription: {
            isSubscribed: true,
            isTrial: false,
            isExpired: false,
            daysLeft: 9999,
            plan: 'SUPER_ADMIN',
            expiresAt: null
          }
        }
      });
      return;
    }
    res.status(500).json({ error: 'Server error fetching user profile' });
  }
};

// @desc    Authenticate with Google OAuth
// @route   POST /api/auth/google
export const googleSignin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      res.status(400).json({ error: 'Google ID token is required' });
      return;
    }

    // Verify the Google ID token
    let payload: any;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      console.error('[AuthController] Google token verification failed:', verifyErr);
      res.status(401).json({ error: 'Invalid Google token. Please try signing in again.' });
      return;
    }

    if (!payload || !payload.email) {
      res.status(400).json({ error: 'Could not retrieve email from Google account' });
      return;
    }

    const cleanEmail = payload.email.toLowerCase().trim();

    // Verify user exists in database or create new user with 14-day free trial
    let user = await prisma.user.findUnique({ where: { email: cleanEmail } });

    if (!user) {
      const trialStart = new Date();
      const trialExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const displayName = payload.name || cleanEmail.split('@')[0];
      const orgName = `${displayName}'s Workspace`;

      const newOrg = await prisma.organization.create({
        data: {
          name: orgName,
          companyEmail: cleanEmail,
          status: 'ACTIVE',
          subscriptionPlan: 'FREE_TRIAL',
          billingCycle: 'monthly',
          subscriptionStart: trialStart,
          subscriptionExpiry: trialExpiry,
          maxUsers: 5,
          maxRecruiters: 5,
          maxActiveJobs: 20,
          maxResumesPerMonth: 500,
          allowJdUpload: true
        }
      });

      const randomPassword = await bcrypt.hash(`google_${Date.now()}_${Math.random()}`, 10);
      user = await prisma.user.create({
        data: {
          name: displayName,
          email: cleanEmail,
          password: randomPassword,
          role: 'CLIENT_ADMIN',
          organizationId: newOrg.id,
          allowJdUpload: true,
          isActive: true
        }
      });
    }

    const token = generateToken(user.id, user.email, user.role as UserRole, user.organizationId || 'org-tasknera');
    const subscription = await calculateSubscriptionStatus(user);

    res.status(200).json({
      message: 'Google authentication successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: payload.picture || null,
        teamId: user.teamId,
        organizationId: user.organizationId || 'org-tasknera',
        createdAt: user.createdAt,
        subscription
      }
    });
  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(500).json({ error: 'Server error during Google authentication' });
  }
};

// @desc    Change / update user password
// @route   PATCH /api/auth/change-password
// @access  Private
export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    if (!newPassword || String(newPassword).length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters long' });
      return;
    }

    const targetUser = await prisma.user.findFirst({
      where: {
        OR: [
          ...(req.user.userId ? [{ id: req.user.userId }] : []),
          ...(req.user.email ? [{ email: req.user.email.toLowerCase().trim() }] : [])
        ]
      }
    });

    if (!targetUser) {
      res.status(404).json({ error: 'User not found in database' });
      return;
    }

    if (currentPassword) {
      const isMatch = await bcrypt.compare(currentPassword, targetUser.password);
      if (!isMatch) {
        res.status(400).json({ error: 'Current password is incorrect' });
        return;
      }
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(String(newPassword), salt);

    await prisma.user.update({
      where: { id: targetUser.id },
      data: { password: hashedPassword }
    });

    res.status(200).json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error: any) {
    console.error('[AuthController] Error changing password:', error);
    res.status(500).json({ error: error.message || 'Failed to update password' });
  }
};

// @desc    Submit subscription plan inquiry or upgrade request
// @route   POST /api/auth/subscription-inquiry
// @access  Private
export const subscriptionInquiry = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { plan, phone, notes } = req.body;

    // Log subscription inquiry in AuditLog
    try {
      await prisma.auditLog.create({
        data: {
          action: 'SUBSCRIPTION_UPGRADE_INQUIRY',
          organizationId: req.user.organizationId !== 'org-tasknera' ? req.user.organizationId : null,
          details: {
            userEmail: req.user.email,
            selectedPlan: plan || 'PROFESSIONAL',
            phone: phone || null,
            notes: notes || null,
            requestedAt: new Date().toISOString()
          }
        }
      });
    } catch (auditErr) {
      console.warn('[Auth] Audit log creation failed for subscription inquiry:', auditErr);
    }

    res.status(200).json({
      success: true,
      message: 'Your subscription upgrade request has been submitted! Our team will contact you shortly.'
    });
  } catch (error: any) {
    console.error('[Auth] Error submitting subscription inquiry:', error);
    res.status(500).json({ error: error.message || 'Failed to submit inquiry' });
  }
};
