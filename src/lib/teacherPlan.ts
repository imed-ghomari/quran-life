export type BillingCycle = 'monthly' | 'yearly';
export type SubscriptionKind = 'student' | 'teacher';
export type AccessSource = 'none' | 'self_paid' | 'teacher_sponsored' | 'teacher_grace' | 'bypass';
export type TeacherSeatAssignmentStatus = 'active' | 'grace' | 'revoked';

export const STUDENT_PRICING = {
  monthly: 10,
  yearly: 96,
} as const;

export const TEACHER_BASE_PRICING = {
  monthly: 10,
  yearly: 96,
} as const;

export const TEACHER_SEAT_PRICING = {
  monthly: 5,
  yearly: 48,
} as const;

export const MIN_TEACHER_SEAT_COUNT = 1;
export const MAX_TEACHER_SEAT_COUNT = 500;
export const TEACHER_GRACE_PERIOD_MS = 72 * 60 * 60 * 1000;
export const TEACHER_CLASS_CODE_PREFIX = 'QL';
const CLASS_CODE_LENGTH = 8;
const CLASS_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function clampTeacherSeatCount(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return MIN_TEACHER_SEAT_COUNT;
  return Math.min(MAX_TEACHER_SEAT_COUNT, Math.max(MIN_TEACHER_SEAT_COUNT, parsed));
}

export function getStudentPlanPrice(cycle: BillingCycle) {
  return STUDENT_PRICING[cycle];
}

export function getTeacherBasePrice(cycle: BillingCycle) {
  return TEACHER_BASE_PRICING[cycle];
}

export function getTeacherSeatPrice(cycle: BillingCycle) {
  return TEACHER_SEAT_PRICING[cycle];
}

export function getTeacherTotalPrice(cycle: BillingCycle, seatCount: number) {
  const normalizedSeatCount = clampTeacherSeatCount(seatCount);
  return getTeacherBasePrice(cycle) + (getTeacherSeatPrice(cycle) * normalizedSeatCount);
}

export function formatCurrency(value: number) {
  return `$${value.toLocaleString('en-US')}`;
}

export function formatClassCodeSegments(raw: string) {
  const cleaned = raw.replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return '';

  const withoutPrefix = cleaned.startsWith(TEACHER_CLASS_CODE_PREFIX)
    ? cleaned.slice(TEACHER_CLASS_CODE_PREFIX.length)
    : cleaned;
  const trimmed = withoutPrefix.slice(0, CLASS_CODE_LENGTH);
  if (!trimmed) return '';

  const groups = trimmed.match(/.{1,4}/g) ?? [];
  return `${TEACHER_CLASS_CODE_PREFIX}-${groups.join('-')}`;
}

export function normalizeClassCode(raw: string | null | undefined) {
  if (!raw) return '';
  return formatClassCodeSegments(raw.trim().toUpperCase());
}

export function isValidClassCode(raw: string | null | undefined) {
  const normalized = normalizeClassCode(raw);
  return normalized.length === `${TEACHER_CLASS_CODE_PREFIX}-XXXX-XXXX`.length;
}

export function generateClassCode() {
  const randomValues = new Uint8Array(CLASS_CODE_LENGTH);
  crypto.getRandomValues(randomValues);
  let output = '';
  for (let index = 0; index < CLASS_CODE_LENGTH; index += 1) {
    output += CLASS_CODE_ALPHABET[randomValues[index] % CLASS_CODE_ALPHABET.length];
  }
  return formatClassCodeSegments(output);
}

export function coerceBillingCycle(value: unknown): BillingCycle {
  return value === 'yearly' ? 'yearly' : 'monthly';
}

export function coerceSubscriptionKind(value: unknown): SubscriptionKind {
  return value === 'teacher' ? 'teacher' : 'student';
}

export function coerceSeatCount(value: unknown) {
  return clampTeacherSeatCount(value);
}

export function isGraceActive(graceEndsAt: string | null | undefined) {
  const timestamp = Date.parse(String(graceEndsAt ?? ''));
  return isFiniteNumber(timestamp) && timestamp > Date.now();
}
