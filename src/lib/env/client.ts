// Obsidian mobile does not provide Node's global `process`. Keep the browser
// bundle safe while still allowing esbuild/Node to inject environment values.
const runtimeEnv: Record<string, string | undefined> =
  typeof process !== 'undefined' && process.env ? process.env : {};

const audioPlayerReciterModeRaw = (runtimeEnv.NEXT_PUBLIC_AUDIO_PLAYER_RECITER_MODE ?? 'ayah-only').trim().toLowerCase();
const audioPlayerReciterMode = audioPlayerReciterModeRaw === 'all' ? 'all' : 'ayah-only';

export const clientEnv = {
  NEXT_PUBLIC_DEPLOYMENT_ID: runtimeEnv.NEXT_PUBLIC_DEPLOYMENT_ID ?? '',
  NEXT_PUBLIC_AUDIO_PLAYER_RECITER_MODE: audioPlayerReciterMode,
  // Kept for compatibility but unused in daily-portion-only branch
  NEXT_PUBLIC_INSTANT_APP_ID: runtimeEnv.NEXT_PUBLIC_INSTANT_APP_ID ?? '',
  NEXT_PUBLIC_FSRS_OPTIMIZATION_ENABLED: false,
  NEXT_PUBLIC_FSRS_OPTIMIZATION_LOG_DELTA: 400,
  NEXT_PUBLIC_FSRS_OPTIMIZATION_DELAY_MS: 5000,
  NEXT_PUBLIC_PADDLE_ENV: (runtimeEnv.NEXT_PUBLIC_PADDLE_ENV ?? 'sandbox') as string,
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: runtimeEnv.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? '',
  NEXT_PUBLIC_PADDLE_PRICE_MONTHLY_ID: runtimeEnv.NEXT_PUBLIC_PADDLE_PRICE_MONTHLY_ID ?? '',
  NEXT_PUBLIC_PADDLE_PRICE_YEARLY_ID: runtimeEnv.NEXT_PUBLIC_PADDLE_PRICE_YEARLY_ID ?? '',
  NEXT_PUBLIC_PADDLE_PRICE_TEACHER_BASE_MONTHLY_ID: runtimeEnv.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_BASE_MONTHLY_ID ?? '',
  NEXT_PUBLIC_PADDLE_PRICE_TEACHER_BASE_YEARLY_ID: runtimeEnv.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_BASE_YEARLY_ID ?? '',
  NEXT_PUBLIC_PADDLE_PRICE_TEACHER_SEAT_MONTHLY_ID: runtimeEnv.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_SEAT_MONTHLY_ID ?? '',
  NEXT_PUBLIC_PADDLE_PRICE_TEACHER_SEAT_YEARLY_ID: runtimeEnv.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_SEAT_YEARLY_ID ?? '',
  NEXT_PUBLIC_FSRS_OPTIMIZATION_MODE: 'normal' as const,
} as const;
