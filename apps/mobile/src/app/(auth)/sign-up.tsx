import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { UserRole } from '@eldercare/shared';

import { useAuth } from '@/auth/auth-context';
import { validateSignUp, type FieldErrors } from '@/auth/validation';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { colors, fontSize, lineHeight, radius, spacing, touchTarget } from '@/constants/theme';

const ROLE_OPTIONS: { role: UserRole; title: string; description: string }[] = [
  {
    role: 'elder',
    title: 'Older adult',
    description: 'I take the medicines and confirm each dose myself.',
  },
  {
    role: 'caregiver',
    title: 'Family caregiver',
    description: 'I look after someone and follow their record.',
  },
];

export default function SignUpScreen() {
  const { signUp } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [roleError, setRoleError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting || success) return;

    setSuccess(null);
    const validation = validateSignUp({ name, email, password, confirmPassword });
    setErrors(validation.fieldErrors);
    setRoleError(role ? null : 'Choose who will use this account.');
    setFormError(null);
    if (!validation.valid || !role) return;

    setSubmitting(true);
    const outcome = await signUp({ name, email, password, role });
    setSubmitting(false);

    if (!outcome.ok) {
      setFormError(outcome.message);
      return;
    }

    setSuccess('Account created successfully. Opening your dashboard…');
    const target = outcome.user.role === 'elder' ? '/elder' : '/caregiver';
    setTimeout(() => router.replace(target), 900);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen title="Create account" subtitle="Stored locally on this device" showBack>
        {success ? <Banner tone="success" message={success} /> : null}
        {formError ? <Banner tone="error" message={formError} /> : null}

        <Field
          label="Full name"
          value={name}
          onChangeText={setName}
          error={errors.name}
          placeholder="Juan Dela Cruz"
          autoCapitalize="words"
          textContentType="name"
        />

        <Field
          label="Email address"
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          placeholder="name@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
        />

        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          isPassword
          placeholder="At least 8 characters"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Field
          label="Confirm password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          error={errors.confirmPassword}
          isPassword
          placeholder="Re-enter the password"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.roleGroup}>
          <Text style={styles.roleHeading}>Who is using this account?</Text>
          {ROLE_OPTIONS.map((option) => {
            const selected = role === option.role;
            return (
              <Pressable
                key={option.role}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${option.title}. ${option.description}`}
                onPress={() => {
                  setRole(option.role);
                  setRoleError(null);
                }}
                style={({ pressed }) => [
                  styles.roleCard,
                  selected ? styles.roleCardSelected : null,
                  pressed ? styles.roleCardPressed : null,
                ]}
              >
                <Text style={styles.roleTitle}>{option.title}</Text>
                <Text style={styles.roleDescription}>{option.description}</Text>
                <Text style={styles.roleState}>{selected ? 'Selected' : 'Not selected'}</Text>
              </Pressable>
            );
          })}
          {roleError ? (
            <View style={styles.roleErrorRow} accessibilityRole="alert">
              <Text style={styles.roleErrorGlyph}>!</Text>
              <Text style={styles.roleErrorText}>{roleError}</Text>
            </View>
          ) : null}
        </View>

        <Button
          label="Create account"
          onPress={submit}
          loading={submitting}
          disabled={Boolean(success)}
        />

        <Button
          label="Back to sign in"
          variant="secondary"
          onPress={() => router.replace('/sign-in')}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  roleGroup: {
    gap: spacing.sm,
  },
  roleHeading: {
    color: colors.text,
    fontSize: fontSize.caption,
    fontWeight: '600',
    lineHeight: lineHeight.caption,
  },
  roleCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xs,
    minHeight: touchTarget.min,
    padding: spacing.md,
  },
  roleCardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  roleCardPressed: {
    opacity: 0.85,
  },
  roleTitle: {
    color: colors.text,
    fontSize: fontSize.body,
    fontWeight: '700',
    lineHeight: lineHeight.body,
  },
  roleDescription: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
  },
  roleState: {
    color: colors.primary,
    fontSize: fontSize.caption,
    fontWeight: '700',
    lineHeight: lineHeight.caption,
  },
  roleErrorRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  roleErrorGlyph: {
    color: colors.danger,
    fontSize: fontSize.caption,
    fontWeight: '700',
  },
  roleErrorText: {
    color: colors.danger,
    flex: 1,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
  },
});
