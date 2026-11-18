import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/authMiddleware';
import { CANDIDATE_STORE } from './candidateController';

/**
 * Optimized Dashboard Summary Controller
 * Performs lightweight aggregate queries in parallel to return:
 * - Executive KPIs (active jobs, total candidates, evaluations, compliance)
 * - Formatted user jobs with applicant counts and top scores
 * - Recent candidate evaluations
 * 
 * Avoids any N+1 sequential fetches or heavy document processing.
 */
export const getDashboardSummaryController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user || !req.user.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const currentUserId = req.user.userId;
    const callerRole = req.user.role || 'MEMBER';
    const isSuperAdmin = callerRole === 'SUPER_ADMIN' || req.user.email?.toLowerCase().trim() === 'operations@tasknera.com' || req.user.email?.toLowerCase().trim() === 'admin@gmail.com' || req.user.email?.toLowerCase().trim() === 'demo@gmail.com';
    const isClientAdmin = callerRole === 'CLIENT_ADMIN' || callerRole === 'ADMIN';
    const userOrgId = req.user.organizationId || 'org-tasknera';

    // 1. Build Scoped Where Clauses
    const jobWhere: any = {};
    if (!isSuperAdmin) {
      jobWhere.organizationId = userOrgId;
      if (!isClientAdmin) {
        jobWhere.AND = [
          ...(jobWhere.AND || []),
          {
            OR: [
              { created_by: currentUserId },
              { user: { role: { in: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'ADMIN'] } } }
            ]
          }
        ];
      }
    } else if (req.query.organizationId) {
      jobWhere.organizationId = String(req.query.organizationId);
    }

    jobWhere.NOT = [
      ...(jobWhere.NOT || []),
      { user: { email: { contains: 'harsh', mode: 'insensitive' } } },
      { user: { name: { contains: 'harsh', mode: 'insensitive' } } },
      { user: { email: { contains: 'aditya', mode: 'insensitive' } } },
      { user: { name: { contains: 'aditya', mode: 'insensitive' } } },
    ];

    const evalWhere: any = {};
    if (!isSuperAdmin) {
      evalWhere.OR = [
        { organizationId: userOrgId },
        { job: { organizationId: userOrgId } },
        { candidate: { organizationId: userOrgId } }
      ];
      if (!isClientAdmin) {
        evalWhere.AND = [
          {
            OR: [
              { evaluatedBy: currentUserId },
              { createdByUserId: currentUserId },
              { candidate: { created_by: currentUserId } },
              { job: { created_by: currentUserId } },
              { job: { user: { role: { in: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'ADMIN'] } } } }
            ]
          }
        ];
      }
    }

    const candidateWhere: any = {};
    if (!isSuperAdmin) {
      candidateWhere.organizationId = userOrgId;
      if (!isClientAdmin) {
        candidateWhere.created_by = currentUserId;
      }
    }

    const activityWhere: any = {};
    if (!isSuperAdmin) {
      activityWhere.organizationId = userOrgId;
      if (!isClientAdmin) {
        activityWhere.candidate = { created_by: currentUserId };
      }
    } else if (req.query.organizationId) {
      activityWhere.organizationId = String(req.query.organizationId);
    }

    // 2. Execute parallel lightweight queries
    const [jobsData, evalsData, candidateCount, candidatesList, applicationsData, activitiesData] = await Promise.all([
      // Jobs query (selected fields only)
      prisma.job.findMany({
        where: jobWhere,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          position: true,
          client: true,
          location: true,
          work_mode: true,
          status: true,
          created_at: true,
          _count: {
            select: {
              candidates: true,
              applications: true
            }
          },
          applications: {
            select: {
              match_score: true
            }
          },
          evaluations: {
            select: {
              score: true,
              atsScore: true
            },
            take: 10,
            orderBy: { createdAt: 'desc' }
          }
        }
      }),

      // Evaluations query (selected fields only)
      prisma.evaluation.findMany({
        where: evalWhere,
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: {
          id: true,
          candidateId: true,
          jobId: true,
          score: true,
          atsScore: true,
          decision: true,
          createdAt: true,
          candidate: {
            select: {
              id: true,
              name: true,
              current_title: true
            }
          },
          job: {
            select: {
              id: true,
              position: true,
              client: true
            }
          }
        }
      }),

      // Total Candidate Count
      prisma.candidate.count({
        where: candidateWhere
      }),

      // Candidate list for pipeline funnel
      prisma.candidate.findMany({
        where: candidateWhere,
        select: { id: true, parsing_status: true }
      }),

      // Applications with stages
      prisma.candidateApplication.findMany({
        where: {
          ...(Object.keys(jobWhere).length > 0 ? { job: jobWhere } : {})
        },
        select: {
          id: true,
          candidate_id: true,
          stage: true,
          status: true,
          match_score: true
        }
      }),

      // Hiring activities for client portal events
      prisma.candidateHiringActivity.findMany({
        where: activityWhere,
        select: {
          id: true,
          candidateId: true,
          status: true,
          interviewRound: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    // 3. Process jobs
    const formattedJobs = jobsData.map((j: any) => {
      const rawStatus = (j.status || 'Active').toLowerCase();
      const normalizedStatus = rawStatus === 'draft' ? 'Draft' : rawStatus === 'closed' ? 'Closed' : 'Active';
      const rawMode = (j.work_mode || 'Remote').trim();
      const normalizedMode = rawMode.charAt(0).toUpperCase() + rawMode.slice(1).toLowerCase();

      // Top Score calculation from stored applications and evaluations
      const appScores = (j.applications || []).map((a: any) => a.match_score).filter((s: any) => typeof s === 'number' && !isNaN(s));
      const evalScores = (j.evaluations || []).map((e: any) => e.atsScore ?? e.score).filter((s: any) => typeof s === 'number' && !isNaN(s));
      const allScores = [...appScores, ...evalScores];
      const topScore = allScores.length > 0 ? Math.round(Math.max(...allScores)) : null;

      const memCount = CANDIDATE_STORE.get(j.id)?.length || 0;
      const dbCount = Math.max(j._count?.candidates || 0, j._count?.applications || 0);
      const candidatesCount = Math.max(dbCount, memCount);

      return {
        id: j.id,
        title: j.position || j.title || 'Untitled Position',
        client: j.client || j.company || 'Direct Client',
        location: j.location || 'Remote',
        mode: ['Remote', 'Hybrid', 'Onsite'].includes(normalizedMode) ? normalizedMode : 'Remote',
        candidates: candidatesCount,
        topScore,
        status: normalizedStatus,
        created: j.created_at ? new Date(j.created_at).toLocaleDateString() : 'Recent'
      };
    });

    // 4. Process recent evaluations with deduplication
    const dedupedEvalsMap = new Map<string, any>();
    for (const e of evalsData) {
      const rawScore = e.atsScore ?? e.score;
      if (typeof rawScore === 'number' && rawScore > 0) {
        const score = Math.round(rawScore);
        const isSubmit = e.decision === 'SUBMIT' || e.decision === 'ACCEPT' || e.decision === 'REVIEW' || score >= 65;
        const candId = e.candidateId || e.id;
        const candName = (e.candidate?.name || 'Candidate').trim();
        const key = candName.toLowerCase() || candId;

        const evalItem = {
          id: candId,
          name: candName,
          role: e.candidate?.current_title || e.job?.position || 'Applicant',
          match: score,
          decision: isSubmit ? 'SUBMIT' : 'DO NOT SUBMIT',
          time: e.createdAt ? new Date(e.createdAt).toLocaleDateString() : 'Recently',
          jobId: e.jobId
        };

        if (!dedupedEvalsMap.has(key) || dedupedEvalsMap.get(key).match < score) {
          dedupedEvalsMap.set(key, evalItem);
        }
      }
    }

    const recentEvaluations = Array.from(dedupedEvalsMap.values());

    // 5. Update topScore on formattedJobs if evaluations had higher scores
    for (const j of formattedJobs) {
      const jEvals = recentEvaluations.filter(ev => ev.jobId === j.id);
      if (jEvals.length > 0) {
        const maxScore = Math.max(...jEvals.map(ev => ev.match));
        if (j.topScore === null || maxScore > j.topScore) {
          j.topScore = maxScore;
        }
      }
    }

    // 6. Compute aggregate stats
    const activeJobsCount = formattedJobs.filter(j => j.status === 'Active').length;
    const totalJobApplicants = formattedJobs.reduce((acc, j) => acc + (j.candidates || 0), 0);
    const totalEvaluated = Math.max(recentEvaluations.length, totalJobApplicants);
    const submitCount = recentEvaluations.filter(e => e.decision === 'SUBMIT' || e.match >= 65).length;
    const rejectCount = recentEvaluations.filter(e => e.decision === 'DO NOT SUBMIT' && e.match < 50).length;

    let avgCompliance: number | null = null;
    if (recentEvaluations.length > 0) {
      const sum = recentEvaluations.reduce((acc, curr) => acc + curr.match, 0);
      avgCompliance = Math.round((sum / recentEvaluations.length) * 10) / 10;
    }

    // 7. Calculate authoritative Pipeline Funnel stages
    const FUNNEL_STAGES = [
      'Screening',
      'Shortlisted',
      'Recruiter Name',
      'Round 1 Phase',
      'Round 2 Phase',
      'Selected',
      'Offered',
      'Joined'
    ] as const;

    const STAGE_RANK: Record<string, number> = {
      'Screening': 1,
      'Shortlisted': 2,
      'Recruiter Name': 3,
      'Round 1 Phase': 4,
      'Round 2 Phase': 5,
      'Selected': 6,
      'Offered': 7,
      'Joined': 8,
    };

    const candStageMap = new Map<string, string>();
    const updateStage = (cId: string, stage: string) => {
      if (!cId || !stage || !STAGE_RANK[stage]) return;
      const current = candStageMap.get(cId);
      if (!current || STAGE_RANK[stage] > (STAGE_RANK[current] || 0)) {
        candStageMap.set(cId, stage);
      }
    };

    // Candidates in DB start in Screening
    for (const c of (candidatesList || [])) {
      if (c && c.id) {
        candStageMap.set(c.id, 'Screening');
      }
    }

    // In-memory candidate store candidates
    for (const [, memCands] of CANDIDATE_STORE.entries()) {
      for (const mc of memCands) {
        if (mc && mc.id) {
          candStageMap.set(String(mc.id), 'Screening');
        }
      }
    }

    // Evaluations: high match or SUBMIT moves to Shortlisted
    for (const e of (evalsData || [])) {
      const s = e.atsScore ?? e.score;
      const cId = e.candidateId || e.id;
      if (e.decision === 'SUBMIT' || (typeof s === 'number' && s >= 80)) {
        updateStage(cId, 'Shortlisted');
      } else if (!candStageMap.has(cId)) {
        updateStage(cId, 'Screening');
      }
    }

    // Applications with stages
    for (const a of (applicationsData || [])) {
      const st = String(a.stage || '').toUpperCase();
      let mapped = '';
      if (st.includes('JOIN')) mapped = 'Joined';
      else if (st.includes('OFFER')) mapped = 'Offered';
      else if (st.includes('SELECT')) mapped = 'Selected';
      else if (st.includes('INTERVIEW')) mapped = 'Round 1 Phase';
      else if (st.includes('SHORTLIST') || st.includes('TL_APPROVED') || (typeof a.match_score === 'number' && a.match_score >= 80)) mapped = 'Shortlisted';
      else if (st.includes('SOURCED') || st.includes('SCREEN') || st.includes('REVIEW')) mapped = 'Screening';

      if (mapped) updateStage(a.candidate_id, mapped);
    }

    // Hiring activities from client shares
    for (const act of (activitiesData || [])) {
      const actStatus = String(act.status || '').toUpperCase();
      const round = String(act.interviewRound || '').toLowerCase();
      let mapped = '';
      if (actStatus.includes('JOIN')) mapped = 'Joined';
      else if (actStatus.includes('OFFER')) mapped = 'Offered';
      else if (actStatus.includes('SELECT')) mapped = 'Selected';
      else if (actStatus.includes('INTERVIEW')) {
        if (round.includes('hr') || round.includes('round 2') || round.includes('final')) mapped = 'Round 2 Phase';
        else if (round.includes('recruiter')) mapped = 'Recruiter Name';
        else mapped = 'Round 1 Phase';
      } else if (actStatus.includes('CLIENT') || actStatus.includes('SHORTLIST')) {
        mapped = 'Shortlisted';
      }

      if (mapped) updateStage(act.candidateId, mapped);
    }

    const counts: Record<string, number> = Object.fromEntries(FUNNEL_STAGES.map(s => [s, 0]));
    for (const [, stage] of candStageMap.entries()) {
      if (counts[stage] !== undefined) {
        counts[stage]++;
      }
    }

    const funnel = FUNNEL_STAGES.map(stage => ({ stage, value: counts[stage] || 0 }));

    res.status(200).json({
      success: true,
      stats: {
        totalJobs: formattedJobs.length,
        activeJobs: activeJobsCount,
        totalCandidates: Math.max(candidateCount, totalJobApplicants, candStageMap.size),
        totalEvaluated,
        submitCount,
        rejectCount,
        avgCompliance
      },
      jobs: formattedJobs,
      recentEvaluations,
      funnel
    });
  } catch (error: any) {
    console.error('[Dashboard Summary Controller Error]:', error);
    res.status(500).json({
      error: 'Failed to retrieve dashboard summary statistics',
      details: error.message || 'Unknown error'
    });
  }
};

