import { mkdir, writeFile, rm } from "fs/promises";
import { dirname, join } from "path";
import { randomBytes } from "crypto";
import {
  ASPECT_RATIOS,
  FPS,
  TRANSITION_SEC,
  type MediaCrop,
  type ReelCaption,
  type ReelEndCta,
  type ReelMediaItem,
  type ReelRenderRequest,
} from "./types";
import {
  computeCropRect,
  evenize,
  hasAudioStream,
  parseDurationSec,
  parseResolution,
  probeFile,
  resolveFontFile,
  runFfmpeg,
} from "./ffmpeg";

const DEFAULT_CROP: MediaCrop = { focusX: 50, focusY: 50, zoom: 1 };
const KEN_BURNS_END = 1.15;

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

function filterPath(p: string): string {
  return toPosix(p).replace(/:/g, "\\:").replace(/'/g, "\\'");
}

/** ffmpeg drawtext rejects CSS rgba(); use 0xRRGGBB@A */
function toFfmpegColor(input: string): string {
  const s = input.trim();
  const hex = s.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (hex) {
    return hex[2] ? `0x${hex[1]}${hex[2]}` : `0x${hex[1]}`;
  }
  const rgba = s.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\s*\)$/i
  );
  if (rgba) {
    const r = Number(rgba[1]).toString(16).padStart(2, "0");
    const g = Number(rgba[2]).toString(16).padStart(2, "0");
    const b = Number(rgba[3]).toString(16).padStart(2, "0");
    const a = rgba[4] !== undefined ? Number(rgba[4]) : 1;
    return `0x${r}${g}${b}@${Math.min(1, Math.max(0, a))}`;
  }
  return s.replace(/[,:]/g, "_");
}

function wrapCaption(text: string, maxChars: number): string {
  const words = text.replace(/\r/g, "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.join("\n") || text;
}

async function writeTextFile(dir: string, text: string): Promise<string> {
  const file = join(dir, `txt-${randomBytes(6).toString("hex")}.txt`);
  await writeFile(file, text, "utf8");
  return file;
}

async function probeMedia(filePath: string, type: "image" | "video") {
  const output = await probeFile(filePath);
  const size = parseResolution(output);
  if (!size) throw new Error("Không đọc được kích thước media.");
  if (type === "image") {
    return { ...size, durationSec: 0, hasAudio: false };
  }
  const durationSec = parseDurationSec(output);
  if (!durationSec || durationSec <= 0) {
    throw new Error("Không đọc được thời lượng video.");
  }
  return { ...size, durationSec, hasAudio: hasAudioStream(output) };
}

function itemDurationSec(item: ReelMediaItem, probedDuration: number): number {
  if (item.type === "image") {
    return Math.min(30, Math.max(1, item.durationSec ?? 5));
  }
  const start = item.trimStartSec ?? 0;
  const end = item.trimEndSec ?? probedDuration;
  return Math.max(0.2, end - start);
}

async function renderImageClip(opts: {
  input: string;
  output: string;
  natW: number;
  natH: number;
  canvasW: number;
  canvasH: number;
  durationSec: number;
  crop: MediaCrop;
}) {
  const { cw, ch, cx, cy } = computeCropRect(
    opts.natW,
    opts.natH,
    opts.canvasW,
    opts.canvasH,
    opts.crop
  );
  const d = Math.max(2, Math.round(opts.durationSec * FPS));
  const outW = evenize(opts.canvasW);
  const outH = evenize(opts.canvasH);
  const fx = (opts.crop.focusX / 100).toFixed(4);
  const fy = (opts.crop.focusY / 100).toFixed(4);
  const zoomIncrement = (KEN_BURNS_END - 1) / (d - 1);
  const vf =
    `crop=${cw}:${ch}:${cx}:${cy},` +
    `scale=${outW * 2}:${outH * 2}:flags=lanczos,` +
    `zoompan=z='1+${zoomIncrement.toFixed(6)}*on':x='(${fx})*iw*(1-1/zoom)':y='(${fy})*ih*(1-1/zoom)':d=${d}:s=${outW * 2}x${outH * 2}:fps=${FPS},` +
    `scale=${outW}:${outH}:flags=lanczos,setsar=1,format=yuv420p`;

  await runFfmpeg([
    "-y",
    "-loop",
    "1",
    "-i",
    opts.input,
    "-f",
    "lavfi",
    "-i",
    `anullsrc=channel_layout=stereo:sample_rate=44100`,
    "-vf",
    vf,
    "-frames:v",
    String(d),
    "-shortest",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-pix_fmt",
    "yuv420p",
    opts.output,
  ]);
}

async function renderVideoClip(opts: {
  input: string;
  output: string;
  natW: number;
  natH: number;
  canvasW: number;
  canvasH: number;
  trimStartSec: number;
  durationSec: number;
  crop: MediaCrop;
  flip: boolean;
  volume: number;
  hasAudio: boolean;
}) {
  const { cw, ch, cx, cy } = computeCropRect(
    opts.natW,
    opts.natH,
    opts.canvasW,
    opts.canvasH,
    opts.crop
  );
  const outW = evenize(opts.canvasW);
  const outH = evenize(opts.canvasH);
  const filters = [
    `crop=${cw}:${ch}:${cx}:${cy}`,
    `scale=${outW}:${outH}:flags=lanczos`,
  ];
  if (opts.flip) filters.push("hflip");
  filters.push(`fps=${FPS}`, "setsar=1", "format=yuv420p");

  const args = [
    "-y",
    "-ss",
    opts.trimStartSec.toFixed(3),
    "-t",
    opts.durationSec.toFixed(3),
    "-i",
    opts.input,
  ];

  if (opts.hasAudio) {
    args.push(
      "-vf",
      filters.join(","),
      "-af",
      `volume=${opts.volume}`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ar",
      "44100",
      "-ac",
      "2",
      opts.output
    );
  } else {
    args.push(
      "-f",
      "lavfi",
      "-i",
      `anullsrc=channel_layout=stereo:sample_rate=44100`,
      "-vf",
      filters.join(","),
      "-shortest",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      opts.output
    );
  }

  await runFfmpeg(args);
}

async function concatClips(clips: { path: string; durationSec: number }[], output: string) {
  if (clips.length === 1) {
    await runFfmpeg(["-y", "-i", clips[0].path, "-c", "copy", output]);
    return;
  }

  const fade = TRANSITION_SEC;
  const tooShortForXfade = clips.some((c) => c.durationSec <= fade + 0.15);
  if (tooShortForXfade) {
    const list = clips.map((c) => `file '${toPosix(c.path).replace(/'/g, "'\\''")}'`).join("\n");
    const listFile = join(dirname(output), "concat.txt");
    await writeFile(listFile, list, "utf8");
    await runFfmpeg([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFile,
      "-c",
      "copy",
      output,
    ]);
    return;
  }

  const inputs: string[] = [];
  for (const clip of clips) {
    inputs.push("-i", clip.path);
  }
  const parts: string[] = [];
  let last = "[0:v]";
  let lastA = "[0:a]";
  let acc = clips[0].durationSec;
  for (let i = 1; i < clips.length; i++) {
    const vOut = i === clips.length - 1 ? "[vout]" : `[v${i}]`;
    const aOut = i === clips.length - 1 ? "[aout]" : `[a${i}]`;
    const offset = Math.max(0, acc - fade);
    parts.push(
      `${last}[${i}:v]xfade=transition=fade:duration=${fade}:offset=${offset.toFixed(3)}${vOut}`
    );
    parts.push(
      `${lastA}[${i}:a]acrossfade=d=${fade}${aOut}`
    );
    last = vOut;
    lastA = aOut;
    acc = acc + clips[i].durationSec - fade;
  }

  await runFfmpeg([
    "-y",
    ...inputs,
    "-filter_complex",
    parts.join(";"),
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-pix_fmt",
    "yuv420p",
    output,
  ]);
}

function drawtextFilter(
  caption: ReelCaption,
  canvasW: number,
  canvasH: number,
  fontFile: string,
  textFile: string
): string {
  const boxW = Math.round((caption.widthPercent / 100) * canvasW);
  const x = Math.round((caption.xPercent / 100) * canvasW - boxW / 2);
  const y = Math.round((caption.yPercent / 100) * canvasH);
  const fontSize = Math.max(16, Math.round(caption.fontSize * (canvasW / 1080)));
  const enable = `between(t\\,${caption.startSec.toFixed(2)}\\,${caption.endSec.toFixed(2)})`;
  const boxColor = toFfmpegColor(caption.backgroundColor);
  return (
    `drawtext=fontfile='${filterPath(fontFile)}':textfile='${filterPath(textFile)}':` +
    `fontsize=${fontSize}:fontcolor=${toFfmpegColor(caption.textColor)}:` +
    `box=1:boxcolor=${boxColor}:boxborderw=12:` +
    `x=${x}:y=${y}:line_spacing=8:enable='${enable}'`
  );
}

function ctaFilter(
  cta: ReelEndCta,
  canvasW: number,
  canvasH: number,
  totalSec: number,
  fontFile: string,
  textFile: string
): string {
  const start = Math.max(0, totalSec - cta.durationSec);
  const fontSize = Math.max(18, Math.round(36 * cta.scale * (canvasW / 1080)));
  const x = `(w*${(cta.xPercent / 100).toFixed(3)}-text_w/2)`;
  const y = `(h*${(cta.yPercent / 100).toFixed(3)}-text_h/2)`;
  const boxColor = toFfmpegColor(cta.backgroundColor);
  const blink = cta.blink ? `*lt(mod(t\\,0.8)\\,0.45)` : "";
  const enable = `gte(t\\,${start.toFixed(2)})${blink}`;
  return (
    `drawtext=fontfile='${filterPath(fontFile)}':textfile='${filterPath(textFile)}':` +
    `fontsize=${fontSize}:fontcolor=${toFfmpegColor(cta.textColor)}:` +
    `box=1:boxcolor=${boxColor}:boxborderw=14:` +
    `x=${x}:y=${y}:enable='${enable}'`
  );
}

async function overlayText(
  input: string,
  output: string,
  workDir: string,
  canvasW: number,
  canvasH: number,
  captions: ReelCaption[],
  endCta: ReelEndCta,
  totalSec: number
) {
  const fontFile = resolveFontFile();
  const filters: string[] = [];

  for (const caption of captions) {
    if (!caption.text.trim() || caption.endSec <= caption.startSec) continue;
    const maxChars = Math.max(12, Math.round((caption.widthPercent / 100) * 28));
    const file = await writeTextFile(workDir, wrapCaption(caption.text.trim(), maxChars));
    filters.push(drawtextFilter(caption, canvasW, canvasH, fontFile, file));
  }

  if (endCta.enabled && (endCta.text.trim() || endCta.icon.trim())) {
    const label = [endCta.icon.trim(), endCta.text.trim()].filter(Boolean).join(" ");
    const file = await writeTextFile(workDir, label);
    filters.push(ctaFilter(endCta, canvasW, canvasH, totalSec, fontFile, file));
  }

  if (filters.length === 0) {
    await runFfmpeg(["-y", "-i", input, "-c", "copy", output]);
    return;
  }

  await runFfmpeg([
    "-y",
    "-i",
    input,
    "-vf",
    filters.join(","),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-c:a",
    "copy",
    "-pix_fmt",
    "yuv420p",
    output,
  ]);
}

async function mixMusic(
  input: string,
  musicPath: string,
  output: string,
  musicVolume: number,
  totalSec: number
) {
  await runFfmpeg([
    "-y",
    "-i",
    input,
    "-stream_loop",
    "-1",
    "-i",
    musicPath,
    "-filter_complex",
    `[1:a]volume=${musicVolume},atrim=0:${totalSec.toFixed(3)},asetpts=PTS-STARTPTS[mus];` +
      `[0:a][mus]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
    "-map",
    "0:v",
    "-map",
    "[aout]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-shortest",
    output,
  ]);
}

async function renderSplit(opts: {
  request: ReelRenderRequest;
  workDir: string;
  canvasW: number;
  canvasH: number;
  resolvePath: (rel: string) => string;
}): Promise<{ path: string; durationSec: number }> {
  const split = opts.request.split!;
  const topH = evenize((opts.canvasH * split.ratio) / 100);
  const bottomH = evenize(opts.canvasH - topH);
  const durationSec = Math.max(1, split.durationSec);
  const out = join(opts.workDir, "split.mp4");

  const regions = [
    { item: split.top, h: topH, volume: split.topVolume, label: "top" },
    { item: split.bottom, h: bottomH, volume: split.bottomVolume, label: "bottom" },
  ];

  const rendered: string[] = [];
  for (const region of regions) {
    const dest = join(opts.workDir, `split-${region.label}.mp4`);
    if (!region.item) {
      await runFfmpeg([
        "-y",
        "-f",
        "lavfi",
        "-i",
        `color=c=black:s=${opts.canvasW}x${region.h}:r=${FPS}:d=${durationSec}`,
        "-f",
        "lavfi",
        "-i",
        `anullsrc=channel_layout=stereo:sample_rate=44100`,
        "-shortest",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-c:a",
        "aac",
        dest,
      ]);
    } else {
      const abs = opts.resolvePath(region.item.filePath);
      const probed = await probeMedia(abs, region.item.type);
      const crop = region.item.crop ?? DEFAULT_CROP;
      if (region.item.type === "image") {
        await renderImageClip({
          input: abs,
          output: dest,
          natW: probed.width,
          natH: probed.height,
          canvasW: opts.canvasW,
          canvasH: region.h,
          durationSec,
          crop,
        });
      } else {
        const start = region.item.trimStartSec ?? 0;
        await renderVideoClip({
          input: abs,
          output: dest,
          natW: probed.width,
          natH: probed.height,
          canvasW: opts.canvasW,
          canvasH: region.h,
          trimStartSec: start,
          durationSec,
          crop,
          flip: opts.request.flipVideo,
          volume: region.volume * opts.request.videoVolume,
          hasAudio: probed.hasAudio,
        });
      }
    }
    rendered.push(dest);
  }

  await runFfmpeg([
    "-y",
    "-i",
    rendered[0],
    "-i",
    rendered[1],
    "-filter_complex",
    `[0:v][1:v]vstack=inputs=2[vout];[0:a][1:a]amix=inputs=2:duration=first[aout]`,
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-t",
    durationSec.toFixed(3),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    out,
  ]);

  return { path: out, durationSec };
}

export async function composeReel(
  request: ReelRenderRequest,
  resolvePath: (rel: string) => string,
  outputPath: string
): Promise<{ durationSec: number }> {
  const size = ASPECT_RATIOS[request.aspectRatio] ?? ASPECT_RATIOS["9:16"];
  const workDir = join(
    process.cwd(),
    "uploads",
    "tmp-reel",
    randomBytes(8).toString("hex")
  );
  await mkdir(workDir, { recursive: true });

  try {
    let timeline: { path: string; durationSec: number };

    if (request.split) {
      if (!request.split.top && !request.split.bottom) {
        throw new Error("Chia đôi màn hình cần ít nhất 1 vùng có media.");
      }
      timeline = await renderSplit({
        request,
        workDir,
        canvasW: size.width,
        canvasH: size.height,
        resolvePath,
      });
    } else {
      if (request.media.length === 0) {
        throw new Error("Cần ít nhất 1 ảnh hoặc video.");
      }

      const clips: { path: string; durationSec: number }[] = [];
      for (const [index, item] of request.media.entries()) {
        const abs = resolvePath(item.filePath);
        const probed = await probeMedia(abs, item.type);
        const crop = item.crop ?? DEFAULT_CROP;
        const dest = join(workDir, `clip-${index}.mp4`);
        const durationSec = itemDurationSec(item, probed.durationSec);

        if (item.type === "image") {
          await renderImageClip({
            input: abs,
            output: dest,
            natW: probed.width,
            natH: probed.height,
            canvasW: size.width,
            canvasH: size.height,
            durationSec,
            crop,
          });
        } else {
          const start = Math.max(0, item.trimStartSec ?? 0);
          await renderVideoClip({
            input: abs,
            output: dest,
            natW: probed.width,
            natH: probed.height,
            canvasW: size.width,
            canvasH: size.height,
            trimStartSec: start,
            durationSec,
            crop,
            flip: request.flipVideo,
            volume: request.videoVolume,
            hasAudio: probed.hasAudio,
          });
        }
        clips.push({ path: dest, durationSec });
      }

      const fadeLoss = Math.max(0, clips.length - 1) * TRANSITION_SEC;
      const concatOut = join(workDir, "concat.mp4");
      await concatClips(clips, concatOut);
      timeline = {
        path: concatOut,
        durationSec: clips.reduce((s, c) => s + c.durationSec, 0) - fadeLoss,
      };
    }

    const captioned = join(workDir, "captioned.mp4");
    await overlayText(
      timeline.path,
      captioned,
      workDir,
      size.width,
      size.height,
      request.captions,
      request.endCta,
      timeline.durationSec
    );

    if (request.musicPath) {
      await mixMusic(
        captioned,
        resolvePath(request.musicPath),
        outputPath,
        request.musicVolume,
        timeline.durationSec
      );
    } else {
      await runFfmpeg(["-y", "-i", captioned, "-c", "copy", outputPath]);
    }

    return { durationSec: timeline.durationSec };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
