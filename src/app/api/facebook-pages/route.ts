import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { facebookPage } from "@/db/schema/facebook-page";
import { eq, and } from "drizzle-orm";
import { verifyPageToken } from "@/lib/facebook";
import { encrypt } from "@/lib/crypto";
import { randomBytes } from "crypto";

/**
 * GET /api/facebook-pages — list all pages for authenticated user
 */
export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pages = await db
    .select({
      id: facebookPage.id,
      pageId: facebookPage.pageId,
      pageName: facebookPage.pageName,
      pageAvatar: facebookPage.pageAvatar,
      tokenStatus: facebookPage.tokenStatus,
      createdAt: facebookPage.createdAt,
    })
    .from(facebookPage)
    .where(eq(facebookPage.userId, session.user.id));

  return NextResponse.json({ pages });
}

/**
 * POST /api/facebook-pages — add a new Facebook Page
 * Body: { accessToken: string }
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { accessToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { accessToken } = body;
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
