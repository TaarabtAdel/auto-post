import { runFfmpegBuffer } from "./ffmpeg";
import { largestBlackRect, type FrameHole } from "./frame-hole-core";

export type { FrameHole };

const SAMPLE_W = 180;
const SAMPLE_H = 320;
const BLACK = 22;

export async function detectFrameHole(imagePath: string): Promise<FrameHole> {
  const raw = await runFfmpegBuffer([
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    imagePath,
    "-vf",
    `scale=${SAMPLE_W}:${SAMPLE_H}:force_original_aspect_ratio=disable`,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "pipe:1",
  ]);

  const expected = SAMPLE_W * SAMPLE_H * 3;
  if (raw.length < expected) {
    return { xPercent: 8, yPercent: 26, wPercent: 84, hPercent: 42 };
  }

  const grid = new Uint8Array(SAMPLE_W * SAMPLE_H);
  for (let i = 0; i < SAMPLE_W * SAMPLE_H; i++) {
    const o = i * 3;
    grid[i] = raw[o] < BLACK && raw[o + 1] < BLACK && raw[o + 2] < BLACK ? 1 : 0;
  }
  return largestBlackRect(grid, SAMPLE_W, SAMPLE_H);
}
