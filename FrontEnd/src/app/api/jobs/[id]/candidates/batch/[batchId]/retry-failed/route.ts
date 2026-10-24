import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; batchId: string }> }
) {
  try {
    const { id: jobId, batchId } = await params;
    const authToken = req.headers.get('authorization');

    const backendUrl = process.env.BACKEND_API_URL ||
                       process.env.NEXT_PUBLIC_API_URL ||
                       (process.env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:5000/api');

    if (!backendUrl) {
      return NextResponse.json({
        success: false,
        error: 'BACKEND_API_URL environment variable is not configured.',
      }, { status: 500 });
    }

    const backendRes = await fetch(`${backendUrl}/jobs/${jobId}/candidates/batch/${batchId}/retry-failed`, {
      method: 'POST',
      headers: {
        ...(authToken ? { Authorization: authToken } : {}),
      },
    });

    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err: any) {
    console.error('[Next.js Batch API] Retry all failed error:', err);
    return NextResponse.json({
      success: false,
      error: err.message || 'Failed to retry all failed CV items',
    }, { status: 500 });
  }
}

