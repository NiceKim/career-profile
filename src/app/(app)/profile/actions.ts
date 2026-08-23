'use server';

import { getCurrentUserId } from '@/lib/session';
import { upsertProfile } from '@/lib/profile';
import { redirect } from 'next/navigation';

export async function updateProfileAction(formData: FormData) {
  const userId = await getCurrentUserId();
  await upsertProfile(userId, {
    fullName: String(formData.get('fullName')),
    email: String(formData.get('email')),
    phone: String(formData.get('phone')),
    location: String(formData.get('location')),
    links: { linkedin: String(formData.get('linkedin') ?? '') },
  });
  redirect('/profile');
}
