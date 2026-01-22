import { init } from '@instantdb/admin';

export const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || 'pr-quran-life',
  adminToken: process.env.INSTANT_ADMIN_TOKEN || '',
});
