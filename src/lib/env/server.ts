import 'server-only';

import { Environment } from '@paddle/paddle-node-sdk';

const paddleEnv =
  (process.env.PADDLE_ENV ?? process.env.NEXT_PUBLIC_PADDLE_ENV ?? Environment.sandbox) as Environment;
const isProduction = paddleEnv === Environment.production;

const parseEmails = (raw: string) =>
  raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

const parseBool = (value: string | undefined, fallback: boolean = false) => {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const warnedDeprecatedKeys = new Set<string>();

function warnDeprecated(key: string, replacement: string) {
  if (warnedDeprecatedKeys.has(key)) return;
  warnedDeprecatedKeys.add(key);
  console.warn(`[config] Deprecated env "${key}" is in use. Migrate to "${replacement}".`);
}

const legacyEditorRaw = process.env.NEXT_PUBLIC_EDITOR_EMAILS ?? process.env.NEXT_PUBLIC_EDITOR_EMAIL ?? '';
const legacyBypassRaw = process.env.NEXT_PUBLIC_BYPASS_EMAILS ?? '';

if (legacyEditorRaw) {
  warnDeprecated('NEXT_PUBLIC_EDITOR_EMAILS/NEXT_PUBLIC_EDITOR_EMAIL', 'EDITOR_EMAILS');
}
if (legacyBypassRaw) {
  warnDeprecated('NEXT_PUBLIC_BYPASS_EMAILS', 'BYPASS_EMAILS');
}
if (process.env.NEXT_PUBLIC_APP_MODE) {
  warnDeprecated('NEXT_PUBLIC_APP_MODE', 'Use email-based roles via EDITOR_EMAILS/BYPASS_EMAILS');
}
if (process.env.APP_MODE) {
  warnDeprecated('APP_MODE', 'Use email-based roles via EDITOR_EMAILS/BYPASS_EMAILS');
}

const canonicalEditorEmails = parseEmails(process.env.EDITOR_EMAILS ?? process.env.EDITOR_EMAIL ?? '');
const legacyEditorEmails = parseEmails(legacyEditorRaw);
const canonicalBypassEmails = parseEmails(process.env.BYPASS_EMAILS ?? '');
const legacyBypassEmails = parseEmails(legacyBypassRaw);

const editorEmails = Array.from(new Set([...canonicalEditorEmails, ...legacyEditorEmails]));
const paymentBypassEmails = Array.from(
  new Set([...canonicalBypassEmails, ...legacyBypassEmails, ...editorEmails])
);

export const serverEnv = {
  PADDLE_ENV: paddleEnv,
  PADDLE_SECRET_KEY:
    (isProduction ? process.env.PADDLE_SECRET_KEY_PRODUCTION : process.env.PADDLE_SECRET_KEY_SANDBOX) ??
    process.env.PADDLE_SECRET_KEY ??
    '',
  PADDLE_WEBHOOK_SECRET:
    (isProduction
      ? process.env.PADDLE_WEBHOOK_SECRET_PRODUCTION
      : process.env.PADDLE_WEBHOOK_SECRET_SANDBOX) ??
    process.env.PADDLE_WEBHOOK_SECRET ??
    '',
  INSTANT_ADMIN_TOKEN: process.env.INSTANT_APP_ADMIN_TOKEN ?? process.env.INSTANT_ADMIN_TOKEN ?? '',
  INSTANT_APP_ID: process.env.NEXT_PUBLIC_INSTANT_APP_ID ?? '',
  E2E_MODE: parseBool(process.env.E2E_MODE, false),
  E2E_AUTH_SECRET: process.env.E2E_AUTH_SECRET ?? '',
  E2E_DEFAULT_EMAIL: process.env.E2E_DEFAULT_EMAIL ?? 'e2e@local.test',
  E2E_ALLOWED_EMAILS: parseEmails(process.env.E2E_ALLOWED_EMAILS ?? ''),
  EDITOR_EMAILS: editorEmails,
  PAYMENT_BYPASS_EMAILS: paymentBypassEmails,
} as const;

export function requireServerEnv(value: string, name: string) {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}
