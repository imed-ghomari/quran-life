export type AppMode = 'owner' | 'user';

const rawMode = (process.env.NEXT_PUBLIC_APP_MODE || 'user').toLowerCase();

export const APP_MODE: AppMode = rawMode === 'owner' ? 'owner' : 'user';
export const isOwnerMode = APP_MODE === 'owner';
export const isUserMode = APP_MODE === 'user';
