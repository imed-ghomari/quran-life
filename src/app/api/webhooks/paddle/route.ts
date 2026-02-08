import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { paddle } from '@/lib/paddle/server';
import { keys } from '@/lib/keys';
import { db as instantAdmin } from '@/lib/instant-admin';

const { PADDLE_WEBHOOK_SECRET, INSTANT_ADMIN_TOKEN } = keys();

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'past_due']);

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

async function recordEvent(eventId: string, eventType: string) {
  await instantAdmin.transact(
    instantAdmin.tx.paddleWebhookEvents[eventId].update({
      eventId,
      eventType,
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
    instantAdmin.tx.subscriptions[subscriptionId].update({
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

async function upsertPaidUser({
  userId,
  subscriptionId,
  status,
  customerId,
  priceId,
}: {
  userId: string;
  subscriptionId: string;
  status: string;
  customerId?: string | null;
  priceId?: string | null;
}) {
  await instantAdmin.transact(
    instantAdmin.tx.users[userId].update({
      userId,
      status,
      paddleSubscriptionId: subscriptionId,
      paddleCustomerId: customerId ?? '',
      priceId: priceId ?? '',
      updatedAt: new Date().toISOString(),
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
    return NextResponse.json({ ok: false, error: 'missing paddle-signature header' }, { status: 400 });
  }

  try {
    const eventData = await paddle.webhooks.unmarshal(body, PADDLE_WEBHOOK_SECRET, signature);

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
            subscriptionId: subscription.id,
          });
          await recordEvent(eventData.eventId, eventData.eventType);
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

        await upsertPaidUser({
          userId,
          subscriptionId: subscription.id,
          status: subscription.status,
          customerId: subscription.customerId,
          priceId,
        });

        await recordEvent(eventData.eventId, eventData.eventType);

        return NextResponse.json({
          ok: true,
          status: subscription.status,
          access: ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status),
        });
      }
      default: {
        await recordEvent(eventData.eventId, eventData.eventType);
        return NextResponse.json({ ok: true, ignored: eventData.eventType });
      }
    }
  } catch (error) {
    console.error('Paddle webhook error', error);
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 400 });
  }
};
