/** Danh sách quốc gia chọn được trên UI — mở rộng thêm code ISO 2 chữ. */
export const PAGE_COUNTRY_OPTIONS = [
  { code: "US", label: "Mỹ (United States)" },
] as const;

export type PageCountryCode = (typeof PAGE_COUNTRY_OPTIONS)[number]["code"];

export function isKnownCountryCode(code: string): code is PageCountryCode {
  return PAGE_COUNTRY_OPTIONS.some((c) => c.code === code);
}
