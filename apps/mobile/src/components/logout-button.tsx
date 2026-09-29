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
 * Sign out with the required confirmation: "Are you sure you want to logout/sign out?"
 * The confirmation renders in-app, never as a system dialog.
 */
export function LogoutButton({ size = 'default' }: LogoutButtonProps) {
  const { signOut } = useAuth();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button
        label="Log out"
        variant="danger"
        size={size}
        onPress={() => setConfirming(true)}
        accessibilityHint="Asks for confirmation before signing out"
        style={styles.button}
      />

      <ConfirmDialog
        visible={confirming}
        title="Sign out"
        description="Are you sure you want to logout/sign out?"
        confirmLabel="Yes, sign out"
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
