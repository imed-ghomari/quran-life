/**
 * Narrowing helpers for untrusted JSON (vault files, network responses).
 * Kept dependency-free so both the web build and the Obsidian plugin can use it.
 */

export type JsonRecord = Record<string, unknown>;

/** `value` as a plain object, or null when it is anything else. */
export function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

/** `value` as an array, or an empty array. */
export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : [];
}

/** `value` as a finite number (numbers and numeric strings), or null. */
export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** `value` as a non-empty string, or null. */
export function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** `value` as a boolean, or the fallback for anything that is not a boolean. */
export function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}
