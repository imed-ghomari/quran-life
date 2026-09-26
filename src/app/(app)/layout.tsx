import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: {
    index: true,
    follow: true,
  },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
