const parseEmails = (raw: string) =>
  raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

const OWNER_EMAILS = parseEmails(process.env.NEXT_PUBLIC_OWNER_EMAILS || '');
const EDITOR_EMAILS = parseEmails(
  process.env.NEXT_PUBLIC_EDITOR_EMAILS ||
    process.env.NEXT_PUBLIC_EDITOR_EMAIL ||
    ''
);

export const PRIVILEGED_EMAILS = Array.from(
  new Set([...OWNER_EMAILS, ...EDITOR_EMAILS])
);

export function isPrivilegedEmail(email?: string | null) {
  if (!email) return false;
  return PRIVILEGED_EMAILS.includes(email.trim().toLowerCase());
}
