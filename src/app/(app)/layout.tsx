import AuthGate from '@/components/AuthGate';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
