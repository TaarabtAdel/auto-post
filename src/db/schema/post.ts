import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { facebookPage } from "./facebook-page";

export const post = sqliteTable("post", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  facebookPageId: text("facebook_page_id").references(() => facebookPage.id, {
    onDelete: "set null",
  }),
  content: text("content").notNull().default(""),
  status: text("status").notNull().default("draft"), // draft | scheduled | posting | posted | failed
  scheduledAt: integer("scheduled_at", { mode: "timestamp_ms" }),
  postedAt: integer("posted_at", { mode: "timestamp_ms" }),
  fbPostId: text("fb_post_id"), // Facebook post ID after successful publish
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const postMedia = sqliteTable("post_media", {
  id: text("id").primaryKey(),
  postId: text("post_id")
    .notNull()
    .references(() => post.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(), // relative path under uploads/
  fileType: text("file_type").notNull(), // 'image' | 'video'
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(), // bytes
  mimeType: text("mime_type").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});
