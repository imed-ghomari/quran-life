import { clientEnv } from '@/lib/env/client';
import {
  BillingCycle,
  SubscriptionKind,
  clampTeacherSeatCount,
  coerceBillingCycle,
  getTeacherTotalPrice,
} from '@/lib/teacherPlan';

export type PaddleCheckoutRole = SubscriptionKind;
export type PaddleSubscriptionItemSummary = {
  priceId: string;
  quantity: number;
};

export const paddlePriceIds = {
  monthly: clientEnv.NEXT_PUBLIC_PADDLE_PRICE_MONTHLY_ID,
  yearly: clientEnv.NEXT_PUBLIC_PADDLE_PRICE_YEARLY_ID,
  student: {
    monthly: clientEnv.NEXT_PUBLIC_PADDLE_PRICE_MONTHLY_ID,
    yearly: clientEnv.NEXT_PUBLIC_PADDLE_PRICE_YEARLY_ID,
  },
  teacherBase: {
    monthly: clientEnv.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_BASE_MONTHLY_ID,
    yearly: clientEnv.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_BASE_YEARLY_ID,
  },
  teacherSeat: {
    monthly: clientEnv.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_SEAT_MONTHLY_ID,
    yearly: clientEnv.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_SEAT_YEARLY_ID,
  },
} as const;

const billingCycleByPriceId = new Map<string, BillingCycle>();
const teacherBasePriceIdSet = new Set<string>();
const teacherSeatPriceIdSet = new Set<string>();
const teacherPriceIdSet = new Set<string>();
const studentPriceIdSet = new Set<string>();

for (const cycle of ['monthly', 'yearly'] as const) {
  const studentPriceId = paddlePriceIds.student[cycle];
  if (studentPriceId) {
    billingCycleByPriceId.set(studentPriceId, cycle);
    studentPriceIdSet.add(studentPriceId);
  }

  const teacherBasePriceId = paddlePriceIds.teacherBase[cycle];
  if (teacherBasePriceId) {
    billingCycleByPriceId.set(teacherBasePriceId, cycle);
    teacherBasePriceIdSet.add(teacherBasePriceId);
    teacherPriceIdSet.add(teacherBasePriceId);
  }

  const teacherSeatPriceId = paddlePriceIds.teacherSeat[cycle];
  if (teacherSeatPriceId) {
    billingCycleByPriceId.set(teacherSeatPriceId, cycle);
    teacherSeatPriceIdSet.add(teacherSeatPriceId);
    teacherPriceIdSet.add(teacherSeatPriceId);
  }
}

export function getStudentPriceId(cycle: BillingCycle) {
  return paddlePriceIds.student[cycle];
}

export function getTeacherBasePriceId(cycle: BillingCycle) {
  return paddlePriceIds.teacherBase[cycle];
}

export function getTeacherSeatPriceId(cycle: BillingCycle) {
  return paddlePriceIds.teacherSeat[cycle];
}

export function buildCheckoutItems(
  role: PaddleCheckoutRole,
  cycle: BillingCycle,
  teacherSeatCount: number = 1,
) {
  if (role === 'teacher') {
    const normalizedSeatCount = clampTeacherSeatCount(teacherSeatCount);
    return [
      { priceId: getTeacherBasePriceId(cycle), quantity: 1 },
      { priceId: getTeacherSeatPriceId(cycle), quantity: normalizedSeatCount },
    ];
  }

  return [
    { priceId: getStudentPriceId(cycle), quantity: 1 },
  ];
}

export function getDisplayedTeacherTotal(cycle: BillingCycle, teacherSeatCount: number) {
  return getTeacherTotalPrice(cycle, teacherSeatCount);
}

export function resolveBillingCycleFromPriceId(priceId: string | null | undefined): BillingCycle | null {
  if (!priceId) return null;
  return billingCycleByPriceId.get(priceId) ?? null;
}

export function isStudentPriceId(priceId: string | null | undefined) {
  return Boolean(priceId && studentPriceIdSet.has(priceId));
}

export function isTeacherBasePriceId(priceId: string | null | undefined) {
  return Boolean(priceId && teacherBasePriceIdSet.has(priceId));
}

export function isTeacherSeatPriceId(priceId: string | null | undefined) {
  return Boolean(priceId && teacherSeatPriceIdSet.has(priceId));
}

export function isTeacherPriceId(priceId: string | null | undefined) {
  return Boolean(priceId && teacherPriceIdSet.has(priceId));
}

export function summarizePaddleSubscriptionItems(
  items: Array<{ price?: { id?: string | null } | null; quantity?: number | null }> | null | undefined,
): PaddleSubscriptionItemSummary[] {
  return (items ?? [])
    .map((item) => {
      const priceId = String(item?.price?.id ?? '').trim();
      const quantity = Number(item?.quantity ?? 0);
      if (!priceId || !Number.isFinite(quantity) || quantity <= 0) {
        return null;
      }
      return {
        priceId,
        quantity,
      } satisfies PaddleSubscriptionItemSummary;
    })
    .filter((item): item is PaddleSubscriptionItemSummary => Boolean(item));
}

export function resolveSubscriptionKindFromItems(
  items: PaddleSubscriptionItemSummary[] | null | undefined,
  fallback?: unknown,
): SubscriptionKind {
  if ((items ?? []).some((item) => isTeacherPriceId(item.priceId))) {
    return 'teacher';
  }
  if ((items ?? []).some((item) => isStudentPriceId(item.priceId))) {
    return 'student';
  }
  return fallback === 'teacher' ? 'teacher' : 'student';
}

export function resolveBillingCycleFromItems(
  items: PaddleSubscriptionItemSummary[] | null | undefined,
  fallback?: unknown,
): BillingCycle {
  for (const item of items ?? []) {
    const cycle = resolveBillingCycleFromPriceId(item.priceId);
    if (cycle) return cycle;
  }
  return coerceBillingCycle(fallback);
}

export function resolveTeacherSeatCountFromItems(
  items: PaddleSubscriptionItemSummary[] | null | undefined,
  fallback?: unknown,
) {
  const teacherSeatItem = (items ?? []).find((item) => isTeacherSeatPriceId(item.priceId));
  if (teacherSeatItem?.quantity) {
    return clampTeacherSeatCount(teacherSeatItem.quantity);
  }
  return clampTeacherSeatCount(fallback);
}
