import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { validateEmail, validateSignIn, type FieldErrors } from '@/auth/validation';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { colors, fontSize, lineHeight, spacing } from '@/constants/theme';

export default function SignInScreen() {
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting || success) return;

    setSuccess(null);
    const validation = validateSignIn({ email, password });
    setErrors(validation.fieldErrors);
    setFormError(validation.formError ?? null);
    if (!validation.valid) return;

    setSubmitting(true);
    const outcome = await signIn(email, password);
    setSubmitting(false);

    if (!outcome.ok) {
      setFormError(outcome.message);
      return;
    }

    setFormError(null);
    setSuccess('Signed in successfully.');
    // The (auth) layout redirects to this role's home as soon as the session
    // lands, so the screen never navigates on its own.
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen title="Sign in" subtitle="Enter the account details to continue" showBack safeBottom>
        {success ? <Banner tone="success" message={success} /> : null}
        {formError ? <Banner tone="error" message={formError} /> : null}

        <Field
          label="Email address"
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          onBlur={() => setErrors((current) => ({ ...current, email: validateEmail(email) }))}
          placeholder="name@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
        />

        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          isPassword
          placeholder="Your password"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          returnKeyType="done"
          onSubmitEditing={submit}
        />

        <Button
          label="Sign in"
          onPress={submit}
          loading={submitting}
          disabled={Boolean(success)}
          accessibilityHint="Signs in to your ElderCare+ account"
        />

        <Button
          label="Create an account"
          variant="secondary"
          onPress={() => router.push('/sign-up')}
        />

        <View style={styles.footer}>
          <Text style={styles.hint}>
            Your session stays signed in on this device until you sign out.
          </Text>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  hint: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
  },
  footer: {
    paddingTop: spacing.sm,
  },
});
