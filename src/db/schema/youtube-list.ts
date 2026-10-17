import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

/** Danh sách video YouTube theo user (đồng bộ giữa các máy). */
export const youtubeList = sqliteTable(
  "youtube_list",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    videoId: text("video_id").notNull(),
    title: text("title").notNull().default(""),
    channel: text("channel").notNull().default(""),
    durationSec: integer("duration_sec").notNull().default(0),
    url: text("url").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("youtube_list_user_video_idx").on(table.userId, table.videoId),
    index("youtube_list_user_sort_idx").on(table.userId, table.sortOrder),
  ]
);
