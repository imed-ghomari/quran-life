import { redirect } from 'next/navigation';
import AuthGate from '@/components/AuthGate';
import { getServerAccessState } from '@/lib/server/access';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const access = await getServerAccessState();

  if (!access.isAuthenticated) {
    redirect('/auth');
  }

  if (!access.hasPremiumAccess) {
    redirect('/checkout');
  }

  return <AuthGate>{children}</AuthGate>;
}
