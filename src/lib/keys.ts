import { createEnv } from '@t3-oss/env-nextjs';
import { Environment } from '@paddle/paddle-node-sdk';
import { z } from 'zod';

export const keys = () =>
  createEnv({
    server: {
      PADDLE_SECRET_KEY: z.string().min(1),
      PADDLE_WEBHOOK_SECRET: z.string().optional(),
      PADDLE_ENV: z.enum([Environment.sandbox, Environment.production]).optional(),
      INSTANT_ADMIN_TOKEN: z.string().min(1).optional(),
      NEXT_PUBLIC_INSTANT_APP_ID: z.string().min(1).optional(),
    },
    client: {
      NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: z
        .union([
          z.string().min(1).startsWith('live_'),
          z.string().min(1).startsWith('test_'),
        ]),
      NEXT_PUBLIC_PADDLE_ENV: z.enum([Environment.sandbox, Environment.production]).optional(),
      NEXT_PUBLIC_INSTANT_APP_ID: z.string().min(1).optional(),
    },
    runtimeEnv: {
      PADDLE_SECRET_KEY: process.env.PADDLE_SECRET_KEY,
      PADDLE_WEBHOOK_SECRET: process.env.PADDLE_WEBHOOK_SECRET,
      PADDLE_ENV: process.env.PADDLE_ENV,
      NEXT_PUBLIC_PADDLE_ENV: process.env.NEXT_PUBLIC_PADDLE_ENV,
      NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
      INSTANT_ADMIN_TOKEN: process.env.INSTANT_ADMIN_TOKEN,
      NEXT_PUBLIC_INSTANT_APP_ID: process.env.NEXT_PUBLIC_INSTANT_APP_ID,
    },
  });
