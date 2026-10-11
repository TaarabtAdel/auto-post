import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { facebookPage } from "@/db/schema/facebook-page";
import { pageCategory } from "@/db/schema/page-category";
import { eq, and } from "drizzle-orm";
import { verifyPageToken } from "@/lib/facebook";
import { encrypt } from "@/lib/crypto";
import { getWorkspaceAppForUser } from "@/lib/workspace-app";
import { randomBytes } from "crypto";

/**
 * GET /api/facebook-pages — list pages (?workspaceAppId= filter by app, unassigned = no app)
 */
export async function GET(request: NextRequest) {
  const session = await getAppSession({
    headers: await headers(),
  });

  const filterApp = request.nextUrl.searchParams.get("workspaceAppId");

  let pages = await db
    .select({
      id: facebookPage.id,
      pageId: facebookPage.pageId,
      pageName: facebookPage.pageName,
      pageAvatar: facebookPage.pageAvatar,
      tokenStatus: facebookPage.tokenStatus,
      workspaceAppId: facebookPage.workspaceAppId,
      categoryId: facebookPage.categoryId,
      categoryName: pageCategory.name,
      createdAt: facebookPage.createdAt,
    })
    .from(facebookPage)
    .leftJoin(pageCategory, eq(facebookPage.categoryId, pageCategory.id))
    .where(eq(facebookPage.userId, session.user.id));

  if (filterApp === "unassigned") {
    pages = pages.filter((p) => !p.workspaceAppId);
  } else if (filterApp) {
    pages = pages.filter((p) => p.workspaceAppId === filterApp);
  }

  return NextResponse.json({ pages });
}

/**
 * POST /api/facebook-pages — add a new Facebook Page
 * Body: { accessToken: string }
 */
export async function POST(request: NextRequest) {
  const session = await getAppSession({
    headers: await headers(),
  });

  let body: { accessToken?: string; workspaceAppId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { accessToken, workspaceAppId } = body;

  if (!workspaceAppId?.trim()) {
    return NextResponse.json(
      { error: "Chọn App (workspaceAppId) trước khi kết nối Page." },
      { status: 400 }
    );
  }

  const wsApp = await getWorkspaceAppForUser(workspaceAppId.trim(), session.user.id);
  if (!wsApp) {
    return NextResponse.json({ error: "App không hợp lệ." }, { status: 404 });
  }
  if (!accessToken || typeof accessToken !== "string" || accessToken.trim().length === 0) {
    return NextResponse.json(
      { error: "Access token là bắt buộc." },
      { status: 400 }
    );
  }

  // Verify token with Facebook Graph API
  let pageInfo;
  try {
    pageInfo = await verifyPageToken(accessToken.trim());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Không thể verify token.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Check if page already connected by this user
  const existing = await db
    .select({ id: facebookPage.id })
    .from(facebookPage)
    .where(
      and(
        eq(facebookPage.userId, session.user.id),
        eq(facebookPage.pageId, pageInfo.pageId)
      )
    );

  if (existing.length > 0) {
    return NextResponse.json(
      { error: `Page "${pageInfo.pageName}" đã được kết nối.` },
      { status: 409 }
    );
  }

  // Encrypt token and save
  const encryptedToken = encrypt(accessToken.trim());
  const id = randomBytes(16).toString("hex");

  await db.insert(facebookPage).values({
    id,
    userId: session.user.id,
    workspaceAppId: wsApp.id,
    pageId: pageInfo.pageId,
    pageName: pageInfo.pageName,
    pageAvatar: pageInfo.pageAvatar,
    encryptedToken,
    tokenStatus: "active",
  });

  return NextResponse.json({
    page: {
      id,
      pageId: pageInfo.pageId,
      pageName: pageInfo.pageName,
      pageAvatar: pageInfo.pageAvatar,
      tokenStatus: "active",
    },
  });
}
