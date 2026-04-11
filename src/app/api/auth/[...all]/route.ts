import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest } from "next/server";
import { authLimiter, checkRateLimit } from "@/lib/rate-limit";

const { GET: authGET, POST: authPOST } = toNextJsHandler(auth);

export const GET = authGET;

export async function POST(request: NextRequest) {
  // Rate limit auth POST requests (login, register, etc.) by IP
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
  const limited = checkRateLimit(authLimiter, ip);
  if (limited) return limited;

  return authPOST(request);
}
