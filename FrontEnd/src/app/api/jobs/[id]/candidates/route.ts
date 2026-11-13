import { NextRequest, NextResponse } from 'next/server';
import { getBackendBaseUrl } from '@/lib/backendUrl';
import { jobCandidatesStore } from '@/lib/jobStore';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const authToken = req.headers.get('authorization');

    // 1. Try forwarding to backend
    let backendCandidates: any[] = [];
    try {
      const backendUrl = getBackendBaseUrl();
      const res = await fetch(`${backendUrl}/jobs/${jobId}/candidates`, {
        headers: {
          ...(authToken ? { Authorization: authToken } : {})
        },
        cache: 'no-store'
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.candidates)) {
          backendCandidates = data.candidates;
        }
      }
    } catch {
      console.warn('[Next.js API] Backend /jobs/[id]/candidates unavailable, using local store');
    }

    // 2. Merge with in-memory candidate store
    const localStoreCandidates = jobCandidatesStore[jobId] || [];

    const candidateMap = new Map<string, any>();
    // Add local candidates first (more recent)
    for (const c of localStoreCandidates) {
      const key = (c.email && c.email.trim().toLowerCase()) || c.id;
      if (key) candidateMap.set(key, c);
    }
    // Add backend candidates
    for (const c of backendCandidates) {
      const key = (c.email && c.email.trim().toLowerCase()) || c.id;
      if (key && !candidateMap.has(key)) {
        candidateMap.set(key, c);
      } else if (key && candidateMap.has(key)) {
        // Merge attributes, keeping existing candidate data
        candidateMap.set(key, { ...c, ...candidateMap.get(key) });
      }
    }

    const mergedList = Array.from(candidateMap.values());

    return NextResponse.json({
      success: true,
      jobId,
      candidates: mergedList,
      count: mergedList.length,
      total: mergedList.length,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
