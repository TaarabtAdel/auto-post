#!/usr/bin/env node
/**
 * ffmpeg-static sometimes installs without +x; youtube-dl-exec needs yt-dlp binary.
 */
const { chmodSync, existsSync } = require("fs");
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

const ytdlpPost = join(root, "node_modules", "youtube-dl-exec", "scripts", "postinstall.js");
if (existsSync(ytdlpPost)) {
  const r = spawnSync(process.execPath, [ytdlpPost], {
    cwd: root,
    stdio: "inherit",
  });
  if (r.status !== 0) {
    console.warn("[postinstall] youtube-dl-exec postinstall exited", r.status);
  }
}
