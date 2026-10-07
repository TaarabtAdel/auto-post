import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { facebookPage } from "@/db/schema/facebook-page";
import { eq, and } from "drizzle-orm";
import { decryptPageToken } from "@/lib/crypto";
import {
  getPageCountryRestrictions,
  setPageCountryRestrictions,
} from "@/lib/facebook";
import { isKnownCountryCode, PAGE_COUNTRY_OPTIONS } from "@/lib/page-country-options";

type Params = { params: Promise<{ id: string }> };

const ALLOWED_CODES = new Set<string>(PAGE_COUNTRY_OPTIONS.map((c) => c.code));

async function getOwnedPageRow(id: string, userId: string) {
  return db
    .select({
      id: facebookPage.id,
      pageId: facebookPage.pageId,
      pageName: facebookPage.pageName,
      encryptedToken: facebookPage.encryptedToken,
    })
    .from(facebookPage)
    .where(and(eq(facebookPage.id, id), eq(facebookPage.userId, userId)))
    .then((rows) => rows[0] ?? null);
}

function getPageToken(encryptedToken: string): string {
  const dec = decryptPageToken(encryptedToken);
  if (!dec.ok) {
    throw new Error(dec.message);
  }
  return dec.value;
}

/** GET — đọc giới hạn quốc gia từ Facebook */
export async function GET(_request: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const row = await getOwnedPageRow(id, session.user.id);
  if (!row) {
    return NextResponse.json({ error: "Page không tồn tại." }, { status: 404 });
  }

  try {
    const token = getPageToken(row.encryptedToken);
    const restrictions = await getPageCountryRestrictions(token, row.pageId);
    const selected = restrictions.countries.filter((c) => ALLOWED_CODES.has(c));

    return NextResponse.json({
      pageName: row.pageName,
      graphPageId: row.pageId,
      restrictionType: restrictions.restrictionType,
      enabled: restrictions.enabled,
      countries: restrictions.countries,
      /** Checkbox UI — mã trong danh sách UI đang bật */
      selectedCountries: selected,
      availableCountries: PAGE_COUNTRY_OPTIONS,
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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    const token = getPageToken(row.encryptedToken);
    await setPageCountryRestrictions(token, row.pageId, restrictionType, requested);

    return NextResponse.json({
      ok: true,
      message:
        requested.length === 0
          ? "Đã gỡ giới hạn quốc gia (theo cấu hình gửi lên Facebook)."
          : `Đã áp dụng ${restrictionType} cho: ${requested.join(", ")}.`,
      countries: requested,
      restrictionType,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Lỗi Facebook API.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
