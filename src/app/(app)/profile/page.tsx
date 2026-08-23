import { getCurrentUserId } from '@/lib/session';
import { getProfile } from '@/lib/profile';
import { updateProfileAction } from './actions';
import { LogoutButton } from './LogoutButton';

export default async function ProfilePage() {
  const userId = await getCurrentUserId();
  const profile = await getProfile(userId);

  return (
    <div>
      <h1>Profile</h1>
      <form action={updateProfileAction}>
        <input name="fullName" defaultValue={profile?.fullName} placeholder="Full name" required />
        <input name="email" type="email" defaultValue={profile?.email} placeholder="Email" required />
        <input name="phone" defaultValue={profile?.phone} placeholder="Phone" required />
        <input name="location" defaultValue={profile?.location} placeholder="Location" required />
        <input
          name="linkedin"
          defaultValue={(profile?.links as any)?.linkedin ?? ''}
          placeholder="LinkedIn URL"
        />
        <button type="submit">Save</button>
      </form>
      <LogoutButton />
    </div>
  );
}
