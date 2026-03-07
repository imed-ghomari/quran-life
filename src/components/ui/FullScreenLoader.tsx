import Spinner from '@/components/ui/Spinner';

type FullScreenLoaderProps = {
  text: string;
};

export default function FullScreenLoader({ text }: FullScreenLoaderProps) {
  return (
    <div
      suppressHydrationWarning={true}
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '1rem',
        background: 'var(--background)',
      }}
    >
      <div
        style={{
          width: 'min(30rem, 92vw)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.75rem',
        }}
      >
        <Spinner size={28} />
        <p
          style={{
            minHeight: '3rem',
            margin: 0,
            lineHeight: 1.5,
            textAlign: 'center',
            color: 'var(--foreground-secondary)',
            fontSize: '0.95rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-live="polite"
        >
          {text}
        </p>
      </div>
    </div>
  );
}
