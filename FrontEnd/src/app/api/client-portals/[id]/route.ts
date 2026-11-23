import { NextRequest, NextResponse } from 'next/server';
import { getBackendBaseUrl } from '@/lib/backendUrl';
import { deletePortalMemory, saveOrUpdatePortalMemory } from '@/lib/clientPortalStore';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const backendUrl = getBackendBaseUrl();
    const authHeader = req.headers.get('authorization');

    // 1. Delete from in-memory store
    deletePortalMemory(id);

    // 2. Forward to Render backend
    try {
      const res = await fetch(`${backendUrl}/client-portals/${id}`, {
        method: 'DELETE',
        headers: authHeader ? { Authorization: authHeader } : {},
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch {
      return NextResponse.json({ success: true, message: 'Deleted successfully' });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const backendUrl = getBackendBaseUrl();
    const authHeader = req.headers.get('authorization');
    const body = await req.json();

    // 1. Update in-memory store
    const updated = saveOrUpdatePortalMemory({ ...body, id });

    // 2. Forward to Render backend
    try {
      const res = await fetch(`${backendUrl}/client-portals/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {})
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch {
      return NextResponse.json({ success: true, clientPortal: updated });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
