import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getAppSession } from "@/lib/app-session";
import { apiUnauthorized } from "@/lib/api-unauthorized";
import * as store from "@/lib/geo-sync/store";
import * as settings from "@/lib/geo-sync/settings";

/** Màn /geo trên auto-post: theo dõi và sửa cài đặt chung của Geo Proxy Rotator (cần đăng nhập). */

async function requireUser() {
  const session = await getAppSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function GET() {
  if (!(await requireUser())) return apiUnauthorized();
  return NextResponse.json({ ok: true, ...settings.overview(), configured: Boolean(process.env.GEO_SYNC_KEY?.trim()) });
}

export async function POST(request: NextRequest) {
  if (!(await requireUser())) return apiUnauthorized();
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON không hợp lệ." }, { status: 400 });
  }
  try {
    switch (body.action) {
      case "inspect":
        return NextResponse.json({ ok: true, ...settings.inspectProxies(body.proxyText) });
      case "save": {
        const patch = settings.settingsPatch((body.form ?? {}) as Partial<settings.SettingsForm>);
        store.updateConfig(patch);
        return NextResponse.json({
          ok: true,
          ...settings.overview(),
          message: `${patch.proxies.length} proxy, ${patch.articles.length} bài. Các máy chế độ Host nhận cài đặt mới trong vài giây.`,
        });
      }
      case "fetchProxies":
        return NextResponse.json({ ok: true, ...(await settings.fetchProxySources(body.sourceText)) });
      case "clear":
        store.clear(body.what);
        return NextResponse.json({ ok: true, ...settings.overview() });
      case "releaseMachine":
        return NextResponse.json({ ok: true, ...store.release({ machine: body.machine }) });
      default:
        return NextResponse.json({ error: "Thao tác không hợp lệ." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
