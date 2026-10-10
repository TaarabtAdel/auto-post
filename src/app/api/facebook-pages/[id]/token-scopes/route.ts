import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { facebookPage } from "@/db/schema/facebook-page";
import { eq, and } from "drizzle-orm";
import { decryptPageToken } from "@/lib/crypto";
import { debugAccessToken } from "@/lib/facebook";
import { getFacebookCredentials } from "@/lib/workspace-app";

type Params = { params: Promise<{ id: string }> };

const TRACKED_SCOPES = [
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_manage_engagement",
] as const;

/**
 * GET /api/facebook-pages/[id]/token-scopes — debug_token scopes on stored Page token
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const session = await getAppSession({ headers: await headers() });

  const { id } = await params;

  const row = await db
    .select({
      encryptedToken: facebookPage.encryptedToken,
      workspaceAppId: facebookPage.workspaceAppId,
      pageName: facebookPage.pageName,
    })
    .from(facebookPage)
    .where(
      and(eq(facebookPage.id, id), eq(facebookPage.userId, session.user.id))
    )
    .then((r) => r[0]);

  if (!row) {
    return NextResponse.json({ error: "Page không tồn tại." }, { status: 404 });
  }

  if (!row.workspaceAppId) {
    return NextResponse.json(
      { error: "Page chưa gán App — không debug được token." },
      { status: 400 }
    );
  }

  const decoded = decryptPageToken(row.encryptedToken);
  if (!decoded.ok) {
    return NextResponse.json(
      { error: decoded.message, code: decoded.code },
      { status: decoded.code === "wrong_key" ? 409 : 500 }
    );
  }

  try {
    const credentials = await getFacebookCredentials(
      row.workspaceAppId,
      session.user.id
    );
    const debug = await debugAccessToken(decoded.value, credentials);

    const scopeSet = new Set(debug.scopes);
    const tracked = Object.fromEntries(
      TRACKED_SCOPES.map((s) => [s, scopeSet.has(s)])
    ) as Record<(typeof TRACKED_SCOPES)[number], boolean>;

    return NextResponse.json({
      pageName: row.pageName,
      isValid: debug.isValid,
      type: debug.type,
      scopes: debug.scopes,
      tracked,
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Không gọi được debug_token.";
    if (msg.includes("App Secret")) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
