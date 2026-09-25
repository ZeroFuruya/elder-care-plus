import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { Banner, type BannerTone } from '@/components/banner';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { StatusBadge } from '@/components/status-badge';
import { colors, fontSize, lineHeight, radius, spacing, touchTarget } from '@/constants/theme';
import { createDose, getLinkedElder, listMedicines, type DoseView } from '@/db';
import { useAsyncData } from '@/hooks/use-async-data';
import { formatTime } from '@/lib/format';

interface MedsData {
  elderName: string | null;
  elderId: string | null;
  medicines: { medicine: string; strength: string; instructions: string; next: DoseView }[];
}

export default function CaregiverMedsScreen() {
  const user = useSessionUser();

  const loader = useCallback(async (): Promise<MedsData> => {
    const link = await getLinkedElder(user.id);
    if (!link) return { elderName: null, elderId: null, medicines: [] };
    return {
      elderName: link.elderName,
      elderId: link.elderId,
      medicines: await listMedicines(link.elderId),
    };
  }, [user.id]);

  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Loading medicines…" />;
  if (state.status === 'error') {
    return (
      <Screen title="Meds">
        <Banner tone="error" message={state.message} />
      </Screen>
    );
  }

  const { elderName, elderId, medicines } = state.data;

  return (
    <Screen
      title="Meds"
      subtitle={elderName ? `Taken by ${elderName}` : 'No older adult linked'}
      onRefresh={reload}
      refreshing={refreshing}
    >
      {elderId ? <AddMedicineForm elderId={elderId} onAdded={reload} /> : null}

      {medicines.length === 0 ? (
        <EmptyState
          title="No medicines yet"
          description="Medicines added for the linked older adult appear here with their next scheduled dose."
        />
      ) : (
        medicines.map((entry) => (
          <View key={`${entry.medicine}-${entry.strength}`} style={styles.card}>
            <View style={styles.top}>
              <Text style={styles.medicine}>
                {entry.medicine} {entry.strength}
              </Text>
              <StatusBadge status={entry.next.status} />
            </View>
            <Text style={styles.instructions}>{entry.instructions}</Text>
            <Text style={styles.meta}>
              {entry.next.status === 'due' || entry.next.status === 'upcoming'
                ? 'Next dose at'
                : 'Most recent dose'}{' '}
              {formatTime(entry.next.scheduledAt)}
            </Text>
          </View>
        ))
      )}

      <Text style={styles.note}>
        Medicine details are entered by the caregiver and are never generated or suggested by the
        application.
      </Text>
    </Screen>
  );
}

const WHEN_OPTIONS = [
  { key: 'now', label: 'Due now', offsetMinutes: 0 },
  { key: 'soon', label: 'In 30 min', offsetMinutes: 30 },
  { key: 'later', label: 'In 2 hours', offsetMinutes: 120 },
] as const;

type WhenKey = (typeof WHEN_OPTIONS)[number]['key'];

interface AddMedicineProps {
  elderId: string;
  onAdded: () => Promise<void>;
}

/**
 * The caregiver's write path: sets the next dose for the linked older adult. The application only
 * stores what the caregiver types — it never suggests a medicine, a strength or a dose
 * (docs/00-product-flow.md, hard rules).
 */
function AddMedicineForm({ elderId, onAdded }: AddMedicineProps) {
  const [medicine, setMedicine] = useState('');
  const [strength, setStrength] = useState('');
  const [instructions, setInstructions] = useState('');
  const [when, setWhen] = useState<WhenKey>('now');
  const [errors, setErrors] = useState<{ medicine?: string; strength?: string }>({});
  const [banner, setBanner] = useState<{ tone: BannerTone; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;

    const nextErrors: { medicine?: string; strength?: string } = {};
    if (!medicine.trim()) nextErrors.medicine = 'Enter the medicine name.';
    if (!strength.trim()) nextErrors.strength = 'Enter the strength, for example 500 mg.';
    setErrors(nextErrors);
    if (nextErrors.medicine || nextErrors.strength) return;

    const offsetMinutes = WHEN_OPTIONS.find((option) => option.key === when)?.offsetMinutes ?? 0;
    setSaving(true);
    setBanner(null);

    try {
      await createDose({
        elderId,
        medicine: medicine.trim(),
        strength: strength.trim(),
        instructions: instructions.trim() || 'No special instructions.',
        scheduledAt: new Date(Date.now() + offsetMinutes * 60_000),
      });

      const saved = `${medicine.trim()} ${strength.trim()}`;
      setMedicine('');
      setStrength('');
      setInstructions('');
      setBanner({
        tone: 'success',
        message: `${saved} saved. The older adult will see it on their Today screen.`,
      });
      await onAdded();
    } catch (error: unknown) {
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not save that medicine.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Add a medicine</Text>
      <Text style={styles.sectionHint}>
        Sets the next dose for the linked older adult. The app never suggests a medicine or a dose.
      </Text>

      {banner ? <Banner tone={banner.tone} message={banner.message} /> : null}

      <Field
        label="Medicine"
        value={medicine}
        onChangeText={setMedicine}
        placeholder="e.g. Metformin"
        autoCapitalize="words"
        error={errors.medicine}
      />
      <Field
        label="Strength"
        value={strength}
        onChangeText={setStrength}
        placeholder="e.g. 500 mg"
        error={errors.strength}
      />
      <Field
        label="Instructions (optional)"
        value={instructions}
        onChangeText={setInstructions}
        placeholder="e.g. One tablet with food."
        autoCapitalize="sentences"
      />

      <Text style={styles.label}>Next dose</Text>
      <View style={styles.whenRow}>
        {WHEN_OPTIONS.map((option) => {
          const selected = option.key === when;
          return (
            <Pressable
              key={option.key}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`Next dose ${option.label}`}
              onPress={() => setWhen(option.key)}
              android_ripple={{ color: colors.border }}
              style={[styles.chip, selected ? styles.chipSelected : null]}
            >
              <Text style={[styles.chipLabel, selected ? styles.chipLabelSelected : null]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Button
        label="Save medicine"
        loading={saving}
        onPress={() => {
          void submit();
        }}
        accessibilityHint="Schedules the next dose for the linked older adult"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  top: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  medicine: {
    color: colors.text,
    flex: 1,
    fontSize: fontSize.body,
    fontWeight: '700',
    lineHeight: lineHeight.body,
  },
  instructions: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
  },
  meta: {
    color: colors.text,
    fontSize: fontSize.caption,
    fontWeight: '600',
    lineHeight: lineHeight.caption,
  },
  note: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.heading,
    fontWeight: '700',
    lineHeight: lineHeight.heading,
  },
  sectionHint: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
  },
  label: {
    color: colors.text,
    fontSize: fontSize.caption,
    fontWeight: '600',
    lineHeight: lineHeight.caption,
  },
  whenRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.md,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipLabel: {
    color: colors.primary,
    fontSize: fontSize.caption,
    fontWeight: '600',
    lineHeight: lineHeight.caption,
  },
  chipLabelSelected: {
    color: colors.surface,
  },
});
