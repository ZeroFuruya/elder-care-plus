import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { validateEmail, validateSignIn, type FieldErrors } from '@/auth/validation';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { colors, fontSize, lineHeight, spacing } from '@/constants/theme';
import { DEMO_CAREGIVER, DEMO_ELDER } from '@/db';

export default function SignInScreen() {
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fillDemo = (account: { email: string; password: string }) => {
    setEmail(account.email);
    setPassword(account.password);
    setErrors({});
    setFormError(null);
    setSuccess(null);
  };

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
    setSuccess('Signed in successfully. Opening your dashboard…');
    const target = outcome.user.role === 'elder' ? '/elder' : '/caregiver';
    setTimeout(() => router.replace(target), 900);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen title="Sign in" subtitle="Enter the account details to continue" showBack>
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
          accessibilityHint="Checks the email and password against the local database"
        />

        <Button
          label="Create an account"
          variant="secondary"
          onPress={() => router.push('/sign-up')}
        />

        <Card title="Demo accounts">
          <Text style={styles.hint}>Tap one to fill the form, then tap Sign in.</Text>
          <Button
            label="Use the caregiver account"
            variant="ghost"
            onPress={() => fillDemo(DEMO_CAREGIVER)}
            accessibilityLabel={`Fill the form with the family caregiver demo account, ${DEMO_CAREGIVER.email}`}
          />
          <Button
            label="Use the older adult account"
            variant="ghost"
            onPress={() => fillDemo(DEMO_ELDER)}
            accessibilityLabel={`Fill the form with the older adult demo account, ${DEMO_ELDER.email}`}
          />
        </Card>

        <View style={styles.footer}>
          <Text style={styles.hint}>
            Accounts are stored locally on this device. New accounts can be created from the
            previous screen.
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
