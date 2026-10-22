import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { isAuthBypassEnabled } from "@/lib/auth-bypass";

const PUBLIC_PATHS = new Set([
  "/login",
  "/register",
  "/terms",
  "/privacy",
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  return false;
}

function n8nApiKeyMatches(request: NextRequest): boolean {
  const apiKey = process.env.N8N_API_KEY?.trim();
  if (!apiKey) return false;
  const provided = request.headers.get("x-api-key");
  return provided === apiKey;
}

function isN8nApiRoute(pathname: string, request: NextRequest): boolean {
  if (pathname === "/api/posts/due") return n8nApiKeyMatches(request);
  if (/^\/api\/posts\/[^/]+\/publish$/.test(pathname)) {
    return n8nApiKeyMatches(request);
  }
  return false;
}

export function middleware(request: NextRequest) {
  if (isAuthBypassEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // App Geo Proxy Rotator Browser tự xác thực bằng x-geo-sync-key trong route.
  // /api/geo-sync/admin (màn /geo) vẫn cần đăng nhập như các API khác.
  if (pathname === "/api/geo-sync") {
    return NextResponse.next();
  }

  if (isPublicPath(pathname) || isN8nApiRoute(pathname, request)) {
    return NextResponse.next();
  }

  const sessionToken = getSessionCookie(request);
  if (sessionToken) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
