export type CutRange = {
  startSec: number;
  endSec: number;
  label: string;
};

function parseClock(raw: string): number {
  const parts = raw.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export function parseCutRanges(raw: string): CutRange[] {
  const re = /(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?)/g;
  const out: CutRange[] = [];
  for (const m of raw.matchAll(re)) {
    const startSec = parseClock(m[1]);
    const endSec = parseClock(m[2]);
    if (endSec <= startSec) continue;
    out.push({
      startSec,
      endSec,
      label: `${m[1]}-${m[2]}`.replace(/\s+/g, ""),
    });
  }
  return out.slice(0, 10);
}
