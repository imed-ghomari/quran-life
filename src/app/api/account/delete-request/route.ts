import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { db as instantAdmin } from '@/lib/instant-admin';
import { getVerifiedInstantUser } from '@/lib/server/auth';

const RETENTION_DAYS = 30;

export async function POST() {
  const user = await getVerifiedInstantUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await instantAdmin.transact(
      instantAdmin.tx.paddleWebhookEvents[randomUUID()].update({
        eventId: `account-delete:${user.id}:${Date.now()}`,
        eventType: 'account.delete_requested',
        userId: user.id,
        subscriptionId: '',
        customerId: '',
        status: 'pending_30_day_retention',
        priceId: '',
        processedAt: new Date().toISOString(),
      }),
    );
  } catch (error) {
    console.error('Failed to record account deletion request', {
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
    retentionDays: RETENTION_DAYS,
    message: 'Account deletion requested. Your data will be retained for 30 days in case you return.',
  });
}
