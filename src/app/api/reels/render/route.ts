import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { mkdir, stat } from "fs/promises";
import { existsSync } from "fs";
import { join, normalize, relative } from "path";
import { reelLimiter, checkRateLimit } from "@/lib/rate-limit";
import { uploadMediaPublicUrl } from "@/lib/upload-media-url";
import { composeReel } from "@/lib/reel/compose";
import { composeFramedCuts } from "@/lib/reel/compose-framed";
import { buildReelOutputFileName } from "@/lib/reel/output-filename";
import { parseCutRanges } from "@/lib/reel/cuts";
import type {
  AspectRatioId,
  FrameHoleInput,
  ReelCaption,
  ReelEndCta,
  ReelMediaItem,
  ReelRenderRequest,
  ReelSplit,
} from "@/lib/reel/types";

export const runtime = "nodejs";
export const maxDuration = 600;

const ASPECTS = new Set<AspectRatioId>(["9:16", "1:1", "16:9"]);

function resolveOwnedPath(userId: string, rel: string): string {
  const cleaned = rel.replace(/^\/+/, "").replace(/^uploads\//, "");
  if (cleaned.includes("..") || !cleaned.startsWith(`${userId}/`)) {
    throw new Error("File không thuộc tài khoản này.");
  }
  const abs = normalize(join(process.cwd(), "uploads", cleaned));
  const root = join(process.cwd(), "uploads", userId);
  const relToUser = relative(root, abs);
  if (relToUser.startsWith("..") || relToUser.includes("..")) {
    throw new Error("Đường dẫn file không hợp lệ.");
  }
  if (!existsSync(abs)) {
    throw new Error("Không tìm thấy file media. Hãy tải lên lại.");
  }
  return abs;
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(min, v))
    : fallback;
}

function sanitizeCrop(raw: unknown) {
  if (!raw || typeof raw !== "object") return undefined;
  const c = raw as { focusX?: unknown; focusY?: unknown; zoom?: unknown };
  return {
    focusX: num(c.focusX, 50, 0, 100),
    focusY: num(c.focusY, 50, 0, 100),
    zoom: num(c.zoom, 1, 1, 5),
  };
}

function sanitizeMedia(raw: unknown): ReelMediaItem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as ReelMediaItem;
  if (typeof item.filePath !== "string" || !item.filePath.trim()) return null;
  if (item.type !== "image" && item.type !== "video") return null;
  return {
    filePath: item.filePath.trim(),
    type: item.type,
    durationSec:
      typeof item.durationSec === "number" ? num(item.durationSec, 5, 1, 30) : undefined,
    trimStartSec:
      typeof item.trimStartSec === "number" ? num(item.trimStartSec, 0, 0, 3600) : undefined,
    trimEndSec:
      typeof item.trimEndSec === "number" ? num(item.trimEndSec, 0, 0.2, 3600) : undefined,
    crop: sanitizeCrop(item.crop),
  };
}

function sanitizeCaptions(raw: unknown): ReelCaption[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const c = item as ReelCaption;
    if (typeof c.text !== "string" || !c.text.trim()) return [];
    return [
      {
        text: c.text.trim().slice(0, 280),
        startSec: num(c.startSec, 0, 0, 600),
        endSec: num(c.endSec, 5, 0.2, 600),
        xPercent: num(c.xPercent, 50, 0, 100),
        yPercent: num(c.yPercent, 12, 0, 100),
        widthPercent: num(c.widthPercent, 80, 20, 100),
        fontSize: num(c.fontSize, 42, 16, 96),
        textColor: typeof c.textColor === "string" ? c.textColor.slice(0, 20) : "#ffffff",
        backgroundColor:
          typeof c.backgroundColor === "string"
            ? c.backgroundColor.slice(0, 40)
            : "rgba(10,10,12,0.78)",
      },
    ];
  });
}

function sanitizeCta(raw: unknown): ReelEndCta {
  const fallback: ReelEndCta = {
    enabled: false,
    text: "Full video",
    icon: "👇",
    durationSec: 4,
    xPercent: 68,
    yPercent: 82,
    scale: 1,
    backgroundColor: "rgba(10,10,12,0.78)",
    textColor: "#ffffff",
    blink: false,
  };
  if (!raw || typeof raw !== "object") return fallback;
  const c = raw as ReelEndCta;
  return {
    enabled: c.enabled === true,
    text: typeof c.text === "string" ? c.text.trim().slice(0, 60) : fallback.text,
    icon: typeof c.icon === "string" && c.icon.trim() ? c.icon.trim().slice(0, 8) : fallback.icon,
    durationSec: num(c.durationSec, fallback.durationSec, 1, 15),
    xPercent: num(c.xPercent, fallback.xPercent, 0, 100),
    yPercent: num(c.yPercent, fallback.yPercent, 0, 100),
    scale: num(c.scale, fallback.scale, 0.3, 3),
    backgroundColor:
      typeof c.backgroundColor === "string"
        ? c.backgroundColor.slice(0, 40)
        : fallback.backgroundColor,
    textColor: typeof c.textColor === "string" ? c.textColor.slice(0, 20) : fallback.textColor,
    blink: c.blink === true,
  };
}

function sanitizeSplit(raw: unknown): ReelSplit | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const s = raw as ReelSplit;
  return {
    ratio: num(s.ratio, 50, 20, 80),
    top: sanitizeMedia(s.top),
    bottom: sanitizeMedia(s.bottom),
    topVolume: num(s.topVolume, 1, 0, 1),
    bottomVolume: num(s.bottomVolume, 0, 0, 1),
    durationSec: num(s.durationSec, 8, 1, 120),
  };
}

export async function POST(request: NextRequest) {
  const session = await getAppSession({
    headers: await headers(),
  });

  const limited = checkRateLimit(reelLimiter, session.user.id);
  if (limited) return limited;

  let body: Partial<ReelRenderRequest> & { musicPath?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const aspectRatio = ASPECTS.has(body.aspectRatio as AspectRatioId)
    ? (body.aspectRatio as AspectRatioId)
    : "9:16";

  const media = Array.isArray(body.media)
    ? body.media.slice(0, 12).flatMap((m) => {
        const item = sanitizeMedia(m);
        return item ? [item] : [];
      })
    : [];

  const split = sanitizeSplit(body.split);
  const backgroundPath =
    typeof body.backgroundPath === "string" ? body.backgroundPath.trim() : "";
  const videoPath = typeof body.videoPath === "string" ? body.videoPath.trim() : "";
  const cutsFromBody = Array.isArray(body.cuts)
    ? body.cuts
        .map((c) => ({
          startSec: num(c.startSec, 0, 0, 36000),
          endSec: num(c.endSec, 0, 0.2, 36000),
          label: typeof c.label === "string" ? c.label : undefined,
        }))
        .filter((c) => c.endSec > c.startSec)
        .slice(0, 10)
    : [];
  const cuts =
    cutsFromBody.length > 0
      ? cutsFromBody.map((c) => ({
          startSec: c.startSec,
          endSec: c.endSec,
          label: c.label || `${c.startSec}-${c.endSec}`,
        }))
      : parseCutRanges(typeof (body as { cutsText?: string }).cutsText === "string"
          ? (body as { cutsText?: string }).cutsText || ""
          : "");
  const holeRaw = body.hole;
  const hole: FrameHoleInput | undefined =
    holeRaw && typeof holeRaw === "object"
      ? {
          xPercent: num(holeRaw.xPercent, 8, 0, 100),
          yPercent: num(holeRaw.yPercent, 26, 0, 100),
          wPercent: num(holeRaw.wPercent, 84, 4, 100),
          hPercent: num(holeRaw.hPercent, 42, 4, 100),
        }
      : undefined;

  const framedMode = Boolean(backgroundPath && videoPath && cuts.length > 0);

  if (!framedMode && !split && media.length === 0) {
    return NextResponse.json(
      { error: "Chọn ảnh nền, video và nhập đoạn cắt — hoặc thêm media." },
      { status: 400 }
    );
  }

  const renderRequest: ReelRenderRequest = {
    aspectRatio,
    media,
    captions: sanitizeCaptions(body.captions),
    musicPath:
      typeof body.musicPath === "string" && body.musicPath.trim()
        ? body.musicPath.trim()
        : undefined,
    videoVolume: num(body.videoVolume, 1, 0, 1),
    musicVolume: num(body.musicVolume, 0.35, 0, 1),
    flipVideo: body.flipVideo === true,
    endCta: sanitizeCta(body.endCta),
    split,
  };

  const userId = session.user.id;
  try {
    const userDir = join(process.cwd(), "uploads", userId);
    await mkdir(userDir, { recursive: true });

    if (framedMode) {
      const clips = await composeFramedCuts({
        backgroundPath: resolveOwnedPath(userId, backgroundPath),
        videoPath: resolveOwnedPath(userId, videoPath),
        cuts,
        hole,
        aspectRatio,
        flipVideo: body.flipVideo === true,
        videoVolume: num(body.videoVolume, 1, 0, 1),
        outputDir: userDir,
      });
      const videos = await Promise.all(
        clips.map(async (c) => {
          const fileName = c.outputPath.split(/[/\\]/).pop() || "reel.mp4";
          const rel = `${userId}/${fileName}`;
          const st = await stat(c.outputPath);
          return {
            filePath: rel,
            fileName,
            fileSize: st.size,
            mimeType: "video/mp4",
            fileType: "video",
            url: uploadMediaPublicUrl(rel),
            durationSec: c.durationSec,
            label: c.label,
          };
        })
      );
      return NextResponse.json({ videos, url: videos[0]?.url, durationSec: videos[0]?.durationSec });
    }

    const outName = buildReelOutputFileName({ stt: 1 });
    const rel = `${userId}/${outName}`;
    const absOut = join(userDir, outName);

    const { durationSec } = await composeReel(
      renderRequest,
      (p) => resolveOwnedPath(userId, p),
      absOut
    );
    const outStat = await stat(absOut);

    return NextResponse.json({
      filePath: rel,
      fileName: outName,
      fileSize: outStat.size,
      mimeType: "video/mp4",
      fileType: "video",
      url: uploadMediaPublicUrl(rel),
      durationSec,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Không render được video.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
