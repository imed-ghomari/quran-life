import { init } from '@instantdb/admin';
import { serverEnv, requireServerEnv } from '@/lib/env/server';
import { schema } from '@/lib/instant-schema';

const appId = requireServerEnv(serverEnv.INSTANT_APP_ID, 'NEXT_PUBLIC_INSTANT_APP_ID');
const adminToken = requireServerEnv(serverEnv.INSTANT_ADMIN_TOKEN, 'INSTANT_ADMIN_TOKEN');

export const db = init({
  appId,
  adminToken,
  schema,
});
