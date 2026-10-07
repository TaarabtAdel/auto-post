import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  exchangeForLongLivedUserToken,
  getUserPages,
  type PageWithToken,
} from "@/lib/facebook";
import { aiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { getFacebookCredentials } from "@/lib/workspace-app";

/**
 * POST /api/facebook/token/exchange
 * Body: { accessToken: string, workspaceAppId: string, includePages?: boolean }
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = checkRateLimit(aiLimiter, `fb-token:${session.user.id}`);
  if (limited) return limited;

  let body: {
    accessToken?: string;
    workspaceAppId?: string;
    includePages?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { accessToken, workspaceAppId, includePages = true } = body;

  if (!workspaceAppId?.trim()) {
    return NextResponse.json(
      { error: "Chọn App (workspaceAppId) để dùng App ID / Secret." },
      { status: 400 }
    );
  }

  let credentials;
  try {
    credentials = await getFacebookCredentials(workspaceAppId.trim(), session.user.id);
  } catch {
    return NextResponse.json({ error: "App không hợp lệ." }, { status: 404 });
  }

  if (
    !accessToken ||
    typeof accessToken !== "string" ||
    accessToken.trim().length < 20
  ) {
    return NextResponse.json(
      { error: "Vui lòng dán User Access Token hợp lệ từ Graph API Explorer." },
      { status: 400 }
    );
  }

  try {
    const exchanged = await exchangeForLongLivedUserToken(
      accessToken,
      credentials
    );

    let pages: PageWithToken[] = [];
    if (includePages) {
      try {
        pages = await getUserPages(exchanged.accessToken);
      } catch {
        pages = [];
      }
    }

    return NextResponse.json({
      accessToken: exchanged.accessToken,
      tokenType: exchanged.tokenType,
      expiresIn: exchanged.expiresIn,
      pages: pages.map((p) => ({
        pageId: p.pageId,
        pageName: p.pageName,
        pageAvatar: p.pageAvatar,
        accessToken: p.accessToken,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Không thể gia hạn token.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
