import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { db as instantAdmin } from '@/lib/instant-admin';
import { paddle } from '@/lib/paddle/server';
import { getVerifiedInstantUser } from '@/lib/server/auth';
import { getLatestSubscriptionForUser } from '@/lib/server/subscriptions';

const PENDING_DELETION_STATUS = 'pending_until_billing_period_end';
const LEGACY_PENDING_DELETION_STATUS = 'pending_30_day_retention';
const NON_CANCELLABLE_SUBSCRIPTION_STATUSES = new Set(['canceled', 'cancelled', 'inactive']);
const DAY_MS = 24 * 60 * 60 * 1000;
const ALLOWED_CHURN_REASON_CODES = new Set([
  'price_too_high',
  'not_using_enough',
  'missing_features',
  'technical_issues',
  'switching_tool',
  'temporary_break',
  'other',
  'prefer_not_to_say',
]);

type DeletionEventRecord = {
  id?: string;
  eventType?: string;
  status?: string;
  processedAt?: string;
  subscriptionId?: string;
  customerId?: string;
  priceId?: string;
};

const toTimestamp = (value: string | undefined) => {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : null;
};

const toDaysUntil = (targetIso: string | null) => {
  const targetMs = toTimestamp(targetIso ?? undefined);
  if (targetMs === null) return null;
  const remaining = targetMs - Date.now();
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / DAY_MS);
};

const isPendingDeletionStatus = (status: string | undefined) =>
  status === PENDING_DELETION_STATUS || status === LEGACY_PENDING_DELETION_STATUS;

const getEndOfMonthIso = (baseIso: string | null) => {
  const base = baseIso ? new Date(baseIso) : new Date();
  if (Number.isNaN(base.getTime())) return null;
  const endOfMonthMs = Date.UTC(
    base.getUTCFullYear(),
    base.getUTCMonth() + 1,
    1,
    0,
    0,
    0,
    0,
  ) - 1;
  return new Date(endOfMonthMs).toISOString();
};

const extractBillingDeadline = (subscription: {
  nextBilledAt?: string | null;
  currentBillingPeriod?: { endsAt?: string } | null;
  scheduledChange?: { effectiveAt?: string } | null;
}) => {
  const candidates = [
    subscription.scheduledChange?.effectiveAt ?? null,
    subscription.nextBilledAt ?? null,
    subscription.currentBillingPeriod?.endsAt ?? null,
  ];
  for (const candidate of candidates) {
    if (candidate && Number.isFinite(Date.parse(candidate))) {
      return candidate;
    }
  }
  return null;
};

const resolveDeletionDeadline = async ({
  requestedAt,
  subscriptionId,
  userId,
}: {
  requestedAt: string | null;
  subscriptionId?: string;
  userId: string;
}) => {
  const normalizedSubscriptionId = String(subscriptionId ?? '').trim();
  if (!normalizedSubscriptionId) {
    return getEndOfMonthIso(requestedAt);
  }

  try {
    const subscription = await paddle.subscriptions.get(normalizedSubscriptionId, {
      include: ['next_transaction', 'recurring_transaction_details'],
    });
    const billingDeadline = extractBillingDeadline(subscription);
    if (billingDeadline) return billingDeadline;
  } catch (error) {
    console.error('Failed to resolve deletion deadline from Paddle subscription', {
      userId,
      subscriptionId: normalizedSubscriptionId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return getEndOfMonthIso(requestedAt);
};

const pickLatestDeletionRequest = (events: DeletionEventRecord[]) => {
  const deletionEvents = events.filter((event) => event.eventType === 'account.delete_requested');
  if (!deletionEvents.length) return null;
  return [...deletionEvents].sort((a, b) => {
    const aTime = toTimestamp(a.processedAt) ?? 0;
    const bTime = toTimestamp(b.processedAt) ?? 0;
    return bTime - aTime;
  })[0] ?? null;
};

const buildDeletionPayload = async (
  record: DeletionEventRecord | null,
  userId: string,
  preResolvedDeadline?: string | null,
) => {
  const requestedAt = record?.processedAt ?? null;
  const deadline = record
    ? (preResolvedDeadline ?? await resolveDeletionDeadline({
      requestedAt,
      subscriptionId: record.subscriptionId,
      userId,
    }))
    : null;
  const deadlineMs = toTimestamp(deadline ?? undefined);
  const pending = Boolean(record && isPendingDeletionStatus(record.status) && deadlineMs !== null && Date.now() <= deadlineMs);
  return {
    pending,
    canCancel: pending,
    requestedAt,
    expiresAt: deadline,
    daysUntilAccessEnds: toDaysUntil(deadline),
    status: record?.status ?? null,
  };
};

const loadUserDeletionEvents = async (userId: string): Promise<DeletionEventRecord[]> => {
  const result = await instantAdmin.query({
    paddleWebhookEvents: {
      $: {
        where: { userId },
      },
    },
  });
  return (result?.paddleWebhookEvents ?? []) as DeletionEventRecord[];
};

export async function GET() {
  const user = await getVerifiedInstantUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const events = await loadUserDeletionEvents(user.id);
  const latestDeletionRequest = pickLatestDeletionRequest(events);

  return NextResponse.json({
    ok: true,
    deletion: await buildDeletionPayload(latestDeletionRequest, user.id),
  });
}

export async function POST(request: Request) {
  const user = await getVerifiedInstantUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const reasonCodeCandidate =
    typeof payload?.reasonCode === 'string'
      ? payload.reasonCode.trim()
      : '';
  const reasonCode = ALLOWED_CHURN_REASON_CODES.has(reasonCodeCandidate)
    ? reasonCodeCandidate
    : 'prefer_not_to_say';
  const reasonDetail =
    typeof payload?.reasonDetail === 'string'
      ? payload.reasonDetail.trim().slice(0, 500)
      : '';

  const events = await loadUserDeletionEvents(user.id);
  const latestDeletionRequest = pickLatestDeletionRequest(events);
  const existingDeletion = await buildDeletionPayload(latestDeletionRequest, user.id);

  if (existingDeletion.pending) {
    try {
      await instantAdmin.auth.signOut({ id: user.id });
    } catch (error) {
      console.error('Failed to invalidate user sessions after duplicate deletion request', {
        userId: user.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    return NextResponse.json({
      ok: true,
      alreadyPending: true,
      deletion: existingDeletion,
      message: 'Deletion request already active. You can cancel it until the end of your current billing period.',
    });
  }

  const latestSubscription = await getLatestSubscriptionForUser(user.id);
  const paddleSubscriptionId = String(latestSubscription?.paddleSubscriptionId ?? '').trim();
  const paddleCustomerId = String(latestSubscription?.paddleCustomerId ?? '').trim();
  const subscriptionStatus = String(latestSubscription?.status ?? '').trim();
  const shouldCancelSubscription =
    Boolean(paddleSubscriptionId)
    && !NON_CANCELLABLE_SUBSCRIPTION_STATUSES.has(subscriptionStatus.toLowerCase());

  let cancellationDeadlineIso: string | null = null;

  if (shouldCancelSubscription) {
    try {
      // Keep access through the current period while preventing future renewals.
      const canceledSubscription = await paddle.subscriptions.cancel(paddleSubscriptionId, { effectiveFrom: 'next_billing_period' });
      cancellationDeadlineIso = extractBillingDeadline(canceledSubscription);
    } catch (error) {
      console.error('Failed to cancel subscription during account deletion request', {
        userId: user.id,
        subscriptionId: paddleSubscriptionId,
        message: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({
        ok: false,
        error: 'Could not cancel your subscription right now. Please try again.',
      }, { status: 502 });
    }
  }

  const requestedAtIso = new Date().toISOString();
  if (!cancellationDeadlineIso) {
    cancellationDeadlineIso = await resolveDeletionDeadline({
      requestedAt: requestedAtIso,
      subscriptionId: paddleSubscriptionId,
      userId: user.id,
    });
  }

  try {
    await instantAdmin.transact(
      instantAdmin.tx.paddleWebhookEvents[randomUUID()].update({
        eventId: `account-delete:${user.id}:${Date.now()}`,
        eventType: 'account.delete_requested',
        userId: user.id,
        subscriptionId: paddleSubscriptionId,
        customerId: paddleCustomerId,
        status: PENDING_DELETION_STATUS,
        priceId: String(latestSubscription?.priceId ?? '').trim(),
        processedAt: requestedAtIso,
      }),
    );
  } catch (error) {
    console.error('Failed to record account deletion request', {
      userId: user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({
      ok: false,
      error: 'Could not save your deletion request right now. Please try again.',
    }, { status: 500 });
  }

  try {
    await instantAdmin.transact(
      instantAdmin.tx.accountDeletionFeedback[randomUUID()].update({
        userId: user.id,
        reasonCode,
        reasonDetail: reasonDetail || undefined,
        source: 'delete_request_modal_v1',
        subscriptionId: paddleSubscriptionId,
        customerId: paddleCustomerId,
        priceId: String(latestSubscription?.priceId ?? '').trim(),
        accessEndsAt: cancellationDeadlineIso ?? undefined,
        daysUntilAccessEnds: toDaysUntil(cancellationDeadlineIso) ?? undefined,
        createdAt: requestedAtIso,
      }),
    );
  } catch (error) {
    console.error('Failed to save account deletion feedback', {
      userId: user.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await instantAdmin.auth.signOut({ id: user.id });
  } catch (error) {
    console.error('Failed to invalidate user sessions after deletion request', {
      userId: user.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return NextResponse.json({
    ok: true,
    deletion: await buildDeletionPayload({
      eventType: 'account.delete_requested',
      status: PENDING_DELETION_STATUS,
      processedAt: requestedAtIso,
      subscriptionId: paddleSubscriptionId,
    }, user.id, cancellationDeadlineIso),
    message: 'Account deletion requested. Your subscription renewal was canceled and you can cancel this request until the end of the current billing period.',
  });
}

export async function DELETE() {
  const user = await getVerifiedInstantUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const events = await loadUserDeletionEvents(user.id);
  const latestDeletionRequest = pickLatestDeletionRequest(events);
  if (!latestDeletionRequest?.id) {
    return NextResponse.json({ ok: false, error: 'No deletion request found.' }, { status: 404 });
  }

  const latestDeletionState = await buildDeletionPayload(latestDeletionRequest, user.id);
  if (!isPendingDeletionStatus(latestDeletionRequest.status)) {
    return NextResponse.json({ ok: false, error: 'No active deletion request to cancel.' }, { status: 409 });
  }
  if (!latestDeletionState.canCancel) {
    return NextResponse.json({ ok: false, error: 'The cancellation window for this billing period has expired.' }, { status: 410 });
  }

  const normalizedSubscriptionId = String(latestDeletionRequest.subscriptionId ?? '').trim();
  if (normalizedSubscriptionId) {
    try {
      const subscription = await paddle.subscriptions.get(normalizedSubscriptionId, {
        include: ['next_transaction', 'recurring_transaction_details'],
      });
      if (subscription.scheduledChange?.action === 'cancel') {
        await paddle.subscriptions.update(normalizedSubscriptionId, {
          scheduledChange: null,
        });
      }
    } catch (error) {
      console.error('Failed to restore subscription renewal while canceling account deletion', {
        userId: user.id,
        subscriptionId: normalizedSubscriptionId,
        message: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({
        ok: false,
        error: 'Could not restore your subscription renewal. Deletion request was not canceled.',
      }, { status: 502 });
    }
  }

  try {
    await instantAdmin.transact([
      instantAdmin.tx.paddleWebhookEvents[latestDeletionRequest.id].update({
        status: 'cancelled_by_user',
      }),
      instantAdmin.tx.paddleWebhookEvents[randomUUID()].update({
        eventId: `account-delete-cancel:${user.id}:${Date.now()}`,
        eventType: 'account.delete_cancelled',
        userId: user.id,
        subscriptionId: latestDeletionRequest.subscriptionId ?? '',
        customerId: latestDeletionRequest.customerId ?? '',
        status: 'cancelled_before_billing_period_end',
        priceId: latestDeletionRequest.priceId ?? '',
        processedAt: new Date().toISOString(),
      }),
    ]);
  } catch (error) {
    console.error('Failed to cancel account deletion request', {
      userId: user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false, error: 'Could not cancel account deletion right now.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    deletion: {
      pending: false,
      canCancel: false,
      requestedAt: latestDeletionRequest.processedAt ?? null,
      expiresAt: null,
      status: 'cancelled_by_user',
    },
    subscriptionRenewalRestored: true,
    message: 'Deletion request canceled. Your account remains active and subscription renewal is restored.',
  });
}
