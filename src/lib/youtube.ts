import { mkdir, readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import youtubedl from "youtube-dl-exec";
import { parseDurationSec, probeFile } from "@/lib/reel/ffmpeg";
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

function ensureYtDlp(): void {
  const ytDlp = join(
    process.cwd(),
    "node_modules",
    "youtube-dl-exec",
    "bin",
    process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"
  );
  if (!existsSync(ytDlp)) {
    throw new Error(
      "Thiếu yt-dlp. Chạy: node node_modules/youtube-dl-exec/scripts/postinstall.js"
    );
  }
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
  ensureYtDlp();
  const limit = Math.min(50, Math.max(5, opts.limit ?? 25));
  const minD = opts.minDurationSec ?? 15 * 60;
  const maxD = opts.maxDurationSec ?? 100 * 60;

  try {
    const raw = (await youtubedl(`ytsearch${limit}:${query}`, {
      dumpSingleJson: true,
      skipDownload: true,
      flatPlaylist: true,
      noWarnings: true,
      noCheckCertificates: true,
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
      .filter(
        (e) =>
          e.id &&
          e.url &&
          e.durationSec >= minD &&
          e.durationSec <= maxD
      );
  } catch (err) {
    throw mapError(err);
  }
}

export async function getYouTubeInfo(rawUrl: string): Promise<YouTubeInfo> {
  if (!isYouTubeUrl(rawUrl)) throw new Error("Chỉ hỗ trợ link YouTube.");
  const url = normalizeYouTubeUrl(rawUrl);
  ensureYtDlp();

  try {
    const info = (await youtubedl(url, {
      dumpSingleJson: true,
      skipDownload: true,
      noPlaylist: true,
      noWarnings: true,
      noCheckCertificates: true,
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
  ensureYtDlp();
  await mkdir(destDir, { recursive: true });

  const stamp = `yt-${Date.now()}-${randomBytes(6).toString("hex")}`;
  const outTpl = join(destDir, `${stamp}.%(ext)s`);

  try {
    await youtubedl(url, {
      noPlaylist: true,
      noWarnings: true,
      noCheckCertificates: true,
      restrictFilenames: true,
      format: formatForQuality(quality),
      mergeOutputFormat: "mp4",
      maxFilesize: "1G",
      output: outTpl,
      windowsFilenames: true,
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

export async function listYouTubeDownloads(userDir: string): Promise<
  Array<{
    fileName: string;
    fileSize: number;
    mtime: number;
  }>
> {
  if (!existsSync(userDir)) return [];
  const names = await readdir(userDir);
  const rows = await Promise.all(
    names
      .filter((n) => n.startsWith("yt-") && /\.(mp4|mkv|webm)$/i.test(n))
      .map(async (fileName) => {
        const st = await stat(join(userDir, fileName));
        return { fileName, fileSize: st.size, mtime: st.mtimeMs };
      })
  );
  return rows.sort((a, b) => b.mtime - a.mtime);
}
