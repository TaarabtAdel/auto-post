import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { renewPageTokenFromStored, renewPageTokensFromUserToken } from "@/lib/renew-page-tokens";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/facebook-pages/[id]/renew
 * Mặc định: tự động dùng Page token đã lưu (fb_exchange + lưu DB).
 * Tuỳ chọn body: { userAccessToken } — luồng thủ công như /pages/renew-token.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const session = await getAppSession({ headers: await headers() });

  const { id } = await params;

  let body: { userAccessToken?: string; workspaceAppId?: string } = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const userAccessToken = body.userAccessToken?.trim();

  try {
    if (userAccessToken && userAccessToken.length >= 20) {
      const { db } = await import("@/lib/db");
      const { facebookPage } = await import("@/db/schema/facebook-page");
      const { eq, and } = await import("drizzle-orm");
      const rows = await db
        .select({ workspaceAppId: facebookPage.workspaceAppId })
        .from(facebookPage)
        .where(and(eq(facebookPage.id, id), eq(facebookPage.userId, session.user.id)));
      const workspaceAppId =
        body.workspaceAppId?.trim() || rows[0]?.workspaceAppId;
      if (!workspaceAppId) {
        return NextResponse.json({ error: "Page chưa gán App." }, { status: 400 });
      }
      const result = await renewPageTokensFromUserToken({
        userId: session.user.id,
        workspaceAppId,
        userAccessToken,
        internalPageIds: [id],
      });
      if (result.renewed.length === 0) {
        return NextResponse.json(
          { error: result.notFoundInFacebook[0]?.pageName ?? "Không cập nhật được." },
          { status: 400 }
        );
      }
      return NextResponse.json({
        ok: true,
        message: "Đã gia hạn từ User token.",
        page: result.renewed[0],
      });
    }

    const page = await renewPageTokenFromStored(session.user.id, id);
    return NextResponse.json({
      ok: true,
      message: page.message,
      page,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Gia hạn thất bại.";
    if (msg.includes("App Secret") || msg.includes("ENCRYPTION")) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
