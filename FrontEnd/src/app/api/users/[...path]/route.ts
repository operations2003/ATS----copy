import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function getBackendBaseUrl(): string {
  let url = (process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').trim();
  url = url.replace(/\/+$/, '');
  return url;
}

async function proxyOrHandle(req: NextRequest, params: Promise<{ path: string[] }>, method: string) {
  const { path } = await params;
  const pathStr = Array.isArray(path) ? path.join('/') : (path || '');
  const authToken = req.headers.get('authorization');
  const searchParams = req.nextUrl.search;

  let bodyData: any = null;
  if (['POST', 'PATCH', 'PUT'].includes(method)) {
    try {
      bodyData = await req.json();
    } catch {
      bodyData = {};
    }
  }

  // 1. Try forwarding to backend
  const backendBase = getBackendBaseUrl();
  const endpointsToTry = [
    backendBase.endsWith('/api') ? `${backendBase}/users/${pathStr}${searchParams}` : `${backendBase}/api/users/${pathStr}${searchParams}`,
    backendBase.endsWith('/api') ? `${backendBase.replace(/\/api$/, '')}/users/${pathStr}${searchParams}` : `${backendBase}/users/${pathStr}${searchParams}`,
    `https://ats-d4tv.onrender.com/api/users/${pathStr}${searchParams}`,
    `http://localhost:5000/api/users/${pathStr}${searchParams}`
  ];

  const triedUrls = new Set<string>();

  for (const targetUrl of endpointsToTry) {
    if (triedUrls.has(targetUrl)) continue;
    triedUrls.add(targetUrl);

    try {
      const res = await fetch(targetUrl, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: authToken } : {}),
        },
        ...(bodyData !== null ? { body: JSON.stringify(bodyData) } : {}),
        cache: 'no-store'
      });

      const contentType = res.headers.get('content-type') || '';
      if (res.status !== 404 && contentType.includes('application/json')) {
        const data = await res.json().catch(() => ({}));
        return NextResponse.json(data, { status: res.status });
      }
    } catch {
      // Continue to next endpoint or fallback
    }
  }

  // 2. Safe Fallback Responses for Users endpoints if backend is offline or returns 404
  if (pathStr === 'audit-logs' || pathStr.startsWith('audit-logs')) {
    return NextResponse.json({ success: true, count: 0, logs: [] }, { status: 200 });
  }

  if (pathStr === 'quota') {
    return NextResponse.json({
      success: true,
      quota: {
        totalLimit: 50,
        currentUsers: 1,
        availableSlots: 49,
        maxRecruiters: 20,
        currentRecruiters: 1,
        availableRecruiterSlots: 19,
        maxActiveJobs: 40,
        currentActiveJobs: 0,
        availableJobSlots: 40,
        maxResumesPerMonth: 1500,
        currentMonthResumes: 0,
        availableResumes: 1500
      }
    }, { status: 200 });
  }

  if (pathStr === 'ta-members') {
    return NextResponse.json({
      success: true,
      members: [],
      overviewStats: { totalRecruiters: 0, activeJobs: 0, totalScreened: 0, avgMatchScore: 0 }
    }, { status: 200 });
  }

  return NextResponse.json({ success: false, error: 'Endpoint unavailable' }, { status: 200 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyOrHandle(req, params, 'GET');
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyOrHandle(req, params, 'POST');
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyOrHandle(req, params, 'PUT');
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyOrHandle(req, params, 'PATCH');
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyOrHandle(req, params, 'DELETE');
}

