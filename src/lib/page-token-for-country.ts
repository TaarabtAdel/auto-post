import { decryptPageToken } from "@/lib/crypto";
import { getPageTokenFromAppUserToken } from "@/lib/workspace-app";

export type CountryApiTokenSource = "app_user_token" | "stored_page_token";

export async function resolvePageTokenForCountryRestrictions(
  row: {
    pageId: string;
    encryptedToken: string;
    workspaceAppId: string | null;
  },
  userId: string
): Promise<{ token: string; source: CountryApiTokenSource }> {
  if (row.workspaceAppId) {
    try {
      const token = await getPageTokenFromAppUserToken(
        row.workspaceAppId,
        userId,
        row.pageId
      );
      return { token, source: "app_user_token" };
    } catch {
      // fallback stored Page token
    }
  }

  const dec = decryptPageToken(row.encryptedToken);
  if (!dec.ok) {
    throw new Error(dec.message);
  }
  return { token: dec.value, source: "stored_page_token" };
}
