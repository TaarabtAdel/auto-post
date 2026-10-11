import { sqlite as getSqlite } from "@/lib/db";

export function migrateSystemLogSchema() {
  const sqlite = getSqlite();
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS system_log (
      id TEXT PRIMARY KEY NOT NULL,
      created_at INTEGER NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      category TEXT NOT NULL DEFAULT 'cron',
      message TEXT NOT NULL,
      detail_json TEXT
    );
    CREATE INDEX IF NOT EXISTS system_log_created_idx ON system_log (created_at);
    CREATE INDEX IF NOT EXISTS system_log_category_idx ON system_log (category, created_at);
  `);
}
