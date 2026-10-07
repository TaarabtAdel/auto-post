import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { workspaceApp } from "@/db/schema/workspace-app";
import { eq } from "drizzle-orm";
import { encryptAppSecret, listWorkspaceApps } from "@/lib/workspace-app";
import { randomBytes } from "crypto";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apps = await listWorkspaceApps(session.user.id);
  return NextResponse.json({ apps });
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    name?: string;
    description?: string;
    facebookAppId?: string;
    facebookAppSecret?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name = body.name?.trim();
  const facebookAppId = body.facebookAppId?.trim();
  const facebookAppSecret = body.facebookAppSecret?.trim();
  const description = body.description?.trim() || null;

  if (!name) {
    return NextResponse.json({ error: "Tên App là bắt buộc." }, { status: 400 });
  }
  if (!facebookAppId || !/^\d+$/.test(facebookAppId)) {
    return NextResponse.json(
      { error: "Facebook App ID không hợp lệ." },
      { status: 400 }
    );
  }
  if (!facebookAppSecret || facebookAppSecret.length < 8) {
    return NextResponse.json(
      { error: "Facebook App Secret là bắt buộc." },
      { status: 400 }
    );
  }

  const id = randomBytes(16).toString("hex");

  await db.insert(workspaceApp).values({
    id,
    userId: session.user.id,
    name,
    description,
    facebookAppId,
    encryptedAppSecret: encryptAppSecret(facebookAppSecret),
  });

  return NextResponse.json({
    app: {
      id,
      name,
      description,
      facebookAppId,
    },
  });
}
