import { Environment } from '@paddle/paddle-node-sdk';

const paddleEnv =
  (process.env.NEXT_PUBLIC_PADDLE_ENV ?? process.env.PADDLE_ENV ?? Environment.sandbox) as Environment;
const isProduction = paddleEnv === Environment.production;

export const clientEnv = {
  NEXT_PUBLIC_PADDLE_ENV: paddleEnv,
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN:
    (isProduction
      ? process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN_PRODUCTION
      : process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN_SANDBOX) ??
    process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ??
    '',
  NEXT_PUBLIC_PADDLE_PRICE_MONTHLY_ID:
    (isProduction
      ? process.env.NEXT_PUBLIC_PADDLE_PRICE_MONTHLY_ID_PRODUCTION
      : process.env.NEXT_PUBLIC_PADDLE_PRICE_MONTHLY_ID_SANDBOX) ??
    process.env.NEXT_PUBLIC_PADDLE_PRICE_MONTHLY_ID ??
    '',
  NEXT_PUBLIC_PADDLE_PRICE_YEARLY_ID:
    (isProduction
      ? process.env.NEXT_PUBLIC_PADDLE_PRICE_YEARLY_ID_PRODUCTION
      : process.env.NEXT_PUBLIC_PADDLE_PRICE_YEARLY_ID_SANDBOX) ??
    process.env.NEXT_PUBLIC_PADDLE_PRICE_YEARLY_ID ??
    '',
  NEXT_PUBLIC_INSTANT_APP_ID: process.env.NEXT_PUBLIC_INSTANT_APP_ID ?? '',
} as const;
