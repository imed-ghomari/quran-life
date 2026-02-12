import 'server-only';

import { serverEnv } from '@/lib/env/server';

export function isServerPaymentBypassEmail(email?: string | null) {
  if (!email) return false;
  return serverEnv.PAYMENT_BYPASS_EMAILS.includes(email.trim().toLowerCase());
}

export function isServerEditorEmail(email?: string | null) {
  if (!email) return false;
  return serverEnv.EDITOR_EMAILS.includes(email.trim().toLowerCase());
}

export function isServerOwnerMode() {
  return serverEnv.APP_MODE === 'owner';
}
