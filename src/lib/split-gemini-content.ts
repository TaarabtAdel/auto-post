export type SplitFourResult = {
  times: string;
  caption1: string;
  caption2: string;
  caption3: string;
};

const RANGE = "\\d{1,2}:\\d{2}(?::\\d{2})?\\s*-\\s*\\d{1,2}:\\d{2}(?::\\d{2})?";
const TIMES_RE = new RegExp(`(?:${RANGE})(?:\\s*,\\s*${RANGE})+`, "g");
const SEGMENT_RE = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:🔹\s*)?Đoạn\s*#?\s*\d+/gi;

function normalizeTimes(raw: string): string {
  return raw.replace(/\s+/g, "");
}

function extractTimes(text: string): string {
  const matches = [...text.matchAll(TIMES_RE)];
  if (matches.length > 0) {
    return normalizeTimes(matches[matches.length - 1][0]);
  }

  const frames = [
    ...text.matchAll(/\*?\s*\*?\s*Khung thời gian:?\*?\s*(\d{1,2}:\d{2}(?::\d{2})?\s*-\s*\d{1,2}:\d{2}(?::\d{2})?)/gi),
  ].map((m) => normalizeTimes(m[1]));
  return frames.slice(0, 3).join(",");
}

function stripAfterSummary(seg: string): string {
  return seg
    .split(/#{0,6}\s*TỔNG HỢP[\s\S]*CÚ PHÁP|TỔNG HỢP LẠI THỜI GIAN/i)[0]
    .replace(/\n?-{3,}[\s\S]*$/, "")
    .trim();
}

function extractOneCaption(seg: string): string {
  const body = stripAfterSummary(seg);
  const lines = body.split(/\r?\n/);
  const hookAt = lines.findIndex(
    (line) => /^\s*😄/.test(line) && !/WATCH\s+FULL\s+VIDEO/i.test(line)
  );
  if (hookAt < 0) {
    const watchAt = lines.findIndex((line) => /WATCH\s+FULL\s+VIDEO/i.test(line));
    if (watchAt < 0) return "";
    return lines.slice(watchAt + 1).join("\n").trim();
  }
  return lines.slice(hookAt).join("\n").trim();
}

function extractCaptions(text: string): [string, string, string] {
  const parts = text.split(SEGMENT_RE).slice(1);
  const fromSegments = parts.map(extractOneCaption).filter(Boolean).slice(0, 3);

  if (fromSegments.length >= 3) {
    return [fromSegments[0], fromSegments[1], fromSegments[2]];
  }

  const fallback: string[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*😄/.test(line) && !/WATCH\s+FULL\s+VIDEO/i.test(line)) {
      const chunk: string[] = [];
      for (let j = i; j < lines.length; j++) {
        if (j > i && (/(?:🔹\s*)?Đoạn\s*#?\s*\d+/i.test(lines[j]) || /TỔNG HỢP/i.test(lines[j]) || /^---+$/.test(lines[j].trim()))) {
          break;
        }
        chunk.push(lines[j]);
      }
      fallback.push(chunk.join("\n").trim());
      if (fallback.length >= 3) break;
    }
  }

  const merged = fromSegments.length ? fromSegments : fallback;
  return [merged[0] ?? "", merged[1] ?? "", merged[2] ?? ""];
}

export function splitGeminiContent(raw: string): SplitFourResult {
  const text = raw.replace(/\r\n/g, "\n").trim();
  const [caption1, caption2, caption3] = extractCaptions(text);
  return {
    times: extractTimes(text),
    caption1,
    caption2,
    caption3,
  };
}
