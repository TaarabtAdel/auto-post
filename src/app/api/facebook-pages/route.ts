import { NextRequest, NextResponse } from "next/server";
import { apiUnauthorized } from "@/lib/api-unauthorized";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { facebookPage } from "@/db/schema/facebook-page";
import { pageCategory } from "@/db/schema/page-category";
import { eq, and } from "drizzle-orm";
import {
  normalizeFacebookPageId,
  verifyPageAccessTokenForPage,
  verifyPageToken,
} from "@/lib/facebook";
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
  if (!session) return apiUnauthorized();

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
  if (!session) return apiUnauthorized();

  let body: {
    accessToken?: string;
    workspaceAppId?: string;
    pageId?: string;
    pageName?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { accessToken } = body;
  const manualPageId = body.pageId?.trim() ?? "";
  const manualPageName = body.pageName?.trim() ?? "";
  const workspaceAppIdRaw = body.workspaceAppId?.trim() ?? "";

  let workspaceAppIdToSave: string | null = null;
  if (workspaceAppIdRaw !== "") {
    const wsApp = await getWorkspaceAppForUser(workspaceAppIdRaw, session.user.id);
    if (!wsApp) {
      return NextResponse.json({ error: "App không hợp lệ." }, { status: 404 });
    }
    workspaceAppIdToSave = wsApp.id;
  }
  const tokenRaw =
    accessToken && typeof accessToken === "string" ? accessToken.trim() : "";

  /** Chỉ đăng ký tên + ID — token bổ sung sau (Cập nhật token). */
  if (tokenRaw === "") {
    if (manualPageId === "" || manualPageName === "") {
      return NextResponse.json(
        { error: "Nhập Tên Fanpage và ID Fanpage." },
        { status: 400 }
      );
    }
    const pageId = normalizeFacebookPageId(manualPageId);
    if (!/^\d+$/.test(pageId)) {
      return NextResponse.json(
        { error: "ID Fanpage phải là số." },
        { status: 400 }
      );
    }

    const existingManual = await db
      .select({ id: facebookPage.id })
      .from(facebookPage)
      .where(
        and(
          eq(facebookPage.userId, session.user.id),
          eq(facebookPage.pageId, pageId)
        )
      );
    if (existingManual.length > 0) {
      return NextResponse.json(
        { error: `Page ID ${pageId} đã có trong danh sách.` },
        { status: 409 }
      );
    }

    const id = randomBytes(16).toString("hex");
    await db.insert(facebookPage).values({
      id,
      userId: session.user.id,
      workspaceAppId: workspaceAppIdToSave,
      pageId,
      pageName: manualPageName,
      pageAvatar: null,
      encryptedToken: encrypt(""),
      tokenStatus: "pending",
    });

    return NextResponse.json({
      page: {
        id,
        pageId,
        pageName: manualPageName,
        pageAvatar: null,
        tokenStatus: "pending",
      },
    });
  }

  if (manualPageId !== "" || manualPageName !== "") {
    if (manualPageId === "" || manualPageName === "") {
      return NextResponse.json(
        { error: "Nhập đủ Tên Fanpage và ID Fanpage, hoặc bỏ trống cả hai (chỉ dán token)." },
        { status: 400 }
      );
    }
  }

  // Verify token with Facebook Graph API
  let pageInfo;
  try {
    if (manualPageId !== "" && manualPageName !== "") {
      const verified = await verifyPageAccessTokenForPage(
        manualPageId,
        tokenRaw
      );
      const expectedId = normalizeFacebookPageId(manualPageId);
      if (verified.pageId !== expectedId) {
        return NextResponse.json(
          {
            error: `Token gắn với Page ID ${verified.pageId}, khác ID đã nhập (${expectedId}).`,
          },
          { status: 400 }
        );
      }
      pageInfo = {
        ...verified,
        pageName: manualPageName,
      };
    } else {
      pageInfo = await verifyPageToken(tokenRaw);
    }
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
  const encryptedToken = encrypt(tokenRaw);
  const id = randomBytes(16).toString("hex");

  await db.insert(facebookPage).values({
    id,
    userId: session.user.id,
    workspaceAppId: workspaceAppIdToSave,
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
