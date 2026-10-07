import { db } from "@/lib/db";
import { workspaceApp } from "@/db/schema/workspace-app";
import { eq, and } from "drizzle-orm";
import { decrypt, encrypt } from "@/lib/crypto";

import type { FacebookAppCredentials } from "@/lib/facebook";

export async function listWorkspaceApps(userId: string) {
  return db
    .select({
      id: workspaceApp.id,
      name: workspaceApp.name,
      description: workspaceApp.description,
      facebookAppId: workspaceApp.facebookAppId,
      createdAt: workspaceApp.createdAt,
      updatedAt: workspaceApp.updatedAt,
    })
    .from(workspaceApp)
    .where(eq(workspaceApp.userId, userId));
}

export async function getWorkspaceAppForUser(appId: string, userId: string) {
  const rows = await db
    .select()
    .from(workspaceApp)
    .where(and(eq(workspaceApp.id, appId), eq(workspaceApp.userId, userId)));
  return rows[0] ?? null;
}

export async function getFacebookCredentials(
  appId: string,
  userId: string
): Promise<FacebookAppCredentials> {
  const row = await getWorkspaceAppForUser(appId, userId);
  if (!row) {
    throw new Error("Không tìm thấy App hoặc bạn không có quyền truy cập.");
  }
  return {
    appId: row.facebookAppId,
    appSecret: decrypt(row.encryptedAppSecret),
  };
}

export function encryptAppSecret(secret: string): string {
  return encrypt(secret.trim());
}
