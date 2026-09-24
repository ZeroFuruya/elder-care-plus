import { Alert, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { useAuth } from '@/auth/auth-context';
import { spacing } from '@/constants/theme';

interface LogoutButtonProps {
  size?: 'default' | 'large';
}

/**
 * Sign out with the required confirmation: "Are you sure you want to logout/sign out?"
 * Nothing happens until the user taps the confirm action.
 */
export function LogoutButton({ size = 'default' }: LogoutButtonProps) {
  const { signOut } = useAuth();

  const confirmSignOut = () => {
    Alert.alert(
      'Sign out',
      'Are you sure you want to logout/sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, sign out', style: 'destructive', onPress: signOut },
      ],
      { cancelable: true },
    );
  };

  return (
    <Button
      label="Log out"
      variant="danger"
      size={size}
      onPress={confirmSignOut}
      accessibilityHint="Asks for confirmation before signing out"
      style={styles.button}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    marginTop: spacing.xs,
  },
});
