'use client';

import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';

export function LogoutButton() {
  return (
    <Button type="button" variant="secondary" className="self-start" onClick={() => signOut({ redirectTo: '/login' })}>
      Log out
    </Button>
  );
}
