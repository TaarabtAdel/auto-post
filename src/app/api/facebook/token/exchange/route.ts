import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  exchangeForLongLivedUserToken,
  getUserPages,
  type PageWithToken,
} from "@/lib/facebook";
import { aiLimiter, checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/facebook/token/exchange
 * Body: { accessToken: string, includePages?: boolean }
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

  if (!process.env.FACEBOOK_APP_ID || !process.env.FACEBOOK_APP_SECRET) {
    return NextResponse.json(
      { error: "Server chưa cấu hình Facebook App (APP_ID / APP_SECRET)." },
      { status: 500 }
    );
  }

  let body: { accessToken?: string; includePages?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { accessToken, includePages = true } = body;
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
    const exchanged = await exchangeForLongLivedUserToken(accessToken);

    let pages: PageWithToken[] = [];
    if (includePages) {
      try {
        pages = await getUserPages(exchanged.accessToken);
      } catch {
        // User token may be valid but missing pages_show_list scope
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
