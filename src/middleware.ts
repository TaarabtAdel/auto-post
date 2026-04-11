import { betterFetch } from "@better-fetch/fetch";
import { NextRequest, NextResponse } from "next/server";
import type { auth } from "@/lib/auth";

type Session = typeof auth.$Infer.Session;

export async function middleware(request: NextRequest) {
  // In production behind reverse proxy, use internal HTTP to avoid SSL issues
  const baseURL = process.env.NODE_ENV === "production" 
    ? "http://localhost:3000" 
    : request.nextUrl.origin;
    
  const { data: session } = await betterFetch<Session>(
    "/api/auth/get-session",
    {
      baseURL,
      headers: {
        cookie: request.headers.get("cookie") || "",
      },
    }
  );

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/posts/:path*", "/pages/:path*"],
};
