import { init } from '@instantdb/react';
import { schema } from '@/lib/instant-schema';

// InstantDB app identifier (public env var in Next.js)
// TODO: Replace with your actual App ID from InstantDB dashboard
export const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID || 'pr-quran-life';

export { schema } from '@/lib/instant-schema';

// Typed database client.
export const db = init({ appId: APP_ID, schema });

// Helper to get typed db
export type DB = typeof db;
