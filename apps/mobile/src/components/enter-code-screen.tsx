import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Banner, type BannerTone } from '@/components/banner';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { colors, fontSize, lineHeight } from '@/constants/theme';
import { redeemCareLinkCode } from '@/db';

interface EnterCodeScreenProps {
  role: 'elder' | 'family_member';
}

const COPY = {
  elder: {
    title: 'Link a caregiver',
    subtitle: 'Enter the six-digit code they gave you',
    intro:
      'Your caregiver creates a code in their app and shares it with you. Entering it links your accounts; afterwards they can set up and follow your medicine plan.',
    success:
      'Your caregiver is linked. Their name now appears on your home screen, and they can follow the doses you confirm.',
    nextLabel: 'Go to my care circle',
    nextRoute: '/elder/circle',
    homeRoute: '/elder',
  },
  family_member: {
    title: 'Enter an invite code',
    subtitle: 'Sent to you by your family caregiver',
    intro:
      'The caregiver who manages the record creates a six-digit code and shares it with you. Entering it asks the older adult to approve your read-only access.',
    success:
      'Your request was sent. The older adult must approve it before you can see their record.',
    nextLabel: 'Go to my home',
    nextRoute: '/family',
    homeRoute: '/family',
  },
} as const;

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Six-digit code entry, shared by the elder (caregiver code) and the family
 * member (invite code). Invalid codes are answered uniformly by the server, so
 * the screen can only repeat one message.
 */
export function EnterCodeScreen({ role }: EnterCodeScreenProps) {
  const copy = COPY[role];

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: BannerTone; text: string } | null>(null);
  const [linked, setLinked] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (cooldownUntil === null) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      // Clear from inside the timer callback so the button re-enables exactly
      // when the server-side window ends.
      if (Date.now() >= cooldownUntil) setCooldownUntil(null);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  const remaining =
    cooldownUntil === null ? 0 : Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  const submit = async () => {
    if (busy || linked || code.length !== 6 || remaining > 0) return;

    setBusy(true);
    setMessage(null);

    try {
      const outcome = await redeemCareLinkCode(code);
      switch (outcome.status) {
        case 'active':
        case 'invited':
          setLinked(true);
          setMessage({ tone: 'success', text: copy.success });
          break;
        case 'revoked':
          setMessage({
            tone: 'error',
            text: 'That code belonged to a link that was removed. Ask your caregiver for a new code.',
          });
          break;
        case 'invalid':
          setMessage({
            tone: 'error',
            text: 'That code is not valid. Check the six digits and try again.',
          });
          break;
        case 'rate_limited':
          setCooldownUntil(Date.now() + outcome.retryAfterSeconds * 1000);
          setCode('');
          break;
      }
    } catch (cause) {
      setMessage({
        tone: 'error',
        text:
          cause instanceof Error
            ? cause.message
            : 'The code could not be checked. Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={copy.title} subtitle={copy.subtitle} showBack>
      <Card>
        <Text style={styles.body}>{copy.intro}</Text>
      </Card>

      {remaining > 0 ? (
        <Banner
          tone="error"
          message={`Too many codes were tried from this account. You can try again in ${formatCountdown(remaining)}.`}
        />
      ) : null}

      {message ? <Banner tone={message.tone} message={message.text} /> : null}

      {linked ? (
        <>
          <Button label={copy.nextLabel} onPress={() => router.replace(copy.nextRoute)} />
          <Button
            label="Back to my home"
            variant="secondary"
            onPress={() => router.replace(copy.homeRoute)}
          />
        </>
      ) : (
        <>
          <Field
            label="Six-digit code"
            value={code}
            onChangeText={(value) => setCode(value.replace(/[^0-9]/g, '').slice(0, 6))}
            placeholder="000000"
            keyboardType="number-pad"
            maxLength={6}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => {
              void submit();
            }}
          />

          <Button
            label="Link accounts"
            onPress={() => {
              void submit();
            }}
            loading={busy}
            disabled={code.length !== 6 || remaining > 0}
          />

          <Text style={styles.note}>
            The code can be used once and expires 24 hours after it is created.
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    color: colors.text,
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
  },
  note: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
  },
});
