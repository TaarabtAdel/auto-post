import { NextResponse } from "next/server";
import { apiUnauthorized } from "@/lib/api-unauthorized";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { syncPageTokenExpiryForUser } from "@/lib/renew-page-tokens";

/** POST — gọi debug_token cho token đã lưu, cập nhật cột hết hạn */
export async function POST() {
  const session = await getAppSession({ headers: await headers() });
  if (!session) return apiUnauthorized();

  const updated = await syncPageTokenExpiryForUser(session.user.id);
  return NextResponse.json({ ok: true, updated });
}
