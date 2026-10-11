import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { facebookPage } from "@/db/schema/facebook-page";
import { pageCategory } from "@/db/schema/page-category";
import { eq, and } from "drizzle-orm";
import { verifyPageToken } from "@/lib/facebook";
import { decryptPageToken, encrypt } from "@/lib/crypto";
import { getWorkspaceAppForUser } from "@/lib/workspace-app";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/facebook-pages/[id] — decrypt and return stored Page access token (owner only)
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const session = await getAppSession({
    headers: await headers(),
  });

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

  const decoded = decryptPageToken(rows[0].encryptedToken);
  if (!decoded.ok) {
    return NextResponse.json(
      { error: decoded.message, code: decoded.code },
      { status: decoded.code === "wrong_key" ? 409 : 500 }
    );
  }

  return NextResponse.json({
    accessToken: decoded.value,
    pageName: rows[0].pageName,
  });
}

/**
 * DELETE /api/facebook-pages/[id] — remove a connected page
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const session = await getAppSession({
    headers: await headers(),
  });

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
  const session = await getAppSession({
    headers: await headers(),
  });

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

  let body: {
    accessToken?: string;
    workspaceAppId?: string;
    categoryId?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {};

  if (body.workspaceAppId !== undefined) {
    const wsApp = await getWorkspaceAppForUser(
      body.workspaceAppId.trim(),
      session.user.id
    );
    if (!wsApp) {
      return NextResponse.json({ error: "App không hợp lệ." }, { status: 400 });
    }
    updates.workspaceAppId = wsApp.id;
  }

  if (body.accessToken !== undefined) {
    const accessToken = body.accessToken;
    if (!accessToken || typeof accessToken !== "string") {
      return NextResponse.json(
        { error: "Access token không hợp lệ." },
        { status: 400 }
      );
    }

    let pageInfo;
    try {
      pageInfo = await verifyPageToken(accessToken.trim());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể verify token.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (pageInfo.pageId !== existing[0].pageId) {
      return NextResponse.json(
        { error: "Token mới phải thuộc cùng Facebook Page." },
        { status: 400 }
      );
    }

    updates.encryptedToken = encrypt(accessToken.trim());
    updates.pageName = pageInfo.pageName;
    updates.pageAvatar = pageInfo.pageAvatar;
    updates.tokenStatus = "active";
  }

  if (body.categoryId !== undefined) {
    if (body.categoryId === null || body.categoryId === "") {
      updates.categoryId = null;
    } else {
      const cat = await db
        .select({ id: pageCategory.id })
        .from(pageCategory)
        .where(
          and(
            eq(pageCategory.id, body.categoryId),
            eq(pageCategory.userId, session.user.id)
          )
        );
      if (cat.length === 0) {
        return NextResponse.json(
          { error: "Danh mục không tồn tại." },
          { status: 400 }
        );
      }
      updates.categoryId = body.categoryId;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Không có thay đổi." }, { status: 400 });
  }

  await db
    .update(facebookPage)
    .set(updates)
    .where(
      and(eq(facebookPage.id, id), eq(facebookPage.userId, session.user.id))
    );

  const row = await db
    .select({
      id: facebookPage.id,
      pageId: facebookPage.pageId,
      pageName: facebookPage.pageName,
      pageAvatar: facebookPage.pageAvatar,
      tokenStatus: facebookPage.tokenStatus,
      workspaceAppId: facebookPage.workspaceAppId,
      categoryId: facebookPage.categoryId,
    })
    .from(facebookPage)
    .where(eq(facebookPage.id, id));

  return NextResponse.json({ page: row[0] });
}
