import { NextRequest, NextResponse } from 'next/server';
import { getBackendBaseUrl } from '@/lib/backendUrl';
import { publicJobLinkStore, publicTokenToJobIdMap } from '@/lib/jobStore';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const backendUrl = getBackendBaseUrl();

    // 1. Forward to Backend
    try {
      const res = await fetch(`${backendUrl}/public/jobs/${token}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.job?.id || data.job?.jobId) {
          const resolvedJobId = data.job.id || data.job.jobId;
          publicTokenToJobIdMap[token] = resolvedJobId;
          publicJobLinkStore[resolvedJobId] = {
            jobId: resolvedJobId,
            publicToken: token,
            isActive: data.isAcceptingApplications !== false,
            position: data.job.position,
            client: data.job.client,
            jobInfo: data.job,
          };
        }
        return NextResponse.json(data, { status: res.status });
      }
    } catch {
      // Backend unavailable, fallback to in-memory store
    }

    // 2. Check local in-memory store fallback
    const resolvedJobId = publicTokenToJobIdMap[token];
    const stored = resolvedJobId ? publicJobLinkStore[resolvedJobId] : null;

    if (stored) {
      return NextResponse.json({
        success: true,
        isAcceptingApplications: stored.isActive !== false,
        job: {
          id: stored.jobId,
          jobId: stored.jobId,
          token,
          position: stored.position || 'Open Requisition',
          client: stored.client || 'Hiring Organization',
          location: stored.jobInfo?.location || 'Remote / Hybrid',
          work_mode: stored.jobInfo?.work_mode || 'Full-time',
          salary: stored.jobInfo?.salary || null,
          jd_text: stored.jobInfo?.jd_text || 'Job Requisition',
          requirements: stored.jobInfo?.requirements || [],
          requirementsCount: stored.jobInfo?.requirements?.length || 0,
        },
      });
    }

    // 3. Fallback generic job profile so candidate can still apply
    return NextResponse.json({
      success: true,
      isAcceptingApplications: true,
      job: {
        id: `job-${token}`,
        jobId: `job-${token}`,
        token,
        position: 'Candidate Application Portal',
        client: 'Hiring Team',
        location: 'Remote / Hybrid',
        work_mode: 'Full-time',
        requirements: [],
        requirementsCount: 0,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to retrieve public job info' },
      { status: 500 }
    );
  }
}
