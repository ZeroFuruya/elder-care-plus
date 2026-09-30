import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { Banner, type BannerTone } from '@/components/banner';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import { SensitiveActionDialog } from '@/components/sensitive-action-dialog';
import { fontSize, lineHeight, spacing, type AppThemeColors } from '@/constants/theme';
import {
  createElderLinkInvite,
  getLinkedElder,
  inviteFamilyMember,
  isLinkingError,
  listMyInvites,
  revokeCareLink,
  type MyInvite,
  type MyLink,
} from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { formatDateTime } from '@/lib/format';

interface LinkData {
  link: MyLink | null;
  invites: MyInvite[];
}

interface IssuedCode {
  code: string;
  kind: 'elder' | 'family_member';
}

function messageFor(cause: unknown): string {
  if (isLinkingError(cause)) return cause.message;
  if (cause instanceof Error) return cause.message;
  return 'The action could not be completed. Please try again.';
}

function inviteState(invite: MyInvite): string {
  if (invite.consumedAt) return `Redeemed ${formatDateTime(invite.consumedAt)}`;
  if (invite.expired) return 'Expired';
  return `Open · expires ${formatDateTime(invite.expiresAt)}`;
}

/** Caregiver side of the care circle: the elder link code, family invites, revoke. */
export default function CaregiverLinkScreen() {
  const user = useSessionUser();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const loader = useCallback(async (): Promise<LinkData> => {
    const [link, invites] = await Promise.all([getLinkedElder(user.id), listMyInvites(user.id)]);
    return { link, invites };
  }, [user.id]);
  const { state, refreshing, reload } = useAsyncData(loader);

  const [issued, setIssued] = useState<IssuedCode | null>(null);
  const [familyEmail, setFamilyEmail] = useState('');
  const [busy, setBusy] = useState<'elder' | 'family_member' | null>(null);
  const [banner, setBanner] = useState<{ tone: BannerTone; message: string } | null>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [revoking, setRevoking] = useState(false);
  // State is async: a double tap can pass the `busy` check before React
  // re-renders, so the ref is the real lock (two codes must not be issued).
  const busyRef = useRef(false);

  const createElderCode = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy('elder');
    setBanner(null);
    try {
      const code = await createElderLinkInvite();
      setIssued({ code, kind: 'elder' });
      await reload();
    } catch (cause) {
      setBanner({ tone: 'error', message: messageFor(cause) });
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const createFamilyCode = async () => {
    if (busyRef.current) return;
    const email = familyEmail.trim();
    if (!/.+@.+\..+/.test(email)) {
      setBanner({ tone: 'error', message: 'Enter the family member’s email address first.' });
      return;
    }

    busyRef.current = true;
    setBusy('family_member');
    setBanner(null);
    try {
      const code = await inviteFamilyMember(email);
      setIssued({ code, kind: 'family_member' });
      setFamilyEmail('');
      await reload();
    } catch (cause) {
      setBanner({ tone: 'error', message: messageFor(cause) });
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  if (state.status === 'loading') return <LoadingScreen message="Loading your care links…" />;
  if (state.status === 'error') {
    return <ScreenError title="Care links" showBack message={state.message} onRetry={reload} />;
  }

  const { link, invites } = state.data;

  return (
    <Screen
      title="Care links"
      subtitle="Codes and invites"
      showBack
      onRefresh={reload}
      refreshing={refreshing}
    >
      {banner ? <Banner tone={banner.tone} message={banner.message} /> : null}

      {issued ? (
        <Card title="Share this code now">
          <Text style={styles.code}>{issued.code}</Text>
          <Text style={styles.body}>
            {issued.kind === 'elder'
              ? 'Give this code to the older adult. They enter it in their app to link to you.'
              : 'Give this code to your family member. They enter it in their app, then the older adult approves their access.'}
          </Text>
          <Text style={styles.note}>
            Single use · expires 24 hours after creation · it is never shown again.
          </Text>
          <Button
            label="I have written it down"
            variant="secondary"
            onPress={() => setIssued(null)}
          />
        </Card>
      ) : null}

      {link ? (
        <Card title="Linked older adult">
          <Text style={styles.name}>{link.elderName ?? 'Your older adult'}</Text>
          <Text style={styles.body}>Their medicine plan is managed from the Meds tab.</Text>
          <Button
            label="Remove this link"
            variant="secondary"
            onPress={() => setConfirmingRevoke(true)}
            accessibilityHint="Asks for confirmation and your password before removing the link"
          />
        </Card>
      ) : (
        <Card title="Link an older adult">
          <Text style={styles.body}>
            Create a six-digit code and give it to the older adult. When they enter it, their
            account links to yours and their dashboard appears here.
          </Text>
          <Button
            label="Create a link code"
            onPress={() => {
              void createElderCode();
            }}
            loading={busy === 'elder'}
            disabled={issued !== null}
          />
        </Card>
      )}

      {link ? (
        <Card title="Invite a family member">
          <Text style={styles.body}>
            They get read-only access after the older adult approves. Bind the invite to their email
            address so only that account can use it.
          </Text>
          <Field
            label="Their email address"
            value={familyEmail}
            onChangeText={setFamilyEmail}
            placeholder="name@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <Button
            label="Create an invite code"
            onPress={() => {
              void createFamilyCode();
            }}
            loading={busy === 'family_member'}
            disabled={familyEmail.trim().length === 0 || issued !== null}
          />
        </Card>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your invites</Text>
        {invites.length === 0 ? (
          <EmptyState
            title="No invites yet"
            description="Codes you create appear here with their state."
          />
        ) : (
          invites.map((invite) => (
            <Card key={invite.id}>
              <Text style={styles.name}>
                {invite.grantsMemberRole === 'caregiver'
                  ? 'Link code for an older adult'
                  : 'Family member invite'}
              </Text>
              <Text style={styles.body}>
                {invite.inviteeEmail ?? 'Any account can use this code'}
              </Text>
              <Text style={styles.note}>{inviteState(invite)}</Text>
            </Card>
          ))
        )}
      </View>

      <ConfirmDialog
        visible={confirmingRevoke}
        title="Remove the link to this older adult?"
        description="Their record stays in the system and keeps its history, but your account will no longer see it. You can link again with a new code."
        confirmLabel="Remove link"
        danger
        onCancel={() => setConfirmingRevoke(false)}
        onConfirm={() => {
          setConfirmingRevoke(false);
          setRevoking(true);
        }}
      />

      {link ? (
        <SensitiveActionDialog
          visible={revoking}
          title="Enter your password"
          description="For your safety, removing a care link needs your password. The history is kept."
          confirmLabel="Remove link"
          danger
          action={() => revokeCareLink(link.linkId)}
          onCancel={() => setRevoking(false)}
          onSuccess={() => {
            setRevoking(false);
            setBanner({ tone: 'success', message: 'The care link was removed.' });
            void reload();
          }}
        />
      ) : null}
    </Screen>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    code: {
      color: colors.text,
      fontSize: fontSize.title,
      fontWeight: '700',
      letterSpacing: 8,
      lineHeight: lineHeight.title,
      textAlign: 'center',
    },
    name: {
      color: colors.text,
      fontSize: fontSize.body,
      fontWeight: '700',
      lineHeight: lineHeight.body,
    },
    body: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
    note: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
      paddingTop: spacing.xs,
    },
    section: {
      gap: spacing.sm,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: fontSize.caption,
      fontWeight: '700',
      lineHeight: lineHeight.caption,
      textTransform: 'uppercase',
    },
  });
}
