import { createInstantRouteHandler } from '@instantdb/react/nextjs';
import { clientEnv } from '@/lib/env/client';

const handler = createInstantRouteHandler({
  appId: clientEnv.NEXT_PUBLIC_INSTANT_APP_ID,
});

export const POST = handler.POST;
