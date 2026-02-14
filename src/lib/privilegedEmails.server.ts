import 'server-only';

import { db as instantAdmin } from '@/lib/instant-admin';
import { serverEnv } from '@/lib/env/server';

export function isServerPaymentBypassEmail(email?: string | null) {
  if (!email) return false;
  return serverEnv.PAYMENT_BYPASS_EMAILS.includes(email.trim().toLowerCase());
}

export function isServerEditorEmail(email?: string | null) {
  if (!email) return false;
  return serverEnv.EDITOR_EMAILS.includes(email.trim().toLowerCase());
}

type ServerUserIdentity = {
  id: string;
  email?: string | null;
};

const EMAIL_ID_CACHE_TTL_MS = 5 * 60 * 1000;
const emailToUserIdCache = new Map<string, { userId: string | null; expiresAt: number }>();

async function resolveUserIdByEmail(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  const now = Date.now();
  const cached = emailToUserIdCache.get(normalized);
  if (cached && cached.expiresAt > now) {
    return cached.userId;
  }

  try {
    const user = await instantAdmin.auth.getUser({ email: normalized });
    const userId = user.id ?? null;
    emailToUserIdCache.set(normalized, { userId, expiresAt: now + EMAIL_ID_CACHE_TTL_MS });
    return userId;
  } catch {
    emailToUserIdCache.set(normalized, { userId: null, expiresAt: now + EMAIL_ID_CACHE_TTL_MS });
    return null;
  }
}

async function emailListContainsUserId(emails: readonly string[], userId: string) {
  if (!userId || emails.length === 0) return false;
  const resolvedIds = await Promise.all(emails.map((email) => resolveUserIdByEmail(email)));
  return resolvedIds.includes(userId);
}

export async function isServerEditorUser(user?: ServerUserIdentity | null) {
  if (!user?.id) return false;
  if (isServerEditorEmail(user.email)) return true;
  return emailListContainsUserId(serverEnv.EDITOR_EMAILS, user.id);
}

export async function isServerPaymentBypassUser(user?: ServerUserIdentity | null) {
  if (!user?.id) return false;
  if (isServerPaymentBypassEmail(user.email)) return true;
  return emailListContainsUserId(serverEnv.PAYMENT_BYPASS_EMAILS, user.id);
}
