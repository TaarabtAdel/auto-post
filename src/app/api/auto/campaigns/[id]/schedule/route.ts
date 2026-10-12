import { NextRequest, NextResponse } from "next/server";
import { apiUnauthorized } from "@/lib/api-unauthorized";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { autoCampaignToDto } from "@/lib/auto-campaign-api";
import {
  getOwnedCampaign,
  scheduleCampaignPosts,
} from "@/lib/auto-campaign-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const session = await getAppSession({ headers: await headers() });
  if (!session) return apiUnauthorized();
  const { id } = await params;
  const row = await getOwnedCampaign(id, session.user.id);
  if (!row) {
    return NextResponse.json({ error: "Campaign không tồn tại." }, { status: 404 });
  }

  let body: { facebookPageIds?: string[]; scheduleHours?: number[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const pageIds = [...new Set((body.facebookPageIds ?? []).filter(Boolean))];
  if (pageIds.length === 0) {
    return NextResponse.json(
      { error: "Chọn ít nhất một Fanpage." },
      { status: 400 }
    );
  }

  try {
    await scheduleCampaignPosts(row, pageIds, body.scheduleHours);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Hẹn giờ thất bại.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const next = await getOwnedCampaign(id, session.user.id);
  return NextResponse.json({ campaign: autoCampaignToDto(next!) });
}
