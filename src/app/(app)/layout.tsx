import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import AuthGate from '@/components/AuthGate';
import { getServerAccessState } from '@/lib/server/access';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const access = await getServerAccessState();

  if (!access.isAuthenticated || !access.hasPremiumAccess) {
    redirect('/auth');
  }

  return <AuthGate>{children}</AuthGate>;
}
