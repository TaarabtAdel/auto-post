import { mkdir, readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import { create } from "youtube-dl-exec";
import { parseDurationSec, probeFile } from "@/lib/reel/ffmpeg";
import { assertYtdlpAvailable, resolveYtdlpBinaryPath } from "@/lib/ytdlp-binary";
import {
  isYouTubeUrl,
  normalizeYouTubeUrl,
  type YouTubeSearchHit,
} from "@/lib/youtube-url";

export type YouTubeQuality = "best" | "1080" | "720" | "480" | "360";

export {
  isYouTubeUrl,
  normalizeYouTubeUrl,
  parseYouTubeUrlsFromText,
  type YouTubeSearchHit,
} from "@/lib/youtube-url";

export interface YouTubeFormatOption {
  id: string;
  label: string;
  height: number;
}

export interface YouTubeInfo {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  durationSec: number;
  webpageUrl: string;
  qualities: YouTubeQuality[];
}

export interface YouTubeDownloadResult {
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileType: "video";
  title: string;
  durationSec: number;
}

const MAX_BYTES = 1024 * 1024 * 1024;

let ytdlpExec: ReturnType<typeof create> | null = null;

function getYtdlp() {
  if (!ytdlpExec) {
    ytdlpExec = create(resolveYtdlpBinaryPath());
  }
  return ytdlpExec;
}

function ytdlpCookieFlags(): Record<string, string> {
  const cookies = process.env.YT_DLP_COOKIES_FILE?.trim();
  if (cookies && existsSync(cookies)) {
    return { cookies };
  }
  return {};
}

function formatForQuality(quality: YouTubeQuality): string {
  if (quality === "best") {
    return "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*+ba/b";
  }
  const h = quality;
  return `bv*[height<=${h}][ext=mp4]+ba[ext=m4a]/b[height<=${h}][ext=mp4]/bv*[height<=${h}]+ba/b[height<=${h}]`;
}

function mapError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (/max.filesize|larger than/i.test(msg)) {
    return new Error("Video lớn hơn 1GB. Chọn chất lượng thấp hơn.");
  }
  if (/private|sign in|confirm your age|members.only/i.test(msg)) {
    return new Error("Video riêng tư / giới hạn tuổi — không tải được.");
  }
  return new Error("Không lấy được video YouTube. Kiểm tra link hoặc thử lại.");
}

export async function searchYouTubeVideos(opts: {
  query: string;
  limit?: number;
  minDurationSec?: number;
  maxDurationSec?: number;
}): Promise<YouTubeSearchHit[]> {
  const query = opts.query.trim();
  if (!query) throw new Error("Nhập từ khóa tìm kiếm.");
  assertYtdlpAvailable();
  const limit = Math.min(50, Math.max(5, opts.limit ?? 25));
  const minD = opts.minDurationSec ?? 0;
  /** Không truyền max → không giới hạn trên (chỉ lọc tối thiểu nếu có). */
  const maxD =
    opts.maxDurationSec == null || !Number.isFinite(opts.maxDurationSec)
      ? Number.POSITIVE_INFINITY
      : opts.maxDurationSec;

  try {
    const raw = (await getYtdlp()(`ytsearch${limit}:${query}`, {
      dumpSingleJson: true,
      skipDownload: true,
      flatPlaylist: true,
      noWarnings: true,
      noCheckCertificates: true,
      ...ytdlpCookieFlags(),
    })) as {
      entries?: Array<{
        id?: string;
        title?: string;
        channel?: string;
        uploader?: string;
        duration?: number;
        url?: string;
        webpage_url?: string;
      }>;
    };

    return (raw.entries ?? [])
      .map((e) => {
        const id = e.id || "";
        const durationSec = typeof e.duration === "number" ? e.duration : 0;
        return {
          id,
          title: e.title || "(không tiêu đề)",
          channel: e.channel || e.uploader || "",
          durationSec,
          url: e.webpage_url || e.url || (id ? `https://www.youtube.com/watch?v=${id}` : ""),
        };
      })
      .filter((e) => {
        if (!e.id || !e.url) return false;
        const d = e.durationSec;
        if (d > 0) {
          if (minD > 0 && d < minD) return false;
          if (Number.isFinite(maxD) && d > maxD) return false;
        }
        return true;
      });
  } catch (err) {
    throw mapError(err);
  }
}

export async function getYouTubeInfo(rawUrl: string): Promise<YouTubeInfo> {
  if (!isYouTubeUrl(rawUrl)) throw new Error("Chỉ hỗ trợ link YouTube.");
  const url = normalizeYouTubeUrl(rawUrl);
  assertYtdlpAvailable();

  try {
    const info = (await getYtdlp()(url, {
      dumpSingleJson: true,
      skipDownload: true,
      noPlaylist: true,
      noWarnings: true,
      noCheckCertificates: true,
      ...ytdlpCookieFlags(),
    })) as {
      id?: string;
      title?: string;
      channel?: string;
      uploader?: string;
      thumbnail?: string;
      duration?: number;
      webpage_url?: string;
      formats?: Array<{ height?: number; vcodec?: string }>;
    };

    const maxH = Math.max(
      0,
      ...(info.formats ?? [])
        .filter((f) => f.height && f.vcodec && f.vcodec !== "none")
        .map((f) => f.height as number)
    );
    const qualities: YouTubeQuality[] = ["best"];
    for (const q of ["1080", "720", "480", "360"] as const) {
      if (maxH === 0 || maxH >= Number(q) || Number(q) === 360) {
        qualities.push(q);
      }
    }

    return {
      id: info.id || "",
      title: info.title || "YouTube video",
      channel: info.channel || info.uploader || "",
      thumbnail: info.thumbnail || "",
      durationSec: typeof info.duration === "number" ? info.duration : 0,
      webpageUrl: info.webpage_url || url,
      qualities,
    };
  } catch (err) {
    throw mapError(err);
  }
}

export async function downloadYouTubeVideo(
  rawUrl: string,
  destDir: string,
  quality: YouTubeQuality = "best"
): Promise<YouTubeDownloadResult> {
  if (!isYouTubeUrl(rawUrl)) {
    throw new Error("Chỉ hỗ trợ link YouTube.");
  }
  const url = normalizeYouTubeUrl(rawUrl);
  assertYtdlpAvailable();
  await mkdir(destDir, { recursive: true });

  const stamp = `yt-${Date.now()}-${randomBytes(6).toString("hex")}`;
  const outTpl = join(destDir, `${stamp}.%(ext)s`);

  try {
    await getYtdlp()(url, {
      noPlaylist: true,
      noWarnings: true,
      noCheckCertificates: true,
      restrictFilenames: true,
      format: formatForQuality(quality),
      mergeOutputFormat: "mp4",
      maxFilesize: "1G",
      output: outTpl,
      windowsFilenames: true,
      ...ytdlpCookieFlags(),
    });
  } catch (err) {
    throw mapError(err);
  }

  const files = (await readdir(destDir)).filter((f) => f.startsWith(stamp));
  if (files.length === 0) {
    throw new Error("yt-dlp không tạo được file video.");
  }
  const fileName = files[0];
  const abs = join(destDir, fileName);
  const st = await stat(abs);
  if (st.size > MAX_BYTES) {
    throw new Error("File tải về vượt 1GB.");
  }

  let durationSec = 0;
  try {
    durationSec = parseDurationSec(await probeFile(abs)) ?? 0;
  } catch {
    durationSec = 0;
  }

  return {
    filePath: abs,
    fileName,
    fileSize: st.size,
    mimeType: "video/mp4",
    fileType: "video",
    title: fileName,
    durationSec,
  };
}

/** Thử quality yêu cầu rồi fallback 720 / 480 / best nếu yt-dlp lỗi format. */
export async function downloadYouTubeVideoWithFallback(
  rawUrl: string,
  destDir: string,
  quality: YouTubeQuality = "best"
): Promise<YouTubeDownloadResult> {
  const order: YouTubeQuality[] =
    quality === "best"
      ? ["best", "720", "480"]
      : [quality, "720", "480", "best"];
  const tries = [...new Set(order)];

  let lastErr: Error | undefined;
  for (const q of tries) {
    try {
      return await downloadYouTubeVideo(rawUrl, destDir, q);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastErr ?? new Error("Không tải được video YouTube.");
}

async function listYtInFolder(
  absDir: string,
  relPrefix: string
): Promise<
  Array<{
    fileName: string;
    fileSize: number;
    mtime: number;
    storageKey: string;
  }>
> {
  if (!existsSync(absDir)) return [];
  const names = await readdir(absDir);
  const rows = await Promise.all(
    names
      .filter((n) => n.startsWith("yt-") && /\.(mp4|mkv|webm)$/i.test(n))
      .map(async (fileName) => {
        const st = await stat(join(absDir, fileName));
        const storageKey = relPrefix ? `${relPrefix}/${fileName}` : fileName;
        return { fileName, fileSize: st.size, mtime: st.mtimeMs, storageKey };
      })
  );
  return rows;
}

/** Quét `uploads/videos/{userId}/` và legacy. */
export async function listYouTubeDownloads(userId: string): Promise<
  Array<{
    fileName: string;
    fileSize: number;
    mtime: number;
    storageKey: string;
  }>
> {
  const { uploadsRoot } = await import("@/lib/upload-storage");
  const root = uploadsRoot();
  const userRoot = join(root, userId);
  const [newRows, legacyUserVideos, legacyRoot] = await Promise.all([
    listYtInFolder(join(root, "videos", userId), `videos/${userId}`),
    listYtInFolder(join(userRoot, "videos"), `${userId}/videos`),
    listYtInFolder(userRoot, userId),
  ]);
  const seen = new Set<string>();
  const merged = [...newRows, ...legacyUserVideos, ...legacyRoot].filter((r) => {
    if (seen.has(r.storageKey)) return false;
    seen.add(r.storageKey);
    return true;
  });
  return merged.sort((a, b) => b.mtime - a.mtime);
}
