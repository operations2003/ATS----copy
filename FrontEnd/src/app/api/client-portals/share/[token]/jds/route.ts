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
    const backendUrl = getBackendBaseUrl();
    const body = await req.json();

    const incomingJds = Array.isArray(body.jds) ? body.jds : (body.jd ? [body.jd] : []);
    const updated = addJdsToPortalMemory(token, incomingJds);

    try {
      const res = await fetch(`${backendUrl}/client-portals/share/${token}/jds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch {
      return NextResponse.json({ success: true, jds: updated?.jds || incomingJds, clientPortal: updated });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
