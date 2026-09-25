import { getDatabase } from './database';

export interface TableDump {
  name: string;
  /** Total rows in the table, not just the ones returned. */
  rowCount: number;
  columns: string[];
  rows: string[][];
}

/** Columns for a table, used when it has no rows to read key order from. */
async function listColumns(table: string): Promise<string[]> {
  const database = await getDatabase();
  const columns = await database.getAllAsync<{ name: string }>(`PRAGMA table_info("${table}")`);
  return columns.map((column) => column.name);
}

const MAX_CELL = 48;

function formatCell(column: string, value: unknown): string {
  if (value === null || value === undefined) return '—';
  const text = String(value);
  // Never surface a full credential hash, even in the demo viewer.
  if (column === 'password_hash') return `${text.slice(0, 12)}…`;
  return text.length > MAX_CELL ? `${text.slice(0, MAX_CELL)}…` : text;
}

/**
 * Read-only dump of the on-device SQLite tables, for the demo's "show me the database" screen.
 * It only ever runs SELECT/PRAGMA, most-recently-inserted rows first, capped so the screen stays
 * usable. There is no write path here.
 */
export async function inspectDatabase(limit = 25): Promise<TableDump[]> {
  const database = await getDatabase();
  const tables = await database.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name`,
  );

  const dumps: TableDump[] = [];

  for (const { name } of tables) {
    const count = await database.getFirstAsync<{ total: number }>(
      `SELECT COUNT(*) AS total FROM "${name}"`,
    );
    const raw = await database.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM "${name}" ORDER BY rowid DESC LIMIT ?`,
      limit,
    );
    const columns = raw.length > 0 ? Object.keys(raw[0]) : await listColumns(name);

    dumps.push({
      name,
      rowCount: count?.total ?? 0,
      columns,
      rows: raw.map((row) => columns.map((column) => formatCell(column, row[column]))),
    });
  }

  return dumps;
}
