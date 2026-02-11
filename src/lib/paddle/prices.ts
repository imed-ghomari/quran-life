import { keys } from '@/lib/keys';

const { NEXT_PUBLIC_PADDLE_PRICE_MONTHLY_ID, NEXT_PUBLIC_PADDLE_PRICE_YEARLY_ID } = keys();

export const paddlePriceIds = {
  monthly: NEXT_PUBLIC_PADDLE_PRICE_MONTHLY_ID,
  yearly: NEXT_PUBLIC_PADDLE_PRICE_YEARLY_ID,
} as const;
