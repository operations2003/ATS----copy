import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; shareId: string; candidateId: string }> }
) {
  try {
    const { id, shareId, candidateId } = await params;
    const authHeader = req.headers.get('authorization') || '';
    const backendUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5000/api';

    const res = await fetch(`${backendUrl}/jobs/${id}/client-shares/${shareId}/candidates/${candidateId}`, {
      method: 'DELETE',
      headers: {
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to remove candidate from share' },
      { status: 500 }
    );
  }
}
