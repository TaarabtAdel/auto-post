import { mkdir, rm } from "fs/promises";
import { join } from "path";
import { randomBytes } from "crypto";
import { ASPECT_RATIOS, type AspectRatioId } from "./types";
import type { CutRange } from "./cuts";
import type { FrameHole } from "./frame-hole";
import { detectFrameHole } from "./frame-hole";
import { evenize, hasAudioStream, probeFile, runFfmpeg } from "./ffmpeg";

export type FramedCutResult = {
  outputPath: string;
  durationSec: number;
  label: string;
};

export async function composeFramedCuts(opts: {
  backgroundPath: string;
  videoPath: string;
  cuts: CutRange[];
  hole?: FrameHole;
  aspectRatio: AspectRatioId;
  flipVideo?: boolean;
  videoVolume?: number;
  outputDir: string;
  filePrefix: string;
}): Promise<FramedCutResult[]> {
  if (opts.cuts.length === 0) {
    throw new Error("Nhập ít nhất 1 đoạn cắt, ví dụ 01:15-01:42,09:10-09:35");
  }

  const size = ASPECT_RATIOS[opts.aspectRatio] ?? ASPECT_RATIOS["9:16"];
  const canvasW = evenize(size.width);
  const canvasH = evenize(size.height);
  const hole = opts.hole ?? (await detectFrameHole(opts.backgroundPath));
  const hx = evenize((hole.xPercent / 100) * canvasW);
  const hy = evenize((hole.yPercent / 100) * canvasH);
  const hw = evenize((hole.wPercent / 100) * canvasW);
  const hh = evenize((hole.hPercent / 100) * canvasH);
  const volume = opts.videoVolume ?? 1;
  const flip = opts.flipVideo ? ",hflip" : "";
  const hasAudio = hasAudioStream(await probeFile(opts.videoPath));

  const workDir = join(
    process.cwd(),
    "uploads",
    "tmp-reel",
    randomBytes(8).toString("hex")
  );
  await mkdir(workDir, { recursive: true });
  await mkdir(opts.outputDir, { recursive: true });

  const results: FramedCutResult[] = [];
  try {
    for (const [i, cut] of opts.cuts.entries()) {
      const durationSec = Math.max(0.2, cut.endSec - cut.startSec);
      const outName = `${opts.filePrefix}-${i + 1}-${cut.label.replace(/[:]/g, "")}.mp4`;
      const outputPath = join(opts.outputDir, outName);
      const filter =
        `[0:v]scale=${canvasW}:${canvasH}:force_original_aspect_ratio=increase,` +
        `crop=${canvasW}:${canvasH},setsar=1[bg];` +
        `[1:v]scale=${hw}:${hh}:force_original_aspect_ratio=increase,` +
        `crop=${hw}:${hh}${flip},setsar=1[fg];` +
        `[bg][fg]overlay=${hx}:${hy}:shortest=1[v]`;

      const args = [
        "-y",
        "-loop",
        "1",
        "-i",
        opts.backgroundPath,
        "-ss",
        cut.startSec.toFixed(3),
        "-t",
        durationSec.toFixed(3),
        "-i",
        opts.videoPath,
        "-filter_complex",
        filter,
        "-map",
        "[v]",
        "-t",
        durationSec.toFixed(3),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
      ];

      if (hasAudio) {
        args.push(
          "-map",
          "1:a?",
          "-af",
          `volume=${volume}`,
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-ar",
          "44100",
          "-ac",
          "2",
          "-shortest"
        );
      } else {
        args.push("-an");
      }
      args.push(outputPath);

      await runFfmpeg(args);
      results.push({ outputPath, durationSec, label: cut.label });
    }
    return results;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
