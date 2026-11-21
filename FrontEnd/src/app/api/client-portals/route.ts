import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const backendUrl = process.env.BACKEND_API_URL || 'http://127.0.0.1:5000/api';
    const authHeader = req.headers.get('authorization');

    const res = await fetch(`${backendUrl}/client-portals`, {
      headers: authHeader ? { Authorization: authHeader } : {},
      cache: 'no-store'
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }

    return NextResponse.json({ success: true, clientPortals: [] });
  } catch (err: any) {
    return NextResponse.json({ success: true, clientPortals: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const backendUrl = process.env.BACKEND_API_URL || 'http://127.0.0.1:5000/api';
    const authHeader = req.headers.get('authorization');
    const body = await req.json();

    const res = await fetch(`${backendUrl}/client-portals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {})
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
