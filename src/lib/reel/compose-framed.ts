import { mkdir, rm, stat, unlink } from "fs/promises";
import { join } from "path";
import { randomBytes } from "crypto";
import { ASPECT_RATIOS, FPS, type AspectRatioId } from "./types";
import { formatClock, type CutRange } from "./cuts";
import type { FrameHole } from "./frame-hole";
import { detectFrameHole } from "./frame-hole";
import {
  evenize,
  hasAudioStream,
  parseDurationSec,
  probeFile,
  runFfmpeg,
} from "./ffmpeg";
import { buildReelOutputFileName } from "./output-filename";

export type FramedCutResult = {
  outputPath: string;
  durationSec: number;
  label: string;
};

function cutsWithinSource(cuts: CutRange[], sourceSec: number): CutRange[] {
  const tooLate = cuts.filter((c) => c.startSec >= sourceSec - 0.2);
  if (tooLate.length > 0) {
    const src = formatClock(sourceSec);
    const bad = tooLate.map((c) => c.label).join(", ");
    throw new Error(
      `Đoạn cắt vượt quá video nguồn (${src}): ${bad}. Sửa mốc thời gian (Gemini/YouTube) cho khớp file đã tải.`
    );
  }
  return cuts.map((c) => ({
    ...c,
    endSec: Math.min(c.endSec, sourceSec),
  }));
}

async function assertRenderedClip(outputPath: string, label: string) {
  const st = await stat(outputPath).catch(() => null);
  if (!st || st.size < 10_000) {
    await unlink(outputPath).catch(() => undefined);
    throw new Error(
      `Render đoạn ${label} ra file rỗng (${st?.size ?? 0} byte). Kiểm tra mốc cắt so với độ dài video.`
    );
  }
  const dur = parseDurationSec(await probeFile(outputPath));
  if (!dur || dur < 0.15) {
    await unlink(outputPath).catch(() => undefined);
    throw new Error(
      `Render đoạn ${label} không có duration (file hỏng). Thử cắt mốc trong phạm vi video nguồn.`
    );
  }
}

export async function composeFramedCuts(opts: {
  backgroundPath: string;
  videoPath: string;
  cuts: CutRange[];
  hole?: FrameHole;
  aspectRatio: AspectRatioId;
  flipVideo?: boolean;
  videoVolume?: number;
  outputDir: string;
}): Promise<FramedCutResult[]> {
  if (opts.cuts.length === 0) {
    throw new Error("Nhập ít nhất 1 đoạn cắt, ví dụ 01:15-01:42,09:10-09:35");
  }

  const probe = await probeFile(opts.videoPath);
  const sourceSec = parseDurationSec(probe);
  if (!sourceSec || sourceSec <= 0) {
    throw new Error("Không đọc được thời lượng video nguồn.");
  }
  const cuts = cutsWithinSource(opts.cuts, sourceSec);
  const hasAudio = hasAudioStream(probe);

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
    for (const [i, cut] of cuts.entries()) {
      const durationSec = Math.max(0.2, cut.endSec - cut.startSec);
      const outName = buildReelOutputFileName({
        stt: i + 1,
        segmentLabel: cut.label,
      });
      const outputPath = join(opts.outputDir, outName);
      const videoFilters =
        `[0:v]fps=${FPS},scale=${canvasW}:${canvasH}:force_original_aspect_ratio=increase,` +
        `crop=${canvasW}:${canvasH},setsar=1,setpts=PTS-STARTPTS[bg];` +
        `[1:v]scale=${hw}:${hh}:force_original_aspect_ratio=increase,` +
        `crop=${hw}:${hh}${flip},setsar=1,fps=${FPS},setpts=PTS-STARTPTS[fg];` +
        `[bg][fg]overlay=${hx}:${hy}:shortest=1[v]`;
      const filter = hasAudio
        ? `${videoFilters};[1:a]volume=${volume},asetpts=PTS-STARTPTS[a]`
        : videoFilters;

      const args = [
        "-y",
        "-loop",
        "1",
        "-framerate",
        String(FPS),
        "-t",
        durationSec.toFixed(3),
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
        "-r",
        String(FPS),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
      ];

      if (hasAudio) {
        args.push(
          "-map",
          "[a]",
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
      await assertRenderedClip(outputPath, cut.label);
      results.push({ outputPath, durationSec, label: cut.label });
    }
    return results;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
