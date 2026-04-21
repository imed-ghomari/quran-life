import { Environment } from '@paddle/paddle-node-sdk';

const paddleEnv =
  (process.env.NEXT_PUBLIC_PADDLE_ENV ?? process.env.PADDLE_ENV ?? Environment.sandbox) as Environment;
const isProduction = paddleEnv === Environment.production;

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const fsrsOptimizationModeRaw = (process.env.NEXT_PUBLIC_FSRS_OPTIMIZATION_MODE ?? 'normal').trim().toLowerCase();
const fsrsOptimizationMode = fsrsOptimizationModeRaw === 'test' ? 'test' : 'normal';
const audioPlayerReciterModeRaw = (process.env.NEXT_PUBLIC_AUDIO_PLAYER_RECITER_MODE ?? 'ayah-only').trim().toLowerCase();
const audioPlayerReciterMode = audioPlayerReciterModeRaw === 'all' ? 'all' : 'ayah-only';
const defaultOptimizationLogDelta = fsrsOptimizationMode === 'test' ? 5 : 400;
const defaultOptimizationDelayMs = fsrsOptimizationMode === 'test' ? 0 : 5000;

export const clientEnv = {
  NEXT_PUBLIC_PADDLE_ENV: paddleEnv,
  NEXT_PUBLIC_DEPLOYMENT_ID: process.env.NEXT_PUBLIC_DEPLOYMENT_ID ?? '',
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
  NEXT_PUBLIC_PADDLE_PRICE_TEACHER_BASE_MONTHLY_ID:
    (isProduction
      ? process.env.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_BASE_MONTHLY_ID_PRODUCTION
      : process.env.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_BASE_MONTHLY_ID_SANDBOX) ??
    process.env.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_BASE_MONTHLY_ID ??
    '',
  NEXT_PUBLIC_PADDLE_PRICE_TEACHER_BASE_YEARLY_ID:
    (isProduction
      ? process.env.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_BASE_YEARLY_ID_PRODUCTION
      : process.env.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_BASE_YEARLY_ID_SANDBOX) ??
    process.env.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_BASE_YEARLY_ID ??
    '',
  NEXT_PUBLIC_PADDLE_PRICE_TEACHER_SEAT_MONTHLY_ID:
    (isProduction
      ? process.env.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_SEAT_MONTHLY_ID_PRODUCTION
      : process.env.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_SEAT_MONTHLY_ID_SANDBOX) ??
    process.env.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_SEAT_MONTHLY_ID ??
    '',
  NEXT_PUBLIC_PADDLE_PRICE_TEACHER_SEAT_YEARLY_ID:
    (isProduction
      ? process.env.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_SEAT_YEARLY_ID_PRODUCTION
      : process.env.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_SEAT_YEARLY_ID_SANDBOX) ??
    process.env.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_SEAT_YEARLY_ID ??
    '',
  NEXT_PUBLIC_INSTANT_APP_ID: process.env.NEXT_PUBLIC_INSTANT_APP_ID ?? '',
  NEXT_PUBLIC_AUDIO_PLAYER_RECITER_MODE: audioPlayerReciterMode,
  NEXT_PUBLIC_FSRS_OPTIMIZATION_MODE: fsrsOptimizationMode,
  NEXT_PUBLIC_FSRS_OPTIMIZATION_ENABLED: parseBoolean(
    process.env.NEXT_PUBLIC_FSRS_OPTIMIZATION_ENABLED,
    false
  ),
  NEXT_PUBLIC_ENABLE_TEACHER_PRICING_UI: parseBoolean(
    process.env.NEXT_PUBLIC_ENABLE_TEACHER_PRICING_UI,
    false
  ),
  NEXT_PUBLIC_FSRS_OPTIMIZATION_LOG_DELTA: parsePositiveInt(
    process.env.NEXT_PUBLIC_FSRS_OPTIMIZATION_LOG_DELTA,
    defaultOptimizationLogDelta
  ),
  NEXT_PUBLIC_FSRS_OPTIMIZATION_DELAY_MS: parsePositiveInt(
    process.env.NEXT_PUBLIC_FSRS_OPTIMIZATION_DELAY_MS,
    defaultOptimizationDelayMs
  ),
} as const;
