import { db } from "@/lib/db";
import { facebookPage } from "@/db/schema/facebook-page";
import { eq, and } from "drizzle-orm";
import { encrypt } from "@/lib/crypto";
import {
  debugAccessToken,
  exchangeForLongLivedUserToken,
  getUserPages,
  resolveTokenExpiryDate,
  verifyPageToken,
} from "@/lib/facebook";
import { getFacebookCredentials } from "@/lib/workspace-app";
import { decryptPageToken } from "@/lib/crypto";

export type RenewPageTokenItem = {
  id: string;
  pageId: string;
  pageName: string;
  tokenExpiresAt: string | null;
  neverExpires: boolean;
};

export type RenewPageTokensResult = {
  renewed: RenewPageTokenItem[];
  notFoundInFacebook: { id: string; pageName: string; pageId: string }[];
};

export type AutoRenewPageResult = {
  id: string;
  pageId: string;
  pageName: string;
  tokenExpiresAt: string | null;
  neverExpires: boolean;
  tokenRotated: boolean;
  message: string;
};

/**
 * Gia hạn tự động: dùng Page token đã lưu → fb_exchange_token (nếu được) → verify → debug → lưu DB.
 * Không cần dán User token (fallback thủ công: /pages/renew-token).
 */
export async function renewPageTokenFromStored(
  userId: string,
  internalPageId: string
): Promise<AutoRenewPageResult> {
  const row = await db
    .select()
    .from(facebookPage)
    .where(and(eq(facebookPage.id, internalPageId), eq(facebookPage.userId, userId)))
    .then((r) => r[0]);

  if (!row) {
    throw new Error("Page không tồn tại.");
  }
  if (!row.workspaceAppId) {
    throw new Error("Page chưa gán App.");
  }

  const dec = decryptPageToken(row.encryptedToken);
  if (!dec.ok) {
    throw new Error(dec.message);
  }

  const credentials = await getFacebookCredentials(row.workspaceAppId, userId);
  let pageToken = dec.value;
  let tokenRotated = false;

  try {
    await verifyPageToken(pageToken);
  } catch {
    await db
      .update(facebookPage)
      .set({ tokenStatus: "expired" })
      .where(eq(facebookPage.id, row.id));
    throw new Error(
      "Token Page đã hết hạn trên Facebook. Kết nối lại Page (OAuth) hoặc dán token mới ở Sửa Page."
    );
  }

  try {
    const exchanged = await exchangeForLongLivedUserToken(pageToken, credentials);
    let candidate = exchanged.accessToken;

    try {
      const asPage = await verifyPageToken(candidate);
      if (asPage.pageId === row.pageId) {
        pageToken = candidate;
        tokenRotated = candidate !== dec.value;
      }
    } catch {
      const pages = await getUserPages(candidate);
      const match = pages.find((p) => p.pageId === row.pageId);
      if (match) {
        pageToken = match.accessToken;
        tokenRotated = true;
      }
    }
  } catch {
    /* Giữ token cũ nếu vẫn verify OK — chỉ cập nhật metadata */
  }

  const pageInfo = await verifyPageToken(pageToken);
  const debug = await debugAccessToken(pageToken, credentials);
  const expiry = resolveTokenExpiryDate(debug);
  const neverExpires = debug.expiresAt === 0 && debug.dataAccessExpiresAt === 0;
  const now = new Date();

  await db
    .update(facebookPage)
    .set({
      encryptedToken: encrypt(pageToken),
      pageName: pageInfo.pageName,
      pageAvatar: pageInfo.pageAvatar,
      tokenStatus: debug.isValid ? "active" : "invalid",
      tokenRenewedAt: now,
      tokenExpiresAt: expiry,
    })
    .where(eq(facebookPage.id, row.id));

  const message = tokenRotated
    ? "Đã đổi sang token mới (long-lived) và lưu vào hệ thống."
    : "Token còn hiệu lực — đã làm mới thông tin hết hạn trên Facebook.";

  return {
    id: row.id,
    pageId: row.pageId,
    pageName: pageInfo.pageName,
    tokenExpiresAt: expiry ? expiry.toISOString() : null,
    neverExpires,
    tokenRotated,
    message,
  };
}

export async function renewPageTokensAuto(
  userId: string,
  internalPageIds: string[]
): Promise<{ renewed: AutoRenewPageResult[]; failed: { id: string; pageName: string; error: string }[] }> {
  const renewed: AutoRenewPageResult[] = [];
  const failed: { id: string; pageName: string; error: string }[] = [];

  for (const id of internalPageIds) {
    const nameRow = await db
      .select({ pageName: facebookPage.pageName })
      .from(facebookPage)
      .where(eq(facebookPage.id, id));
    const pageName = nameRow[0]?.pageName ?? id.slice(0, 8);
    try {
      renewed.push(await renewPageTokenFromStored(userId, id));
    } catch (e) {
      failed.push({
        id,
        pageName,
        error: e instanceof Error ? e.message : "Lỗi không xác định.",
      });
    }
  }

  return { renewed, failed };
}

export async function renewPageTokensFromUserToken(options: {
  userId: string;
  workspaceAppId: string;
  userAccessToken: string;
  /** AutoPost facebook_page.id; bỏ trống = mọi page của user có trong /me/accounts */
  internalPageIds?: string[];
}): Promise<RenewPageTokensResult> {
  const credentials = await getFacebookCredentials(
    options.workspaceAppId,
    options.userId
  );

  const exchanged = await exchangeForLongLivedUserToken(
    options.userAccessToken,
    credentials
  );

  const fbPages = await getUserPages(exchanged.accessToken);
  const fbByGraphId = new Map(fbPages.map((p) => [p.pageId, p]));

  let dbPages = await db
    .select()
    .from(facebookPage)
    .where(eq(facebookPage.userId, options.userId));

  if (options.internalPageIds?.length) {
    const allowed = new Set(options.internalPageIds);
    dbPages = dbPages.filter((p) => allowed.has(p.id));
  }

  const renewed: RenewPageTokenItem[] = [];
  const notFoundInFacebook: RenewPageTokensResult["notFoundInFacebook"] = [];
  const now = new Date();

  for (const row of dbPages) {
    const fb = fbByGraphId.get(row.pageId);
    if (!fb) {
      notFoundInFacebook.push({
        id: row.id,
        pageName: row.pageName,
        pageId: row.pageId,
      });
      continue;
    }

    const debug = await debugAccessToken(fb.accessToken, credentials);
    const expiry = resolveTokenExpiryDate(debug);
    const neverExpires = debug.expiresAt === 0 && debug.dataAccessExpiresAt === 0;

    await db
      .update(facebookPage)
      .set({
        encryptedToken: encrypt(fb.accessToken),
        pageName: fb.pageName,
        pageAvatar: fb.pageAvatar,
        tokenStatus: debug.isValid ? "active" : "invalid",
        tokenRenewedAt: now,
        tokenExpiresAt: expiry,
        workspaceAppId: options.workspaceAppId,
      })
      .where(and(eq(facebookPage.id, row.id), eq(facebookPage.userId, options.userId)));

    renewed.push({
      id: row.id,
      pageId: row.pageId,
      pageName: fb.pageName,
      tokenExpiresAt: expiry ? expiry.toISOString() : null,
      neverExpires,
    });
  }

  return { renewed, notFoundInFacebook };
}

export async function syncPageTokenExpiryForUser(userId: string): Promise<number> {
  const rows = await db
    .select({
      id: facebookPage.id,
      encryptedToken: facebookPage.encryptedToken,
      workspaceAppId: facebookPage.workspaceAppId,
    })
    .from(facebookPage)
    .where(eq(facebookPage.userId, userId));

  let updated = 0;

  for (const row of rows) {
    if (!row.workspaceAppId) continue;
    let credentials;
    try {
      credentials = await getFacebookCredentials(row.workspaceAppId, userId);
    } catch {
      continue;
    }

    let plain: string;
    try {
      const { decryptPageToken } = await import("@/lib/crypto");
      const dec = decryptPageToken(row.encryptedToken);
      if (!dec.ok) continue;
      plain = dec.value;
    } catch {
      continue;
    }

    try {
      const debug = await debugAccessToken(plain, credentials);
      const expiry = resolveTokenExpiryDate(debug);
      await db
        .update(facebookPage)
        .set({
          tokenExpiresAt: expiry,
          tokenStatus: debug.isValid ? "active" : "invalid",
        })
        .where(eq(facebookPage.id, row.id));
      updated++;
    } catch {
      /* skip */
    }
  }

  return updated;
}
