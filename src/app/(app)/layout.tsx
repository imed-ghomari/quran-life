import type { Metadata } from 'next';
import AuthGate from '@/components/AuthGate';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
