import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { Banner, type BannerTone } from '@/components/banner';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChoiceChips, type ChoiceOption } from '@/components/choice-chips';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import { fontSize, lineHeight, spacing, type AppThemeColors } from '@/constants/theme';
import {
  getLinkedElder,
  listAvailability,
  setMemberAvailability,
  type MemberAvailability,
} from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';

const AVAILABILITY_OPTIONS: ChoiceOption<'available' | 'not_available'>[] = [
  { value: 'available', label: 'Available' },
  { value: 'not_available', label: 'Not available' },
];

interface AvailabilityData {
  elderId: string;
  availability: MemberAvailability[];
}

/**
 * `F-15` Family Availability (docs/specs/sprint-8.md).
 *
 * A member sets their own Available / Not available toggle and an optional short note for the
 * linked elder. The circle reads it on `F-14`; no member can edit anyone else's.
 */
export default function FamilyAvailabilityScreen() {
  const user = useSessionUser();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const loader = useCallback(async (): Promise<AvailabilityData | null> => {
    const link = await getLinkedElder(user.id);
    if (!link) return null;
    const availability = await listAvailability(link.elderId);
    return { elderId: link.elderId, availability };
  }, [user.id]);

  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Loading availability…" />;
  if (state.status === 'error') {
    return <ScreenError title="Availability" message={state.message} onRetry={reload} />;
  }

  if (state.data === null) {
    return (
      <Screen title="Availability" showBack>
        <EmptyState
          title="No record is shared with you"
          description="Ask your family caregiver for a six-digit invite code, then enter it on the Home tab."
        />
      </Screen>
    );
  }

  const { elderId, availability } = state.data;
  const mine = availability.find((row) => row.memberId === user.id);
  const others = availability.filter((row) => row.memberId !== user.id && row.isAvailable);

  return (
    <Screen
      title="Availability"
      subtitle="Help the circle plan"
      showBack
      safeBottom
      onRefresh={reload}
      refreshing={refreshing}
    >
      {/* The key remounts the form when the server value changes, so its local state is always
          initialised from the latest read without a setState-in-effect. */}
      <AvailabilityForm
        key={mine ? mine.updatedAt : 'new'}
        elderId={elderId}
        initialAvailable={mine?.isAvailable ?? true}
        initialNote={mine?.note ?? null}
        onSaved={reload}
      />

      <Card title="Who is available">
        {others.length === 0 ? (
          <Text style={styles.body}>No one else has marked themselves available.</Text>
        ) : (
          others.map((row) => (
            <Text key={row.memberId} style={styles.body}>
              {row.memberLabel}
              {row.note ? ` — ${row.note}` : ''}
            </Text>
          ))
        )}
      </Card>
    </Screen>
  );
}

function AvailabilityForm({
  elderId,
  initialAvailable,
  initialNote,
  onSaved,
}: {
  elderId: string;
  initialAvailable: boolean;
  initialNote: string | null;
  onSaved: () => void;
}) {
  const [availability, setAvailability] = useState<'available' | 'not_available'>(
    initialAvailable ? 'available' : 'not_available',
  );
  const [note, setNote] = useState(initialNote ?? '');
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ tone: BannerTone; message: string } | null>(null);

  async function save() {
    setSaving(true);
    setBanner(null);
    try {
      await setMemberAvailability(elderId, availability === 'available', note.trim() || null);
      setBanner({ tone: 'success', message: 'Your availability is saved.' });
      onSaved();
    } catch (error) {
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not save. Try again.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="My availability">
      {banner ? <Banner tone={banner.tone} message={banner.message} /> : null}
      <ChoiceChips
        label="I am"
        options={AVAILABILITY_OPTIONS}
        value={availability}
        onChange={setAvailability}
      />
      <Field
        label="Note (optional)"
        value={note}
        onChangeText={setNote}
        placeholder="e.g. free on weekend mornings"
        maxLength={200}
      />
      <Button label="Save availability" loading={saving} onPress={() => void save()} />
    </Card>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    body: {
      color: colors.text,
      fontSize: fontSize.body,
      lineHeight: lineHeight.body,
      paddingVertical: spacing.xs,
    },
  });
}
