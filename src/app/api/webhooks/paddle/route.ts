import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createHash } from 'crypto';
import { paddle } from '@/lib/paddle/server';
import { db as instantAdmin } from '@/lib/instant-admin';
import { serverEnv } from '@/lib/env/server';
import { invalidateServerAccessStateCacheForUser } from '@/lib/server/access';

const PADDLE_WEBHOOK_SECRET = serverEnv.PADDLE_WEBHOOK_SECRET;
const INSTANT_ADMIN_TOKEN = serverEnv.INSTANT_ADMIN_TOKEN;

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'past_due', 'trialing']);

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
}: {
  userId: string;
  subscriptionId: string;
  status: string;
  customerId?: string | null;
  priceId?: string | null;
  customData?: Record<string, unknown> | null;
}) {
  await instantAdmin.transact(
    instantAdmin.tx.subscriptions[deterministicUuid(`sub:${subscriptionId}`)].update({
      userId,
      status,
      paddleSubscriptionId: subscriptionId,
      paddleCustomerId: customerId ?? '',
      priceId: priceId ?? '',
      updatedAt: new Date().toISOString(),
      customData: customData ?? {},
    }),
  );
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

        const priceId = subscription.items?.[0]?.price?.id ?? null;

        await upsertSubscription({
          userId,
          subscriptionId: subscription.id,
          status: subscription.status,
          customerId: subscription.customerId,
          priceId,
          customData: subscription.customData ?? null,
        });
        invalidateServerAccessStateCacheForUser(userId);

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
