import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { buildOAuthUrl } from "@/lib/facebook";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";

/**
 * GET /api/auth/facebook/connect
 * Redirects user to Facebook OAuth dialog.
 * Requires authenticated session.
 */
export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.FACEBOOK_APP_ID) {
    return NextResponse.json(
      { error: "Facebook App ID chưa được cấu hình." },
      { status: 500 }
    );
  }

  const baseUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";
  const redirectUri = `${baseUrl}/api/auth/facebook/callback`;

  // CSRF state token
  const state = randomBytes(16).toString("hex");

  // Store state in cookie for verification in callback
  const cookieStore = await cookies();
  cookieStore.set("fb_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  const authUrl = buildOAuthUrl(redirectUri, state);

  return NextResponse.redirect(authUrl);
}
