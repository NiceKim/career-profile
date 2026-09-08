import { GitFork } from 'lucide-react';
import { signupAction } from './actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function SignupPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 text-foreground">
      <Card className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5 font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-[#2da44e] text-white">
            <GitFork aria-hidden="true" className="size-4" />
          </span>
          <span>footprint</span>
        </div>
        <form className="flex flex-col gap-4" action={signupAction}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required />
          </div>
          <Button type="submit" className="mt-2 w-full">
            Sign up
          </Button>
        </form>
      </Card>
    </main>
  );
}
