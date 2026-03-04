import AuthGate from '@/components/AuthGate';
import { getServerAccessState } from '@/lib/server/access';
import { forbidden, redirect } from 'next/navigation';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const access = await getServerAccessState();

  if (!access.isAuthenticated) {
    redirect('/auth');
  }

  if (!access.hasPremiumAccess) {
    forbidden();
  }

  return <AuthGate>{children}</AuthGate>;
}
