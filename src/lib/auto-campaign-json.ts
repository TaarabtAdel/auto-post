/** Số đoạn / bài / reel mỗi plan AUTO (khớp /youtube tách 4 caption). */
export const AUTO_CAMPAIGN_SEGMENT_COUNT = 4;

export const DEFAULT_SCHEDULE_HOURS = [18, 20, 22, 6] as const;

export const AUTO_CAMPAIGN_RUN_MODES = ["live", "test", "manual"] as const;
export type AutoCampaignRunMode = (typeof AUTO_CAMPAIGN_RUN_MODES)[number];

export function parseRunMode(raw: string | null | undefined): AutoCampaignRunMode {
  if (raw === "test" || raw === "manual") return raw;
  return "live";
}

export function autoCampaignRunModeLabel(mode: AutoCampaignRunMode): string {
  if (mode === "test") return "Test";
  if (mode === "manual") return "Thủ công";
  return "Live";
}

export function parsePageIdsJson(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}

export function parseScheduleHoursJson(raw: string | null | undefined): number[] {
  if (!raw?.trim()) return [...DEFAULT_SCHEDULE_HOURS];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [...DEFAULT_SCHEDULE_HOURS];
    const nums = v.map((n) => Number(n)).filter((n) => Number.isFinite(n));
    if (nums.length >= AUTO_CAMPAIGN_SEGMENT_COUNT) {
      return nums.slice(0, AUTO_CAMPAIGN_SEGMENT_COUNT);
    }
    if (nums.length === 3) {
      return [...nums, DEFAULT_SCHEDULE_HOURS[3]];
    }
    return [...DEFAULT_SCHEDULE_HOURS];
  } catch {
    return [...DEFAULT_SCHEDULE_HOURS];
  }
}

export function stringifyPageIds(ids: string[]): string {
  return JSON.stringify([...new Set(ids.filter(Boolean))]);
}

export function stringifyScheduleHours(hours: number[]): string {
  return JSON.stringify(hours.slice(0, AUTO_CAMPAIGN_SEGMENT_COUNT));
}
