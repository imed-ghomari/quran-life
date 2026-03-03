import { NextResponse } from 'next/server';
import { clientEnv } from '@/lib/env/client';
import { db as instantAdmin } from '@/lib/instant-admin';

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

function readCookieValue(request: Request, name: string) {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const [rawKey, ...rest] = pair.trim().split('=');
    if (rawKey !== name) continue;
    return rest.join('=');
  }
  return null;
}

function readTrustedCookieUser(request: Request): InstantUserCookie | null {
  const raw = readCookieValue(request, cookieName());
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as InstantUserCookie;
  } catch {
    return null;
  }
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

  const existingCookieUser = readTrustedCookieUser(request);
  if (existingCookieUser?.refresh_token === body.user.refresh_token) {
    return response;
  }

  let verifiedUser: { id: string; email?: string | null } | null = null;
  try {
    verifiedUser = await instantAdmin.auth.getUser({ refresh_token: body.user.refresh_token });
  } catch {
    response.cookies.set(cookieName(), '', {
      httpOnly: true,
      sameSite: 'strict',
      secure,
      path: '/',
      maxAge: 0,
    });
    return NextResponse.json({ ok: false, error: 'Invalid refresh token' }, { status: 401 });
  }

  const trustedCookieUser: InstantUserCookie = {
    id: verifiedUser.id,
    refresh_token: body.user.refresh_token,
    email: verifiedUser.email ?? null,
    imageURL: body.user.imageURL ?? null,
    type: body.user.type,
    isGuest: body.user.isGuest,
  };

  response.cookies.set(cookieName(), encodeURIComponent(JSON.stringify(trustedCookieUser)), {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
