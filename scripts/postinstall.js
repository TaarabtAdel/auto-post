#!/usr/bin/env node
/**
 * ffmpeg-static sometimes installs without +x; youtube-dl-exec needs yt-dlp binary.
 */
const { chmodSync, existsSync, statSync } = require("fs");
const { join } = require("path");
const { spawnSync } = require("child_process");

const root = join(__dirname, "..");

for (const name of ["ffmpeg", "ffmpeg.exe"]) {
  const p = join(root, "node_modules", "ffmpeg-static", name);
  if (existsSync(p)) {
    try {
      chmodSync(p, 0o755);
      console.log("[postinstall] chmod +x", p);
    } catch (e) {
      console.warn("[postinstall] chmod ffmpeg failed:", e.message);
    }
  }
}

const ytdlpBin = join(root, "node_modules", "youtube-dl-exec", "bin", "yt-dlp");
const ytdlpPost = join(root, "node_modules", "youtube-dl-exec", "scripts", "postinstall.js");

if (!existsSync(ytdlpPost)) {
  console.log("[postinstall] youtube-dl-exec chưa cài — bỏ qua yt-dlp.");
  process.exit(0);
}

if (existsSync(ytdlpBin)) {
  try {
    const st = statSync(ytdlpBin);
    if (st.size > 500_000) {
      chmodSync(ytdlpBin, 0o755);
      console.log("[postinstall] yt-dlp đã có — bỏ qua tải lại:", ytdlpBin);
      process.exit(0);
    }
  } catch {
    // fall through to download
  }
}

console.log(
  "[postinstall] Đang tải yt-dlp từ GitHub (1–3 phút, không có thanh tiến trình)…"
);
console.log(
  "[postinstall] Mạng chậm: đợi thêm hoặc Ctrl+C rồi chạy lại npm run postinstall"
);

const r = spawnSync(process.execPath, [ytdlpPost], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, DEBUG: process.env.DEBUG || "youtube-dl-exec:install" },
});

if (r.status !== 0) {
  console.warn("[postinstall] youtube-dl-exec postinstall exited", r.status);
  process.exit(r.status ?? 1);
}

console.log("[postinstall] xong (ffmpeg + yt-dlp).");
