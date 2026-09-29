import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { spacing } from '@/constants/theme';

interface LogoutButtonProps {
  size?: 'default' | 'large';
}

/**
 * Sign out with an in-app confirmation that names the action and states the
 * consequence (docs/02-ui-ux-standard.md: never "Yes", never an unedited
 * "Are you sure?"). The confirmation renders in-app, never as a system dialog.
 */
export function LogoutButton({ size = 'default' }: LogoutButtonProps) {
  const { signOut } = useAuth();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button
        label="Sign out"
        variant="danger"
        size={size}
        onPress={() => setConfirming(true)}
        accessibilityHint="Asks for confirmation before signing out"
        style={styles.button}
      />

      <ConfirmDialog
        visible={confirming}
        title="Sign out?"
        description="You will need your email and password to sign in again on this device."
        confirmLabel="Sign out"
        danger
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void signOut();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    marginTop: spacing.xs,
  },
});
