import { existsSync } from "fs";
import { join } from "path";

function bundledYtdlpPath(): string {
  return join(
    process.cwd(),
    "node_modules",
    "youtube-dl-exec",
    "bin",
    process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"
  );
}

/** Đường dẫn yt-dlp: env → .venv (pip) → binary npm (youtube-dl-exec). */
export function resolveYtdlpBinaryPath(): string {
  const fromEnv = process.env.YT_DLP_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }

  const root = process.cwd();
  const unixVenv = join(root, ".venv", "bin", "yt-dlp");
  if (existsSync(unixVenv)) {
    return unixVenv;
  }
  const winVenv = join(root, ".venv", "Scripts", "yt-dlp.exe");
  if (existsSync(winVenv)) {
    return winVenv;
  }

  return bundledYtdlpPath();
}

export function assertYtdlpAvailable(): void {
  const p = resolveYtdlpBinaryPath();
  if (!existsSync(p)) {
    throw new Error(
      "Thiếu yt-dlp. Chạy: npm run setup:python (hoặc npm run postinstall cho binary npm)."
    );
  }
}
