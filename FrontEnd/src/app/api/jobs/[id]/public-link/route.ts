import { NextRequest, NextResponse } from 'next/server';
import { getBackendBaseUrl } from '@/lib/backendUrl';
import { publicJobLinkStore, publicTokenToJobIdMap } from '@/lib/jobStore';

export const dynamic = 'force-dynamic';

function generateDeterministicToken(jobId: string): string {
  const cleanId = jobId.replace(/[^a-zA-Z0-9]/g, '').slice(-8);
  return cleanId.length >= 6 ? cleanId : `job${Date.now().toString(36).slice(-6)}`;
}

// GET /api/jobs/:id/public-link
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const authToken = req.headers.get('authorization');

    // 1. Try forwarding to backend
    try {
      const backendUrl = getBackendBaseUrl();
      const res = await fetch(`${backendUrl}/jobs/${jobId}/public-link`, {
        headers: {
          ...(authToken ? { Authorization: authToken } : {}),
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.publicToken) {
          publicJobLinkStore[jobId] = {
            jobId,
            publicToken: data.publicToken,
            isActive: data.isPublicLinkActive !== false,
            publicUrl: data.publicUrl,
            position: data.position,
          };
          publicTokenToJobIdMap[data.publicToken] = jobId;
        }
        return NextResponse.json(data);
      }
    } catch {
      // Backend unavailable, fallback to in-memory store
    }

    // 2. Check local store fallback
    const stored = publicJobLinkStore[jobId];
    if (stored) {
      const origin = req.nextUrl.origin;
      return NextResponse.json({
        success: true,
        jobId,
        hasLink: true,
        publicToken: stored.publicToken,
        isPublicLinkActive: stored.isActive,
        publicUrl: `${origin}/apply/${stored.publicToken}`,
      });
    }

    // Return empty state if not yet generated
    return NextResponse.json({
      success: true,
      jobId,
      hasLink: false,
      publicToken: null,
      isPublicLinkActive: true,
      publicUrl: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to retrieve public link' },
      { status: 500 }
    );
  }
}

// POST /api/jobs/:id/public-link
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const authToken = req.headers.get('authorization');
    let body = {};
    try {
      body = await req.json();
    } catch {}

    // 1. Try forwarding to backend
    try {
      const backendUrl = getBackendBaseUrl();
      const res = await fetch(`${backendUrl}/jobs/${jobId}/public-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: authToken } : {}),
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.publicToken) {
          publicJobLinkStore[jobId] = {
            jobId,
            publicToken: data.publicToken,
            isActive: data.isPublicLinkActive !== false,
            publicUrl: data.publicUrl,
            position: data.position,
          };
          publicTokenToJobIdMap[data.publicToken] = jobId;
        }
        return NextResponse.json(data);
      }
    } catch {
      // Backend unavailable, proceed to resilient generation
    }

    // 2. Resilient local fallback generation
    let stored = publicJobLinkStore[jobId];
    const token = stored?.publicToken || generateDeterministicToken(jobId);
    const origin = req.nextUrl.origin;
    const publicUrl = `${origin}/apply/${token}`;

    publicJobLinkStore[jobId] = {
      jobId,
      publicToken: token,
      isActive: true,
      publicUrl,
    };
    publicTokenToJobIdMap[token] = jobId;

    return NextResponse.json({
      success: true,
      jobId,
      position: 'Job Requisition',
      publicToken: token,
      isPublicLinkActive: true,
      publicUrl,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate public link' },
      { status: 500 }
    );
  }
}

// PATCH /api/jobs/:id/public-link
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const authToken = req.headers.get('authorization');
    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    // 1. Try forwarding to backend
    try {
      const backendUrl = getBackendBaseUrl();
      const res = await fetch(`${backendUrl}/jobs/${jobId}/public-link`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: authToken } : {}),
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        if (publicJobLinkStore[jobId]) {
          publicJobLinkStore[jobId].isActive = body.isPublicLinkActive !== false;
        }
        return NextResponse.json(data);
      }
    } catch {}

    // 2. Resilient fallback toggle
    const newStatus = body.isPublicLinkActive !== false;
    if (publicJobLinkStore[jobId]) {
      publicJobLinkStore[jobId].isActive = newStatus;
    }

    return NextResponse.json({
      success: true,
      jobId,
      isPublicLinkActive: newStatus,
      message: newStatus ? 'Public applications are OPEN.' : 'Public applications are PAUSED.',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to toggle public link' },
      { status: 500 }
    );
  }
}

