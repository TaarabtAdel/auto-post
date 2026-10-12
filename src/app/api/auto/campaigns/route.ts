import { NextRequest, NextResponse } from "next/server";
import { apiUnauthorized } from "@/lib/api-unauthorized";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { autoCampaign } from "@/db/schema/auto-campaign";
import { eq, desc } from "drizzle-orm";
import { randomBytes } from "crypto";
import { autoCampaignToDto } from "@/lib/auto-campaign-api";
import {
  parseRunMode,
  stringifyPageIds,
  stringifyScheduleHours,
} from "@/lib/auto-campaign-json";

export async function GET() {
  const session = await getAppSession({ headers: await headers() });
  if (!session) return apiUnauthorized();
  const rows = await db
    .select()
    .from(autoCampaign)
    .where(eq(autoCampaign.userId, session.user.id))
    .orderBy(desc(autoCampaign.updatedAt))
    .limit(30);
  return NextResponse.json({ campaigns: rows.map(autoCampaignToDto) });
}

export async function POST(request: NextRequest) {
  const session = await getAppSession({ headers: await headers() });
  if (!session) return apiUnauthorized();

  let body: {
    name?: string;
    youtubeUrl?: string;
    youtubeVideoId?: string;
    youtubeTitle?: string;
    rawGemini?: string;
    times?: string;
    caption1?: string;
    caption2?: string;
    caption3?: string;
    sourceVideoPath?: string;
    backgroundPath?: string;
    firstComment?: string;
    wizardStep?: number;
    runMode?: string;
    autoDownloadVideo?: boolean;
    workspaceAppId?: string | null;
    facebookPageIds?: string[];
    scheduleHours?: number[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const id = randomBytes(16).toString("hex");
  const name = (body.name ?? "").trim() || "Campaign mới";

  await db.insert(autoCampaign).values({
    id,
    userId: session.user.id,
    name,
    youtubeUrl: body.youtubeUrl?.trim() || null,
    youtubeVideoId: body.youtubeVideoId?.trim() || null,
    youtubeTitle: body.youtubeTitle?.trim() || null,
    rawGemini: body.rawGemini?.trim() || null,
    times: body.times?.trim() ?? "",
    caption1: body.caption1?.trim() ?? "",
    caption2: body.caption2?.trim() ?? "",
    caption3: body.caption3?.trim() ?? "",
    sourceVideoPath: body.sourceVideoPath?.trim() || null,
    backgroundPath: body.backgroundPath?.trim() || null,
    firstComment: body.firstComment?.trim() || null,
    wizardStep: body.wizardStep ?? 0,
    runMode: parseRunMode(body.runMode),
    autoDownloadVideo: body.autoDownloadVideo ? 1 : 0,
    workspaceAppId: body.workspaceAppId?.trim() || null,
    facebookPageIds: body.facebookPageIds
      ? stringifyPageIds(body.facebookPageIds)
      : null,
    scheduleHours: body.scheduleHours
      ? stringifyScheduleHours(body.scheduleHours)
      : null,
    status: "draft",
  });

  const row = await db.select().from(autoCampaign).where(eq(autoCampaign.id, id)).limit(1);
  return NextResponse.json({ campaign: autoCampaignToDto(row[0]) });
}
