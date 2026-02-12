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
  INSTANT_APP_ID: process.env.NEXT_PUBLIC_INSTANT_APP_ID ?? 'pr-quran-life',
  APP_MODE: (process.env.APP_MODE ?? process.env.NEXT_PUBLIC_APP_MODE ?? 'user').toLowerCase(),
  EDITOR_EMAILS: Array.from(
    new Set(
      parseEmails(process.env.EDITOR_EMAILS ?? process.env.EDITOR_EMAIL ?? '').concat(
        parseEmails(process.env.NEXT_PUBLIC_EDITOR_EMAILS ?? process.env.NEXT_PUBLIC_EDITOR_EMAIL ?? '')
      )
    )
  ),
  PAYMENT_BYPASS_EMAILS: Array.from(
    new Set(
      parseEmails(process.env.BYPASS_EMAILS ?? '').concat(
        parseEmails(process.env.NEXT_PUBLIC_BYPASS_EMAILS ?? ''),
        parseEmails(process.env.EDITOR_EMAILS ?? process.env.EDITOR_EMAIL ?? ''),
        parseEmails(process.env.NEXT_PUBLIC_EDITOR_EMAILS ?? process.env.NEXT_PUBLIC_EDITOR_EMAIL ?? '')
      )
    )
  ),
} as const;

export function requireServerEnv(value: string, name: string) {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}
