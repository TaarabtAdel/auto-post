import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getAppSession } from "@/lib/app-session";
import { apiUnauthorized } from "@/lib/api-unauthorized";
import * as store from "@/lib/geo-sync/store";
import * as settings from "@/lib/geo-sync/settings";

/** Màn /geo: user đang đăng nhập theo dõi và sửa dữ liệu Geo Proxy Rotator của chính mình. */

async function requireUser() {
  const session = await getAppSession({ headers: await headers() });
  return session?.user ?? null;
}

function keyInfo(userId: string) {
  const key = store.readUserKey(userId);
  return { userId, syncKey: key?.token ?? "", syncKeyCreatedAt: key?.createdAt ?? null };
}

export async function GET() {
  const user = await requireUser();
  if (!user) return apiUnauthorized();
  return NextResponse.json({ ok: true, ...settings.overview(user.id), ...keyInfo(user.id) });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return apiUnauthorized();
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON không hợp lệ." }, { status: 400 });
  }
  try {
    switch (body.action) {
      case "inspect":
        return NextResponse.json({ ok: true, ...settings.inspectProxies(user.id, body.proxyText) });
      case "save": {
        const patch = settings.settingsPatch((body.form ?? {}) as Partial<settings.SettingsForm>);
        store.updateConfig(user.id, patch);
        return NextResponse.json({
          ok: true,
          ...settings.overview(user.id),
          ...keyInfo(user.id),
          message: `${patch.proxies.length} proxy, ${patch.articles.length} bài. Các máy chế độ Host nhận cài đặt mới trong vài giây.`,
        });
      }
      case "fetchProxies":
        return NextResponse.json({ ok: true, ...(await settings.fetchProxySources(body.sourceText)) });
      case "clear":
        store.clear(user.id, body.what);
        return NextResponse.json({ ok: true, ...settings.overview(user.id), ...keyInfo(user.id) });
      case "releaseMachine":
        return NextResponse.json({ ok: true, ...store.release(user.id, { machine: body.machine }) });
      case "rotateKey":
        store.rotateUserKey(user.id);
        return NextResponse.json({ ok: true, ...keyInfo(user.id) });
      default:
        return NextResponse.json({ error: "Thao tác không hợp lệ." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
