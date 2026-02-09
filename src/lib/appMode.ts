import { isEditorEmail } from '@/lib/privilegedEmails';

export type AppMode = 'owner' | 'user';

const rawMode = (process.env.NEXT_PUBLIC_APP_MODE || 'user').toLowerCase();

export const APP_MODE: AppMode = rawMode === 'owner' ? 'owner' : 'user';
export const isOwnerMode = APP_MODE === 'owner';
export const isUserMode = APP_MODE === 'user';

export function getAppModeForEmail(email?: string | null): AppMode {
  if (rawMode === 'owner') return 'owner';
  return isEditorEmail(email) ? 'owner' : 'user';
}
