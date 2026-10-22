import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { apiUnauthorized } from "@/lib/api-unauthorized";
import { getAppSession } from "@/lib/app-session";
import { isYouTubeUrl } from "@/lib/youtube-url";
import { NewsPublishError, publishYouTubeAsNews } from "@/lib/news-publisher";
import { appendSystemLog } from "@/lib/system-log";

export const runtime = "nodejs";
export const maxDuration = 600;

/** POST /api/youtube/publish-news — body { url } → lấy info, soạn bài, đăng tin. */
export async function POST(request: NextRequest) {
  const session = await getAppSession({ headers: await headers() });
  if (!session) return apiUnauthorized();

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const url = body.url?.trim() ?? "";
  if (!url || !isYouTubeUrl(url)) {
    return NextResponse.json({ error: "Link YouTube không hợp lệ." }, { status: 400 });
  }

  try {
    const result = await publishYouTubeAsNews(url, session.user.id);
    appendSystemLog({
      category: "publish",
      level: "info",
      message: "Đăng tin từ YouTube | XONG",
      detail: { url, title: result.title, userId: session.user.id },
    });
    return NextResponse.json({ ok: true, title: result.title, response: result.response });
  } catch (e) {
    const step = e instanceof NewsPublishError ? e.step : undefined;
    const message = e instanceof Error ? e.message : String(e);
    appendSystemLog({
      category: "publish",
      level: "error",
      message: "Đăng tin từ YouTube | LỖI",
      detail: { url, step, error: message, userId: session.user.id },
    });
    return NextResponse.json({ ok: false, step, error: message }, { status: 502 });
  }
}
