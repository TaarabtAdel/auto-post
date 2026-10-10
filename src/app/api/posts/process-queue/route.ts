import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { drainPublishQueue } from "@/lib/publish-queue-processor";
import { cronLog } from "@/lib/cron-log";

/** POST /api/posts/process-queue — xử lý job queue đến hạn (dev / thủ công) */
export async function POST() {
  const session = await getAppSession({ headers: await headers() });

  cronLog("API POST /api/posts/process-queue (Run now cả queue)", {
    userId: session.user.id,
  });
  const processed = await drainPublishQueue(15);
  return NextResponse.json({ ok: true, processed });
}
