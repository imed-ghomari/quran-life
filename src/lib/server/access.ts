import 'server-only';

import { db as instantAdmin } from '@/lib/instant-admin';
import { getVerifiedInstantUser } from '@/lib/server/auth';
import { isServerEditorUser, isServerPaymentBypassUser } from '@/lib/privilegedEmails.server';

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'past_due', 'trialing']);
const ACCESS_STATE_CACHE_TTL_MS = 30_000;

type CachedAccessState = {
  expiresAt: number;
  hasActiveSubscription: boolean;
  isPaymentBypass: boolean;
  isEditor: boolean;
};

const accessStateCache = new Map<string, CachedAccessState>();

export function invalidateServerAccessStateCacheForUser(userId: string) {
  const prefix = `${userId}:`;
  for (const key of accessStateCache.keys()) {
    if (key.startsWith(prefix)) {
      accessStateCache.delete(key);
    }
  }
}

export async function getServerAccessState() {
  const user = await getVerifiedInstantUser();

  if (!user) {
    return {
      isAuthenticated: false,
      hasActiveSubscription: false,
      isPaymentBypass: false,
      hasPremiumAccess: false,
      isEditor: false,
      user: null,
    } as const;
  }

  const isEditor = await isServerEditorUser(user);
  const isPaymentBypass = isEditor || (await isServerPaymentBypassUser(user));
  const cacheKey = `${user.id}:${isEditor ? '1' : '0'}:${isPaymentBypass ? '1' : '0'}`;
  const cached = accessStateCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      isAuthenticated: true,
      hasActiveSubscription: cached.hasActiveSubscription,
      isPaymentBypass: cached.isPaymentBypass,
      hasPremiumAccess: cached.hasActiveSubscription || cached.isPaymentBypass,
      isEditor: cached.isEditor,
      user,
    } as const;
  }

  let hasActiveSubscription = false;

  try {
    const result = await instantAdmin.query({
      subscriptions: {
        $: {
          where: { userId: user.id },
        },
      },
    });

    const subscriptions = result?.subscriptions ?? [];
    hasActiveSubscription = subscriptions.some((subscription) => {
      const status = subscription?.status ?? '';
      return ACTIVE_SUBSCRIPTION_STATUSES.has(status);
    });
  } catch {
    hasActiveSubscription = false;
  }

  accessStateCache.set(cacheKey, {
    expiresAt: Date.now() + ACCESS_STATE_CACHE_TTL_MS,
    hasActiveSubscription,
    isPaymentBypass,
    isEditor,
  });

  return {
    isAuthenticated: true,
    hasActiveSubscription,
    isPaymentBypass,
    hasPremiumAccess: hasActiveSubscription || isPaymentBypass,
    isEditor,
    user,
  } as const;
}
