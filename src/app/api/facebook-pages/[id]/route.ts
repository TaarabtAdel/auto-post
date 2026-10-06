import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { facebookPage } from "@/db/schema/facebook-page";
import { eq, and } from "drizzle-orm";
import { verifyPageToken } from "@/lib/facebook";
import { decrypt, encrypt } from "@/lib/crypto";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/facebook-pages/[id] — decrypt and return stored Page access token (owner only)
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const rows = await db
    .select({
      encryptedToken: facebookPage.encryptedToken,
      pageName: facebookPage.pageName,
    })
    .from(facebookPage)
    .where(
      and(eq(facebookPage.id, id), eq(facebookPage.userId, session.user.id))
    );

  if (rows.length === 0) {
    return NextResponse.json({ error: "Page không tồn tại." }, { status: 404 });
  }

  try {
    const accessToken = decrypt(rows[0].encryptedToken);
    return NextResponse.json({
      accessToken,
      pageName: rows[0].pageName,
    });
  } catch {
    return NextResponse.json(
      { error: "Không thể đọc token đã lưu." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/facebook-pages/[id] — remove a connected page
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Check ownership
  const page = await db
    .select({ id: facebookPage.id })
    .from(facebookPage)
    .where(
      and(eq(facebookPage.id, id), eq(facebookPage.userId, session.user.id))
    );

  if (page.length === 0) {
    return NextResponse.json({ error: "Page không tồn tại." }, { status: 404 });
  }

  await db
    .delete(facebookPage)
    .where(
      and(eq(facebookPage.id, id), eq(facebookPage.userId, session.user.id))
    );

  return NextResponse.json({ success: true });
}

/**
 * PATCH /api/facebook-pages/[id] — update token for a connected page
 * Body: { accessToken: string }
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Check ownership
  const existing = await db
    .select({ id: facebookPage.id, pageId: facebookPage.pageId })
    .from(facebookPage)
    .where(
      and(eq(facebookPage.id, id), eq(facebookPage.userId, session.user.id))
    );

  if (existing.length === 0) {
    return NextResponse.json({ error: "Page không tồn tại." }, { status: 404 });
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
  if (!accessToken || typeof accessToken !== "string") {
    return NextResponse.json(
      { error: "Access token là bắt buộc." },
      { status: 400 }
    );
  }

  // Verify new token
  let pageInfo;
  try {
    pageInfo = await verifyPageToken(accessToken.trim());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Không thể verify token.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Verify token is for the same page
  if (pageInfo.pageId !== existing[0].pageId) {
    return NextResponse.json(
      { error: "Token mới phải thuộc cùng Facebook Page." },
      { status: 400 }
    );
  }

  const encryptedToken = encrypt(accessToken.trim());

  await db
    .update(facebookPage)
    .set({
      encryptedToken,
      pageName: pageInfo.pageName,
      pageAvatar: pageInfo.pageAvatar,
      tokenStatus: "active",
    })
    .where(
      and(eq(facebookPage.id, id), eq(facebookPage.userId, session.user.id))
    );

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
