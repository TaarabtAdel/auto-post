import { randomBytes } from "crypto";

const REEL_TZ = "Asia/Ho_Chi_Minh";

export function reelDateStamp(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: REEL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replace(/-/g, "");
}

/** `{YYYYMMDD}-{STT}-{rand}[-{segment}]-reel.mp4` — STT bắt đầu từ 1. */
export function buildReelOutputFileName(opts: {
  stt: number;
  segmentLabel?: string;
}): string {
  const date = reelDateStamp();
  const stt = String(Math.max(1, opts.stt)).padStart(2, "0");
  const rand = randomBytes(4).toString("hex");
  const seg = opts.segmentLabel
    ? `-${opts.segmentLabel.replace(/[:]/g, "").replace(/[^\dA-Za-z_-]+/g, "")}`
    : "";
  return `${date}-${stt}-${rand}${seg}-reel.mp4`;
}
