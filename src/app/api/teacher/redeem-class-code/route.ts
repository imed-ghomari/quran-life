import { NextResponse } from 'next/server';
import { db as instantAdmin } from '@/lib/instant-admin';
import { badRequest } from '@/lib/apiUtils';
import { getVerifiedInstantUser } from '@/lib/server/auth';
import { invalidateServerAccessStateCacheForUser } from '@/lib/server/access';
import {
  createTeacherSeatAssignmentId,
  getLatestSubscriptionForUser,
  getTeacherSeatAssignment,
  getTeacherSeatAssignmentsForTeacher,
  getTeacherSeatUsage,
  getTeacherSubscriptionByClassCode,
  isSubscriptionActiveStatus,
  resolveSponsoredAccessForStudent,
} from '@/lib/server/subscriptions';
import { normalizeClassCode } from '@/lib/teacherPlan';

export async function POST(request: Request) {
  const user = await getVerifiedInstantUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json().catch(() => null) as { classCode?: string } | null;
  const classCode = normalizeClassCode(payload?.classCode);
  if (!classCode) {
    return badRequest('Enter a valid class code.');
  }

  const latestSubscription = await getLatestSubscriptionForUser(user.id);
  if (isSubscriptionActiveStatus(latestSubscription?.status)) {
    return NextResponse.json({
      ok: false,
      error: 'Accounts with an active personal subscription cannot redeem a teacher class code yet.',
    }, { status: 409 });
  }

  const sponsoredAccess = await resolveSponsoredAccessForStudent(user.id);
  if (sponsoredAccess?.accessSource === 'teacher_sponsored' && sponsoredAccess.teacherUserId !== user.id) {
    return NextResponse.json({
      ok: false,
      error: 'This account is already sponsored by a teacher.',
    }, { status: 409 });
  }

  const teacherSubscription = await getTeacherSubscriptionByClassCode(classCode);
  if (!teacherSubscription) {
    return NextResponse.json({ ok: false, error: 'That class code is invalid.' }, { status: 404 });
  }
  if (!isSubscriptionActiveStatus(teacherSubscription.status)) {
    return NextResponse.json({ ok: false, error: 'That class code is no longer active.' }, { status: 409 });
  }
  if (!teacherSubscription.userId || teacherSubscription.userId === user.id) {
    return NextResponse.json({ ok: false, error: 'You cannot redeem your own teacher code.' }, { status: 409 });
  }

  const existingAssignment = await getTeacherSeatAssignment(teacherSubscription.userId, user.id);
  if (existingAssignment?.status === 'active') {
    invalidateServerAccessStateCacheForUser(user.id);
    return NextResponse.json({
      ok: true,
      alreadyLinked: true,
      accessSource: 'teacher_sponsored',
    });
  }

  const assignments = await getTeacherSeatAssignmentsForTeacher(teacherSubscription.userId);
  const teacherUsage = getTeacherSeatUsage(assignments);
  const capacity = Number(teacherSubscription.seatCount ?? 0);
  if (teacherUsage.activeCount >= capacity && existingAssignment?.status !== 'grace') {
    return NextResponse.json({
      ok: false,
      error: 'This class is already at capacity.',
    }, { status: 409 });
  }

  const assignmentId = createTeacherSeatAssignmentId(teacherSubscription.userId, user.id);
  const claimedAt = existingAssignment?.claimedAt || new Date().toISOString();
  const updatedAt = new Date().toISOString();

  await instantAdmin.transact(
    instantAdmin.tx.teacherSeatAssignments[assignmentId].update({
      teacherUserId: teacherSubscription.userId,
      studentUserId: user.id,
      subscriptionId: teacherSubscription.paddleSubscriptionId ?? '',
      status: 'active',
      claimedAt,
      graceEndsAt: '',
      updatedAt,
    }),
  );

  invalidateServerAccessStateCacheForUser(user.id);

  return NextResponse.json({
    ok: true,
    accessSource: 'teacher_sponsored',
  });
}
