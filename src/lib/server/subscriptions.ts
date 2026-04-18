import 'server-only';

import { db as instantAdmin } from '@/lib/instant-admin';
import { stableEntityId } from '@/lib/instantIds';
import {
  AccessSource,
  BillingCycle,
  SubscriptionKind,
  TeacherSeatAssignmentStatus,
  clampTeacherSeatCount,
  coerceBillingCycle,
  coerceSubscriptionKind,
  generateClassCode,
  isGraceActive,
  normalizeClassCode,
} from '@/lib/teacherPlan';
import {
  PaddleSubscriptionItemSummary,
  resolveBillingCycleFromItems,
  resolveBillingCycleFromPriceId,
  resolveSubscriptionKindFromItems,
  resolveTeacherSeatCountFromItems,
} from '@/lib/paddle/prices';

export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'past_due', 'trialing']);

export type SubscriptionRecord = {
  id: string;
  userId?: string;
  status?: string;
  paddleSubscriptionId?: string;
  paddleCustomerId?: string;
  priceId?: string;
  updatedAt?: string;
  customData?: Record<string, unknown> | null;
  subscriptionKind?: SubscriptionKind;
  billingInterval?: BillingCycle;
  seatCount?: number;
  classCode?: string | null;
  items?: PaddleSubscriptionItemSummary[];
};

export type TeacherSeatAssignmentRecord = {
  id: string;
  teacherUserId?: string;
  studentUserId?: string;
  subscriptionId?: string;
  status?: TeacherSeatAssignmentStatus;
  claimedAt?: string;
  graceEndsAt?: string | null;
  updatedAt?: string;
};

export type SponsoredAccessRecord = {
  accessSource: Extract<AccessSource, 'teacher_sponsored' | 'teacher_grace'>;
  teacherUserId: string;
  teacherSubscription: SubscriptionRecord | null;
  assignment: TeacherSeatAssignmentRecord;
  graceEndsAt: string | null;
};

type RawSubscriptionRecord = {
  id?: string;
  userId?: string;
  status?: string;
  paddleSubscriptionId?: string;
  paddleCustomerId?: string;
  priceId?: string;
  updatedAt?: string;
  customData?: Record<string, unknown> | null;
  subscriptionKind?: string;
  billingInterval?: string;
  seatCount?: number;
  classCode?: string | null;
  items?: PaddleSubscriptionItemSummary[] | null;
};

type RawTeacherSeatAssignmentRecord = {
  id?: string;
  teacherUserId?: string;
  studentUserId?: string;
  subscriptionId?: string;
  status?: string;
  claimedAt?: string;
  graceEndsAt?: string | null;
  updatedAt?: string;
};

const getTimestamp = (value: string | null | undefined) => {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeSubscriptionItems = (items: unknown): PaddleSubscriptionItemSummary[] => {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const priceId = String((item as { priceId?: string }).priceId ?? '').trim();
      const quantity = Number((item as { quantity?: number }).quantity ?? 0);
      if (!priceId || !Number.isFinite(quantity) || quantity <= 0) {
        return null;
      }
      return {
        priceId,
        quantity,
      } satisfies PaddleSubscriptionItemSummary;
    })
    .filter((item): item is PaddleSubscriptionItemSummary => Boolean(item));
};

export function createSubscriptionEntityId(paddleSubscriptionId: string) {
  return stableEntityId('subscription', paddleSubscriptionId);
}

export function createTeacherSeatAssignmentId(teacherUserId: string, studentUserId: string) {
  return stableEntityId('teacher-seat-assignment', teacherUserId, studentUserId);
}

export function isSubscriptionActiveStatus(status: string | null | undefined) {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(String(status ?? '').trim().toLowerCase());
}

export function isTeacherSubscriptionRecord(
  subscription: SubscriptionRecord | null | undefined,
): subscription is SubscriptionRecord & { subscriptionKind: 'teacher' } {
  return subscription?.subscriptionKind === 'teacher';
}

export function createTeacherSubscriptionCustomData({
  userId,
  billingInterval,
  seatCount,
  classCode,
}: {
  userId: string;
  billingInterval: BillingCycle;
  seatCount: number;
  classCode?: string | null;
}) {
  return {
    userId,
    subscriptionKind: 'teacher' as const,
    billingInterval,
    seatCount: clampTeacherSeatCount(seatCount),
    classCode: normalizeClassCode(classCode) || generateClassCode(),
  };
}

export function createStudentSubscriptionCustomData({
  userId,
  billingInterval,
}: {
  userId: string;
  billingInterval: BillingCycle;
}) {
  return {
    userId,
    subscriptionKind: 'student' as const,
    billingInterval,
  };
}

export function normalizeSubscriptionRecord(record: RawSubscriptionRecord): SubscriptionRecord {
  const directItems = normalizeSubscriptionItems(record.items);
  const customDataItems = normalizeSubscriptionItems(record.customData?.items);
  const items = directItems.length > 0 ? directItems : customDataItems;
  const subscriptionKind = coerceSubscriptionKind(
    record.subscriptionKind
      ?? record.customData?.subscriptionKind
      ?? resolveSubscriptionKindFromItems(items, record.priceId),
  );
  const billingInterval = resolveBillingCycleFromItems(
    items,
    record.billingInterval
      ?? record.customData?.billingInterval
      ?? resolveBillingCycleFromPriceId(record.priceId),
  );
  const seatCount = subscriptionKind === 'teacher'
    ? resolveTeacherSeatCountFromItems(items, record.seatCount ?? record.customData?.seatCount)
    : 0;
  const classCode = subscriptionKind === 'teacher'
    ? normalizeClassCode(
      record.classCode
        ?? String(record.customData?.classCode ?? ''),
    ) || null
    : null;

  return {
    id: String(record.id ?? ''),
    userId: String(record.userId ?? ''),
    status: String(record.status ?? ''),
    paddleSubscriptionId: String(record.paddleSubscriptionId ?? ''),
    paddleCustomerId: String(record.paddleCustomerId ?? ''),
    priceId: String(record.priceId ?? items[0]?.priceId ?? ''),
    updatedAt: String(record.updatedAt ?? ''),
    customData: record.customData ?? null,
    subscriptionKind,
    billingInterval,
    seatCount,
    classCode,
    items,
  };
}

export function normalizeTeacherSeatAssignmentRecord(record: RawTeacherSeatAssignmentRecord): TeacherSeatAssignmentRecord {
  const status = String(record.status ?? '').trim().toLowerCase();
  const normalizedStatus: TeacherSeatAssignmentStatus =
    status === 'grace'
      ? 'grace'
      : status === 'revoked'
        ? 'revoked'
        : 'active';

  return {
    id: String(record.id ?? ''),
    teacherUserId: String(record.teacherUserId ?? ''),
    studentUserId: String(record.studentUserId ?? ''),
    subscriptionId: String(record.subscriptionId ?? ''),
    status: normalizedStatus,
    claimedAt: String(record.claimedAt ?? ''),
    graceEndsAt: record.graceEndsAt ? String(record.graceEndsAt) : null,
    updatedAt: String(record.updatedAt ?? ''),
  };
}

export async function getSubscriptionsForUser(userId: string): Promise<SubscriptionRecord[]> {
  const result = await instantAdmin.query({
    subscriptions: {
      $: {
        where: { userId },
      },
    },
  });

  return ((result?.subscriptions ?? []) as RawSubscriptionRecord[])
    .map(normalizeSubscriptionRecord)
    .sort((a, b) => getTimestamp(b.updatedAt) - getTimestamp(a.updatedAt));
}

export async function getLatestSubscriptionForUser(userId: string): Promise<SubscriptionRecord | null> {
  const subscriptions = await getSubscriptionsForUser(userId);
  return subscriptions[0] ?? null;
}

export async function getSubscriptionsByClassCode(classCode: string): Promise<SubscriptionRecord[]> {
  const normalizedClassCode = normalizeClassCode(classCode);
  if (!normalizedClassCode) return [];

  const result = await instantAdmin.query({
    subscriptions: {
      $: {
        where: { classCode: normalizedClassCode },
      },
    },
  });

  return ((result?.subscriptions ?? []) as RawSubscriptionRecord[])
    .map(normalizeSubscriptionRecord)
    .sort((a, b) => getTimestamp(b.updatedAt) - getTimestamp(a.updatedAt));
}

export async function getTeacherSubscriptionByClassCode(classCode: string): Promise<SubscriptionRecord | null> {
  const subscriptions = await getSubscriptionsByClassCode(classCode);
  return subscriptions.find((subscription) => subscription.subscriptionKind === 'teacher') ?? null;
}

export async function getTeacherSeatAssignmentsForTeacher(teacherUserId: string): Promise<TeacherSeatAssignmentRecord[]> {
  const result = await instantAdmin.query({
    teacherSeatAssignments: {
      $: {
        where: { teacherUserId },
      },
    },
  });

  return ((result?.teacherSeatAssignments ?? []) as RawTeacherSeatAssignmentRecord[])
    .map(normalizeTeacherSeatAssignmentRecord)
    .sort((a, b) => getTimestamp(b.updatedAt || b.claimedAt) - getTimestamp(a.updatedAt || a.claimedAt));
}

export async function getTeacherSeatAssignmentsForStudent(studentUserId: string): Promise<TeacherSeatAssignmentRecord[]> {
  const result = await instantAdmin.query({
    teacherSeatAssignments: {
      $: {
        where: { studentUserId },
      },
    },
  });

  return ((result?.teacherSeatAssignments ?? []) as RawTeacherSeatAssignmentRecord[])
    .map(normalizeTeacherSeatAssignmentRecord)
    .sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      return getTimestamp(b.updatedAt || b.claimedAt) - getTimestamp(a.updatedAt || a.claimedAt);
    });
}

export async function getTeacherSeatAssignment(
  teacherUserId: string,
  studentUserId: string,
): Promise<TeacherSeatAssignmentRecord | null> {
  const assignments = await getTeacherSeatAssignmentsForTeacher(teacherUserId);
  return assignments.find((assignment) => assignment.studentUserId === studentUserId) ?? null;
}

export async function resolveSponsoredAccessForStudent(userId: string): Promise<SponsoredAccessRecord | null> {
  const assignments = await getTeacherSeatAssignmentsForStudent(userId);

  for (const assignment of assignments) {
    const teacherUserId = String(assignment.teacherUserId ?? '').trim();
    if (!teacherUserId) continue;

    const teacherSubscription = await getLatestSubscriptionForUser(teacherUserId);
    if (!isTeacherSubscriptionRecord(teacherSubscription)) continue;

    if (assignment.status === 'active' && isSubscriptionActiveStatus(teacherSubscription?.status)) {
      return {
        accessSource: 'teacher_sponsored',
        teacherUserId,
        teacherSubscription,
        assignment,
        graceEndsAt: null,
      };
    }

    if (assignment.status === 'grace' && isGraceActive(assignment.graceEndsAt)) {
      return {
        accessSource: 'teacher_grace',
        teacherUserId,
        teacherSubscription,
        assignment,
        graceEndsAt: assignment.graceEndsAt ?? null,
      };
    }
  }

  return null;
}

export function getTeacherSeatUsage(assignments: TeacherSeatAssignmentRecord[]) {
  const activeAssignments = assignments.filter((assignment) => assignment.status === 'active');
  const graceAssignments = assignments.filter((assignment) => assignment.status === 'grace' && isGraceActive(assignment.graceEndsAt));
  return {
    activeAssignments,
    graceAssignments,
    activeCount: activeAssignments.length,
    graceCount: graceAssignments.length,
  };
}
