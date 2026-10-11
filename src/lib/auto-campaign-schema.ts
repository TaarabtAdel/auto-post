import { sqlite as getSqlite } from "@/lib/db";

function addColumnIfMissing(
  sqlite: ReturnType<typeof getSqlite>,
  table: string,
  column: string,
  ddl: string
) {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

export function migrateAutoCampaignSchema() {
  const sqlite = getSqlite();
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS auto_campaign (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '',
      batch_id TEXT,
      youtube_video_id TEXT,
      youtube_url TEXT,
      youtube_title TEXT,
      raw_gemini TEXT,
      times TEXT NOT NULL DEFAULT '',
      caption1 TEXT NOT NULL DEFAULT '',
      caption2 TEXT NOT NULL DEFAULT '',
      caption3 TEXT NOT NULL DEFAULT '',
      post_id1 TEXT,
      post_id2 TEXT,
      post_id3 TEXT,
      source_video_path TEXT,
      background_path TEXT,
      reel_path1 TEXT,
      reel_path2 TEXT,
      reel_path3 TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      error_message TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS auto_campaign_user_idx ON auto_campaign (user_id);
  `);

  addColumnIfMissing(sqlite, "auto_campaign", "wizard_step", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(sqlite, "auto_campaign", "first_comment", "TEXT");
  addColumnIfMissing(sqlite, "auto_campaign", "workspace_app_id", "TEXT");
  addColumnIfMissing(sqlite, "auto_campaign", "facebook_page_ids", "TEXT");
  addColumnIfMissing(sqlite, "auto_campaign", "schedule_hours", "TEXT");
  addColumnIfMissing(sqlite, "auto_campaign", "execute_at", "INTEGER");
  addColumnIfMissing(sqlite, "auto_campaign", "run_mode", "TEXT NOT NULL DEFAULT 'live'");

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS auto_campaign_planned_idx ON auto_campaign (status, execute_at);
  `);
}
