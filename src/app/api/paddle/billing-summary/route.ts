import { NextResponse } from 'next/server';
import { getVerifiedInstantUser } from '@/lib/server/auth';
import { getServerAccessState } from '@/lib/server/access';
import { getLatestSubscriptionForUser } from '@/lib/server/subscriptions';
import { paddle } from '@/lib/paddle/server';

export async function GET() {
  const user = await getVerifiedInstantUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const accessState = await getServerAccessState();
  if (accessState.accessSource === 'teacher_sponsored' || accessState.accessSource === 'teacher_grace') {
    return NextResponse.json({
      ok: true,
      billing: {
        nextRenewalAt: null,
        canManageSubscription: false,
      },
    });
  }

  const latestSubscription = await getLatestSubscriptionForUser(user.id);
  if (!latestSubscription) {
    return NextResponse.json({
      ok: true,
      billing: {
        nextRenewalAt: null,
        canManageSubscription: false,
      },
    });
  }

  const paddleSubscriptionId = String(latestSubscription.paddleSubscriptionId ?? '').trim();
  const paddleCustomerId = String(latestSubscription.paddleCustomerId ?? '').trim();
  let nextRenewalAt: string | null = null;

  if (paddleSubscriptionId) {
    try {
      const subscription = await paddle.subscriptions.get(paddleSubscriptionId, {
        include: ['next_transaction', 'recurring_transaction_details'],
      });
      nextRenewalAt = subscription.nextBilledAt ?? subscription.currentBillingPeriod?.endsAt ?? null;
    } catch (error) {
      console.error('Failed to fetch Paddle subscription summary', {
        userId: user.id,
        subscriptionId: paddleSubscriptionId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    billing: {
      nextRenewalAt,
      canManageSubscription: Boolean(paddleSubscriptionId && paddleCustomerId),
    },
  });
}
