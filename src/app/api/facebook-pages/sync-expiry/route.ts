import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { syncPageTokenExpiryForUser } from "@/lib/renew-page-tokens";

/** POST — gọi debug_token cho token đã lưu, cập nhật cột hết hạn */
export async function POST() {
  const session = await getAppSession({ headers: await headers() });

  const updated = await syncPageTokenExpiryForUser(session.user.id);
  return NextResponse.json({ ok: true, updated });
}
