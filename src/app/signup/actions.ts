'use server';

import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/password';
import { redirect } from 'next/navigation';

export async function signupAction(formData: FormData) {
  const email = String(formData.get('email'));
  const password = String(formData.get('password'));

  const passwordHash = await hashPassword(password);
  await prisma.user.create({ data: { email, passwordHash } });

  redirect('/login');
}
