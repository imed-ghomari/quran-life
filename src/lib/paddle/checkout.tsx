'use client';

import { CheckoutEventNames, initializePaddle, type Paddle } from '@paddle/paddle-js';
import { useEffect, useState } from 'react';
import { keys } from '@/lib/keys';

const { NEXT_PUBLIC_PADDLE_CLIENT_TOKEN, NEXT_PUBLIC_PADDLE_ENV } = keys();

export function usePaddle() {
  const [paddle, setPaddle] = useState<Paddle>();

  useEffect(() => {
    let isMounted = true;

    const successUrl = `${window.location.origin}/dashboard`;

    initializePaddle({
      environment: NEXT_PUBLIC_PADDLE_ENV ?? 'sandbox',
      token: NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
      eventCallback: (event) => {
        if (event?.name === CheckoutEventNames.CHECKOUT_COMPLETED) {
          window.localStorage.setItem('checkout:completed', Date.now().toString());
          window.location.assign('/dashboard');
        }
      },
      checkout: {
        settings: {
          variant: 'one-page',
          successUrl,
        },
      },
    }).then((paddleInstance) => {
      if (!isMounted) return;
      if (paddleInstance) {
        setPaddle(paddleInstance);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return paddle;
}
