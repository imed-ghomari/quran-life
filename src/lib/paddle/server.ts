import 'server-only';
import { Environment, Paddle } from '@paddle/paddle-node-sdk';
import { keys } from '@/lib/keys';

const { PADDLE_SECRET_KEY, PADDLE_ENV } = keys();

export const paddle = new Paddle(PADDLE_SECRET_KEY, {
  environment: PADDLE_ENV ?? Environment.sandbox,
});

export * from '@paddle/paddle-node-sdk';
