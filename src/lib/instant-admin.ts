import { init } from '@instantdb/admin';
import { schema } from '@/lib/instant-schema';

export const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || 'pr-quran-life',
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN || process.env.INSTANT_ADMIN_TOKEN || '',
  schema,
});
