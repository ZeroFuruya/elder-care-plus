/**
 * The password policy (Sprint 11), shared by the sign-up form, the sign-in error copy and the
 * tests so the client can never disagree with the server.
 *
 * The hosted project enforces the same rule through Supabase Auth's own settings, applied from
 * `supabase/config.toml` (`minimum_password_length = 10`,
 * `password_requirements = "lower_upper_letters_digits"`). The server is still the authority:
 * this module only stops the user before a round-trip.
 */

export const MIN_PASSWORD_LENGTH = 10;

/** One sentence, safe to put under a password field and in a banner. */
export const PASSWORD_REQUIREMENTS =
  'At least 10 characters, with an upper-case letter, a lower-case letter and a number.';

const HAS_LOWER = /[a-z]/;
const HAS_UPPER = /[A-Z]/;
const HAS_DIGIT = /[0-9]/;

/**
 * The first problem with `password`, or `null` when it satisfies the policy. The messages are
 * deliberately specific so the user can fix the field without guessing.
 */
export function passwordProblem(password: string): string | null {
  if (!password) return 'Enter your password.';

  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!HAS_UPPER.test(password)) return 'Add an upper-case letter.';
  if (!HAS_LOWER.test(password)) return 'Add a lower-case letter.';
  if (!HAS_DIGIT.test(password)) return 'Add a number.';

  return null;
}

export function passwordMeetsPolicy(password: string): boolean {
  return passwordProblem(password) === null;
}
