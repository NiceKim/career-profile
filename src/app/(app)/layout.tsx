import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Sidebar } from '@/components/Sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const initial = (session.user.email ?? '?').slice(0, 1).toUpperCase();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar initial={initial} />
      <main style={{ flex: 1, padding: '1.5rem' }}>{children}</main>
    </div>
  );
}
