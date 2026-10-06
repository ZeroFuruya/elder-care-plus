import {
  auditTargetLabel,
  describeAuditEvent,
  inventoryAdjustmentLabel,
  type InventoryReason,
  type StockAdjustmentReason,
} from '@eldercare/shared';

import { getSupabase } from '@/supabase/client';

import { getMedicationPlan } from './medications';

/**
 * The `C-12` care-activity timeline (docs/specs/sprint-9.md).
 *
 * A read-only merge of two RLS-scoped sources: the audited care-plan changes
 * (`audit_events`) and the stock ledger (`inventory_transactions`). Both are
 * bounded by a date range and a limit, newest first. The stock rows are joined to
 * their medicine in memory — `listBatchesFor` is fetched for the elder's plan —
 * rather than relying on PostgREST embedded resources.
 *
 * The audit summary is free-form jsonb, so it is always rendered through the
 * shared, bounded presenter; raw ids and JSON never reach the UI.
 */

export type ActivityKind = 'audit' | 'stock';

export interface CareActivity {
  id: string;
  kind: ActivityKind;
  /** The main line: the plain-language action, or the stock movement. */
  title: string;
  /** A secondary line: the target/source, or `null`. */
  subtitle: string | null;
  /** ISO instant, for ordering and the timestamp row. */
  at: string;
}

export interface CareActivityQuery {
  kind?: 'all' | ActivityKind;
  from?: Date;
  to?: Date;
  /** Restrict the stock side to one medicine. */
  medicationId?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 50;

const AUDIT_COLUMNS =
  'id, action, target_table, before_summary, after_summary, created_at' as const;

interface AuditRow {
  id: number;
  action: string;
  target_table: string | null;
  before_summary: unknown;
  after_summary: unknown;
  created_at: string;
}

const STOCK_COLUMNS = 'id, batch_id, delta, reason, adjustment_reason, note, created_at' as const;

interface StockRow {
  id: string;
  batch_id: string;
  delta: number | string;
  reason: string;
  adjustment_reason: string | null;
  note: string | null;
  created_at: string;
}

async function listAuditActivity(
  elderId: string,
  query: CareActivityQuery,
): Promise<CareActivity[]> {
  let builder = getSupabase()
    .from('audit_events')
    .select(AUDIT_COLUMNS)
    .eq('elder_id', elderId)
    .order('created_at', { ascending: false })
    .limit(query.limit ?? DEFAULT_LIMIT);

  if (query.from) builder = builder.gte('created_at', query.from.toISOString());
  if (query.to) builder = builder.lte('created_at', query.to.toISOString());

  const { data, error } = await builder.returns<AuditRow[]>();
  if (error) throw new Error('Could not load the activity.');

  return (data ?? []).map((row) => ({
    id: `audit-${row.id}`,
    kind: 'audit' as const,
    title: describeAuditEvent(row),
    subtitle: auditTargetLabel(row.target_table),
    at: row.created_at,
  }));
}

async function listStockActivity(
  elderId: string,
  query: CareActivityQuery,
): Promise<CareActivity[]> {
  const plan = await getMedicationPlan(elderId);
  const nameByMedication = new Map(plan.medications.map((m) => [m.id, m.name]));

  const batchMeta = new Map<string, { name: string; unit: string }>();
  for (const batch of plan.batches) {
    if (query.medicationId && batch.medicationId !== query.medicationId) continue;
    batchMeta.set(batch.id, {
      name: nameByMedication.get(batch.medicationId) ?? 'Medicine',
      unit: batch.unit,
    });
  }

  const batchIds = [...batchMeta.keys()];
  if (batchIds.length === 0) return [];

  let builder = getSupabase()
    .from('inventory_transactions')
    .select(STOCK_COLUMNS)
    .in('batch_id', batchIds)
    .order('created_at', { ascending: false })
    .limit(query.limit ?? DEFAULT_LIMIT);

  if (query.from) builder = builder.gte('created_at', query.from.toISOString());
  if (query.to) builder = builder.lte('created_at', query.to.toISOString());

  const { data, error } = await builder.returns<StockRow[]>();
  if (error) throw new Error('Could not load the stock history.');

  return (data ?? []).map((row) => {
    const meta = batchMeta.get(row.batch_id);
    const delta = Number(row.delta);
    const reason = row.reason as InventoryReason;
    const adjustment = (row.adjustment_reason ?? null) as StockAdjustmentReason | null;
    const label = inventoryAdjustmentLabel(reason, adjustment);
    const sign = delta > 0 ? '+' : '';

    return {
      id: `stock-${row.id}`,
      kind: 'stock' as const,
      title: `${meta?.name ?? 'Medicine'} ${sign}${delta}${meta?.unit ? ` ${meta.unit}` : ''}`,
      subtitle: row.note ? `${label} - ${row.note}` : label,
      at: row.created_at,
    };
  });
}

/** The merged, newest-first timeline. */
export async function listCareActivity(
  elderId: string,
  query: CareActivityQuery = {},
): Promise<CareActivity[]> {
  const kind = query.kind ?? 'all';
  const limit = query.limit ?? DEFAULT_LIMIT;

  const [audit, stock] = await Promise.all([
    kind === 'stock' ? Promise.resolve<CareActivity[]>([]) : listAuditActivity(elderId, query),
    kind === 'audit' ? Promise.resolve<CareActivity[]>([]) : listStockActivity(elderId, query),
  ]);

  return [...audit, ...stock]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}
