'use client';

import { useState } from 'react';
import { db } from '@/lib/instant';
import { usePaddle } from '@/lib/paddle/checkout';
import { paddlePriceIds } from '@/lib/paddle/prices';
import Spinner from '@/components/ui/Spinner';

export default function CheckoutPage() {
  const paddle = usePaddle();
  const { user, isLoading } = db.useAuth();
  const [isOpening, setIsOpening] = useState(false);
  const [plan, setPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  const priceId = plan === 'monthly' ? paddlePriceIds.monthly : paddlePriceIds.yearly;

  const handleCheckout = () => {
    if (!paddle || !user) return;
    setIsOpening(true);

    paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customer: user.email ? { email: user.email } : undefined,
      customData: { userId: user.id },
    });

    setIsOpening(false);
    setIsCheckoutOpen(true);
  };

  const handlePlanChange = (nextPlan: 'monthly' | 'yearly') => {
    setPlan(nextPlan);
    if (!paddle || !isCheckoutOpen) return;
    const nextPriceId = nextPlan === 'monthly' ? paddlePriceIds.monthly : paddlePriceIds.yearly;
    paddle.Checkout.updateCheckout({
      items: [{ priceId: nextPriceId, quantity: 1 }],
    });
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
          {isOpening ? 'Opening checkout...' : 'Proceed'}
        </button>

        {isCheckoutOpen && (
          <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1.25rem' }}>
            <div style={{ color: 'var(--foreground-secondary)', fontSize: '0.95rem' }}>
              Switch billing plan while checkout is open:
            </div>
            <button
              type="button"
              onClick={() => handlePlanChange('monthly')}
              className="btn"
              style={{
                border: plan === 'monthly' ? '2px solid var(--accent)' : '1px solid var(--border)',
                background: plan === 'monthly' ? 'var(--accent-light)' : 'var(--background-secondary)',
                color: 'var(--foreground)',
                width: '100%',
              }}
            >
              Monthly plan
            </button>
            <button
              type="button"
              onClick={() => handlePlanChange('yearly')}
              className="btn"
              style={{
                border: plan === 'yearly' ? '2px solid var(--accent)' : '1px solid var(--border)',
                background: plan === 'yearly' ? 'var(--accent-light)' : 'var(--background-secondary)',
                color: 'var(--foreground)',
                width: '100%',
              }}
            >
              Yearly plan
            </button>
          </div>
        )}

        {!paddle && (
          <p style={{ marginTop: '0.75rem', color: 'var(--foreground-secondary)' }}>
            Preparing secure checkout...
          </p>
        )}
      </div>
    </div>
  );
}
