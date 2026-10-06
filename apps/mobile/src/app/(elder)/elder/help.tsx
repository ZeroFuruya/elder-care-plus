import { helpRequestCategoryPresentation, helpRequestStatePresentation } from '@eldercare/shared';
import type { HelpRequestCategory } from '@eldercare/shared';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { Banner, type BannerTone } from '@/components/banner';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChoiceChips, type ChoiceOption } from '@/components/choice-chips';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import { StatusPill } from '@/components/status-pill';
import { fontSize, lineHeight, spacing, type AppThemeColors } from '@/constants/theme';
import { cancelHelpRequest, createHelpRequest, listHelpRequests, type HelpRequest } from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { formatDateTime } from '@/lib/format';

const CATEGORY_OPTIONS: ChoiceOption<HelpRequestCategory>[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'practical', label: 'Practical' },
  { value: 'companionship', label: 'Companionship' },
];

/**
 * `E-Help` Elder Ask for Help (docs/specs/sprint-8.md, Flow F).
 *
 * The older adult raises a request for their circle and can withdraw one that is still open or
 * accepted. Confirmed state changes are timestamped by the database; nothing is hard-deleted.
 */
export default function ElderHelpScreen() {
  const user = useSessionUser();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const loader = useCallback(() => listHelpRequests(user.id), [user.id]);
  const { state, refreshing, reload } = useAsyncData(loader);

  const [category, setCategory] = useState<HelpRequestCategory>('practical');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<HelpRequest | null>(null);
  const [banner, setBanner] = useState<{ tone: BannerTone; message: string } | null>(null);

  async function send() {
    setSending(true);
    setBanner(null);
    try {
      await createHelpRequest(category, note.trim() || null);
      setNote('');
      setBanner({ tone: 'success', message: 'Your family and caregiver have been asked.' });
      reload();
    } catch (error) {
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not send. Try again.',
      });
    } finally {
      setSending(false);
    }
  }

  async function cancel(request: HelpRequest) {
    setCancelTarget(null);
    try {
      await cancelHelpRequest(request.id);
      setBanner({ tone: 'success', message: 'That request was withdrawn.' });
      reload();
    } catch (error) {
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not withdraw. Try again.',
      });
    }
  }

  if (state.status === 'loading') return <LoadingScreen message="Loading your requests…" />;
  if (state.status === 'error') {
    return <ScreenError title="Ask for help" showBack message={state.message} onRetry={reload} />;
  }

  const requests = state.data;
  const openCount = requests.filter(
    (request) => request.state === 'open' || request.state === 'accepted',
  ).length;

  return (
    <Screen
      title="Ask for help"
      subtitle="Your family and caregiver are told"
      showBack
      safeBottom
      onRefresh={reload}
      refreshing={refreshing}
    >
      {banner ? <Banner tone={banner.tone} message={banner.message} /> : null}

      <Card title="What do you need?">
        <ChoiceChips
          label="Kind of help"
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={setCategory}
        />
        <Field
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          placeholder="e.g. I need a ride to the clinic on Friday"
          maxLength={500}
        />
        <Button label="Ask for help" loading={sending} onPress={() => void send()} />
      </Card>

      <Text style={styles.sectionHeading}>
        {openCount > 0 ? `Open requests (${openCount})` : 'Your requests'}
      </Text>

      {requests.length === 0 ? (
        <EmptyState
          title="No requests yet"
          description="When you ask for help, it appears here until someone answers."
        />
      ) : (
        requests.map((request) => {
          const categoryPresentation = helpRequestCategoryPresentation[request.category];
          const requestState = helpRequestStatePresentation[request.state];
          const canCancel = request.state === 'open' || request.state === 'accepted';

          return (
            <Card key={request.id}>
              <View style={styles.pillRow}>
                <StatusPill presentation={categoryPresentation} />
                <StatusPill presentation={requestState} />
              </View>
              <Text style={styles.note}>{request.note ?? 'No note'}</Text>
              <Text style={styles.meta}>Asked {formatDateTime(request.createdAt)}</Text>
              {request.acceptedByName ? (
                <Text style={styles.meta}>{request.acceptedByName} is helping.</Text>
              ) : null}
              {canCancel ? (
                <Button
                  label="Withdraw"
                  variant="secondary"
                  onPress={() => setCancelTarget(request)}
                />
              ) : null}
            </Card>
          );
        })
      )}

      <ConfirmDialog
        visible={cancelTarget !== null}
        title="Withdraw this request?"
        description="Your family and caregiver will see that you no longer need help with this."
        confirmLabel="Withdraw"
        danger
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => {
          if (cancelTarget) void cancel(cancelTarget);
        }}
      />
    </Screen>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    sectionHeading: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      fontWeight: '700',
      lineHeight: lineHeight.caption,
      paddingTop: spacing.sm,
      textTransform: 'uppercase',
    },
    pillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    note: {
      color: colors.text,
      fontSize: fontSize.body,
      lineHeight: lineHeight.body,
      paddingTop: spacing.sm,
    },
    meta: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
  });
}
