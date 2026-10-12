import { NextRequest, NextResponse } from "next/server";
import { apiUnauthorized } from "@/lib/api-unauthorized";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { autoCampaignToDto } from "@/lib/auto-campaign-api";
import {
  getOwnedCampaign,
  renderCampaignReels,
} from "@/lib/auto-campaign-service";
import type { AspectRatioId } from "@/lib/reel/types";

export const runtime = "nodejs";
export const maxDuration = 600;

type Params = { params: Promise<{ id: string }> };

const ASPECTS = new Set<AspectRatioId>(["9:16", "1:1", "16:9"]);

export async function POST(request: NextRequest, { params }: Params) {
  const session = await getAppSession({ headers: await headers() });
  if (!session) return apiUnauthorized();
  const { id } = await params;
  const row = await getOwnedCampaign(id, session.user.id);
  if (!row) {
    return NextResponse.json({ error: "Campaign không tồn tại." }, { status: 404 });
  }

  let body: { aspectRatio?: string; flipVideo?: boolean; videoVolume?: number } = {};
  try {
    body = await request.json();
  } catch {
    // optional body
  }

  const aspectRatio = ASPECTS.has(body.aspectRatio as AspectRatioId)
    ? (body.aspectRatio as AspectRatioId)
    : "9:16";

  try {
    const reelPaths = await renderCampaignReels(row, {
      aspectRatio,
      flipVideo: body.flipVideo === true,
      videoVolume:
        typeof body.videoVolume === "number" ? body.videoVolume : undefined,
    });
    const next = await getOwnedCampaign(id, session.user.id);
    return NextResponse.json({ campaign: autoCampaignToDto(next!), reelPaths });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Render thất bại.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
