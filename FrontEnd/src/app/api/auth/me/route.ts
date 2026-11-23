import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');

    if (!token) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    // Try backend first
    try {
      const { getBackendBaseUrl } = await import('@/lib/backendUrl');
      const backendUrl = getBackendBaseUrl();
      const backendRes = await fetch(`${backendUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (backendRes.ok) {
        const data = await backendRes.json();
        return NextResponse.json(data);
      }
    } catch (backendErr) {
      console.warn('Backend /auth/me call failed, using local token decoding fallback');
    }

    // Decode fallback token safely
    let email = '';
    let displayName = 'Unknown User';
    if (token.startsWith('jwt_local_session_')) {
      const parts = token.split('_');
      // parts = ['jwt', 'local', 'session', timestamp, base64Email]
      const emailBase64 = parts[4] || parts[3];
      if (emailBase64) {
        try {
          const decoded = Buffer.from(emailBase64, 'base64').toString('utf-8');
          if (decoded && decoded.includes('@')) {
            email = decoded;
            const handle = decoded.split('@')[0];
            displayName = handle.split(/[._-]/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          }
        } catch {}
      }
    }

    if (!email.includes('@')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    return NextResponse.json({
      user: {
        id: 'usr_current',
        name: displayName,
        email: email,
        role: 'MEMBER',
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
