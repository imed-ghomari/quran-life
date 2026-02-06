'use client';

import { useState } from 'react';
import { db } from '@/lib/instant';
import { usePaddle } from '@/lib/paddle/checkout';
import Spinner from '@/components/ui/Spinner';

const PRICE_ID = 'PRICE_ID_GOES_HERE';

export default function CheckoutPage() {
  const paddle = usePaddle();
  const { user, isLoading } = db.useAuth();
  const [isOpening, setIsOpening] = useState(false);

  const handleCheckout = () => {
    if (!paddle || !user) return;
    setIsOpening(true);

    paddle.Checkout.open({
      items: [{ priceId: PRICE_ID, quantity: 1 }],
      customer: user.email ? { email: user.email } : undefined,
      customData: { userId: user.id },
    });

    setIsOpening(false);
  };

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--background)',
      }}>
        <Spinner text="Loading checkout..." />
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--background)',
      }}>
        <Spinner text="Redirecting to sign in..." />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      background: 'var(--background)',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '520px',
        background: 'var(--background)',
        borderRadius: '24px',
        padding: '2.5rem',
        boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
        border: '1px solid var(--border)',
      }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Activate your subscription
        </h1>
        <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1.5rem' }}>
          Complete checkout to unlock the full app experience.
        </p>

        <button
          className="btn btn-primary"
          onClick={handleCheckout}
          disabled={!paddle || isOpening}
          style={{ width: '100%' }}
        >
          {isOpening ? 'Opening checkout...' : 'Open Paddle Checkout'}
        </button>

        {!paddle && (
          <p style={{ marginTop: '0.75rem', color: 'var(--foreground-secondary)' }}>
            Preparing secure checkout...
          </p>
        )}
      </div>
    </div>
  );
}
