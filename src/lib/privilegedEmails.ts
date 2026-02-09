const parseEmails = (raw: string) =>
  raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

const BYPASS_EMAILS = parseEmails(process.env.NEXT_PUBLIC_BYPASS_EMAILS || '');
const EDITOR_EMAILS = parseEmails(
  process.env.NEXT_PUBLIC_EDITOR_EMAILS ||
    process.env.NEXT_PUBLIC_EDITOR_EMAIL ||
    ''
);

export const PAYMENT_BYPASS_EMAILS = Array.from(
  new Set([...BYPASS_EMAILS, ...EDITOR_EMAILS])
);

export function isPaymentBypassEmail(email?: string | null) {
  if (!email) return false;
  return PAYMENT_BYPASS_EMAILS.includes(email.trim().toLowerCase());
}

export function isEditorEmail(email?: string | null) {
  if (!email) return false;
  return EDITOR_EMAILS.includes(email.trim().toLowerCase());
}
