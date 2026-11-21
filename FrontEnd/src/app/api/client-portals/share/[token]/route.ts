import { NextRequest, NextResponse } from 'next/server';
import { getBackendBaseUrl } from '@/lib/backendUrl';
import { findPortalMemory } from '@/lib/clientPortalStore';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const clientQuery = req.nextUrl.searchParams.get('client') || '';
    const backendUrl = getBackendBaseUrl();

    try {
      const res = await fetch(`${backendUrl}/client-portals/share/${token}?client=${encodeURIComponent(clientQuery)}`, {
        cache: 'no-store'
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.clientPortal) {
          return NextResponse.json(data);
        }
      }
    } catch (backendErr) {
      console.warn('[Next.js /api/client-portals/share/:token] Backend warning:', backendErr);
    }

    // Fallback to memory store
    const localPortal = findPortalMemory(token, clientQuery);
    if (localPortal) {
      return NextResponse.json({ success: true, clientPortal: localPortal });
    }

    return NextResponse.json({ error: 'Client portal not found' }, { status: 404 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
