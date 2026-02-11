import { createEnv } from '@t3-oss/env-nextjs';
import { Environment } from '@paddle/paddle-node-sdk';
import { z } from 'zod';

const paddleEnv = process.env.PADDLE_ENV ?? process.env.NEXT_PUBLIC_PADDLE_ENV ?? Environment.sandbox;
const isProduction = paddleEnv === Environment.production;

const paddleSecretKey =
  (isProduction ? process.env.PADDLE_SECRET_KEY_PRODUCTION : process.env.PADDLE_SECRET_KEY_SANDBOX)
  ?? process.env.PADDLE_SECRET_KEY;

const paddleWebhookSecret =
  (isProduction
    ? process.env.PADDLE_WEBHOOK_SECRET_PRODUCTION
    : process.env.PADDLE_WEBHOOK_SECRET_SANDBOX)
  ?? process.env.PADDLE_WEBHOOK_SECRET;

const paddleClientToken =
  (isProduction
    ? process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN_PRODUCTION
    : process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN_SANDBOX)
  ?? process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;

const paddleMonthlyPriceId =
  (isProduction
    ? process.env.NEXT_PUBLIC_PADDLE_PRICE_MONTHLY_ID_PRODUCTION
    : process.env.NEXT_PUBLIC_PADDLE_PRICE_MONTHLY_ID_SANDBOX)
  ?? process.env.NEXT_PUBLIC_PADDLE_PRICE_MONTHLY_ID;

const paddleYearlyPriceId =
  (isProduction
    ? process.env.NEXT_PUBLIC_PADDLE_PRICE_YEARLY_ID_PRODUCTION
    : process.env.NEXT_PUBLIC_PADDLE_PRICE_YEARLY_ID_SANDBOX)
  ?? process.env.NEXT_PUBLIC_PADDLE_PRICE_YEARLY_ID;

export const keys = () =>
  createEnv({
    server: {
      PADDLE_SECRET_KEY: z.string().min(1),
      PADDLE_WEBHOOK_SECRET: z.string().optional(),
      PADDLE_ENV: z.enum([Environment.sandbox, Environment.production]).optional(),
      INSTANT_ADMIN_TOKEN: z.string().min(1).optional(),
    },
    client: {
      NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: z
        .union([
          z.string().min(1).startsWith('live_'),
          z.string().min(1).startsWith('test_'),
        ]),
      NEXT_PUBLIC_PADDLE_ENV: z.enum([Environment.sandbox, Environment.production]).optional(),
      NEXT_PUBLIC_PADDLE_PRICE_MONTHLY_ID: z.string().min(1).startsWith('pri_'),
      NEXT_PUBLIC_PADDLE_PRICE_YEARLY_ID: z.string().min(1).startsWith('pri_'),
      NEXT_PUBLIC_INSTANT_APP_ID: z.string().min(1).optional(),
    },
    runtimeEnv: {
      PADDLE_SECRET_KEY: paddleSecretKey,
      PADDLE_WEBHOOK_SECRET: paddleWebhookSecret,
      PADDLE_ENV: process.env.PADDLE_ENV ?? process.env.NEXT_PUBLIC_PADDLE_ENV,
      NEXT_PUBLIC_PADDLE_ENV: process.env.NEXT_PUBLIC_PADDLE_ENV ?? process.env.PADDLE_ENV,
      NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: paddleClientToken,
      NEXT_PUBLIC_PADDLE_PRICE_MONTHLY_ID: paddleMonthlyPriceId,
      NEXT_PUBLIC_PADDLE_PRICE_YEARLY_ID: paddleYearlyPriceId,
      INSTANT_ADMIN_TOKEN:
        process.env.INSTANT_APP_ADMIN_TOKEN ?? process.env.INSTANT_ADMIN_TOKEN,
      NEXT_PUBLIC_INSTANT_APP_ID: process.env.NEXT_PUBLIC_INSTANT_APP_ID,
    },
  });
