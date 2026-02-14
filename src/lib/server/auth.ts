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

  const resolveEmail = async (id: string, candidateEmail?: string | null, cookieEmail?: string | null) => {
    if (candidateEmail) return candidateEmail;

    const normalizedCookieEmail = cookieEmail?.trim().toLowerCase();
    if (normalizedCookieEmail) {
      try {
        const byEmail = await instantAdmin.auth.getUser({ email: normalizedCookieEmail });
        if (byEmail.id === id) {
          return byEmail.email ?? normalizedCookieEmail;
        }
      } catch {
        // Ignore and continue with id lookup.
      }
    }

    try {
      const byId = await instantAdmin.auth.getUser({ id });
      return byId.email ?? null;
    } catch {
      return null;
    }
  };

  try {
    const user = await instantAdmin.auth.getUser({ refresh_token: refreshToken });
    const email = await resolveEmail(user.id, user.email ?? null, cookieUser?.email ?? null);
    return { id: user.id, email };
  } catch {
    // Back-compat fallback: older flows may still pass a token accepted by verifyToken.
    try {
      const user = await instantAdmin.auth.verifyToken(refreshToken as any);
      const email = await resolveEmail(user.id, user.email ?? null, cookieUser?.email ?? null);
      return { id: user.id, email };
    } catch {
      return null;
    }
  }
}
