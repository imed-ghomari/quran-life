import { clientEnv } from '@/lib/env/client';

export const paddlePriceIds = {
  monthly: clientEnv.NEXT_PUBLIC_PADDLE_PRICE_MONTHLY_ID,
  yearly: clientEnv.NEXT_PUBLIC_PADDLE_PRICE_YEARLY_ID,
} as const;
