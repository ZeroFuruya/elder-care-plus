import { useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SensitiveActionDialog } from '@/components/sensitive-action-dialog';
import { fontSize, lineHeight, type AppThemeColors } from '@/constants/theme';
import { deactivateAccount } from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';

/**
 * Deactivation is a soft delete: links are revoked and history is kept. It needs
 * a confirmation plus a fresh password, then signs the account out.
 */
export function DeactivateAccount() {
  const { signOut } = useAuth();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [confirming, setConfirming] = useState(false);
  const [prompting, setPrompting] = useState(false);

  return (
    <Card title="Deactivate account">
      <Text style={styles.body}>
        Deactivating signs you out, removes your care links and keeps all medical history. The
        account cannot sign in again.
      </Text>

      <Button
        label="Deactivate my account"
        variant="secondary"
        onPress={() => setConfirming(true)}
        accessibilityHint="Asks for confirmation and your password before deactivating"
      />

      <ConfirmDialog
        visible={confirming}
        title="Deactivate your account?"
        description="Your care links are removed, the history is kept, and this account can no longer sign in."
        confirmLabel="Continue"
        danger
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          setPrompting(true);
        }}
      />

      <SensitiveActionDialog
        visible={prompting}
        title="Enter your password"
        description="For your safety, deactivating an account needs your password. You will be signed out afterwards."
        confirmLabel="Deactivate account"
        danger
        action={() => deactivateAccount('deactivated from the app')}
        onCancel={() => setPrompting(false)}
        onSuccess={() => {
          setPrompting(false);
          void signOut();
        }}
      />
    </Card>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    body: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
  });
}
