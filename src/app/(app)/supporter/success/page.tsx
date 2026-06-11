import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, ExternalLink, MessageCircle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Supporter Setup | Quran Life',
};

const fallbackDiscordInvite = 'https://discord.gg/6wy3YRG2qB';

function getDiscordInviteUrl() {
  return (
    process.env.NEXT_PUBLIC_DISCORD_SUPPORTER_INVITE_URL
    || process.env.NEXT_PUBLIC_DISCORD_INVITE_URL
    || fallbackDiscordInvite
  );
}

export default function SupporterSuccessPage() {
  const discordInviteUrl = getDiscordInviteUrl();

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--background)',
        color: 'var(--foreground)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(1rem, 4vw, 3rem)',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: '760px',
          display: 'grid',
          gap: '1.5rem',
        }}
      >
        <div style={{ display: 'grid', gap: '0.75rem', textAlign: 'center' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '999px',
              margin: '0 auto',
              display: 'grid',
              placeItems: 'center',
              background: 'rgba(22, 163, 74, 0.12)',
              color: '#16a34a',
            }}
          >
            <CheckCircle2 size={34} />
          </div>
          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', margin: 0, lineHeight: 1.08 }}>
            You are a Quran Life Supporter
          </h1>
          <p style={{ color: 'var(--foreground-secondary)', fontSize: '1rem', lineHeight: 1.6, margin: 0 }}>
            JazakAllah khayr for helping keep Quran Life maintained and free for other learners.
          </p>
        </div>

        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: '16px',
            background: 'var(--background-secondary)',
            padding: 'clamp(1rem, 3vw, 1.5rem)',
            display: 'grid',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <MessageCircle size={20} style={{ color: 'var(--accent)' }} />
            <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Join the supporter Discord</h2>
          </div>
          <ol style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--foreground-secondary)', lineHeight: 1.7 }}>
            <li>Open the Discord invite below.</li>
            <li>Use the same email you used for checkout when asking for the supporter role.</li>
            <li>Watch Discord for the weekly group Q&A schedule and post your Quran Life questions there.</li>
          </ol>
          <a
            className="btn btn-primary"
            href={discordInviteUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              width: '100%',
              justifyContent: 'center',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            Join Discord
            <ExternalLink size={18} />
          </a>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '0.75rem',
          }}
        >
          <Link className="btn btn-secondary" href="/dashboard" style={{ justifyContent: 'center' }}>
            Go to Today
          </Link>
          <Link className="btn btn-secondary" href="/settings" style={{ justifyContent: 'center' }}>
            Manage Billing
          </Link>
        </div>
      </section>
    </main>
  );
}
