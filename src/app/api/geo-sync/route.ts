import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/geo-sync/store";

/**
 * POST /api/geo-sync — app Geo Proxy Rotator Browser đồng bộ dữ liệu của một user giữa nhiều máy.
 * Header x-geo-user-id (ID user auto-post) + x-geo-sync-key (khoá đồng bộ của user, lấy ở /geo).
 * Body: { action, ...tham số }. Mọi dữ liệu và giữ chỗ proxy tách riêng theo user.
 */

export async function POST(request: NextRequest) {
  const userId = (request.headers.get("x-geo-user-id") ?? "").trim();
  const token = request.headers.get("x-geo-sync-key") ?? "";
  if (!userId || !token) {
    return NextResponse.json({ error: "Thiếu ID user hoặc khoá đồng bộ." }, { status: 401 });
  }
  if (!store.verifyUserKey(userId, token)) {
    return NextResponse.json({ error: "Sai ID user hoặc khoá đồng bộ." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON không hợp lệ." }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "ping":
        return NextResponse.json({ ok: true, userId, ...store.stats(userId) });
      case "pull":
        return NextResponse.json({ ok: true, ...store.changesSince(userId, body.since) });
      case "setHealth":
        store.setHealth(userId, body.proxyKey, (body.entry ?? {}) as Partial<store.HealthEntry>);
        return NextResponse.json({ ok: true });
      case "remember":
        store.remember(userId, body.proxyKey, body.url, (body.outcome ?? null) as { ok?: unknown; note?: unknown } | null);
        return NextResponse.json({ ok: true });
      case "batch": {
        // Nhiều lệnh ghi gửi dồn (khi máy vừa có mạng lại).
        const ops = Array.isArray(body.ops) ? body.ops.slice(0, 5000) : [];
        for (const op of ops as Record<string, unknown>[]) {
          if (op.action === "setHealth") store.setHealth(userId, op.proxyKey, (op.entry ?? {}) as Partial<store.HealthEntry>);
          else if (op.action === "remember") {
            store.remember(userId, op.proxyKey, op.url, (op.outcome ?? null) as { ok?: unknown; note?: unknown } | null);
          }
        }
        return NextResponse.json({ ok: true, applied: ops.length });
      }
      case "updateConfig":
        return NextResponse.json({ ok: true, config: store.updateConfig(userId, body.patch) });
      case "clear":
        store.clear(userId, body.what);
        return NextResponse.json({ ok: true });
      case "claim":
        return NextResponse.json(store.claim(userId, body));
      case "renew":
        return NextResponse.json({ ok: true, ...store.renew(userId, body) });
      case "release":
        return NextResponse.json({ ok: true, ...store.release(userId, body) });
      case "import":
        return NextResponse.json({
          ok: true,
          ...store.importData(
            userId,
            (body.data ?? {}) as Parameters<typeof store.importData>[1],
            body.overwriteConfig === true
          ),
        });
      default:
        return NextResponse.json({ error: "Thao tác không hợp lệ." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
