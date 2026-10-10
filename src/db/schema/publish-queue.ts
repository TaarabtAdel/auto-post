import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { post } from "./post";
import { facebookPage } from "./facebook-page";

export const publishQueue = sqliteTable(
  "publish_queue",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    postId: text("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    facebookPageId: text("facebook_page_id").references(() => facebookPage.id, {
      onDelete: "set null",
    }),
    batchId: text("batch_id").notNull(),
    queueOrder: integer("queue_order").notNull().default(0),
    scheduledAt: integer("scheduled_at", { mode: "timestamp_ms" }).notNull(),
    status: text("status").notNull().default("pending"), // pending | processing | completed | failed
    errorMessage: text("error_message"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("publish_queue_status_scheduled_idx").on(
      table.status,
      table.scheduledAt,
      table.queueOrder
    ),
    index("publish_queue_batch_idx").on(table.batchId),
  ]
);
