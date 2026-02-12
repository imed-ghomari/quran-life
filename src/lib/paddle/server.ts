import 'server-only';
import { Environment, Paddle } from '@paddle/paddle-node-sdk';
import { requireServerEnv, serverEnv } from '@/lib/env/server';

export const paddle = new Paddle(requireServerEnv(serverEnv.PADDLE_SECRET_KEY, 'PADDLE_SECRET_KEY'), {
  environment: serverEnv.PADDLE_ENV ?? Environment.sandbox,
});

export * from '@paddle/paddle-node-sdk';
