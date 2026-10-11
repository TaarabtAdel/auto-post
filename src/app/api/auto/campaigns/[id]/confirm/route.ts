import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { autoCampaign } from "@/db/schema/auto-campaign";
import { eq } from "drizzle-orm";
import { autoCampaignToDto } from "@/lib/auto-campaign-api";
import {
  getOwnedCampaign,
  validateCampaignPlan,
} from "@/lib/auto-campaign-service";
import { datetimeLocalInAppTzToIso } from "@/lib/scheduled-at";
import { parseRunMode } from "@/lib/auto-campaign-json";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const session = await getAppSession({ headers: await headers() });
  const { id } = await params;
  const row = await getOwnedCampaign(id, session.user.id);
  if (!row) {
    return NextResponse.json({ error: "Campaign không tồn tại." }, { status: 404 });
  }

  if (row.status === "planned" || row.status === "running") {
    return NextResponse.json(
      { error: "Campaign đã được hẹn chạy AUTO." },
      { status: 409 }
    );
  }

  let body: { executeAt?: string; runMode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  let executeAt: Date | null = null;
  if (body.executeAt) {
    if (body.executeAt.includes("T") && !body.executeAt.endsWith("Z")) {
      executeAt = new Date(datetimeLocalInAppTzToIso(body.executeAt));
    } else {
      executeAt = new Date(body.executeAt);
    }
  }

  if (!executeAt || Number.isNaN(executeAt.getTime())) {
    return NextResponse.json(
      { error: "Chọn thời điểm chạy AUTO hợp lệ." },
      { status: 400 }
    );
  }

  const runMode = parseRunMode(body.runMode ?? row.runMode);

  await db
    .update(autoCampaign)
    .set({
      executeAt,
      wizardStep: 6,
      status: "ready",
      runMode,
    })
    .where(eq(autoCampaign.id, id));

  const updated = (await getOwnedCampaign(id, session.user.id))!;
  const err = validateCampaignPlan(updated);
  if (err) {
    await db
      .update(autoCampaign)
      .set({ status: "draft", executeAt: null })
      .where(eq(autoCampaign.id, id));
    return NextResponse.json({ error: err }, { status: 400 });
  }

  await db
    .update(autoCampaign)
    .set({ status: "planned" })
    .where(eq(autoCampaign.id, id));

  const final = (await getOwnedCampaign(id, session.user.id))!;
  return NextResponse.json({ campaign: autoCampaignToDto(final) });
}
