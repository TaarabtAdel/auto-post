import { NextRequest, NextResponse } from "next/server";
import { apiUnauthorized } from "@/lib/api-unauthorized";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { youtubeList } from "@/db/schema/youtube-list";
import { migrateYoutubeListSchema } from "@/lib/youtube-list-schema";
import { eq, asc } from "drizzle-orm";
import { randomBytes } from "crypto";
import type { YouTubeSearchHit } from "@/lib/youtube-url";

async function requireUser() {
  const session = await getAppSession({
    headers: await headers(),
  });
  if (!session) return null;
  return session.user;
}

function normalizeHits(raw: unknown): YouTubeSearchHit[] {
  if (!Array.isArray(raw)) return [];
  const out: YouTubeSearchHit[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      title: String(row.title ?? "(không tiêu đề)"),
      channel: String(row.channel ?? ""),
      durationSec:
        typeof row.durationSec === "number" && Number.isFinite(row.durationSec)
          ? Math.max(0, Math.round(row.durationSec))
          : 0,
      url: String(row.url ?? `https://www.youtube.com/watch?v=${id}`),
    });
  }
  return out;
}

/** GET /api/youtube/list — danh sách video theo user đăng nhập */
export async function GET() {
  const user = await requireUser();
  if (!user) return apiUnauthorized();
  migrateYoutubeListSchema();

  const rows = await db
    .select()
    .from(youtubeList)
    .where(eq(youtubeList.userId, user.id))
    .orderBy(asc(youtubeList.sortOrder));

  const results: YouTubeSearchHit[] = rows.map((r) => ({
    id: r.videoId,
    title: r.title,
    channel: r.channel,
    durationSec: r.durationSec,
    url: r.url,
  }));

  return NextResponse.json({ results });
}

/**
 * PUT /api/youtube/list — ghi đè toàn bộ danh sách của user.
 * Body: { results: YouTubeSearchHit[] }
 */
export async function PUT(request: NextRequest) {
  const user = await requireUser();
  if (!user) return apiUnauthorized();
  migrateYoutubeListSchema();

  let body: { results?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const hits = normalizeHits(body.results);
  if (hits.length > 500) {
    return NextResponse.json(
      { error: "Tối đa 500 video trong danh sách." },
      { status: 400 }
    );
  }

  await db.delete(youtubeList).where(eq(youtubeList.userId, user.id));

  if (hits.length > 0) {
    const now = new Date();
    await db.insert(youtubeList).values(
      hits.map((h, sortOrder) => ({
        id: randomBytes(16).toString("hex"),
        userId: user.id,
        videoId: h.id,
        title: h.title,
        channel: h.channel,
        durationSec: h.durationSec,
        url: h.url,
        sortOrder,
        createdAt: now,
        updatedAt: now,
      }))
    );
  }

  return NextResponse.json({ results: hits, count: hits.length });
}
