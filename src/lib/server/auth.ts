import 'server-only';

import { getUserFromInstantCookie } from '@instantdb/react/nextjs';
import { db as instantAdmin } from '@/lib/instant-admin';
import { serverEnv } from '@/lib/env/server';

export type VerifiedInstantUser = {
  id: string;
  email?: string | null;
};

export async function getVerifiedInstantUser(): Promise<VerifiedInstantUser | null> {
  const cookieUser = await getUserFromInstantCookie(serverEnv.INSTANT_APP_ID);
  const refreshToken = cookieUser?.refresh_token;

  if (!refreshToken) return null;

  try {
    const user = await instantAdmin.auth.verifyToken(refreshToken as any);
    return { id: user.id, email: user.email ?? null };
  } catch {
    return null;
  }
}
