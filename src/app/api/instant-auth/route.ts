import { NextResponse } from 'next/server';
import { clientEnv } from '@/lib/env/client';

type InstantUserCookie = {
  id: string;
  refresh_token: string;
  email?: string | null;
  imageURL?: string | null;
  type?: 'user' | 'guest';
  isGuest: boolean;
};

type Payload = {
  type?: 'sync-user';
  appId?: string;
  user?: InstantUserCookie | null;
};

function cookieName() {
  return `instant_user_${clientEnv.NEXT_PUBLIC_INSTANT_APP_ID}`;
}

function isHttpsRequest(request: Request) {
  const proto = request.headers.get('x-forwarded-proto');
  if (proto) return proto.includes('https');
  return false;
}

export async function POST(request: Request) {
  let body: Payload;

  try {
    body = (await request.json()) as Payload;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.type !== 'sync-user') {
    return NextResponse.json({ ok: false, error: 'Unknown type' }, { status: 400 });
  }

  if (body.appId !== clientEnv.NEXT_PUBLIC_INSTANT_APP_ID) {
    return NextResponse.json({ ok: false, error: 'App ID mismatch' }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  const secure = process.env.NODE_ENV === 'production' || isHttpsRequest(request);

  if (!body.user?.refresh_token) {
    response.cookies.set(cookieName(), '', {
      httpOnly: true,
      sameSite: 'strict',
      secure,
      path: '/',
      maxAge: 0,
    });
    return response;
  }

  response.cookies.set(cookieName(), encodeURIComponent(JSON.stringify(body.user)), {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
