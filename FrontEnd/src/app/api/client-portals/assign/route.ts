import { NextRequest, NextResponse } from 'next/server';
import { getBackendBaseUrl } from '@/lib/backendUrl';
import { saveOrUpdatePortalMemory } from '@/lib/clientPortalStore';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const backendUrl = getBackendBaseUrl();
    const authHeader = req.headers.get('authorization');
    const body = await req.json();

    // 1. Immediately sync in-memory portal store on Next.js
    if (body.clientName) {
      saveOrUpdatePortalMemory({
        clientName: body.clientName,
        assignedMember: body.assignedMember,
        assignedMemberRole: body.assignedMemberRole,
        assignedAt: body.assignedAt
      });
    }

    // 2. Forward to Render backend
    try {
      const res = await fetch(`${backendUrl}/client-portals/assign`, {
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
      return NextResponse.json({ success: true, message: `Assigned ${body.clientName} to ${body.assignedMember}` });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
