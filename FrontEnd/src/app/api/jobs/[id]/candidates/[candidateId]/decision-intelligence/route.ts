import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function getBackendBaseUrl(): string {
  let url = (process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || 'https://ats-d4tv.onrender.com/api').trim();
  url = url.replace(/\/+$/, '');
  if (!url.endsWith('/api')) {
    url = `${url}/api`;
  }
  return url;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; candidateId: string }> }
) {
  try {
    const { id: jobId, candidateId } = await params;
    const authToken = req.headers.get('authorization');

    const backendUrl = getBackendBaseUrl();
    const targetUrl = `${backendUrl}/jobs/${encodeURIComponent(jobId)}/candidates/${encodeURIComponent(candidateId)}/decision-intelligence`;

    const res = await fetch(targetUrl, {
      headers: {
        ...(authToken ? { Authorization: authToken } : {}),
      },
      cache: 'no-store'
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error('[Next.js /api/jobs/[id]/candidates/[candidateId]/decision-intelligence GET Error]:', err);
    return NextResponse.json(
      { error: 'Failed to proxy job candidate decision intelligence request', details: err?.message },
      { status: 500 }
    );
  }
}
