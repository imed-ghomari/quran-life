import { NextResponse } from 'next/server';
import { badRequest } from '@/lib/apiUtils';
import { db as instantAdmin } from '@/lib/instant-admin';
import { getVerifiedInstantUser } from '@/lib/server/auth';
import { invalidateServerAccessStateCacheForUser } from '@/lib/server/access';
import { createTeacherSeatAssignmentId, getTeacherSeatAssignment } from '@/lib/server/subscriptions';
import { TEACHER_GRACE_PERIOD_MS } from '@/lib/teacherPlan';

export async function POST(request: Request) {
  const user = await getVerifiedInstantUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json().catch(() => null) as { studentUserId?: string } | null;
  const studentUserId = String(payload?.studentUserId ?? '').trim();
  if (!studentUserId) {
    return badRequest('Select a student to remove.');
  }

  const existingAssignment = await getTeacherSeatAssignment(user.id, studentUserId);
  if (!existingAssignment) {
    return NextResponse.json({ ok: false, error: 'Linked student not found.' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const graceEndsAt = new Date(Date.now() + TEACHER_GRACE_PERIOD_MS).toISOString();
  await instantAdmin.transact(
    instantAdmin.tx.teacherSeatAssignments[createTeacherSeatAssignmentId(user.id, studentUserId)].update({
      teacherUserId: user.id,
      studentUserId,
      subscriptionId: existingAssignment.subscriptionId ?? '',
      status: 'grace',
      claimedAt: existingAssignment.claimedAt ?? now,
      graceEndsAt,
      updatedAt: now,
    }),
  );

  invalidateServerAccessStateCacheForUser(studentUserId);

  return NextResponse.json({
    ok: true,
    graceEndsAt,
  });
}
