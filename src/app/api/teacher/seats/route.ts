import { NextResponse } from 'next/server';
import { db as instantAdmin } from '@/lib/instant-admin';
import { getVerifiedInstantUser } from '@/lib/server/auth';
import {
  getLatestSubscriptionForUser,
  getTeacherSeatAssignmentsForTeacher,
  getTeacherSeatUsage,
  isTeacherSubscriptionRecord,
  resolveSponsoredAccessForStudent,
} from '@/lib/server/subscriptions';
import { getSiteUrl } from '@/lib/siteUrl';

async function resolveUserEmail(userId: string | null | undefined) {
  const normalizedUserId = String(userId ?? '').trim();
  if (!normalizedUserId) return null;

  try {
    const user = await instantAdmin.auth.getUser({ id: normalizedUserId });
    return user.email ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  const user = await getVerifiedInstantUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const latestSubscription = await getLatestSubscriptionForUser(user.id);
  const teacherSubscription = isTeacherSubscriptionRecord(latestSubscription) ? latestSubscription : null;
  const teacherAssignments = teacherSubscription
    ? await getTeacherSeatAssignmentsForTeacher(user.id)
    : [];
  const teacherUsage = getTeacherSeatUsage(teacherAssignments);
  const inviteLinkBase = getSiteUrl();

  const assignmentRows = await Promise.all(
    teacherAssignments.map(async (assignment) => ({
      studentUserId: assignment.studentUserId ?? '',
      studentEmail: await resolveUserEmail(assignment.studentUserId),
      status: assignment.status ?? 'active',
      claimedAt: assignment.claimedAt ?? null,
      graceEndsAt: assignment.graceEndsAt ?? null,
    })),
  );

  const sponsoredAccess = await resolveSponsoredAccessForStudent(user.id);
  const sponsoredTeacherEmail = sponsoredAccess
    ? await resolveUserEmail(sponsoredAccess.teacherUserId)
    : null;

  return NextResponse.json({
    ok: true,
    teacherPlan: teacherSubscription
      ? {
        classCode: teacherSubscription.classCode ?? null,
        inviteLink: teacherSubscription.classCode
          ? `${inviteLinkBase}/auth?classCode=${encodeURIComponent(teacherSubscription.classCode)}`
          : null,
        seatCount: teacherSubscription.seatCount ?? 0,
        activeSeatCount: teacherUsage.activeCount,
        graceSeatCount: teacherUsage.graceCount,
        billingInterval: teacherSubscription.billingInterval ?? null,
        status: teacherSubscription.status ?? null,
        assignments: assignmentRows,
      }
      : null,
    sponsorship: sponsoredAccess
      ? {
        accessSource: sponsoredAccess.accessSource,
        teacherUserId: sponsoredAccess.teacherUserId,
        teacherEmail: sponsoredTeacherEmail,
        graceEndsAt: sponsoredAccess.graceEndsAt,
      }
      : null,
  });
}
