import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { workspaceApp } from "./workspace-app";
import { pageCategory } from "./page-category";

export const facebookPage = sqliteTable(
  "facebook_page",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceAppId: text("workspace_app_id").references(() => workspaceApp.id, {
      onDelete: "set null",
    }),
    categoryId: text("category_id").references(() => pageCategory.id, {
      onDelete: "set null",
    }),
    pageId: text("page_id").notNull(),
    pageName: text("page_name").notNull(),
    pageAvatar: text("page_avatar"),
    encryptedToken: text("encrypted_token").notNull(),
    tokenStatus: text("token_status").notNull().default("active"), // 'active' | 'expired' | 'invalid'
    /** Lần gia hạn token gần nhất (đổi user token → page token mới). */
    tokenRenewedAt: integer("token_renewed_at", { mode: "timestamp_ms" }),
    /** Hết hạn token (từ Graph debug_token); null nếu không xác định / không hết hạn. */
    tokenExpiresAt: integer("token_expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("facebook_page_user_page_idx").on(table.userId, table.pageId),
  ]
);
