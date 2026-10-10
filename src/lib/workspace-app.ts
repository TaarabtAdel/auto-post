import { db } from "@/lib/db";
import { workspaceApp } from "@/db/schema/workspace-app";
import { eq, and } from "drizzle-orm";
import { decrypt, decryptPageToken, encrypt } from "@/lib/crypto";
import { getUserPages } from "@/lib/facebook";

import type { FacebookAppCredentials } from "@/lib/facebook";

export async function listWorkspaceApps(userId: string) {
  const rows = await db
    .select({
      id: workspaceApp.id,
      name: workspaceApp.name,
      description: workspaceApp.description,
      facebookAppId: workspaceApp.facebookAppId,
      encryptedUserToken: workspaceApp.encryptedUserToken,
      createdAt: workspaceApp.createdAt,
      updatedAt: workspaceApp.updatedAt,
    })
    .from(workspaceApp)
    .where(eq(workspaceApp.userId, userId));

  return rows.map(({ encryptedUserToken, ...app }) => ({
    ...app,
    hasUserToken: Boolean(encryptedUserToken),
  }));
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

export function encryptUserAccessToken(token: string): string {
  return encrypt(token.trim());
}

export function getStoredUserAccessToken(
  encryptedUserToken: string | null | undefined
): string | null {
  if (!encryptedUserToken?.trim()) return null;
  const dec = decryptPageToken(encryptedUserToken);
  if (!dec.ok) return null;
  return dec.value;
}

/** Page access token từ User token đã lưu trên App (/apps). */
export async function getPageTokenFromAppUserToken(
  workspaceAppId: string,
  userId: string,
  graphPageId: string
): Promise<string> {
  const row = await getWorkspaceAppForUser(workspaceAppId, userId);
  if (!row) {
    throw new Error("App không tồn tại.");
  }
  const userToken = getStoredUserAccessToken(row.encryptedUserToken);
  if (!userToken) {
    throw new Error(
      "App chưa có User token — thêm tại /apps (Graph API Explorer, quyền quản trị Page)."
    );
  }

  const pages = await getUserPages(userToken);
  const match = pages.find((p) => p.pageId === graphPageId);
  if (!match?.accessToken) {
    throw new Error(
      "User token không thấy Page này trong /me/accounts — kiểm tra quyền Admin/Moderator."
    );
  }
  return match.accessToken;
}
