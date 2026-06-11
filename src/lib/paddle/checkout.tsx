'use client';

import { CheckoutEventNames, initializePaddle, type Paddle } from '@paddle/paddle-js';
import { useEffect, useState } from 'react';
import { clientEnv } from '@/lib/env/client';

export function usePaddle() {
  const [paddle, setPaddle] = useState<Paddle>();

  useEffect(() => {
    let isMounted = true;

    if (typeof window === 'undefined') return;
    if (!window.navigator.onLine) return;
    if (!clientEnv.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN) return;

    const successUrl = `${window.location.origin}/supporter/success`;

    initializePaddle({
      environment: clientEnv.NEXT_PUBLIC_PADDLE_ENV ?? 'sandbox',
      token: clientEnv.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
      eventCallback: (event) => {
        if (event?.name === CheckoutEventNames.CHECKOUT_COMPLETED) {
          window.localStorage.setItem('checkout:completed', Date.now().toString());
          window.location.assign('/supporter/success');
        }
      },
      checkout: {
        settings: {
          variant: 'one-page',
          successUrl,
        },
      },
    })
      .then((paddleInstance) => {
        if (!isMounted) return;
        if (paddleInstance) {
          setPaddle(paddleInstance);
        }
      })
      .catch((error) => {
        // Offline or blocked third-party scripts should not crash auth/checkout UI.
        console.warn('Paddle initialization skipped:', error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return paddle;
}
