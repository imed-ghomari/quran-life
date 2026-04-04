import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createHash } from 'crypto';
import { paddle } from '@/lib/paddle/server';
import { db as instantAdmin } from '@/lib/instant-admin';
import { serverEnv } from '@/lib/env/server';
import { invalidateServerAccessStateCacheForUser } from '@/lib/server/access';
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  createSubscriptionEntityId,
  createTeacherSeatAssignmentId,
  getTeacherSeatAssignmentsForTeacher,
  isSubscriptionActiveStatus,
  normalizeSubscriptionRecord,
} from '@/lib/server/subscriptions';
import { summarizePaddleSubscriptionItems } from '@/lib/paddle/prices';
import { TEACHER_GRACE_PERIOD_MS } from '@/lib/teacherPlan';

const PADDLE_WEBHOOK_SECRET = serverEnv.PADDLE_WEBHOOK_SECRET;
const INSTANT_ADMIN_TOKEN = serverEnv.INSTANT_ADMIN_TOKEN;

function deterministicUuid(input: string) {
  const hash = createHash('sha256').update(input).digest('hex');
  const part1 = hash.slice(0, 8);
  const part2 = hash.slice(8, 12);
  const part3 = `4${hash.slice(13, 16)}`;
  const part4 = `${((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${hash.slice(18, 20)}`;
  const part5 = hash.slice(20, 32);
  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}

async function hasProcessedEvent(eventId: string) {
  const result = await instantAdmin.query({
    paddleWebhookEvents: {
      $: {
        where: { eventId },
      },
    },
  });
  return (result?.paddleWebhookEvents ?? []).length > 0;
}

async function recordEvent({
  eventId,
  eventType,
  userId,
  subscriptionId,
  customerId,
  status,
  priceId,
}: {
  eventId: string;
  eventType: string;
  userId?: string | null;
  subscriptionId?: string | null;
  customerId?: string | null;
  status?: string | null;
  priceId?: string | null;
}) {
  await instantAdmin.transact(
    instantAdmin.tx.paddleWebhookEvents[deterministicUuid(`event:${eventId}`)].update({
      eventId,
      eventType,
      userId: userId ?? '',
      subscriptionId: subscriptionId ?? '',
      customerId: customerId ?? '',
      status: status ?? '',
      priceId: priceId ?? '',
      processedAt: new Date().toISOString(),
    }),
  );
}

async function upsertSubscription({
  userId,
  subscriptionId,
  status,
  customerId,
  priceId,
  customData,
  items,
}: {
  userId: string;
  subscriptionId: string;
  status: string;
  customerId?: string | null;
  priceId?: string | null;
  customData?: Record<string, unknown> | null;
  items: ReturnType<typeof summarizePaddleSubscriptionItems>;
}) {
  const normalized = normalizeSubscriptionRecord({
    id: createSubscriptionEntityId(subscriptionId),
    userId,
    status,
    paddleSubscriptionId: subscriptionId,
    paddleCustomerId: customerId ?? '',
    priceId: priceId ?? items[0]?.priceId ?? '',
    updatedAt: new Date().toISOString(),
    customData: customData ?? {},
    items,
  });

  await instantAdmin.transact(
    instantAdmin.tx.subscriptions[createSubscriptionEntityId(subscriptionId)].update({
      userId,
      status,
      paddleSubscriptionId: subscriptionId,
      paddleCustomerId: customerId ?? '',
      priceId: normalized.priceId ?? '',
      updatedAt: normalized.updatedAt,
      customData: customData ?? {},
      subscriptionKind: normalized.subscriptionKind,
      billingInterval: normalized.billingInterval,
      seatCount: normalized.seatCount,
      classCode: normalized.classCode ?? '',
      items: normalized.items,
    }),
  );

  return normalized;
}

async function transitionTeacherAssignmentsToGrace(teacherUserId: string) {
  const assignments = await getTeacherSeatAssignmentsForTeacher(teacherUserId);
  const activeAssignments = assignments.filter((assignment) => assignment.status === 'active');
  if (!activeAssignments.length) return;

  const graceEndsAt = new Date(Date.now() + TEACHER_GRACE_PERIOD_MS).toISOString();
  const updatedAt = new Date().toISOString();
  const writes = activeAssignments.map((assignment) => {
    const teacherSeatAssignmentId = createTeacherSeatAssignmentId(teacherUserId, assignment.studentUserId ?? '');
    invalidateServerAccessStateCacheForUser(assignment.studentUserId ?? '');
    return instantAdmin.tx.teacherSeatAssignments[teacherSeatAssignmentId].update({
      teacherUserId,
      studentUserId: assignment.studentUserId ?? '',
      subscriptionId: assignment.subscriptionId ?? '',
      status: 'grace',
      claimedAt: assignment.claimedAt ?? '',
      graceEndsAt,
      updatedAt,
    });
  });

  await instantAdmin.transact(writes.length === 1 ? writes[0] : writes);
}

async function reconcileTeacherSeatAssignments(teacherUserId: string, seatCount: number) {
  const assignments = await getTeacherSeatAssignmentsForTeacher(teacherUserId);
  const activeAssignments = assignments
    .filter((assignment) => assignment.status === 'active')
    .sort((a, b) => Date.parse(a.claimedAt ?? '') - Date.parse(b.claimedAt ?? ''));

  if (activeAssignments.length <= seatCount) return;

  const overflowAssignments = activeAssignments.slice(seatCount);
  const graceEndsAt = new Date(Date.now() + TEACHER_GRACE_PERIOD_MS).toISOString();
  const updatedAt = new Date().toISOString();
  const writes = overflowAssignments.map((assignment) => {
    const teacherSeatAssignmentId = createTeacherSeatAssignmentId(teacherUserId, assignment.studentUserId ?? '');
    invalidateServerAccessStateCacheForUser(assignment.studentUserId ?? '');
    return instantAdmin.tx.teacherSeatAssignments[teacherSeatAssignmentId].update({
      teacherUserId,
      studentUserId: assignment.studentUserId ?? '',
      subscriptionId: assignment.subscriptionId ?? '',
      status: 'grace',
      claimedAt: assignment.claimedAt ?? '',
      graceEndsAt,
      updatedAt,
    });
  });

  await instantAdmin.transact(writes.length === 1 ? writes[0] : writes);
}

export const POST = async (request: Request) => {
  if (!PADDLE_WEBHOOK_SECRET) {
    console.error('Missing PADDLE_WEBHOOK_SECRET');
    return NextResponse.json({ ok: false, error: 'webhook not configured' }, { status: 500 });
  }
  if (!INSTANT_ADMIN_TOKEN) {
    console.error('Missing INSTANT_ADMIN_TOKEN');
    return NextResponse.json({ ok: false, error: 'instant admin not configured' }, { status: 500 });
  }

  const body = await request.text();
  const headerPayload = await headers();
  const signature = headerPayload.get('paddle-signature');

  if (!signature) {
    console.error('Paddle webhook missing signature header', {
      hasSignature: Boolean(signature),
    });
    return NextResponse.json({ ok: false, error: 'missing paddle-signature header' }, { status: 400 });
  }

  let eventData;
  try {
    eventData = await paddle.webhooks.unmarshal(body, PADDLE_WEBHOOK_SECRET, signature);
  } catch (error) {
    console.error('Paddle webhook signature error', {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 400 });
  }

  try {
    if (await hasProcessedEvent(eventData.eventId)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    switch (eventData.eventType) {
      case 'subscription.created':
      case 'subscription.updated':
      case 'subscription.canceled': {
        const subscription = eventData.data;
        const userId = subscription.customData?.userId as string | undefined;

        if (!userId) {
          console.warn('Subscription webhook missing customData.userId', {
            eventId: eventData.eventId,
            eventType: eventData.eventType,
            subscriptionId: subscription.id,
            customerId: subscription.customerId ?? null,
            customData: subscription.customData ?? null,
          });
          await recordEvent({ eventId: eventData.eventId, eventType: eventData.eventType });
          return NextResponse.json({ ok: true, ignored: 'missing userId' });
        }

        const items = summarizePaddleSubscriptionItems(subscription.items);
        const priceId = items[0]?.priceId ?? null;

        const normalizedSubscription = await upsertSubscription({
          userId,
          subscriptionId: subscription.id,
          status: subscription.status,
          customerId: subscription.customerId,
          priceId,
          customData: subscription.customData ?? null,
          items,
        });
        invalidateServerAccessStateCacheForUser(userId);

        if (normalizedSubscription.subscriptionKind === 'teacher') {
          if (isSubscriptionActiveStatus(normalizedSubscription.status)) {
            await reconcileTeacherSeatAssignments(userId, normalizedSubscription.seatCount ?? 0);
          } else {
            await transitionTeacherAssignmentsToGrace(userId);
          }
        }

        await recordEvent({
          eventId: eventData.eventId,
          eventType: eventData.eventType,
          userId,
          subscriptionId: subscription.id,
          customerId: subscription.customerId ?? null,
          status: subscription.status,
          priceId,
        });

        return NextResponse.json({
          ok: true,
          status: subscription.status,
          access: ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status),
          subscriptionKind: normalizedSubscription.subscriptionKind,
        });
      }
      default: {
        await recordEvent({ eventId: eventData.eventId, eventType: eventData.eventType });
        return NextResponse.json({ ok: true, ignored: eventData.eventType });
      }
    }
  } catch (error) {
    console.error('Paddle webhook processing error', {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false, error: 'processing failure' }, { status: 500 });
  }
};
