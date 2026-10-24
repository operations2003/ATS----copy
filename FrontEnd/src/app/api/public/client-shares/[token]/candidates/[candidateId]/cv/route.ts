import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; candidateId: string }> }
) {
  try {
    const { token, candidateId } = await params;
    const backendUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5000/api';
    const search = req.nextUrl.search || '';

    const res = await fetch(`${backendUrl}/public/client-shares/${token}/candidates/${candidateId}/cv${search}`);

    if (!res.ok) {
      const errText = await res.text();
      return new NextResponse(errText, { status: res.status });
    }

    const contentType = res.headers.get('content-type') || 'application/pdf';
    const contentDisposition = res.headers.get('content-disposition') || 'attachment; filename="Candidate_CV.pdf"';

    const arrayBuffer = await res.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': contentDisposition,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to download candidate CV' },
      { status: 500 }
    );
  }
}
