/** Client-safe YouTube URL helpers (không import Node / yt-dlp). */

const YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

export interface YouTubeSearchHit {
  id: string;
  title: string;
  channel: string;
  durationSec: number;
  url: string;
}

export function isYouTubeUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return YT_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function normalizeYouTubeUrl(raw: string): string {
  const u = new URL(raw.trim());
  const host = u.hostname.toLowerCase();
  if (host === "youtu.be" || host === "www.youtu.be") {
    const id = u.pathname.replace(/^\//, "").split("/")[0];
    if (!id) throw new Error("Link YouTube không hợp lệ.");
    return `https://www.youtube.com/watch?v=${id}`;
  }
  const shorts = u.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
  if (shorts) return `https://www.youtube.com/watch?v=${shorts[1]}`;
  const embed = u.pathname.match(/^\/embed\/([a-zA-Z0-9_-]+)/);
  if (embed) return `https://www.youtube.com/watch?v=${embed[1]}`;
  const live = u.pathname.match(/^\/live\/([a-zA-Z0-9_-]+)/);
  if (live) return `https://www.youtube.com/watch?v=${live[1]}`;
  const v = u.searchParams.get("v");
  if (v) return `https://www.youtube.com/watch?v=${v}`;
  throw new Error(
    "Chỉ hỗ trợ link 1 video (watch / shorts / youtu.be), không tải cả playlist."
  );
}

/** Tách nhiều link từ text dán (xuống dòng, dấu phẩy, khoảng trắng). */
export function parseYouTubeUrlsFromText(text: string): string[] {
  const parts = text
    .split(/[\r\n]+/)
    .flatMap((line) => line.split(/[\s,;]+/))
    .map((s) => s.trim())
    .filter(Boolean);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of parts) {
    if (!isYouTubeUrl(raw)) continue;
    try {
      const norm = normalizeYouTubeUrl(raw);
      if (seen.has(norm)) continue;
      seen.add(norm);
      out.push(norm);
    } catch {
      // bỏ qua link lỗi định dạng
    }
  }
  return out;
}
