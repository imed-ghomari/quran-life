import { createHash, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { db as instantAdmin } from '@/lib/instant-admin';
import { serverEnv } from '@/lib/env/server';

function hashSecret(secret: string) {
  return createHash('sha256').update(secret).digest();
}

function isSecretValid(provided: string, expected: string) {
  const providedHash = hashSecret(provided);
  const expectedHash = hashSecret(expected);
  return timingSafeEqual(providedHash, expectedHash);
}

function cookieName() {
  return `instant_user_${serverEnv.INSTANT_APP_ID}`;
}

function isHttpsRequest(request: Request) {
  const proto = request.headers.get('x-forwarded-proto');
  if (proto) return proto.includes('https');
  return false;
}

function isAllowedEmail(email: string) {
  if (serverEnv.E2E_ALLOWED_EMAILS.length === 0) return true;
  return serverEnv.E2E_ALLOWED_EMAILS.includes(email.toLowerCase());
}

function guardEnabled() {
  return serverEnv.E2E_MODE && process.env.NODE_ENV !== 'production' && !!serverEnv.E2E_AUTH_SECRET;
}

function notFound() {
  return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
}

export async function GET(request: Request) {
  if (!guardEnabled()) {
    return notFound();
  }

  const url = new URL(request.url);
  const secret = (url.searchParams.get('secret') ?? '').trim();
  const email = (url.searchParams.get('email') ?? serverEnv.E2E_DEFAULT_EMAIL).trim().toLowerCase();
  const nextPath = url.searchParams.get('next') ?? '/dashboard';

  if (!secret || !isSecretValid(secret, serverEnv.E2E_AUTH_SECRET)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!isAllowedEmail(email)) {
    return NextResponse.json({ ok: false, error: 'Email not allowed' }, { status: 403 });
  }

  const authToken = await instantAdmin.auth.createToken({ email });
  const user = await instantAdmin.auth.verifyToken(authToken as any);

  const redirectUrl = new URL(nextPath.startsWith('/') ? nextPath : '/dashboard', url.origin);
  const response = NextResponse.redirect(redirectUrl);

  response.cookies.set(cookieName(), encodeURIComponent(JSON.stringify(user)), {
    httpOnly: true,
    sameSite: 'strict',
    secure: isHttpsRequest(request),
    path: '/',
    maxAge: 60 * 60,
  });

  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  response.headers.set('Pragma', 'no-cache');

  return response;
}
