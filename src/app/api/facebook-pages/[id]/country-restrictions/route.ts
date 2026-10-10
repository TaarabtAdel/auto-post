import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { facebookPage } from "@/db/schema/facebook-page";
import { eq, and } from "drizzle-orm";
import {
  getPageCountryRestrictions,
  setPageCountryRestrictions,
} from "@/lib/facebook";
import { isKnownCountryCode, PAGE_COUNTRY_OPTIONS } from "@/lib/page-country-options";
import { resolvePageTokenForCountryRestrictions } from "@/lib/page-token-for-country";

type Params = { params: Promise<{ id: string }> };

const ALLOWED_CODES = new Set<string>(PAGE_COUNTRY_OPTIONS.map((c) => c.code));

async function getOwnedPageRow(id: string, userId: string) {
  return db
    .select({
      id: facebookPage.id,
      pageId: facebookPage.pageId,
      pageName: facebookPage.pageName,
      encryptedToken: facebookPage.encryptedToken,
      workspaceAppId: facebookPage.workspaceAppId,
    })
    .from(facebookPage)
    .where(and(eq(facebookPage.id, id), eq(facebookPage.userId, userId)))
    .then((rows) => rows[0] ?? null);
}

/** GET — đọc giới hạn quốc gia từ Facebook */
export async function GET(_request: NextRequest, { params }: Params) {
  const session = await getAppSession({ headers: await headers() });

  const { id } = await params;
  const row = await getOwnedPageRow(id, session.user.id);
  if (!row) {
    return NextResponse.json({ error: "Page không tồn tại." }, { status: 404 });
  }

  try {
    const { token, source } = await resolvePageTokenForCountryRestrictions(
      row,
      session.user.id
    );
    const restrictions = await getPageCountryRestrictions(token, row.pageId);
    const selected = restrictions.countries.filter((c) => ALLOWED_CODES.has(c));

    return NextResponse.json({
      pageName: row.pageName,
      graphPageId: row.pageId,
      restrictionType: restrictions.restrictionType,
      enabled: restrictions.enabled,
      countries: restrictions.countries,
      selectedCountries: selected,
      availableCountries: PAGE_COUNTRY_OPTIONS,
      tokenSource: source,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Lỗi Facebook API.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/**
 * PATCH — cập nhật whitelist theo checkbox (hiện chỉ US).
 * Body: { countries: string[] } — rỗng = gỡ giới hạn (whitelist không country).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await getAppSession({ headers: await headers() });

  const { id } = await params;
  const row = await getOwnedPageRow(id, session.user.id);
  if (!row) {
    return NextResponse.json({ error: "Page không tồn tại." }, { status: 404 });
  }

  let body: { countries?: string[]; restrictionType?: "whitelist" | "blacklist" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const requested = (body.countries ?? []).filter(
    (c) => typeof c === "string" && isKnownCountryCode(c)
  );

  const restrictionType = body.restrictionType === "blacklist" ? "blacklist" : "whitelist";

  try {
    const { token, source } = await resolvePageTokenForCountryRestrictions(
      row,
      session.user.id
    );
    await setPageCountryRestrictions(token, row.pageId, restrictionType, requested);

    const viaUser =
      source === "app_user_token"
        ? " (token Page lấy từ User token trên /apps)"
        : "";

    return NextResponse.json({
      ok: true,
      message:
        requested.length === 0
          ? `Đã gỡ giới hạn quốc gia${viaUser}.`
          : `Đã áp dụng ${restrictionType} cho: ${requested.join(", ")}${viaUser}.`,
      countries: requested,
      restrictionType,
      tokenSource: source,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Lỗi Facebook API.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
