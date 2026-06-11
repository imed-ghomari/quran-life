import 'server-only';

import { getVerifiedInstantUser } from '@/lib/server/auth';
import { isServerEditorUser, isServerPaymentBypassUser } from '@/lib/privilegedEmails.server';
import {
  AccessSource,
  SubscriptionKind,
} from '@/lib/teacherPlan';
import {
  getLatestSubscriptionForUser,
  isSubscriptionActiveStatus,
  normalizeSubscriptionRecord,
  resolveSponsoredAccessForStudent,
} from '@/lib/server/subscriptions';

const ACCESS_STATE_CACHE_TTL_MS = 30_000;

type CachedAccessState = {
  expiresAt: number;
  hasActiveSubscription: boolean;
  isPaymentBypass: boolean;
  isEditor: boolean;
  hasPremiumAccess: boolean;
  accessSource: AccessSource;
  sponsorshipEndsAt: string | null;
  subscriptionKind: SubscriptionKind | null;
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
      accessSource: 'none' as const,
      sponsorshipEndsAt: null,
      subscriptionKind: null,
      user: null,
    };
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
      hasPremiumAccess: cached.hasPremiumAccess,
      isEditor: cached.isEditor,
      accessSource: cached.accessSource,
      sponsorshipEndsAt: cached.sponsorshipEndsAt,
      subscriptionKind: cached.subscriptionKind,
      user,
    };
  }

  const latestSubscription = await getLatestSubscriptionForUser(user.id);
  const normalizedLatestSubscription = latestSubscription ? normalizeSubscriptionRecord(latestSubscription) : null;
  const hasActiveSubscription = isSubscriptionActiveStatus(normalizedLatestSubscription?.status);

  let accessSource: AccessSource = 'none';
  let sponsorshipEndsAt: string | null = null;
  let hasPremiumAccess = true;
  let subscriptionKind: SubscriptionKind | null = normalizedLatestSubscription?.subscriptionKind ?? null;

  if (isPaymentBypass) {
    accessSource = 'bypass';
  } else if (hasActiveSubscription) {
    accessSource = 'self_paid';
  } else {
    const sponsoredAccess = await resolveSponsoredAccessForStudent(user.id);
    if (sponsoredAccess) {
      accessSource = sponsoredAccess.accessSource;
      sponsorshipEndsAt = sponsoredAccess.graceEndsAt;
      subscriptionKind = sponsoredAccess.teacherSubscription?.subscriptionKind ?? null;
    }
  }

  accessStateCache.set(cacheKey, {
    expiresAt: Date.now() + ACCESS_STATE_CACHE_TTL_MS,
    hasActiveSubscription,
    isPaymentBypass,
    isEditor,
    hasPremiumAccess,
    accessSource,
    sponsorshipEndsAt,
    subscriptionKind,
  });

  return {
    isAuthenticated: true,
    hasActiveSubscription,
    isPaymentBypass,
    hasPremiumAccess,
    isEditor,
    accessSource,
    sponsorshipEndsAt,
    subscriptionKind,
    user,
  };
}
