import { NextResponse } from 'next/server';
import { badRequest } from '@/lib/apiUtils';
import { paddle } from '@/lib/paddle/server';
import { buildCheckoutItems } from '@/lib/paddle/prices';
import { getVerifiedInstantUser } from '@/lib/server/auth';
import {
  createTeacherSubscriptionCustomData,
  createSubscriptionEntityId,
  getLatestSubscriptionForUser,
  getTeacherSeatAssignmentsForTeacher,
  getTeacherSeatUsage,
  isTeacherSubscriptionRecord,
  normalizeSubscriptionRecord,
} from '@/lib/server/subscriptions';
import { clampTeacherSeatCount } from '@/lib/teacherPlan';
import { db as instantAdmin } from '@/lib/instant-admin';
import { summarizePaddleSubscriptionItems } from '@/lib/paddle/prices';

export async function POST(request: Request) {
  const user = await getVerifiedInstantUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json().catch(() => null) as {
    targetSeatCount?: number;
    previewOnly?: boolean;
  } | null;

  const targetSeatCountRaw = Number(payload?.targetSeatCount);
  if (!Number.isFinite(targetSeatCountRaw) || targetSeatCountRaw <= 0) {
    return badRequest('Enter a valid number of student seats.');
  }

  const targetSeatCount = clampTeacherSeatCount(targetSeatCountRaw);
  const previewOnly = Boolean(payload?.previewOnly);

  const latestSubscription = await getLatestSubscriptionForUser(user.id);
  if (!isTeacherSubscriptionRecord(latestSubscription)) {
    return NextResponse.json({ ok: false, error: 'Teacher plan not found.' }, { status: 404 });
  }

  const paddleSubscriptionId = String(latestSubscription.paddleSubscriptionId ?? '').trim();
  if (!paddleSubscriptionId) {
    return badRequest('Teacher billing is unavailable for this account.');
  }

  const currentSeatCount = clampTeacherSeatCount(latestSubscription.seatCount ?? 1);
  const teacherAssignments = await getTeacherSeatAssignmentsForTeacher(user.id);
  const teacherUsage = getTeacherSeatUsage(teacherAssignments);
  if (targetSeatCount < teacherUsage.activeCount) {
    return NextResponse.json({
      ok: false,
      error: 'Remove enough linked students before reducing your seat count.',
    }, { status: 409 });
  }

  if (latestSubscription.status === 'trialing' && targetSeatCount !== currentSeatCount) {
    return NextResponse.json({
      ok: false,
      error: 'Seat changes are disabled while the teacher plan is trialing.',
    }, { status: 409 });
  }

  const billingInterval = latestSubscription.billingInterval ?? 'monthly';
  const items = buildCheckoutItems('teacher', billingInterval, targetSeatCount);
  const customData = createTeacherSubscriptionCustomData({
    userId: user.id,
    billingInterval,
    seatCount: targetSeatCount,
    classCode: latestSubscription.classCode ?? null,
  });
  const prorationBillingMode = targetSeatCount > currentSeatCount
    ? 'prorated_immediately'
    : targetSeatCount < currentSeatCount
      ? 'prorated_next_billing_period'
      : undefined;

  const preview = await paddle.subscriptions.previewUpdate(paddleSubscriptionId, {
    items,
    customData,
    ...(prorationBillingMode ? { prorationBillingMode } : {}),
  });

  if (previewOnly || targetSeatCount === currentSeatCount) {
    return NextResponse.json({
      ok: true,
      unchanged: targetSeatCount === currentSeatCount,
      preview: {
        charge: preview.updateSummary?.charge?.amount ?? null,
        credit: preview.updateSummary?.credit?.amount ?? null,
        currencyCode: preview.updateSummary?.charge?.currencyCode ?? preview.updateSummary?.credit?.currencyCode ?? null,
        result: preview.updateSummary?.result ?? null,
      },
      seatCount: currentSeatCount,
    });
  }

  const updatedSubscription = await paddle.subscriptions.update(paddleSubscriptionId, {
    items,
    customData,
    ...(prorationBillingMode ? { prorationBillingMode } : {}),
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
    seatCount: normalized.seatCount ?? targetSeatCount,
    preview: {
      charge: preview.updateSummary?.charge?.amount ?? null,
      credit: preview.updateSummary?.credit?.amount ?? null,
      currencyCode: preview.updateSummary?.charge?.currencyCode ?? preview.updateSummary?.credit?.currencyCode ?? null,
      result: preview.updateSummary?.result ?? null,
    },
  });
}
