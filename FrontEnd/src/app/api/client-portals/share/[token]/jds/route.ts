import { NextRequest, NextResponse } from 'next/server';
import { getBackendBaseUrl } from '@/lib/backendUrl';
import { addJdsToPortalMemory } from '@/lib/clientPortalStore';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await req.json();
    const { jd, jds } = body;
    const incomingJds = Array.isArray(jds) ? jds : (jd ? [jd] : []);

    // 1. Immediately store in memory so recruiter /clients instantly gets this JD
    const updatedPortal = addJdsToPortalMemory(token, incomingJds);

    // 2. Relay to backend
    const backendUrl = getBackendBaseUrl();
    try {
      const res = await fetch(`${backendUrl}/client-portals/share/${token}/jds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch (backendErr) {
      console.warn('[Next.js /api/client-portals/share/:token/jds] Backend relay skipped:', backendErr);
    }

    return NextResponse.json({
      success: true,
      jds: updatedPortal?.jds || incomingJds,
      clientPortal: updatedPortal
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
