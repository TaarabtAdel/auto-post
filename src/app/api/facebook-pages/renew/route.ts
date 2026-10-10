import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import {
  renewPageTokensAuto,
  renewPageTokensFromUserToken,
} from "@/lib/renew-page-tokens";
import { getWorkspaceAppForUser } from "@/lib/workspace-app";
import { db } from "@/lib/db";
import { facebookPage } from "@/db/schema/facebook-page";
import { eq } from "drizzle-orm";

/**
 * POST /api/facebook-pages/renew
 * Auto: { pageIds?: string[] } — gia hạn bằng token Page đã lưu (không body = mọi page có App).
 * Manual: { userAccessToken, workspaceAppId, pageIds? }
 */
export async function POST(request: NextRequest) {
  const session = await getAppSession({ headers: await headers() });

  let body: {
    userAccessToken?: string;
    workspaceAppId?: string;
    pageIds?: string[];
  } = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const userAccessToken = body.userAccessToken?.trim();

  if (userAccessToken && userAccessToken.length >= 20) {
    const workspaceAppId = body.workspaceAppId?.trim();
    if (!workspaceAppId) {
      return NextResponse.json({ error: "Chọn Facebook App." }, { status: 400 });
    }
    const app = await getWorkspaceAppForUser(workspaceAppId, session.user.id);
    if (!app) {
      return NextResponse.json({ error: "App không tồn tại." }, { status: 404 });
    }
    try {
      const result = await renewPageTokensFromUserToken({
        userId: session.user.id,
        workspaceAppId,
        userAccessToken,
        internalPageIds: body.pageIds?.length ? body.pageIds : undefined,
      });
      return NextResponse.json({
        ok: true,
        message:
          result.renewed.length > 0
            ? `Đã gia hạn ${result.renewed.length} Page.`
            : "Không Page nào được cập nhật.",
        ...result,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Gia hạn thất bại.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  let pageIds = body.pageIds?.filter(Boolean);
  if (!pageIds?.length) {
    const rows = await db
      .select({ id: facebookPage.id })
      .from(facebookPage)
      .where(eq(facebookPage.userId, session.user.id));
    pageIds = rows
      .filter((r) => r.id)
      .map((r) => r.id);
  }

  const withApp = await db
    .select({ id: facebookPage.id })
    .from(facebookPage)
    .where(eq(facebookPage.userId, session.user.id));

  const allowed = new Set(withApp.map((r) => r.id));
  const targets = pageIds.filter((id) => allowed.has(id));

  const hasApp = await db
    .select({ id: facebookPage.id, workspaceAppId: facebookPage.workspaceAppId })
    .from(facebookPage)
    .where(eq(facebookPage.userId, session.user.id));

  const targetWithApp = targets.filter((id) => {
    const row = hasApp.find((r) => r.id === id);
    return row?.workspaceAppId;
  });

  if (targetWithApp.length === 0) {
    return NextResponse.json(
      { error: "Không có Page nào đã gán App để gia hạn." },
      { status: 400 }
    );
  }

  try {
    const { renewed, failed } = await renewPageTokensAuto(
      session.user.id,
      targetWithApp
    );
    return NextResponse.json({
      ok: true,
      message: `Gia hạn xong: ${renewed.length} thành công${failed.length ? `, ${failed.length} lỗi` : ""}.`,
      renewed,
      failed,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Gia hạn thất bại.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
