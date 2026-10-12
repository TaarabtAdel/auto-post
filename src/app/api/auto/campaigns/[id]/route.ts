import { NextRequest, NextResponse } from "next/server";
import { apiUnauthorized } from "@/lib/api-unauthorized";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { autoCampaign } from "@/db/schema/auto-campaign";
import { eq } from "drizzle-orm";
import { autoCampaignToDto } from "@/lib/auto-campaign-api";
import {
  deleteOwnedCampaign,
  getOwnedCampaign,
  syncExistingCampaignPostPages,
} from "@/lib/auto-campaign-service";
import { parseRunMode } from "@/lib/auto-campaign-json";

type Params = { params: Promise<{ id: string }> };

function trimText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function trimNullable(value: string | null | undefined): string | null {
  const t = trimText(value);
  return t || null;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const session = await getAppSession({ headers: await headers() });
  if (!session) return apiUnauthorized();
  const { id } = await params;
  const row = await getOwnedCampaign(id, session.user.id);
  if (!row) {
    return NextResponse.json({ error: "Campaign không tồn tại." }, { status: 404 });
  }
  return NextResponse.json({ campaign: autoCampaignToDto(row) });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await getAppSession({ headers: await headers() });
  if (!session) return apiUnauthorized();
  const { id } = await params;
  const row = await getOwnedCampaign(id, session.user.id);
  if (!row) {
    return NextResponse.json({ error: "Campaign không tồn tại." }, { status: 404 });
  }

  if (row.status === "planned" || row.status === "running") {
    return NextResponse.json(
      { error: "Campaign đang/đã hẹn chạy AUTO — không sửa được." },
      { status: 409 }
    );
  }

  let body: {
    name?: string;
    wizardStep?: number;
    youtubeUrl?: string;
    youtubeVideoId?: string;
    youtubeTitle?: string;
    rawGemini?: string;
    firstComment?: string | null;
    times?: string;
    caption1?: string;
    caption2?: string;
    caption3?: string;
    sourceVideoPath?: string | null;
    backgroundPath?: string | null;
    workspaceAppId?: string | null;
    facebookPageIds?: string[];
    scheduleHours?: number[];
    runMode?: string;
    autoDownloadVideo?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = trimText(body.name) || row.name;
  if (body.youtubeUrl !== undefined) updates.youtubeUrl = trimNullable(body.youtubeUrl);
  if (body.youtubeVideoId !== undefined) {
    updates.youtubeVideoId = trimNullable(body.youtubeVideoId);
  }
  if (body.youtubeTitle !== undefined) updates.youtubeTitle = trimNullable(body.youtubeTitle);
  if (body.rawGemini !== undefined) updates.rawGemini = trimNullable(body.rawGemini);
  if (body.firstComment !== undefined) {
    updates.firstComment = trimNullable(body.firstComment);
  }
  if (body.wizardStep !== undefined && Number.isFinite(body.wizardStep)) {
    updates.wizardStep = Math.max(0, Math.min(6, Math.floor(body.wizardStep)));
  }
  if (body.times !== undefined) updates.times = trimText(body.times);
  if (body.caption1 !== undefined) updates.caption1 = trimText(body.caption1);
  if (body.caption2 !== undefined) updates.caption2 = trimText(body.caption2);
  if (body.caption3 !== undefined) updates.caption3 = trimText(body.caption3);
  if (body.sourceVideoPath !== undefined) {
    updates.sourceVideoPath = trimNullable(body.sourceVideoPath);
  }
  if (body.backgroundPath !== undefined) {
    updates.backgroundPath = trimNullable(body.backgroundPath);
  }
  if (body.workspaceAppId !== undefined) {
    updates.workspaceAppId = trimNullable(body.workspaceAppId);
  }
  if (body.facebookPageIds !== undefined) {
    const { stringifyPageIds } = await import("@/lib/auto-campaign-json");
    updates.facebookPageIds = stringifyPageIds(body.facebookPageIds);
  }
  if (body.scheduleHours !== undefined) {
    const { stringifyScheduleHours } = await import("@/lib/auto-campaign-json");
    updates.scheduleHours = stringifyScheduleHours(body.scheduleHours);
  }
  if (body.runMode !== undefined) {
    updates.runMode = parseRunMode(body.runMode);
  }
  if (body.autoDownloadVideo !== undefined) {
    updates.autoDownloadVideo = body.autoDownloadVideo ? 1 : 0;
  }

  if (Object.keys(updates).length > 0) {
    if (row.status === "failed" || row.status === "completed") {
      updates.status = "draft";
    }
    await db.update(autoCampaign).set(updates).where(eq(autoCampaign.id, id));
  }

  const next = await getOwnedCampaign(id, session.user.id);
  if (next && body.facebookPageIds !== undefined) {
    await syncExistingCampaignPostPages(next);
  }
  return NextResponse.json({ campaign: autoCampaignToDto(next!) });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const session = await getAppSession({ headers: await headers() });
  if (!session) return apiUnauthorized();
  const { id } = await params;

  try {
    await deleteOwnedCampaign(id, session.user.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Không xóa được.";
    const status = msg.includes("không tồn tại") ? 404 : 409;
    return NextResponse.json({ error: msg }, { status });
  }

  return NextResponse.json({ ok: true });
}
