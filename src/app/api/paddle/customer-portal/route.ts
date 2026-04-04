import { NextResponse } from 'next/server';
import { getVerifiedInstantUser } from '@/lib/server/auth';
import { getServerAccessState } from '@/lib/server/access';
import { getLatestSubscriptionForUser } from '@/lib/server/subscriptions';
import { paddle } from '@/lib/paddle/server';

export async function POST() {
  const user = await getVerifiedInstantUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const accessState = await getServerAccessState();
  if (accessState.accessSource === 'teacher_sponsored' || accessState.accessSource === 'teacher_grace') {
    return NextResponse.json({ ok: false, error: 'Billing is managed by the teacher plan for this account.' }, { status: 403 });
  }

  const latestSubscription = await getLatestSubscriptionForUser(user.id);
  if (!latestSubscription) {
    return NextResponse.json({ ok: false, error: 'No subscription found' }, { status: 404 });
  }

  const paddleCustomerId = String(latestSubscription.paddleCustomerId ?? '').trim();
  const paddleSubscriptionId = String(latestSubscription.paddleSubscriptionId ?? '').trim();
  if (!paddleCustomerId || !paddleSubscriptionId) {
    return NextResponse.json({ ok: false, error: 'Billing portal is unavailable' }, { status: 404 });
  }

  try {
    const session = await paddle.customerPortalSessions.create(paddleCustomerId, [paddleSubscriptionId]);
    const url = session.urls.general.overview;

    return NextResponse.json({ ok: true, url });
  } catch (error) {
    console.error('Failed to create Paddle customer portal session', {
      userId: user.id,
      customerId: paddleCustomerId,
      subscriptionId: paddleSubscriptionId,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false, error: 'Could not open billing portal' }, { status: 500 });
  }
}
