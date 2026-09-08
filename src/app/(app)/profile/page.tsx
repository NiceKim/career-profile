import { getCurrentUserId } from '@/lib/session';
import { getProfile } from '@/lib/profile';
import { updateProfileAction } from './actions';
import { LogoutButton } from './LogoutButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default async function ProfilePage() {
  const userId = await getCurrentUserId();
  const profile = await getProfile(userId);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-0">Profile</h1>
      <form action={updateProfileAction} className="flex flex-col gap-4 max-w-none mb-0">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" name="fullName" defaultValue={profile?.fullName} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={profile?.email} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={profile?.phone} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="location">Location</Label>
          <Input id="location" name="location" defaultValue={profile?.location} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="linkedin">LinkedIn URL</Label>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Input id="linkedin" name="linkedin" defaultValue={(profile?.links as any)?.linkedin ?? ''} />
        </div>
        <Button type="submit" className="self-start">
          Save
        </Button>
      </form>
      <LogoutButton />
    </div>
  );
}
