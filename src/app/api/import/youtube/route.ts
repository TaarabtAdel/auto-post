import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { join, relative } from "path";
import { mkdir } from "fs/promises";
import { youtubeLimiter, checkRateLimit } from "@/lib/rate-limit";
import { uploadMediaPublicUrl } from "@/lib/upload-media-url";
import {
  downloadYouTubeVideo,
  getYouTubeInfo,
  isYouTubeUrl,
  listYouTubeDownloads,
  searchYouTubeVideos,
  type YouTubeQuality,
} from "@/lib/youtube";

export const runtime = "nodejs";
export const maxDuration = 180;

const QUALITIES = new Set<YouTubeQuality>(["best", "1080", "720", "480", "360"]);

async function requireUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) return null;
  return session.user;
}

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userDir = join(process.cwd(), "uploads", user.id);
  const files = await listYouTubeDownloads(userDir);
  return NextResponse.json({
    files: files.map((f) => ({
      fileName: f.fileName,
      filePath: `${user.id}/${f.fileName}`,
      fileSize: f.fileSize,
      mimeType: "video/mp4",
      fileType: "video",
      url: uploadMediaPublicUrl(`${user.id}/${f.fileName}`),
      mtime: f.mtime,
    })),
  });
}

/**
 * POST /api/import/youtube
 * Body: { url: string, action?: "info" | "download", quality?: YouTubeQuality }
 */
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = checkRateLimit(youtubeLimiter, user.id);
  if (limited) return limited;

  let body: {
    url?: string;
    query?: string;
    action?: string;
    quality?: string;
    minDurationSec?: number;
    maxDurationSec?: number;
    limit?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const action =
    body.action === "info" || body.action === "search" ? body.action : "download";
  const quality = QUALITIES.has(body.quality as YouTubeQuality)
    ? (body.quality as YouTubeQuality)
    : "best";

  try {
    if (action === "search") {
      const hits = await searchYouTubeVideos({
        query: body.query?.trim() || body.url?.trim() || "",
        limit: body.limit,
        minDurationSec: body.minDurationSec,
        maxDurationSec: body.maxDurationSec,
      });
      return NextResponse.json({ results: hits });
    }

    const url = body.url?.trim() ?? "";
    if (!url || !isYouTubeUrl(url)) {
      return NextResponse.json(
        { error: "Dán link YouTube (watch, Shorts, hoặc youtu.be)." },
        { status: 400 }
      );
    }

    if (action === "info") {
      const info = await getYouTubeInfo(url);
      return NextResponse.json({ info });
    }

    const userDir = join(process.cwd(), "uploads", user.id);
    await mkdir(userDir, { recursive: true });
    const downloaded = await downloadYouTubeVideo(url, userDir, quality);
    const rel = relative(join(process.cwd(), "uploads"), downloaded.filePath).replace(
      /\\/g,
      "/"
    );

    return NextResponse.json({
      filePath: rel,
      fileName: downloaded.fileName,
      fileSize: downloaded.fileSize,
      mimeType: downloaded.mimeType,
      fileType: "video",
      url: uploadMediaPublicUrl(rel),
      durationSec: downloaded.durationSec,
      title: downloaded.title,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Không tải được video YouTube.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
