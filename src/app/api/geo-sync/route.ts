import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import * as store from "@/lib/geo-sync/store";

/**
 * POST /api/geo-sync — đồng bộ dữ liệu app Geo Proxy Rotator Browser giữa nhiều máy.
 * Header x-geo-sync-key phải khớp GEO_SYNC_KEY trong .env. Thiếu GEO_SYNC_KEY thì API đóng.
 * Body: { action, ...tham số }.
 */

function keyMatches(request: NextRequest): boolean {
  const expected = process.env.GEO_SYNC_KEY?.trim();
  const provided = request.headers.get("x-geo-sync-key") ?? "";
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!process.env.GEO_SYNC_KEY?.trim()) {
    return NextResponse.json({ error: "Máy chủ chưa cấu hình GEO_SYNC_KEY." }, { status: 503 });
  }
  if (!keyMatches(request)) {
    return NextResponse.json({ error: "Sai khoá đồng bộ." }, { status: 401 });
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
        return NextResponse.json({ ok: true, ...store.stats() });
      case "pull":
        return NextResponse.json({ ok: true, ...store.changesSince(body.since) });
      case "setHealth":
        store.setHealth(body.proxyKey, (body.entry ?? {}) as Partial<store.HealthEntry>);
        return NextResponse.json({ ok: true });
      case "remember":
        store.remember(body.proxyKey, body.url, (body.outcome ?? null) as { ok?: unknown; note?: unknown } | null);
        return NextResponse.json({ ok: true });
      case "batch": {
        // Nhiều lệnh ghi gửi dồn (khi máy vừa có mạng lại).
        const ops = Array.isArray(body.ops) ? body.ops.slice(0, 5000) : [];
        for (const op of ops as Record<string, unknown>[]) {
          if (op.action === "setHealth") store.setHealth(op.proxyKey, (op.entry ?? {}) as Partial<store.HealthEntry>);
          else if (op.action === "remember") store.remember(op.proxyKey, op.url, (op.outcome ?? null) as { ok?: unknown; note?: unknown } | null);
        }
        return NextResponse.json({ ok: true, applied: ops.length });
      }
      case "updateConfig":
        return NextResponse.json({ ok: true, config: store.updateConfig(body.patch) });
      case "clear":
        store.clear(body.what);
        return NextResponse.json({ ok: true });
      case "claim":
        return NextResponse.json(store.claim(body));
      case "renew":
        return NextResponse.json({ ok: true, ...store.renew(body) });
      case "release":
        return NextResponse.json({ ok: true, ...store.release(body) });
      case "import":
        return NextResponse.json({
          ok: true,
          ...store.importData((body.data ?? {}) as Parameters<typeof store.importData>[0], body.overwriteConfig === true),
        });
      default:
        return NextResponse.json({ error: "Thao tác không hợp lệ." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
