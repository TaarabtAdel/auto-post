import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { autoCampaignToDto } from "@/lib/auto-campaign-api";
import { getOwnedCampaign } from "@/lib/auto-campaign-service";
import { runManualAutoCampaign } from "@/lib/auto-campaign-processor";

export const runtime = "nodejs";
export const maxDuration = 600;

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  const session = await getAppSession({ headers: await headers() });
  const { id } = await params;

  const result = await runManualAutoCampaign(id, session.user.id);
  const row = await getOwnedCampaign(id, session.user.id);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, campaign: row ? autoCampaignToDto(row) : null },
      { status: result.httpStatus }
    );
  }

  const final = await getOwnedCampaign(id, session.user.id);
  return NextResponse.json({
    campaign: final ? autoCampaignToDto(final) : null,
  });
}
