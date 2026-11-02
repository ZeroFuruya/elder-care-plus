import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_LOCK_MAX_ATTEMPTS, cooldownRemainingMs } from '@eldercare/shared';

import { useAppLock } from '@/auth/app-lock';
import { useAuth } from '@/auth/auth-context';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Icon } from '@/components/icon';
import { fontSize, lineHeight, spacing, type AppThemeColors } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

/**
 * The lock screen (Sprint 11).
 *
 * Two ways back in, both checked outside this component:
 * - the device biometric (`expo-local-authentication`), which never leaves the phone;
 * - the account password, verified by `reauthenticate()` against Supabase Auth.
 *
 * The screen shows **no medical data and no email address** - only the account name - so a phone
 * left on a table reveals nothing. After five wrong passwords it pauses for 30 s
 * (`unlockCooldownMs`, unit-tested in `@eldercare/shared`).
 */
export function AppLockScreen() {
  const { locked } = useAppLock();

  return (
    <Modal
      visible={locked}
      animationType="fade"
      // Android back must not dismiss a lock; there is no "close" affordance by design.
      onRequestClose={() => undefined}
      statusBarTranslucent
    >
      {/* Mounted only while locked, so the form, errors and attempt count start clean every time. */}
      {locked ? <LockScreenBody /> : null}
    </Modal>
  );
}

function LockScreenBody() {
  const { unlock, biometric, cooldownUntil, registerFailure } = useAppLock();
  const { user, reauthenticate, signOut } = useAuth();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'password' | 'biometric' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const busyRef = useRef(false);

  const cooldownSeconds = Math.ceil(cooldownRemainingMs(cooldownUntil, now) / 1000);

  // A one-second tick while the lock is on screen, so the cooldown text counts down. The callback
  // starts a timer rather than setting state synchronously in the effect.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const runBiometric = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy('biometric');
    setMessage(null);

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock ElderCare+',
        cancelLabel: 'Use password',
        // The app has its own password fallback; the device PIN is not an app credential.
        disableDeviceFallback: true,
      });

      if (result.success) {
        unlock();
        return;
      }

      if (result.error === 'user_cancel' || result.error === 'system_cancel') {
        setMessage('Use your password to unlock.');
      } else {
        setMessage(
          `That ${biometric.label.toLowerCase()} was not recognised. Try again or use your password.`,
        );
      }
    } catch {
      setMessage('The biometric check could not start. Use your password.');
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }, [biometric.label, unlock]);

  // Ask for the fingerprint as soon as the screen appears. The short delay lets the modal finish
  // animating in first, so the system prompt is not drawn over a half-drawn screen.
  useEffect(() => {
    if (!biometric.available) return;
    const timer = setTimeout(() => {
      void runBiometric();
    }, 250);
    return () => clearTimeout(timer);
  }, [biometric.available, runBiometric]);

  const submitPassword = async () => {
    if (busyRef.current) return;
    if (cooldownSeconds > 0) return;

    if (!password) {
      setMessage('Enter your password.');
      return;
    }

    busyRef.current = true;
    setBusy('password');
    setMessage(null);

    try {
      const result = await reauthenticate(password);

      if (result.ok) {
        unlock();
        return;
      }

      setPassword('');
      setMessage(result.message);
      registerFailure();
    } catch {
      // A thrown auth call (timeout, offline, malformed response) must never leave the lock screen
      // stuck with a dead button; the user gets the message and can try again.
      setMessage('The password could not be checked just now. Please try again.');
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View style={styles.lockBadge}>
          <Icon name="lock" size={36} color={colors.primary} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          ElderCare+ is locked
        </Text>
        <Text style={styles.subtitle}>
          {user ? `For ${user.name}. ` : ''}Unlock to see your medicines and appointments.
        </Text>
      </View>

      <View style={styles.body}>
        {message ? <Banner tone="error" message={message} /> : null}

        {cooldownSeconds > 0 ? (
          <Banner
            tone="error"
            message={`Too many attempts. Try again in ${cooldownSeconds} second${
              cooldownSeconds === 1 ? '' : 's'
            }.`}
          />
        ) : null}

        {biometric.available ? (
          <Button
            label={`Unlock with ${biometric.label.toLowerCase()}`}
            size="large"
            onPress={() => {
              void runBiometric();
            }}
            loading={busy === 'biometric'}
            disabled={busy !== null}
            accessibilityHint="Uses this phone's biometric check. No password is sent."
          />
        ) : null}

        <Field
          label="Password"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            if (message) setMessage(null);
          }}
          isPassword
          placeholder="Your account password"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          returnKeyType="done"
          editable={busy === null && cooldownSeconds === 0}
          onSubmitEditing={() => {
            void submitPassword();
          }}
        />

        <Button
          label="Unlock with password"
          variant={biometric.available ? 'secondary' : 'primary'}
          size="large"
          onPress={() => {
            void submitPassword();
          }}
          loading={busy === 'password'}
          disabled={busy !== null || cooldownSeconds > 0}
        />

        <Text style={styles.policy}>
          The app locks after 2 minutes in the background. {APP_LOCK_MAX_ATTEMPTS} wrong passwords
          pause the keypad for 30 seconds.
        </Text>
      </View>

      <View style={styles.footer}>
        <Button
          label="Sign out instead"
          variant="ghost"
          onPress={() => {
            void signOut();
          }}
          disabled={busy !== null}
          accessibilityHint="Signs out of this account. Your record is not deleted."
        />
      </View>
    </ScrollView>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1,
    },
    content: {
      flexGrow: 1,
      gap: spacing.md,
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    header: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingTop: spacing.sm,
    },
    lockBadge: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 48,
      borderWidth: 1,
      height: 96,
      justifyContent: 'center',
      width: 96,
    },
    title: {
      color: colors.text,
      fontSize: fontSize.title,
      fontWeight: '700',
      lineHeight: lineHeight.title,
      textAlign: 'center',
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: fontSize.body,
      lineHeight: lineHeight.body,
      textAlign: 'center',
    },
    body: {
      gap: spacing.md,
      paddingTop: spacing.md,
    },
    policy: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
      textAlign: 'center',
    },
    footer: {
      paddingTop: spacing.md,
    },
  });
}
