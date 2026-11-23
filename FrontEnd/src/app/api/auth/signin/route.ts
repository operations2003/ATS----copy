import { NextResponse } from 'next/server';
import { getBackendBaseUrl } from '@/lib/backendUrl';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Please provide email and password' }, { status: 400 });
    }

    const backendUrl = getBackendBaseUrl();

    try {
      const backendRes = await fetch(`${backendUrl}/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await backendRes.json();

      if (!backendRes.ok) {
        return NextResponse.json(
          { error: data.error || 'Invalid email or password' },
          { status: backendRes.status }
        );
      }

      return NextResponse.json(data, { status: 200 });
    } catch (networkErr: any) {
      console.error('[SignIn Route] Error connecting to authentication backend:', networkErr);
      return NextResponse.json(
        { error: 'Authentication service unavailable. Please check that the backend server is running.' },
        { status: 503 }
      );
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server error during signin' }, { status: 500 });
  }
}
