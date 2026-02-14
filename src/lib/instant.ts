import { init } from '@instantdb/react';
import { clientEnv } from '@/lib/env/client';
import { schema } from '@/lib/instant-schema';

export const APP_ID = clientEnv.NEXT_PUBLIC_INSTANT_APP_ID;
if (!APP_ID) {
  throw new Error('Missing NEXT_PUBLIC_INSTANT_APP_ID');
}

export { schema } from '@/lib/instant-schema';

// Typed database client.
export const db = init({ appId: APP_ID, schema });

// Helper to get typed db
export type DB = typeof db;
