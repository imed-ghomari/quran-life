import 'server-only';

import { db as instantAdmin } from '@/lib/instant-admin';
import { getVerifiedInstantUser } from '@/lib/server/auth';
import { isServerEditorUser, isServerPaymentBypassUser } from '@/lib/privilegedEmails.server';

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'past_due', 'trialing']);

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

  return {
    isAuthenticated: true,
    hasActiveSubscription,
    isPaymentBypass,
    hasPremiumAccess: hasActiveSubscription || isPaymentBypass,
    isEditor,
    user,
  } as const;
}
