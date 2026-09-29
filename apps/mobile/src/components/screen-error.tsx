import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';

interface ScreenErrorProps {
  title: string;
  message: string;
  onRetry: () => void;
  showBack?: boolean;
  showBell?: boolean;
  safeBottom?: boolean;
}

/**
 * Load failure with a visible retry (docs/specs/sprint-1b.md contract 5):
 * a network glitch must never leave a screen with no way forward.
 */
export function ScreenError({
  title,
  message,
  onRetry,
  showBack,
  showBell,
  safeBottom,
}: ScreenErrorProps) {
  return (
    <Screen
      title={title}
      showBack={showBack}
      showBell={showBell}
      onRefresh={onRetry}
      safeBottom={safeBottom}
    >
      <Banner tone="error" message={message} />
      <Button label="Try again" variant="secondary" onPress={onRetry} />
    </Screen>
  );
}
