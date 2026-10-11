/** Múi giờ hẹn đăng / hiển thị lịch (Việt Nam) — không phụ thuộc TZ của VPS. */
export const APP_TIMEZONE = "Asia/Ho_Chi_Minh";

function wallClockParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

/** Chuẩn hóa scheduled_at từ DB / RSC → ISO UTC. */
export function scheduledAtToIso(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const d = new Date(Number(s));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO UTC → giá trị `datetime-local` theo APP_TIMEZONE. */
export function scheduledAtToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = wallClockParts(d, APP_TIMEZONE);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** `datetime-local` (theo APP_TIMEZONE) → ISO UTC lưu server. */
export function datetimeLocalInAppTzToIso(local: string): string {
  const [datePart, timePart] = local.split("T");
  if (!datePart || !timePart) {
    throw new Error("Invalid datetime-local");
  }
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi] = timePart.split(":").map(Number);
  if ([y, mo, d, h, mi].some((n) => Number.isNaN(n))) {
    throw new Error("Invalid datetime-local");
  }

  let ms = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 4; i++) {
    const w = wallClockParts(new Date(ms), APP_TIMEZONE);
    const diffMin =
      (y - w.year) * 525600 +
      (mo - w.month) * 43200 +
      (d - w.day) * 1440 +
      (h - w.hour) * 60 +
      (mi - w.minute);
    if (diffMin === 0) break;
    ms += diffMin * 60 * 1000;
  }
  return new Date(ms).toISOString();
}

/** Lần tới của `hour:00` theo APP_TIMEZONE → datetime-local. */
export function nextAppTzDatetimeLocal(hour: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const w = wallClockParts(new Date(), APP_TIMEZONE);
  let candidate = `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(hour)}:00`;
  if (new Date(datetimeLocalInAppTzToIso(candidate)).getTime() <= Date.now()) {
    const t = wallClockParts(new Date(Date.now() + 86400000), APP_TIMEZONE);
    candidate = `${t.year}-${pad(t.month)}-${pad(t.day)}T${pad(hour)}:00`;
  }
  return candidate;
}

/** Hiển thị ngày giờ trên UI / SSR (VPS UTC vẫn đúng). */
export function formatInAppTimezone(
  dateStr: string | null | undefined,
  withSeconds = false
): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("vi-VN", {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
  });
}
