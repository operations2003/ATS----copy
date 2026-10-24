import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { bulkUploadService } from '../services/bulkUploadService';
import prisma from '../config/prisma';

/**
 * Initialize a new bulk upload batch session
 * POST /api/jobs/:jobId/candidates/batch or POST /api/candidates/batch
 */
export const createBulkBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const callerRole = req.user?.role || 'MEMBER';
    const isSuperAdmin = callerRole === 'SUPER_ADMIN' || req.user?.email?.toLowerCase().trim() === 'operations@tasknera.com';
    const userOrgId = req.user?.organizationId || 'org-tasknera';
    const currentUserId = req.user?.userId || req.user?.id;

    if (!currentUserId) {
      res.status(401).json({ error: 'Unauthorized: User authentication required' });
      return;
    }

    const rawJobId = String(req.params.jobId || req.body?.jobId || '').trim();
    const isPool = !rawJobId || rawJobId === 'pool' || rawJobId === 'all';
    const jobId = isPool ? null : rawJobId;

    if (jobId) {
      const jobRecord = await prisma.job.findUnique({
        where: { id: jobId },
        select: { id: true, organizationId: true },
      });

      if (!jobRecord) {
        res.status(404).json({ error: 'Job requisition not found' });
        return;
      }

      if (!isSuperAdmin && (jobRecord.organizationId || 'org-tasknera') !== userOrgId) {
        res.status(403).json({ error: 'Forbidden: Cannot access job from another organization' });
        return;
      }
    }

    const totalFiles = parseInt(req.body?.totalFiles || '0', 10);
    const batch = await bulkUploadService.createBatch({
      jobId,
      organizationId: userOrgId,
      uploadedBy: currentUserId,
      totalFiles,
    });

    res.status(201).json({
      success: true,
      batchId: batch.id,
      status: batch.status,
      jobId: batch.jobId,
      createdAt: batch.createdAt,
    });
  } catch (err: any) {
    console.error('[Bulk Batch Controller] Create error:', err);
    res.status(500).json({ error: err.message || 'Failed to create bulk upload batch' });
  }
};

/**
 * Upload one or more files to a bulk batch
 * POST /api/jobs/:jobId/candidates/batch/:batchId/upload
 */
export const uploadFilesToBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const batchId = String(req.params.batchId || '').trim();
    const userOrgId = req.user?.organizationId || 'org-tasknera';

    if (!batchId) {
      res.status(400).json({ error: 'Batch ID is required' });
      return;
    }

    let files: Express.Multer.File[] = [];
    if (Array.isArray(req.files)) {
      files = req.files;
    } else if (req.files && typeof req.files === 'object') {
      const filesObj = req.files as Record<string, Express.Multer.File[]>;
      for (const k of Object.keys(filesObj)) {
        if (Array.isArray(filesObj[k])) files.push(...filesObj[k]);
      }
    } else if (req.file) {
      files = [req.file];
    }

    if (files.length === 0) {
      res.status(400).json({ error: 'No files provided for batch upload' });
      return;
    }

    const addedItems = [];
    for (const f of files) {
      const item = await bulkUploadService.addFileToBatch(
        batchId,
        {
          originalname: f.originalname,
          mimetype: f.mimetype,
          size: f.size,
          buffer: f.buffer,
        },
        userOrgId
      );
      addedItems.push(item);
    }

    res.status(200).json({
      success: true,
      batchId,
      uploadedCount: addedItems.length,
      items: addedItems.map(i => ({
        id: i.id,
        fileName: i.fileName,
        fileSize: i.fileSize,
        status: i.status,
      })),
    });
  } catch (err: any) {
    console.error('[Bulk Batch Controller] Upload error:', err);
    res.status(500).json({ error: err.message || 'Failed to upload files to batch' });
  }
};

/**
 * Get batch progress metrics and per-file item list
 * GET /api/jobs/:jobId/candidates/batch/:batchId
 */
export const getBatchStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const batchId = String(req.params.batchId || '').trim();
    const userOrgId = req.user?.organizationId || 'org-tasknera';

    if (!batchId) {
      res.status(400).json({ error: 'Batch ID is required' });
      return;
    }

    const details = await bulkUploadService.getBatchDetails(batchId, userOrgId);
    res.status(200).json({
      success: true,
      ...details,
    });
  } catch (err: any) {
    console.error('[Bulk Batch Controller] Status error:', err);
    res.status(err.message === 'Unauthorized' ? 403 : 500).json({ error: err.message || 'Failed to retrieve batch status' });
  }
};

/**
 * Retry single CV item
 * POST /api/jobs/:jobId/candidates/batch/:batchId/items/:itemId/retry
 */
export const retryBatchItem = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const itemId = String(req.params.itemId || '').trim();
    const userOrgId = req.user?.organizationId || 'org-tasknera';

    if (!itemId) {
      res.status(400).json({ error: 'Item ID is required' });
      return;
    }

    const updated = await bulkUploadService.retryItem(itemId, userOrgId);
    res.status(200).json({
      success: true,
      item: updated,
    });
  } catch (err: any) {
    console.error('[Bulk Batch Controller] Retry item error:', err);
    res.status(err.message === 'Unauthorized' ? 403 : 500).json({ error: err.message || 'Failed to retry CV item' });
  }
};

/**
 * Retry all failed items in batch
 * POST /api/jobs/:jobId/candidates/batch/:batchId/retry-failed
 */
export const retryAllFailedInBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const batchId = String(req.params.batchId || '').trim();
    const userOrgId = req.user?.organizationId || 'org-tasknera';

    if (!batchId) {
      res.status(400).json({ error: 'Batch ID is required' });
      return;
    }

    const result = await bulkUploadService.retryAllFailedInBatch(batchId, userOrgId);
    res.status(200).json({
      success: true,
      retriedCount: result.retriedCount,
    });
  } catch (err: any) {
    console.error('[Bulk Batch Controller] Retry all error:', err);
    res.status(err.message === 'Unauthorized' ? 403 : 500).json({ error: err.message || 'Failed to retry failed items' });
  }
};

