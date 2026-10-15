import { sqlite as getSqlite } from "@/lib/db";

const KEY_INTERVAL = "publish_page_interval_minutes";
const DEFAULT_INTERVAL_MINUTES = 15;
const MIN_INTERVAL = 1;
const MAX_INTERVAL = 120;

export function migratePublishSettingsSchema() {
  const sqlite = getSqlite();
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS app_setting (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
}

function parseInterval(raw: string | undefined): number {
  const n = parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL_MINUTES;
  return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, n));
}

export function getPublishPageIntervalMinutes(): number {
  migratePublishSettingsSchema();
  const sqlite = getSqlite();
  const row = sqlite
    .prepare(`SELECT value FROM app_setting WHERE key = ?`)
    .get(KEY_INTERVAL) as { value: string } | undefined;
  return parseInterval(row?.value);
}

export function setPublishPageIntervalMinutes(minutes: number): number {
  migratePublishSettingsSchema();
  const value = parseInterval(String(minutes));
  const sqlite = getSqlite();
  sqlite
    .prepare(
      `INSERT INTO app_setting (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(KEY_INTERVAL, String(value));
  return value;
}

/** scheduledAt cho từng Page trong cùng bài (queueOrder 0 = giờ gốc). */
export function scheduledAtForPageInBatch(
  base: Date,
  queueOrder: number
): Date {
  const intervalMs = getPublishPageIntervalMinutes() * 60_000;
  return new Date(base.getTime() + queueOrder * intervalMs);
}

export function getPublishPageIntervalMs(): number {
  return getPublishPageIntervalMinutes() * 60_000;
}
