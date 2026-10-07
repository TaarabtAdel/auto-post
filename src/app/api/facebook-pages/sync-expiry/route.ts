import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { syncPageTokenExpiryForUser } from "@/lib/renew-page-tokens";

/** POST — gọi debug_token cho token đã lưu, cập nhật cột hết hạn */
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const updated = await syncPageTokenExpiryForUser(session.user.id);
  return NextResponse.json({ ok: true, updated });
}
