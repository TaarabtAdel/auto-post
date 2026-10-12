import { db, sqlite as getSqlite } from "@/lib/db";
import { facebookPage } from "@/db/schema/facebook-page";
import { workspaceApp } from "@/db/schema/workspace-app";
import { encryptAppSecret } from "@/lib/workspace-app";
import { isNull, eq } from "drizzle-orm";
import { randomBytes } from "crypto";

export function migrateWorkspaceAppSchema() {
  const sqlite = getSqlite();
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS workspace_app (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      facebook_app_id TEXT NOT NULL,
      encrypted_app_secret TEXT NOT NULL,
      encrypted_user_token TEXT,
      created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
      updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
    );
  `);
  const cols = sqlite.prepare(`PRAGMA table_info(workspace_app)`).all() as {
    name: string;
  }[];
  if (!cols.some((c) => c.name === "encrypted_user_token")) {
    sqlite.exec(`ALTER TABLE workspace_app ADD COLUMN encrypted_user_token TEXT`);
  }
}

/**
 * Gán Page cũ vào workspace app; một lần import FB credentials từ env (legacy).
 */
export async function migrateLegacyWorkspaceApps() {
  migrateWorkspaceAppSchema();
  const legacyAppId = process.env.FACEBOOK_APP_ID?.trim();
  const legacySecret = process.env.FACEBOOK_APP_SECRET?.trim();

  const orphanPages = await db
    .select({
      id: facebookPage.id,
      userId: facebookPage.userId,
    })
    .from(facebookPage)
    .where(isNull(facebookPage.workspaceAppId));

  if (orphanPages.length === 0) {
    return;
  }

  const byUser = new Map<string, typeof orphanPages>();
  for (const page of orphanPages) {
    const list = byUser.get(page.userId) ?? [];
    list.push(page);
    byUser.set(page.userId, list);
  }

  for (const [userId, pages] of byUser) {
    let app = await db
      .select({ id: workspaceApp.id })
      .from(workspaceApp)
      .where(eq(workspaceApp.userId, userId))
      .limit(1);

    let workspaceAppId: string;

    if (app.length === 0) {
      if (!legacyAppId || !legacySecret) {
        console.warn(
          `[migrate] User ${userId} có Page chưa gán App — tạo App trong UI hoặc set FACEBOOK_* env một lần để import.`
        );
        continue;
      }

      workspaceAppId = randomBytes(16).toString("hex");
      await db.insert(workspaceApp).values({
        id: workspaceAppId,
        userId,
        name: "Facebook App (migrated)",
        description: "Tự động tạo từ biến môi trường FACEBOOK_APP_ID / SECRET.",
        facebookAppId: legacyAppId,
        encryptedAppSecret: encryptAppSecret(legacySecret),
      });
      console.log(`[migrate] Created workspace app for user ${userId}`);
    } else {
      workspaceAppId = app[0].id;
    }

    for (const page of pages) {
      await db
        .update(facebookPage)
        .set({ workspaceAppId })
        .where(eq(facebookPage.id, page.id));
    }
  }
}
