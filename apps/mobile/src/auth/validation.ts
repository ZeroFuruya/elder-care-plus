export const MIN_PASSWORD_LENGTH = 8;

export interface SignInFields {
  email: string;
  password: string;
}

export interface SignUpFields extends SignInFields {
  name: string;
  confirmPassword: string;
}

export interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export interface ValidationResult<T extends string> {
  fieldErrors: FieldErrors;
  /** Set when the form as a whole cannot be submitted. */
  formError?: string;
  valid: boolean;
  /** Not used for anything but reporting; kept so callers can index errors safely. */
  values: T;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateName(name: string): string | undefined {
  if (!name.trim()) return 'Enter your full name.';
  if (name.trim().length < 2) return 'Enter at least 2 characters.';
  return undefined;
}

export function validateEmail(email: string): string | undefined {
  if (!email.trim()) return 'Enter your email address.';
  if (!EMAIL_PATTERN.test(email.trim()))
    return 'Enter a valid email address, like name@example.com.';
  return undefined;
}

export function validatePassword(password: string): string | undefined {
  if (!password) return 'Enter your password.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return undefined;
}

export function validateSignIn(fields: SignInFields): ValidationResult<'signIn'> {
  const fieldErrors: FieldErrors = {
    email: validateEmail(fields.email),
    password: fields.password ? undefined : 'Enter your password.',
  };

  const emptyBoth = !fields.email.trim() && !fields.password;

  return {
    fieldErrors,
    formError: emptyBoth ? 'Enter your email and password to sign in.' : undefined,
    valid: !fieldErrors.email && !fieldErrors.password,
    values: 'signIn',
  };
}

export function validateSignUp(fields: SignUpFields): ValidationResult<'signUp'> {
  const fieldErrors: FieldErrors = {
    name: validateName(fields.name),
    email: validateEmail(fields.email),
    password: validatePassword(fields.password),
    confirmPassword: !fields.confirmPassword
      ? 'Re-enter your password.'
      : fields.confirmPassword !== fields.password
        ? 'Passwords do not match.'
        : undefined,
  };

  return {
    fieldErrors,
    valid:
      !fieldErrors.name &&
      !fieldErrors.email &&
      !fieldErrors.password &&
      !fieldErrors.confirmPassword,
    values: 'signUp',
  };
}
