import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const workspaceApp = sqliteTable("workspace_app", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  facebookAppId: text("facebook_app_id").notNull(),
  encryptedAppSecret: text("encrypted_app_secret").notNull(),
  /** User access token (Explorer) — mã hóa; dùng lấy Page token khi Page token thiếu quyền. */
  encryptedUserToken: text("encrypted_user_token"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});
