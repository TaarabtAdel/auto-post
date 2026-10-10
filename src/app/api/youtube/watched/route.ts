import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { db, sqlite } from "@/lib/db";
import { youtubeWatched } from "@/db/schema/youtube-watched";
import { and, eq, inArray } from "drizzle-orm";
import { randomBytes } from "crypto";

function ensureTable() {
  sqlite().exec(`
    CREATE TABLE IF NOT EXISTS youtube_watched (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      video_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS youtube_watched_user_video_idx
      ON youtube_watched (user_id, video_id);
  `);
}

async function requireUser() {
  const session = await getAppSession({
    headers: await headers(),
  });
  return session.user;
}

export async function GET() {
  const user = await requireUser();
  ensureTable();

  const rows = await db
    .select({ videoId: youtubeWatched.videoId })
    .from(youtubeWatched)
    .where(eq(youtubeWatched.userId, user.id));

  return NextResponse.json({ ids: rows.map((r) => r.videoId) });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  ensureTable();

  let body: { videoId?: string; videoIds?: string[]; watched?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const ids = [
    ...new Set(
      [body.videoId, ...(body.videoIds ?? [])]
        .map((id) => id?.trim())
        .filter((id): id is string => Boolean(id))
    ),
  ];
  if (ids.length === 0) {
    return NextResponse.json({ error: "Thiếu videoId." }, { status: 400 });
  }

  const watched = body.watched !== false;

  if (watched) {
    const existing = await db
      .select({ videoId: youtubeWatched.videoId })
      .from(youtubeWatched)
      .where(
        and(eq(youtubeWatched.userId, user.id), inArray(youtubeWatched.videoId, ids))
      );
    const have = new Set(existing.map((r) => r.videoId));
    const toInsert = ids.filter((id) => !have.has(id));
    if (toInsert.length > 0) {
      await db.insert(youtubeWatched).values(
        toInsert.map((videoId) => ({
          id: randomBytes(16).toString("hex"),
          userId: user.id,
          videoId,
        }))
      );
    }
  } else {
    await db
      .delete(youtubeWatched)
      .where(
        and(eq(youtubeWatched.userId, user.id), inArray(youtubeWatched.videoId, ids))
      );
  }

  const rows = await db
    .select({ videoId: youtubeWatched.videoId })
    .from(youtubeWatched)
    .where(eq(youtubeWatched.userId, user.id));

  return NextResponse.json({ ids: rows.map((r) => r.videoId) });
}
