import { NextRequest, NextResponse } from 'next/server';
import { getBackendBaseUrl } from '@/lib/backendUrl';
import { getClientPortalsMemory, saveOrUpdatePortalMemory } from '@/lib/clientPortalStore';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const backendUrl = getBackendBaseUrl();
    const authHeader = req.headers.get('authorization');

    try {
      const res = await fetch(`${backendUrl}/client-portals`, {
        headers: authHeader ? { Authorization: authHeader } : {},
        cache: 'no-store'
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.clientPortals)) {
          // Sync backend portals into memory
          data.clientPortals.forEach((p: any) => saveOrUpdatePortalMemory(p));
          return NextResponse.json({ success: true, clientPortals: getClientPortalsMemory() });
        }
      }
    } catch (backendErr) {
      console.warn('[Next.js /api/client-portals GET] Backend unreachable, using memory store:', backendErr);
    }

    return NextResponse.json({ success: true, clientPortals: getClientPortalsMemory() });
  } catch (err: any) {
    return NextResponse.json({ success: true, clientPortals: getClientPortalsMemory() });
  }
}

export async function POST(req: NextRequest) {
  try {
    const backendUrl = getBackendBaseUrl();
    const authHeader = req.headers.get('authorization');
    const body = await req.json();

    // 1. Immediately record in memory store
    const saved = saveOrUpdatePortalMemory(body);

    // 2. Relay to backend
    try {
      await fetch(`${backendUrl}/client-portals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {})
        },
        body: JSON.stringify(body)
      });
    } catch (backendErr) {
      console.warn('[Next.js /api/client-portals POST] Backend sync skipped:', backendErr);
    }

    return NextResponse.json({ success: true, clientPortal: saved });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
