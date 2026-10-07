import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { buildOAuthUrl } from "@/lib/facebook";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { getFacebookCredentials } from "@/lib/workspace-app";

/**
 * GET /api/auth/facebook/connect?workspaceAppId=...
 * Redirects user to Facebook OAuth dialog.
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceAppId = request.nextUrl.searchParams.get("workspaceAppId")?.trim();
  if (!workspaceAppId) {
    return NextResponse.json(
      { error: "Chọn App (workspaceAppId) trước khi kết nối Facebook." },
      { status: 400 }
    );
  }

  let credentials;
  try {
    credentials = await getFacebookCredentials(workspaceAppId, session.user.id);
  } catch {
    return NextResponse.json({ error: "App không hợp lệ." }, { status: 404 });
  }

  const baseUrl =
    process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT || "3100"}`;
  const redirectUri = `${baseUrl}/api/auth/facebook/callback`;

  const state = randomBytes(16).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set("fb_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  cookieStore.set("fb_oauth_workspace_app_id", workspaceAppId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const authUrl = buildOAuthUrl(redirectUri, state, credentials);

  return NextResponse.redirect(authUrl);
}
