import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest, NextResponse } from "next/server";
import { authLimiter, checkRateLimit } from "@/lib/rate-limit";
import { verifyRegistrationGate } from "@/lib/registration-gate";

const { GET: authGET, POST: authPOST } = toNextJsHandler(auth);

export const GET = authGET;

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const limited = checkRateLimit(authLimiter, ip);
  if (limited) return limited;

  const pathname = new URL(request.url).pathname;
  if (pathname.endsWith("/sign-up/email")) {
    let body: Record<string, unknown>;
    try {
      body = (await request.clone().json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const inviteUser = String(body.inviteUser ?? "").trim();
    const invitePassword = String(body.invitePassword ?? "");
    if (!verifyRegistrationGate(inviteUser, invitePassword)) {
      return NextResponse.json(
        { message: "Mã mời đăng ký không đúng." },
        { status: 403 }
      );
    }

    const { inviteUser: _u, invitePassword: _p, ...signUpBody } = body;
    const forwarded = new NextRequest(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(signUpBody),
    });
    return authPOST(forwarded);
  }

  return authPOST(request);
}
