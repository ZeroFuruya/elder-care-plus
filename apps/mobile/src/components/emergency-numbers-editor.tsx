import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  emergencyCategoryLabels,
  emergencyCategorySchema,
  MIN_PHONE_DIGITS,
  phoneLooksValid,
  type EmergencyCategory,
} from '@eldercare/shared';

import { Banner, type BannerTone } from '@/components/banner';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChoiceChips } from '@/components/choice-chips';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Field } from '@/components/field';
import {
  deactivateEmergencyNumber,
  reorderEmergencyNumbers,
  setEmergencyNumberVerified,
  upsertEmergencyNumber,
  type EmergencyNumber,
} from '@/db';
import {
  fontSize,
  lineHeight,
  radius,
  spacing,
  touchTarget,
  type AppThemeColors,
} from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatDateTime } from '@/lib/format';

/**
 * The caregiver's emergency-contact manager, shared by `A-09` (initial contacts) and `C-11`
 * (every later change). All writes go through the guarded RPCs — this component never touches a
 * table directly (docs/specs/sprint-2.md).
 *
 * Ordering is the priority order the elder sees. Verification is the caregiver's own act and is
 * cleared by the database whenever the name, number or category changes, so a stale "verified"
 * marker can never survive an edit. Contacts are deactivated, never deleted
 * (docs/02-ui-ux-standard.md section 12).
 */

const PHONE_ERROR = `Enter a phone number with at least ${MIN_PHONE_DIGITS} digits`;
const NAME_ERROR = 'Enter a name for this contact.';

const LAST_RESORT_MESSAGE = 'The action could not be completed. Please try again.';

interface EditingState {
  /** Absent while creating a new contact. */
  id?: string;
  category: EmergencyCategory;
  label: string;
  phone: string;
  priority: number;
  isPrimary: boolean;
}

interface EditorErrors {
  label?: string;
  phone?: string;
}

function nextFreeCategory(used: EmergencyCategory[]): EmergencyCategory {
  return (
    emergencyCategorySchema.options.find((category) => !used.includes(category)) ??
    'primary_caregiver'
  );
}

function nextPriority(numbers: EmergencyNumber[]): number {
  return numbers.reduce((highest, number) => Math.max(highest, number.priority + 1), 0);
}

function messageFrom(cause: unknown): string {
  return cause instanceof Error ? cause.message : LAST_RESORT_MESSAGE;
}

interface EmergencyNumbersEditorProps {
  elderId: string;
  /** Active contacts in priority order, as loaded by the screen. */
  numbers: EmergencyNumber[];
  /** Re-reads the record after a successful write. */
  onChanged: () => Promise<void>;
}

export function EmergencyNumbersEditor({
  elderId,
  numbers,
  onChanged,
}: EmergencyNumbersEditorProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [errors, setErrors] = useState<EditorErrors>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: BannerTone; message: string } | null>(null);
  const [confirming, setConfirming] = useState<EmergencyNumber | null>(null);

  const categoryOptions = useMemo(
    () =>
      emergencyCategorySchema.options.map((value) => ({
        value,
        label: emergencyCategoryLabels[value],
      })),
    [],
  );

  function startNew() {
    setErrors({});
    setFeedback(null);
    setEditing({
      category: nextFreeCategory(numbers.map((number) => number.category)),
      label: '',
      phone: '',
      priority: nextPriority(numbers),
      isPrimary: numbers.length === 0,
    });
  }

  function startEdit(number: EmergencyNumber) {
    setErrors({});
    setFeedback(null);
    setEditing({
      id: number.id,
      category: number.category,
      label: number.label,
      phone: number.phone,
      priority: number.priority,
      isPrimary: number.isPrimary,
    });
  }

  function update(patch: Partial<EditingState>) {
    setEditing((current) => (current ? { ...current, ...patch } : current));
  }

  function validateEditing(): EditorErrors {
    if (!editing) return {};
    const next: EditorErrors = {};
    if (editing.label.trim().length === 0) next.label = NAME_ERROR;
    if (!phoneLooksValid(editing.phone)) next.phone = PHONE_ERROR;
    return next;
  }

  function handleBlur(key: 'label' | 'phone') {
    if (!editing) return;
    const message = key === 'label' ? validateEditing().label : validateEditing().phone;
    setErrors((current) => {
      const next = { ...current };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  }

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setFeedback(null);
    try {
      await work();
      await onChanged();
      return true;
    } catch (cause: unknown) {
      setFeedback({ tone: 'error', message: messageFrom(cause) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveEditing() {
    if (!editing) return;
    const nextErrors = validateEditing();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const saved = await run(() =>
      upsertEmergencyNumber(
        elderId,
        {
          category: editing.category,
          label: editing.label.trim(),
          phone: editing.phone.trim(),
          priority: editing.priority,
          isPrimary: editing.isPrimary,
        },
        editing.id,
      ),
    );

    if (saved) setEditing(null);
  }

  async function move(number: EmergencyNumber, delta: -1 | 1) {
    const index = numbers.findIndex((row) => row.id === number.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= numbers.length) return;

    const order = numbers.map((row) => row.id);
    const moved = order[index];
    const displaced = order[target];
    if (!moved || !displaced) return;
    order[index] = displaced;
    order[target] = moved;

    await run(() => reorderEmergencyNumbers(elderId, order));
  }

  async function deactivate() {
    const target = confirming;
    setConfirming(null);
    if (!target) return;
    const deactivated = await run(() => deactivateEmergencyNumber(target.id));
    if (deactivated) setEditing(null);
  }

  return (
    <>
      {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}

      <Card title="Emergency contacts">
        {numbers.length === 0 ? (
          <Text style={styles.empty}>No emergency contacts yet.</Text>
        ) : (
          numbers.map((number, index) => (
            <View key={number.id} style={styles.contact}>
              <Text style={styles.contactCategory}>{emergencyCategoryLabels[number.category]}</Text>
              <Text style={styles.contactLabel}>{number.label}</Text>
              <Text style={styles.contactPhone}>{number.phone}</Text>
              {number.isPrimary ? <Text style={styles.contactPrimary}>Primary contact</Text> : null}
              {number.verifiedAt ? (
                <Text style={styles.contactVerified}>
                  {'Verified by caregiver'}
                  {'\n'}
                  {formatDateTime(number.verifiedAt)}
                </Text>
              ) : null}

              <View style={styles.actions}>
                {number.verifiedAt ? null : (
                  <ActionButton
                    label="Verify"
                    accessibilityLabel={`Verify ${number.label}`}
                    disabled={busy}
                    onPress={() => void run(() => setEmergencyNumberVerified(number.id))}
                  />
                )}
                <ActionButton
                  label="Edit"
                  accessibilityLabel={`Edit ${number.label}`}
                  disabled={busy}
                  onPress={() => startEdit(number)}
                />
                {index > 0 ? (
                  <ActionButton
                    label="Move up"
                    accessibilityLabel={`Move ${number.label} up`}
                    disabled={busy}
                    onPress={() => void move(number, -1)}
                  />
                ) : null}
                {index < numbers.length - 1 ? (
                  <ActionButton
                    label="Move down"
                    accessibilityLabel={`Move ${number.label} down`}
                    disabled={busy}
                    onPress={() => void move(number, 1)}
                  />
                ) : null}
              </View>
            </View>
          ))
        )}

        {editing ? null : <Button label="Add contact" variant="secondary" onPress={startNew} />}
      </Card>

      {editing ? (
        <Card title="Emergency contact">
          <Field
            label="Name"
            value={editing.label}
            onChangeText={(value) => update({ label: value })}
            onBlur={() => handleBlur('label')}
            error={errors.label}
            autoComplete="name"
          />
          <Field
            label="Phone number"
            value={editing.phone}
            onChangeText={(value) => update({ phone: value })}
            onBlur={() => handleBlur('phone')}
            error={errors.phone}
            keyboardType="phone-pad"
            autoComplete="tel"
          />
          <ChoiceChips
            label="Category"
            options={categoryOptions}
            value={editing.category}
            onChange={(value) => update({ category: value })}
          />

          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="Primary contact"
            accessibilityState={{ checked: editing.isPrimary }}
            onPress={() => update({ isPrimary: !editing.isPrimary })}
            style={styles.checkRow}
          >
            <Text style={[styles.checkGlyph, editing.isPrimary ? styles.checkGlyphOn : null]}>
              {editing.isPrimary ? '\u2713' : '\u25CB'}
            </Text>
            <Text style={styles.checkLabel}>Primary contact</Text>
          </Pressable>

          <Button label="Save changes" onPress={() => void saveEditing()} loading={busy} />
          <Button
            label="Cancel"
            variant="secondary"
            disabled={busy}
            onPress={() => {
              setEditing(null);
              setErrors({});
            }}
          />

          {editing.id ? (
            <Button
              label="Deactivate"
              variant="danger"
              disabled={busy}
              onPress={() => {
                const target = numbers.find((number) => number.id === editing.id);
                if (target) setConfirming(target);
              }}
            />
          ) : null}
        </Card>
      ) : null}

      <ConfirmDialog
        visible={confirming !== null}
        title={confirming ? `Deactivate ${confirming.label}?` : ''}
        description="They stay in the record, but the older adult no longer sees them."
        confirmLabel="Deactivate contact"
        danger
        busy={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={() => void deactivate()}
      />
    </>
  );
}

interface ActionButtonProps {
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
}

/** Compact 48 dp action inside a contact row; the visible label is always the action's name. */
function ActionButton({ label, accessibilityLabel, disabled, onPress }: ActionButtonProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: colors.border }}
      style={({ pressed }) => [
        styles.action,
        disabled ? styles.actionDisabled : null,
        pressed && !disabled ? styles.actionPressed : null,
      ]}
    >
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    empty: {
      color: colors.textMuted,
      fontSize: fontSize.body,
      lineHeight: lineHeight.body,
    },
    contact: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.md,
      gap: spacing.xs,
      padding: spacing.md,
    },
    contactCategory: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
    contactLabel: {
      color: colors.text,
      fontSize: fontSize.body,
      fontWeight: '600',
      lineHeight: lineHeight.body,
    },
    contactPhone: {
      color: colors.primary,
      fontSize: fontSize.body,
      lineHeight: lineHeight.body,
    },
    contactPrimary: {
      color: colors.text,
      fontSize: fontSize.caption,
      fontWeight: '700',
      lineHeight: lineHeight.caption,
    },
    contactVerified: {
      color: colors.success,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    action: {
      alignItems: 'center',
      borderColor: colors.borderStrong,
      borderRadius: radius.md,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: touchTarget.min,
      paddingHorizontal: spacing.md,
    },
    actionDisabled: {
      opacity: 0.55,
    },
    actionPressed: {
      opacity: 0.85,
    },
    actionLabel: {
      color: colors.primary,
      fontSize: fontSize.body,
      fontWeight: '600',
      lineHeight: lineHeight.body,
    },
    checkRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
      minHeight: touchTarget.min,
    },
    checkGlyph: {
      color: colors.textMuted,
      fontSize: fontSize.heading,
      lineHeight: lineHeight.heading,
    },
    checkGlyphOn: {
      color: colors.success,
    },
    checkLabel: {
      color: colors.text,
      fontSize: fontSize.body,
      lineHeight: lineHeight.body,
    },
  });
}
