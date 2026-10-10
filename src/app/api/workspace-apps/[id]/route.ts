import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { workspaceApp } from "@/db/schema/workspace-app";
import { facebookPage } from "@/db/schema/facebook-page";
import { eq, and } from "drizzle-orm";
import {
  encryptAppSecret,
  encryptUserAccessToken,
  getWorkspaceAppForUser,
  listWorkspaceApps,
} from "@/lib/workspace-app";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await getAppSession({ headers: await headers() });

  const { id } = await context.params;
  const app = await getWorkspaceAppForUser(id, session.user.id);
  if (!app) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    app: {
      id: app.id,
      name: app.name,
      description: app.description,
      facebookAppId: app.facebookAppId,
      hasUserToken: Boolean(app.encryptedUserToken),
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    },
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await getAppSession({ headers: await headers() });

  const { id } = await context.params;
  const existing = await getWorkspaceAppForUser(id, session.user.id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: {
    name?: string;
    description?: string;
    facebookAppId?: string;
    facebookAppSecret?: string;
    userAccessToken?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const updates: Partial<typeof workspaceApp.$inferInsert> = {};

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "Tên App không được để trống." }, { status: 400 });
    }
    updates.name = name;
  }

  if (body.description !== undefined) {
    updates.description = body.description.trim() || null;
  }

  if (body.facebookAppId !== undefined) {
    const facebookAppId = body.facebookAppId.trim();
    if (!facebookAppId || !/^\d+$/.test(facebookAppId)) {
      return NextResponse.json(
        { error: "Facebook App ID không hợp lệ." },
        { status: 400 }
      );
    }
    updates.facebookAppId = facebookAppId;
  }

  if (body.facebookAppSecret !== undefined && body.facebookAppSecret.trim()) {
    updates.encryptedAppSecret = encryptAppSecret(body.facebookAppSecret);
  }

  if (body.userAccessToken !== undefined) {
    const raw = body.userAccessToken;
    if (raw === null || (typeof raw === "string" && !raw.trim())) {
      updates.encryptedUserToken = null;
    } else if (typeof raw === "string" && raw.trim().length >= 20) {
      updates.encryptedUserToken = encryptUserAccessToken(raw);
    } else {
      return NextResponse.json(
        { error: "User token không hợp lệ (quá ngắn)." },
        { status: 400 }
      );
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Không có thay đổi." }, { status: 400 });
  }

  await db.update(workspaceApp).set(updates).where(eq(workspaceApp.id, id));

  const apps = await listWorkspaceApps(session.user.id);
  const app = apps.find((a) => a.id === id);

  return NextResponse.json({ app });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const session = await getAppSession({ headers: await headers() });

  const { id } = await context.params;
  const existing = await getWorkspaceAppForUser(id, session.user.id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const linked = await db
    .select({ id: facebookPage.id })
    .from(facebookPage)
    .where(
      and(
        eq(facebookPage.workspaceAppId, id),
        eq(facebookPage.userId, session.user.id)
      )
    )
    .limit(1);

  if (linked.length > 0) {
    return NextResponse.json(
      { error: "Không thể xóa App đang có Facebook Page liên kết." },
      { status: 409 }
    );
  }

  await db
    .delete(workspaceApp)
    .where(and(eq(workspaceApp.id, id), eq(workspaceApp.userId, session.user.id)));

  return NextResponse.json({ ok: true });
}
