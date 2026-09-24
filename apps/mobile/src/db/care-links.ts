import { getDatabase } from './database';

export interface CareLink {
  caregiverId: string;
  elderId: string;
  elderName: string;
}

export async function linkCaregiverToElder(caregiverId: string, elderId: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT OR IGNORE INTO care_links (caregiver_id, elder_id, status, created_at)
     VALUES (?, ?, 'active', ?)`,
    caregiverId,
    elderId,
    new Date().toISOString(),
  );
}

export async function getLinkedElder(caregiverId: string): Promise<CareLink | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{
    caregiver_id: string;
    elder_id: string;
    name: string;
  }>(
    `SELECT l.caregiver_id, l.elder_id, u.name
       FROM care_links l
       JOIN users u ON u.id = l.elder_id
      WHERE l.caregiver_id = ? AND l.status = 'active'
      ORDER BY l.created_at ASC
      LIMIT 1`,
    caregiverId,
  );

  if (!row) return null;
  return { caregiverId: row.caregiver_id, elderId: row.elder_id, elderName: row.name };
}
