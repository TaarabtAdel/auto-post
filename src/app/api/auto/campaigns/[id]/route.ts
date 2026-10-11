import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { autoCampaign } from "@/db/schema/auto-campaign";
import { eq } from "drizzle-orm";
import { autoCampaignToDto } from "@/lib/auto-campaign-api";
import { deleteOwnedCampaign, getOwnedCampaign } from "@/lib/auto-campaign-service";
import { parseRunMode } from "@/lib/auto-campaign-json";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const session = await getAppSession({ headers: await headers() });
  const { id } = await params;
  const row = await getOwnedCampaign(id, session.user.id);
  if (!row) {
    return NextResponse.json({ error: "Campaign không tồn tại." }, { status: 404 });
  }
  return NextResponse.json({ campaign: autoCampaignToDto(row) });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await getAppSession({ headers: await headers() });
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
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim() || row.name;
  if (body.youtubeUrl !== undefined) updates.youtubeUrl = body.youtubeUrl.trim() || null;
  if (body.youtubeVideoId !== undefined) {
    updates.youtubeVideoId = body.youtubeVideoId.trim() || null;
  }
  if (body.youtubeTitle !== undefined) updates.youtubeTitle = body.youtubeTitle.trim() || null;
  if (body.rawGemini !== undefined) updates.rawGemini = body.rawGemini.trim() || null;
  if (body.firstComment !== undefined) {
    updates.firstComment = body.firstComment?.trim() || null;
  }
  if (body.wizardStep !== undefined && Number.isFinite(body.wizardStep)) {
    updates.wizardStep = Math.max(0, Math.min(6, Math.floor(body.wizardStep)));
  }
  if (body.times !== undefined) updates.times = body.times.trim();
  if (body.caption1 !== undefined) updates.caption1 = body.caption1.trim();
  if (body.caption2 !== undefined) updates.caption2 = body.caption2.trim();
  if (body.caption3 !== undefined) updates.caption3 = body.caption3.trim();
  if (body.sourceVideoPath !== undefined) {
    updates.sourceVideoPath = body.sourceVideoPath?.trim() || null;
  }
  if (body.backgroundPath !== undefined) {
    updates.backgroundPath = body.backgroundPath?.trim() || null;
  }
  if (body.workspaceAppId !== undefined) {
    updates.workspaceAppId = body.workspaceAppId?.trim() || null;
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

  if (Object.keys(updates).length > 0) {
    if (row.status === "failed" || row.status === "completed") {
      updates.status = "draft";
    }
    await db.update(autoCampaign).set(updates).where(eq(autoCampaign.id, id));
  }

  const next = await getOwnedCampaign(id, session.user.id);
  return NextResponse.json({ campaign: autoCampaignToDto(next!) });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const session = await getAppSession({ headers: await headers() });
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
