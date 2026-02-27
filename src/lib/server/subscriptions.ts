import 'server-only';

import { db as instantAdmin } from '@/lib/instant-admin';

export type SubscriptionRecord = {
  id: string;
  userId?: string;
  status?: string;
  paddleSubscriptionId?: string;
  paddleCustomerId?: string;
  priceId?: string;
  updatedAt?: string;
  customData?: Record<string, unknown> | null;
};

export async function getLatestSubscriptionForUser(userId: string): Promise<SubscriptionRecord | null> {
  const result = await instantAdmin.query({
    subscriptions: {
      $: {
        where: { userId },
      },
    },
  });

  const subscriptions = (result?.subscriptions ?? []) as SubscriptionRecord[];
  if (!subscriptions.length) return null;

  const sorted = [...subscriptions].sort((a, b) => {
    const aTime = Date.parse(a?.updatedAt ?? '') || 0;
    const bTime = Date.parse(b?.updatedAt ?? '') || 0;
    return bTime - aTime;
  });

  return sorted[0] ?? null;
}
