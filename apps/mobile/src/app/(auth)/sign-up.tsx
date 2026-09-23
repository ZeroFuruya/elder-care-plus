import { ScreenScaffold } from '@/components/screen-scaffold';

/** Account creation followed by email/phone verification, then role selection. */
export default function SignUpScreen() {
  return (
    <ScreenScaffold
      title="Create account"
      description="Account creation, email/phone verification, then role selection."
    />
  );
}
