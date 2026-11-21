import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const backendUrl = process.env.BACKEND_API_URL || 'http://127.0.0.1:5000/api';
    const authHeader = req.headers.get('authorization');

    const res = await fetch(`${backendUrl}/client-portals/${id}`, {
      method: 'DELETE',
      headers: authHeader ? { Authorization: authHeader } : {},
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
