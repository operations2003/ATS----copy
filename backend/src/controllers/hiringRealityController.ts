import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import prisma from '../config/prisma';
import { analyzeHiringReality, HiringRealityInput } from '../services/hiringRealityService';

/**
 * Controller to fetch Hiring Reality analysis for a saved job requisition
 * GET /api/jobs/:id/hiring-reality
 */
export const getJobHiringRealityController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const jobId = String(req.params.id || '').trim();
    if (!jobId) {
      res.status(400).json({ error: 'Job ID is required.' });
      return;
    }

    let job: any = null;
    const isJobUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId);
    if (isJobUuid) {
      try {
        job = await prisma.job.findUnique({
          where: { id: jobId },
          include: { requirements: true }
        });
      } catch (err) {
        console.warn('[Hiring Reality] Prisma findUnique job error:', err);
      }
    }
    if (!job) {
      try {
        const { GLOBAL_JOB_STORE } = require('./jobController');
        job = GLOBAL_JOB_STORE.get(jobId);
      } catch {}
    }

    if (!job) {
      res.status(404).json({ error: 'Job requisition not found.' });
      return;
    }

    const report = analyzeHiringReality({
      jobTitle: job.position,
      client: job.client,
      location: job.location || undefined,
      workMode: job.work_mode || undefined,
      salary: job.salary || undefined,
      jdText: job.jd_text || job.original_jd || undefined,
      requirements: (job.requirements || []).map(r => ({
        id: r.id,
        requirement: r.requirement,
        category: r.category || 'General',
        isMandatory: r.is_mandatory,
        mandatory: r.is_mandatory,
        weight: r.weight
      }))
    });

    res.status(200).json({
      success: true,
      report
    });
  } catch (error: any) {
    console.error('[Hiring Reality Controller Error]:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze hiring reality' });
  }
};

/**
 * Controller to simulate or analyze Hiring Reality on-the-fly (stateless)
 * POST /api/jobs/hiring-reality/simulate
 */
export const simulateJobHiringRealityController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const input: HiringRealityInput = req.body || {};

    const report = analyzeHiringReality({
      jobTitle: input.jobTitle,
      client: input.client,
      location: input.location,
      workMode: input.workMode,
      salary: input.salary,
      minExperienceYears: input.minExperienceYears,
      maxExperienceYears: input.maxExperienceYears,
      noticePeriodDays: input.noticePeriodDays,
      jdText: input.jdText,
      requirements: input.requirements,
      activeAdjustments: input.activeAdjustments
    });

    res.status(200).json({
      success: true,
      report
    });
  } catch (error: any) {
    console.error('[Hiring Reality Simulation Error]:', error);
    res.status(500).json({ error: error.message || 'Failed to simulate hiring reality' });
  }
};

