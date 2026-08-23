'use client';

import { signIn } from 'next-auth/react';

export default function LoginPage() {
  return (
    <form
      action={async (formData) => {
        await signIn('credentials', {
          email: formData.get('email'),
          password: formData.get('password'),
          redirectTo: '/dashboard/resumes',
        });
      }}
    >
      <input name="email" type="email" placeholder="Email" required />
      <input name="password" type="password" placeholder="Password" required />
      <button type="submit">Log in</button>
    </form>
  );
}
