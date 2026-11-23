import { NextRequest, NextResponse } from 'next/server';
import { getBackendBaseUrl } from '@/lib/backendUrl';
import { addJdsToPortalMemory, findPortalMemory } from '@/lib/clientPortalStore';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const backendUrl = getBackendBaseUrl();
    const authHeader = req.headers.get('authorization');
    const body = await req.json();

    const incomingJds = Array.isArray(body.jds) ? body.jds : (body.jd ? [body.jd] : []);
    const updatedPortal = addJdsToPortalMemory(id, incomingJds);

    try {
      const res = await fetch(`${backendUrl}/client-portals/${id}/jds`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {})
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch {
      return NextResponse.json({ success: true, jds: updatedPortal?.jds || incomingJds, clientPortal: updatedPortal });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const backendUrl = getBackendBaseUrl();
    const authHeader = req.headers.get('authorization');

    try {
      const res = await fetch(`${backendUrl}/client-portals/${id}/jds`, {
        headers: authHeader ? { Authorization: authHeader } : {},
        cache: 'no-store'
      });
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch {}

    const portal = findPortalMemory(id);
    return NextResponse.json({ success: true, jds: portal?.jds || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
