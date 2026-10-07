import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { facebookPage } from "@/db/schema/facebook-page";
import { eq, and } from "drizzle-orm";
import { encrypt } from "@/lib/crypto";
import { randomBytes } from "crypto";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getUserPages,
} from "@/lib/facebook";
import { getFacebookCredentials } from "@/lib/workspace-app";

/**
 * GET /api/auth/facebook/callback
 * Facebook redirects here after OAuth. Exchanges code → token → pages.
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return redirectWithError("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  if (errorParam) {
    const errorDesc = searchParams.get("error_description") || "Bạn đã từ chối quyền truy cập.";
    return redirectWithError(errorDesc);
  }

  if (!code || !state) {
    return redirectWithError("Thiếu code hoặc state từ Facebook.");
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get("fb_oauth_state")?.value;
  const workspaceAppId = cookieStore.get("fb_oauth_workspace_app_id")?.value;
  cookieStore.delete("fb_oauth_state");
  cookieStore.delete("fb_oauth_workspace_app_id");

  if (!savedState || savedState !== state) {
    return redirectWithError("State không khớp — có thể bị tấn công CSRF.");
  }

  if (!workspaceAppId) {
    return redirectWithError("Thiếu thông tin App. Hãy kết nối lại từ trang Pages.");
  }

  let credentials;
  try {
    credentials = await getFacebookCredentials(workspaceAppId, session.user.id);
  } catch {
    return redirectWithError("App không hợp lệ hoặc đã bị xóa.");
  }

  const baseUrl =
    process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT || "3100"}`;
  const redirectUri = `${baseUrl}/api/auth/facebook/callback`;

  try {
    const shortLivedToken = await exchangeCodeForToken(code, redirectUri, credentials);
    const longLivedToken = await exchangeForLongLivedToken(shortLivedToken, credentials);
    const pages = await getUserPages(longLivedToken);

    if (pages.length === 0) {
      return redirectWithError("Không tìm thấy Facebook Page nào. Hãy chắc chắn bạn là Admin của ít nhất 1 Page.");
    }

    let newCount = 0;
    let skippedCount = 0;

    for (const page of pages) {
      const existing = await db
        .select({ id: facebookPage.id })
        .from(facebookPage)
        .where(
          and(
            eq(facebookPage.userId, session.user.id),
            eq(facebookPage.pageId, page.pageId)
          )
        );

      if (existing.length > 0) {
        await db
          .update(facebookPage)
          .set({
            encryptedToken: encrypt(page.accessToken),
            tokenStatus: "active",
            pageName: page.pageName,
            pageAvatar: page.pageAvatar,
            workspaceAppId,
          })
          .where(eq(facebookPage.id, existing[0].id));
        skippedCount++;
      } else {
        await db.insert(facebookPage).values({
          id: randomBytes(16).toString("hex"),
          userId: session.user.id,
          workspaceAppId,
          pageId: page.pageId,
          pageName: page.pageName,
          pageAvatar: page.pageAvatar,
          encryptedToken: encrypt(page.accessToken),
          tokenStatus: "active",
        });
        newCount++;
      }
    }

    const successMsg = buildSuccessMessage(newCount, skippedCount);
    return NextResponse.redirect(
      `${baseUrl}/pages?success=${encodeURIComponent(successMsg)}`
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Lỗi không xác định.";
    console.error("[FB OAuth callback]", message);
    return redirectWithError(message);
  }
}

function redirectWithError(message: string) {
  const baseUrl =
    process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT || "3100"}`;
  return NextResponse.redirect(
    `${baseUrl}/pages?error=${encodeURIComponent(message)}`
  );
}

function buildSuccessMessage(newCount: number, updatedCount: number): string {
  const parts: string[] = [];
  if (newCount > 0) parts.push(`${newCount} Page mới đã kết nối`);
  if (updatedCount > 0) parts.push(`${updatedCount} Page đã cập nhật token`);
  return parts.length > 0 ? parts.join(", ") + "." : "Không có Page mới.";
}
