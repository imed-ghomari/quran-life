// Obsidian (especially mobile) does not provide Node's global `process`, and the
// plugin build never injects NEXT_PUBLIC_* values, so this module exposes the
// defaults directly. The web app can still override them at build time by
// replacing this module, but the plugin must not depend on `process` existing.

const AUDIO_PLAYER_RECITER_MODE: string = 'ayah-only';

export const clientEnv = {
  NEXT_PUBLIC_DEPLOYMENT_ID: '',
  NEXT_PUBLIC_AUDIO_PLAYER_RECITER_MODE: AUDIO_PLAYER_RECITER_MODE,
  // Kept for compatibility but unused in daily-portion-only branch
  NEXT_PUBLIC_INSTANT_APP_ID: '',
  NEXT_PUBLIC_FSRS_OPTIMIZATION_ENABLED: false,
  NEXT_PUBLIC_FSRS_OPTIMIZATION_LOG_DELTA: 400,
  NEXT_PUBLIC_FSRS_OPTIMIZATION_DELAY_MS: 5000,
  NEXT_PUBLIC_PADDLE_ENV: 'sandbox' as string,
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: '',
  NEXT_PUBLIC_PADDLE_PRICE_MONTHLY_ID: '',
  NEXT_PUBLIC_PADDLE_PRICE_YEARLY_ID: '',
  NEXT_PUBLIC_PADDLE_PRICE_TEACHER_BASE_MONTHLY_ID: '',
  NEXT_PUBLIC_PADDLE_PRICE_TEACHER_BASE_YEARLY_ID: '',
  NEXT_PUBLIC_PADDLE_PRICE_TEACHER_SEAT_MONTHLY_ID: '',
  NEXT_PUBLIC_PADDLE_PRICE_TEACHER_SEAT_YEARLY_ID: '',
  NEXT_PUBLIC_FSRS_OPTIMIZATION_MODE: 'normal' as const,
} as const;
