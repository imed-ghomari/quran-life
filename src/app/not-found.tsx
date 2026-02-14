import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at 18% 20%, rgba(91, 143, 185, 0.18) 0%, rgba(91, 143, 185, 0) 40%), radial-gradient(circle at 85% 12%, rgba(27, 152, 224, 0.14) 0%, rgba(27, 152, 224, 0) 42%), var(--background)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
      }}
    >
      <section
        style={{
          width: 'min(640px, 100%)',
          borderRadius: '24px',
          background: 'var(--glass-bg, rgba(253,253,253,0.75))',
          border: '1px solid var(--glass-border, rgba(255,255,255,0.6))',
          boxShadow: 'var(--glass-shadow, 0 8px 32px 0 rgba(31, 38, 135, 0.07))',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          padding: '2.25rem 1.5rem',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.6rem',
            marginBottom: '1rem',
          }}
        >
          <img src="/logo.png" width={28} height={28} alt="Quran Life logo" />
          <span style={{ fontWeight: 700, color: 'var(--accent)' }}>Quran Life</span>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: '0.92rem',
            fontWeight: 700,
            letterSpacing: '0.18em',
            color: 'var(--foreground-secondary)',
          }}
        >
          404
        </p>
        <h1 style={{ margin: '0.5rem 0 0.75rem', fontSize: '2rem', lineHeight: 1.15 }}>
          This page was not found
        </h1>
        <p style={{ margin: '0 auto 1.5rem', maxWidth: '42ch', color: 'var(--foreground-secondary)' }}>
          The URL may be mistyped, moved, or no longer available.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.72rem 1.15rem',
              borderRadius: '12px',
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Back to landing page
          </Link>
          <Link
            href="/dashboard"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.72rem 1.15rem',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
              fontWeight: 600,
              textDecoration: 'none',
              background: 'transparent',
            }}
          >
            Go to dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
