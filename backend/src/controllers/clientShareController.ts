import { Response } from 'express';
import crypto from 'crypto';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/authMiddleware';

/**
 * Helper to compute SHA-256 hash of sharing token
 */
export const hashShareToken = (token: string): string => {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
};

/**
 * POST /api/jobs/:jobId/client-shares
 * Recruiter generates a secure client sharing link for selected candidate IDs
 */
export const createClientShare = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !user.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { jobId } = req.params;
    const { candidateIds, clientName, expiresInDays } = req.body;

    if (!jobId) {
      res.status(400).json({ error: 'Job ID is required' });
      return;
    }

    if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
      res.status(400).json({ error: 'At least one candidate must be selected' });
      return;
    }

    const orgId = user.organizationId || 'org-tasknera';
    const isSuperAdmin = user.role === 'SUPER_ADMIN';

    // Verify job belongs to organization
    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        ...(isSuperAdmin ? {} : { organizationId: orgId }),
      },
    });

    if (!job) {
      res.status(404).json({ error: 'Job requisition not found or unauthorized' });
      return;
    }

    // Verify candidate IDs belong to organization
    const validCandidates = await prisma.candidate.findMany({
      where: {
        id: { in: candidateIds },
        ...(isSuperAdmin ? {} : { organizationId: orgId }),
      },
      select: { id: true, name: true, resume_file_url: true },
    });

    if (validCandidates.length === 0) {
      res.status(400).json({ error: 'None of the selected candidates exist or belong to your organization' });
      return;
    }

    // Generate secure cryptographic token (48 chars hex)
    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = hashShareToken(rawToken);

    // Calculate expiration if requested
    let expiresAt: Date | null = null;
    if (expiresInDays && Number(expiresInDays) > 0) {
      expiresAt = new Date(Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000);
    }

    const shareTargetClient = clientName ? String(clientName).trim() : job.client;

    // Create share record and items atomically
    const newShare = await prisma.clientCandidateShare.create({
      data: {
        jobId: job.id,
        organizationId: orgId,
        createdBy: user.userId,
        clientName: shareTargetClient,
        tokenHash,
        rawToken,
        status: 'active',
        expiresAt,
        items: {
          create: validCandidates.map(c => ({
            candidateId: c.id,
            addedBy: user.userId,
            isActive: true,
          })),
        },
      },
      include: {
        items: {
          include: {
            candidate: {
              select: {
                id: true,
                name: true,
                current_title: true,
                current_company: true,
                total_experience: true,
              },
            },
          },
        },
      },
    });

    // Record initial hiring activity for each shared candidate
    const actorName = user.name || user.email || 'Recruiter';
    await Promise.all(
      validCandidates.map(c =>
        prisma.candidateHiringActivity.create({
          data: {
            organizationId: orgId,
            jobId: job.id,
            candidateId: c.id,
            shareId: newShare.id,
            status: 'Shared with Client',
            previousStatus: null,
            feedback: `Candidate shortlisted and shared with ${shareTargetClient} via secure link.`,
            updatedBy: actorName,
            updatedByRole: 'RECRUITER',
          },
        })
      )
    );

    res.status(201).json({
      success: true,
      share: newShare,
      token: rawToken,
      shareUrl: `/share/${rawToken}`,
    });
  } catch (error: any) {
    console.error('[Create Client Share Error]:', error);
    res.status(500).json({
      error: 'Failed to create client sharing link',
      details: error?.message || 'Internal error',
    });
  }
};

/**
 * GET /api/jobs/:jobId/client-shares
 * List all client candidate share links for a job requisition
 */
export const listJobClientShares = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !user.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { jobId } = req.params;
    const orgId = user.organizationId || 'org-tasknera';
    const isSuperAdmin = user.role === 'SUPER_ADMIN';

    const shares = await prisma.clientCandidateShare.findMany({
      where: {
        jobId,
        ...(isSuperAdmin ? {} : { organizationId: orgId }),
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        items: {
          where: { isActive: true },
          include: {
            candidate: {
              select: {
                id: true,
                name: true,
                email: true,
                current_title: true,
                current_company: true,
                total_experience: true,
              },
            },
          },
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Check expiry dynamically
    const now = new Date();
    const formattedShares = shares.map(share => {
      let isExpired = false;
      if (share.expiresAt && share.expiresAt < now) {
        isExpired = true;
      }
      return {
        ...share,
        isExpired,
        candidateCount: share.items.length,
      };
    });

    res.status(200).json({
      success: true,
      shares: formattedShares,
    });
  } catch (error: any) {
    console.error('[List Job Client Shares Error]:', error);
    res.status(500).json({
      error: 'Failed to retrieve client shares',
      details: error?.message || 'Internal error',
    });
  }
};

/**
 * GET /api/jobs/:jobId/client-shares/:shareId
 * Retrieve single share link details including candidates and full activity log
 */
export const getClientShareById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !user.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { jobId, shareId } = req.params;
    const orgId = user.organizationId || 'org-tasknera';
    const isSuperAdmin = user.role === 'SUPER_ADMIN';

    const share = await prisma.clientCandidateShare.findFirst({
      where: {
        id: shareId,
        jobId,
        ...(isSuperAdmin ? {} : { organizationId: orgId }),
      },
      include: {
        job: {
          select: { id: true, position: true, client: true, location: true },
        },
        user: {
          select: { id: true, name: true, email: true },
        },
        items: {
          where: { isActive: true },
          include: {
            candidate: {
              select: {
                id: true,
                name: true,
                email: true,
                current_title: true,
                current_company: true,
                total_experience: true,
                summary: true,
                skills: { select: { skill: true } },
                evaluations: {
                  where: { jobId },
                  select: { score: true, atsScore: true, matchLevel: true },
                  take: 1,
                },
              },
            },
          },
        },
        activities: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!share) {
      res.status(404).json({ error: 'Sharing link not found' });
      return;
    }

    res.status(200).json({
      success: true,
      share,
    });
  } catch (error: any) {
    console.error('[Get Client Share Error]:', error);
    res.status(500).json({
      error: 'Failed to retrieve sharing link details',
      details: error?.message || 'Internal error',
    });
  }
};

/**
 * PATCH /api/jobs/:jobId/client-shares/:shareId/status
 * Revoke or activate a client sharing link
 */
export const updateClientShareStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !user.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { jobId, shareId } = req.params;
    const { status } = req.body;

    if (!status || !['active', 'revoked'].includes(status)) {
      res.status(400).json({ error: 'Status must be active or revoked' });
      return;
    }

    const orgId = user.organizationId || 'org-tasknera';
    const isSuperAdmin = user.role === 'SUPER_ADMIN';

    const share = await prisma.clientCandidateShare.findFirst({
      where: {
        id: shareId,
        jobId,
        ...(isSuperAdmin ? {} : { organizationId: orgId }),
      },
    });

    if (!share) {
      res.status(404).json({ error: 'Sharing link not found' });
      return;
    }

    const updated = await prisma.clientCandidateShare.update({
      where: { id: share.id },
      data: { status },
    });

    res.status(200).json({
      success: true,
      share: updated,
    });
  } catch (error: any) {
    console.error('[Update Share Status Error]:', error);
    res.status(500).json({
      error: 'Failed to update link status',
      details: error?.message || 'Internal error',
    });
  }
};

/**
 * POST /api/jobs/:jobId/client-shares/:shareId/regenerate
 * Regenerate sharing token (invalidates previous link)
 */
export const regenerateClientShareToken = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !user.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { jobId, shareId } = req.params;
    const orgId = user.organizationId || 'org-tasknera';
    const isSuperAdmin = user.role === 'SUPER_ADMIN';

    const share = await prisma.clientCandidateShare.findFirst({
      where: {
        id: shareId,
        jobId,
        ...(isSuperAdmin ? {} : { organizationId: orgId }),
      },
    });

    if (!share) {
      res.status(404).json({ error: 'Sharing link not found' });
      return;
    }

    const newRawToken = crypto.randomBytes(24).toString('hex');
    const newTokenHash = hashShareToken(newRawToken);

    const updated = await prisma.clientCandidateShare.update({
      where: { id: share.id },
      data: {
        rawToken: newRawToken,
        tokenHash: newTokenHash,
        status: 'active',
      },
    });

    res.status(200).json({
      success: true,
      share: updated,
      token: newRawToken,
      shareUrl: `/share/${newRawToken}`,
    });
  } catch (error: any) {
    console.error('[Regenerate Share Token Error]:', error);
    res.status(500).json({
      error: 'Failed to regenerate sharing link',
      details: error?.message || 'Internal error',
    });
  }
};

/**
 * POST /api/jobs/:jobId/client-shares/:shareId/candidates
 * Add candidates to an existing share link
 */
export const addCandidatesToShare = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !user.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { jobId, shareId } = req.params;
    const { candidateIds } = req.body;

    if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
      res.status(400).json({ error: 'Candidate IDs array is required' });
      return;
    }

    const orgId = user.organizationId || 'org-tasknera';
    const isSuperAdmin = user.role === 'SUPER_ADMIN';

    const share = await prisma.clientCandidateShare.findFirst({
      where: {
        id: shareId,
        jobId,
        ...(isSuperAdmin ? {} : { organizationId: orgId }),
      },
    });

    if (!share) {
      res.status(404).json({ error: 'Sharing link not found' });
      return;
    }

    // Upsert candidate items
    await Promise.all(
      candidateIds.map(candidateId =>
        prisma.clientCandidateShareItem.upsert({
          where: {
            shareId_candidateId: {
              shareId: share.id,
              candidateId,
            },
          },
          create: {
            shareId: share.id,
            candidateId,
            addedBy: user.userId,
            isActive: true,
          },
          update: {
            isActive: true,
          },
        })
      )
    );

    // Record initial hiring activity for newly added candidates
    const actorName = user.name || user.email || 'Recruiter';
    await Promise.all(
      candidateIds.map(candidateId =>
        prisma.candidateHiringActivity.create({
          data: {
            organizationId: orgId,
            jobId,
            candidateId,
            shareId: share.id,
            status: 'Shared with Client',
            feedback: `Candidate added to active client share for ${share.clientName || 'Client'}.`,
            updatedBy: actorName,
            updatedByRole: 'RECRUITER',
          },
        })
      )
    );

    res.status(200).json({
      success: true,
      message: 'Candidates successfully added to sharing link.',
    });
  } catch (error: any) {
    console.error('[Add Candidates to Share Error]:', error);
    res.status(500).json({
      error: 'Failed to add candidates to sharing link',
      details: error?.message || 'Internal error',
    });
  }
};

/**
 * DELETE /api/jobs/:jobId/client-shares/:shareId/candidates/:candidateId
 * Remove a candidate from a sharing link
 */
export const removeCandidateFromShare = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !user.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { jobId, shareId, candidateId } = req.params;
    const orgId = user.organizationId || 'org-tasknera';
    const isSuperAdmin = user.role === 'SUPER_ADMIN';

    const share = await prisma.clientCandidateShare.findFirst({
      where: {
        id: shareId,
        jobId,
        ...(isSuperAdmin ? {} : { organizationId: orgId }),
      },
    });

    if (!share) {
      res.status(404).json({ error: 'Sharing link not found' });
      return;
    }

    await prisma.clientCandidateShareItem.updateMany({
      where: {
        shareId: share.id,
        candidateId,
      },
      data: {
        isActive: false,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Candidate removed from client sharing link.',
    });
  } catch (error: any) {
    console.error('[Remove Candidate from Share Error]:', error);
    res.status(500).json({
      error: 'Failed to remove candidate from share',
      details: error?.message || 'Internal error',
    });
  }
};

/**
 * GET /api/jobs/:jobId/candidate-activities
 * Retrieve unified candidate activity and interview tracking history for a job
 */
export const getJobCandidateActivities = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !user.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { jobId } = req.params;
    const candidateId = req.query.candidateId ? String(req.query.candidateId) : undefined;
    const shareId = req.query.shareId ? String(req.query.shareId) : undefined;

    const orgId = user.organizationId || 'org-tasknera';
    const isSuperAdmin = user.role === 'SUPER_ADMIN';

    const activities = await prisma.candidateHiringActivity.findMany({
      where: {
        jobId,
        ...(candidateId ? { candidateId } : {}),
        ...(shareId ? { shareId } : {}),
        ...(isSuperAdmin ? {} : { organizationId: orgId }),
      },
      include: {
        candidate: {
          select: { id: true, name: true, current_title: true },
        },
        share: {
          select: { id: true, clientName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
      success: true,
      activities,
    });
  } catch (error: any) {
    console.error('[Get Job Activities Error]:', error);
    res.status(500).json({
      error: 'Failed to fetch candidate interview tracking activities',
      details: error?.message || 'Internal error',
    });
  }
};
