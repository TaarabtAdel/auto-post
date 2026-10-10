import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { post } from "./post";
import { facebookPage } from "./facebook-page";

/** Một bài viết → nhiều Fanpage (một bản ghi post). */
export const postFacebookPage = sqliteTable(
  "post_facebook_page",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    facebookPageId: text("facebook_page_id")
      .notNull()
      .references(() => facebookPage.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    fbPostId: text("fb_post_id"),
    errorMessage: text("error_message"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("post_facebook_page_post_page_idx").on(
      table.postId,
      table.facebookPageId
    ),
    index("post_facebook_page_post_idx").on(table.postId),
  ]
);
