import { NextResponse } from "next/server";
import { apiUnauthorized } from "@/lib/api-unauthorized";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { autoCampaignToDto } from "@/lib/auto-campaign-api";
import {
  createCampaignPosts,
  getOwnedCampaign,
} from "@/lib/auto-campaign-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const session = await getAppSession({ headers: await headers() });
  if (!session) return apiUnauthorized();
  const { id } = await params;
  const row = await getOwnedCampaign(id, session.user.id);
  if (!row) {
    return NextResponse.json({ error: "Campaign không tồn tại." }, { status: 404 });
  }

  try {
    await createCampaignPosts(row);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Không tạo được bài viết.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const next = await getOwnedCampaign(id, session.user.id);
  return NextResponse.json({ campaign: autoCampaignToDto(next!) });
}
