import { sqlite as getSqlite } from "@/lib/db";

export function migrateYoutubeListSchema() {
  const sqlite = getSqlite();
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS youtube_list (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      video_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      channel TEXT NOT NULL DEFAULT '',
      duration_sec INTEGER NOT NULL DEFAULT 0,
      url TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
      updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS youtube_list_user_video_idx
      ON youtube_list (user_id, video_id);
    CREATE INDEX IF NOT EXISTS youtube_list_user_sort_idx
      ON youtube_list (user_id, sort_order);
  `);
}
