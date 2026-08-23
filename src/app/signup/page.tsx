import { signupAction } from './actions';

export default function SignupPage() {
  return (
    <form action={signupAction}>
      <input name="email" type="email" placeholder="Email" required />
      <input name="password" type="password" placeholder="Password" required />
      <button type="submit">Sign up</button>
    </form>
  );
}
