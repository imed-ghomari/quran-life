import { NextResponse } from 'next/server';
import { getServerAccessState } from '@/lib/server/access';

export async function GET() {
  const access = await getServerAccessState();

  return NextResponse.json({
    isAuthenticated: access.isAuthenticated,
    hasActiveSubscription: access.hasActiveSubscription,
    isPaymentBypass: access.isPaymentBypass,
    hasPremiumAccess: access.hasPremiumAccess,
    isEditor: access.isEditor,
    accessSource: access.accessSource,
    sponsorshipEndsAt: access.sponsorshipEndsAt,
    subscriptionKind: access.subscriptionKind,
  });
}
