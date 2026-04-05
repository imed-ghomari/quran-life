import { NextResponse } from 'next/server';
import { db as instantAdmin } from '@/lib/instant-admin';
import { badRequest } from '@/lib/apiUtils';
import { paddle } from '@/lib/paddle/server';
import { summarizePaddleSubscriptionItems } from '@/lib/paddle/prices';
import { getVerifiedInstantUser } from '@/lib/server/auth';
import { createSubscriptionEntityId, createTeacherSubscriptionCustomData, getLatestSubscriptionForUser, isTeacherSubscriptionRecord, normalizeSubscriptionRecord } from '@/lib/server/subscriptions';
import { generateClassCode } from '@/lib/teacherPlan';

export async function POST() {
  const user = await getVerifiedInstantUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const latestSubscription = await getLatestSubscriptionForUser(user.id);
  if (!isTeacherSubscriptionRecord(latestSubscription)) {
    return NextResponse.json({ ok: false, error: 'Teacher plan not found.' }, { status: 404 });
  }

  const paddleSubscriptionId = String(latestSubscription.paddleSubscriptionId ?? '').trim();
  if (!paddleSubscriptionId) {
    return badRequest('Teacher billing is unavailable for this account.');
  }

  const classCode = generateClassCode();
  const customData = createTeacherSubscriptionCustomData({
    userId: user.id,
    billingInterval: latestSubscription.billingInterval ?? 'monthly',
    seatCount: latestSubscription.seatCount ?? 1,
    classCode,
  });

  const updatedSubscription = await paddle.subscriptions.update(paddleSubscriptionId, {
    customData,
  });

  const normalized = normalizeSubscriptionRecord({
    id: createSubscriptionEntityId(paddleSubscriptionId),
    userId: user.id,
    status: updatedSubscription.status,
    paddleSubscriptionId: updatedSubscription.id,
    paddleCustomerId: updatedSubscription.customerId ?? '',
    priceId: updatedSubscription.items?.[0]?.price?.id ?? '',
    updatedAt: new Date().toISOString(),
    customData,
    items: summarizePaddleSubscriptionItems(updatedSubscription.items),
  });

  await instantAdmin.transact(
    instantAdmin.tx.subscriptions[createSubscriptionEntityId(paddleSubscriptionId)].update({
      userId: user.id,
      status: normalized.status ?? '',
      paddleSubscriptionId: normalized.paddleSubscriptionId ?? '',
      paddleCustomerId: normalized.paddleCustomerId ?? '',
      priceId: normalized.priceId ?? '',
      updatedAt: normalized.updatedAt ?? '',
      customData,
      subscriptionKind: normalized.subscriptionKind,
      billingInterval: normalized.billingInterval,
      seatCount: normalized.seatCount,
      classCode: normalized.classCode ?? '',
      items: normalized.items,
    }),
  );

  return NextResponse.json({
    ok: true,
    classCode: normalized.classCode ?? classCode,
  });
}
