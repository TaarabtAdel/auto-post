import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { apiUnauthorized } from "@/lib/api-unauthorized";
import { getAppSession } from "@/lib/app-session";
import { getNewsSettingsPublic, saveNewsSettings } from "@/lib/news-settings";

/** GET — cấu hình đăng tin của user (không trả mật khẩu / token). */
export async function GET() {
  const session = await getAppSession({ headers: await headers() });
  if (!session) return apiUnauthorized();
  return NextResponse.json(getNewsSettingsPublic(session.user.id));
}

/** PUT { userName, newsGroupId, password?, token? } — ô bí mật để trống = giữ nguyên. */
export async function PUT(request: NextRequest) {
  const session = await getAppSession({ headers: await headers() });
  if (!session) return apiUnauthorized();

  let body: {
    userName?: string;
    newsGroupId?: string;
    password?: string;
    token?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  saveNewsSettings(session.user.id, {
    userName: String(body.userName ?? ""),
    newsGroupId: String(body.newsGroupId ?? ""),
    password: body.password ? String(body.password) : undefined,
    token: body.token ? String(body.token).trim() : undefined,
  });
  return NextResponse.json(getNewsSettingsPublic(session.user.id));
}
