import { useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { ModalCard } from '@/components/modal-card';
import { colors, fontSize, lineHeight } from '@/constants/theme';
import { isLinkingError } from '@/db';

interface SensitiveActionDialogProps {
  visible: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  /** Runs only after a fresh password sign-in. May throw a LinkingError. */
  action: () => Promise<void>;
  onCancel: () => void;
  onSuccess: () => void;
  danger?: boolean;
}

/**
 * The consent / revoke / deactivate flow (Sprint 1b contract 3):
 * confirm intent → enter password → freshly sign in → run the guarded RPC.
 * Nothing client-side asserts re-authentication; the server checks the token.
 */
export function SensitiveActionDialog({
  visible,
  title,
  description,
  confirmLabel,
  action,
  onCancel,
  onSuccess,
  danger = false,
}: SensitiveActionDialogProps) {
  const { user, reauthenticate } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // State updates are async, so a double tap can pass the `busy` check before
  // React re-renders. The ref is the actual lock.
  const busyRef = useRef(false);

  const finish = () => {
    busyRef.current = false;
    setBusy(false);
  };

  const close = () => {
    if (busyRef.current) return;
    setPassword('');
    setError(null);
    onCancel();
  };

  const submit = async () => {
    if (busyRef.current) return;
    if (!password) {
      setError('Enter your password to continue.');
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setError(null);

    const reauth = await reauthenticate(password);
    if (!reauth.ok) {
      finish();
      setError(reauth.message);
      return;
    }

    try {
      await action();
    } catch (cause) {
      finish();
      setPassword('');
      if (isLinkingError(cause) && cause.kind === 'reauth') {
        setError('The password check expired before the action ran. Enter your password again.');
      } else {
        setError(
          cause instanceof Error
            ? cause.message
            : 'The action could not be completed. Please try again.',
        );
      }
      return;
    }

    finish();
    setPassword('');
    setError(null);
    onSuccess();
  };

  return (
    <ModalCard visible={visible} title={title} description={description} onRequestClose={close}>
      {user?.email ? (
        <Text style={styles.email} accessibilityLabel={`Signed in as ${user.email}`}>
          {user.email}
        </Text>
      ) : null}

      <Field
        label="Your password"
        value={password}
        onChangeText={setPassword}
        error={error ?? undefined}
        isPassword
        placeholder="Your password"
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
        returnKeyType="done"
        editable={!busy}
        onSubmitEditing={() => {
          void submit();
        }}
      />

      <Button
        label={confirmLabel}
        variant={danger ? 'danger' : 'primary'}
        onPress={() => {
          void submit();
        }}
        loading={busy}
      />
      <Button label="Cancel" variant="secondary" onPress={close} disabled={busy} />
    </ModalCard>
  );
}

const styles = StyleSheet.create({
  email: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
  },
});
