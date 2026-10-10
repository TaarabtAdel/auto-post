import { execFile } from "child_process";
import { createRequire } from "module";
import { promisify } from "util";
import { accessSync, constants, chmodSync, existsSync } from "fs";
import { dirname, join } from "path";
import ffmpegStatic from "ffmpeg-static";

const execFileAsync = promisify(execFile);

function resolveFfmpegFromPackage(): string | null {
  const candidates: Array<string | null | undefined> = [ffmpegStatic];
  try {
    const req = createRequire(import.meta.url);
    const pkgPath = req.resolve("ffmpeg-static");
    candidates.push(join(dirname(pkgPath), "ffmpeg.exe"));
    candidates.push(join(dirname(pkgPath), "ffmpeg"));
  } catch {
    // webpack may not resolve package.json the same way
  }
  candidates.push(join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg.exe"));
  candidates.push(join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"));

  for (const p of candidates) {
    if (!p || !existsSync(p)) continue;
    try {
      accessSync(p, constants.X_OK);
      return p;
    } catch {
      try {
        chmodSync(p, 0o755);
        accessSync(p, constants.X_OK);
        return p;
      } catch {
        // try next candidate
      }
    }
  }
  return null;
}

export function getFfmpegPath(): string {
  const fromEnv = process.env.FFMPEG_PATH || process.env.FFMPEG_BIN;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const resolved = resolveFfmpegFromPackage();
  if (resolved) return resolved;
  throw new Error(
    "Không tìm thấy ffmpeg. Cài `ffmpeg-static` hoặc đặt FFMPEG_PATH."
  );
}

export function resolveFontFile(): string {
  const fromEnv = process.env.REEL_FONT_FILE;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const winRoot = process.env.WINDIR || "C:/Windows";
  const candidates = [
    join(winRoot, "Fonts", "arial.ttf"),
    join(winRoot, "Fonts", "arialuni.ttf"),
    join(winRoot, "Fonts", "tahoma.ttf"),
    join(winRoot, "Fonts", "segoeui.ttf"),
    join(winRoot, "Fonts", "calibri.ttf"),
    join(winRoot, "Fonts", "times.ttf"),
    join(winRoot, "Fonts", "malgun.ttf"),
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/tahoma.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
    "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
    "/System/Library/Fonts/Supplemental/Tahoma.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      "Không tìm thấy font chữ. Đặt REEL_FONT_FILE trỏ tới file .ttf."
    );
  }
  return found;
}

export async function runFfmpegBuffer(args: string[]): Promise<Buffer> {
  try {
    const { stdout } = await execFileAsync(getFfmpegPath(), args, {
      maxBuffer: 50 * 1024 * 1024,
      windowsHide: true,
      encoding: "buffer",
    });
    return stdout as unknown as Buffer;
  } catch (err) {
    const e = err as { stderr?: Buffer | string; message?: string };
    const stderr =
      typeof e.stderr === "string"
        ? e.stderr
        : Buffer.isBuffer(e.stderr)
          ? e.stderr.toString("utf8")
          : "";
    if (stderr) throw new Error(summarizeFfmpegError(stderr));
    throw new Error(e.message || "ffmpeg thất bại.");
  }
}

export async function runFfmpeg(args: string[]): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync(getFfmpegPath(), args, {
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true,
    });
    return `${stdout}\n${stderr}`;
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    if (typeof e.stderr === "string" && e.stderr.length > 0) {
      throw new Error(summarizeFfmpegError(e.stderr));
    }
    throw new Error(e.message || "ffmpeg thất bại.");
  }
}

/** ffmpeg -i always exits non-zero; stderr holds stream info. */
export async function probeFile(filePath: string): Promise<string> {
  try {
    await execFileAsync(
      getFfmpegPath(),
      ["-hide_banner", "-i", filePath],
      { maxBuffer: 2 * 1024 * 1024, windowsHide: true }
    );
    return "";
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr;
    if (typeof stderr === "string" && stderr.length > 0) return stderr;
    throw err;
  }
}

function summarizeFfmpegError(stderr: string): string {
  const lines = stderr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const errorLine = [...lines]
    .reverse()
    .find((l) => /error|failed|invalid|unable to parse|cannot find/i.test(l));
  return errorLine || lines.slice(-3).join(" ") || "ffmpeg thất bại.";
}

export function evenize(n: number): number {
  const rounded = Math.max(2, Math.round(n));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

export function computeCropRect(
  natW: number,
  natH: number,
  targetW: number,
  targetH: number,
  crop: { focusX: number; focusY: number; zoom: number }
): { cw: number; ch: number; cx: number; cy: number } {
  const coverScale = Math.max(targetW / natW, targetH / natH);
  const rawCw = targetW / (crop.zoom * coverScale);
  const rawCh = targetH / (crop.zoom * coverScale);
  const cw = Math.min(natW, Math.max(2, Math.round(rawCw)));
  const ch = Math.min(natH, Math.max(2, Math.round(rawCh)));
  const cx = Math.min(natW - cw, Math.max(0, Math.round((crop.focusX / 100) * (natW - cw))));
  const cy = Math.min(natH - ch, Math.max(0, Math.round((crop.focusY / 100) * (natH - ch))));
  return { cw, ch, cx, cy };
}

export function parseResolution(output: string): { width: number; height: number } | null {
  const videoLine = output.split("\n").find((line) => /Stream #\d+:\d+.*Video:/.test(line));
  if (!videoLine) return null;
  for (const match of videoLine.matchAll(/(\d+)x(\d+)/g)) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width > 0 && height > 0) return { width, height };
  }
  return null;
}

export function parseDurationSec(output: string): number | null {
  const match = output.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

export function hasAudioStream(output: string): boolean {
  return /Stream #\d+:\d+.*Audio:/.test(output);
}
