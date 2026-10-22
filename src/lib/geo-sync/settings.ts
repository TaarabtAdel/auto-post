import * as store from "@/lib/geo-sync/store";

/**
 * Cài đặt Geo Proxy Rotator trên auto-post: cùng quy tắc với trang Cài đặt của app
 * (app-settings.cjs / parse-proxy.cjs) để lưu ở đây hay ở app đều ra cùng một config.
 */

export type ParsedProxy = {
  host: string;
  port: number;
  protocol: "http" | "socks4" | "socks5";
  username?: string;
  password?: string;
};

export const DEFAULT_PROXY_SOURCES = [
  "https://raw.githubusercontent.com/databay-labs/free-proxy-list/master/by-country/us/http.txt",
  "https://raw.githubusercontent.com/databay-labs/free-proxy-list/master/by-country/us/socks4.txt|socks4",
  "https://raw.githubusercontent.com/databay-labs/free-proxy-list/master/by-country/us/socks5.txt|socks5",
  "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/countries/US/data.txt",
  "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/countries/US/data.txt",
  "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=US&ssl=all&anonymity=all",
  "https://cdn.jsdelivr.net/gh/proxyscrape/free-proxy-list@main/proxies/countries/us/data.json",
  "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=US&ssl=all&anonymity=all|socks5",
  "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks4&timeout=10000&country=US&ssl=all&anonymity=all|socks4",
  "https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text&country=us",
].join("\n");

const DEFAULT_TIMING = {
  waitMinSec: 100,
  waitMaxSec: 120,
  proxyTimeoutSec: 15,
  articleLoadTimeoutSec: 60,
  scrollEnabled: true,
  scrollSpeed: "normal",
  scrollDepthPercent: 95,
  loop: false,
};

function lines(text: unknown): string[] {
  return String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function isIPv4(host: string) {
  const parts = host.split(".");
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

function isHostname(host: string) {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(host);
}

function normalizeProtocol(value: unknown): ParsedProxy["protocol"] | "" {
  const p = String(value || "http").toLowerCase();
  if (p === "https" || p === "http") return "http";
  if (p === "socks4" || p === "socks5") return p;
  return "";
}

export function parseProxyLine(line: unknown): ParsedProxy | null {
  let raw = String(line ?? "").trim();
  if (!raw || raw.startsWith("#")) return null;
  let protocol: ParsedProxy["protocol"] = "http";
  const scheme = raw.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  if (scheme) {
    const p = normalizeProtocol(scheme[1]);
    if (!p) return null;
    protocol = p;
    raw = raw.slice(scheme[0].length);
  }
  raw = raw.split("/")[0].trim();
  const parts = raw.split(":");
  if (parts.length !== 2 && parts.length < 4) return null;
  const host = parts[0].trim();
  const port = Number(parts[1]);
  if ((!isIPv4(host) && !isHostname(host)) || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  const proxy: ParsedProxy = { host, port, protocol };
  if (parts.length >= 4) {
    proxy.username = parts[2];
    proxy.password = parts.slice(3).join(":");
    if (!proxy.username) return null;
  }
  return proxy;
}

/** Khoá giống proxyKey / proxyStorageKey của app: dùng cho proxyHealth, proxyArticleDone và lease. */
export function proxyKey(p: ParsedProxy): string {
  const base = p.host + ":" + p.port + (p.username ? ":" + p.username : "");
  return p.protocol === "http" ? base : p.protocol + "://" + base;
}

export function proxyToLine(p: ParsedProxy): string {
  const auth = p.username ? ":" + p.username + ":" + (p.password || "") : "";
  const base = p.host + ":" + p.port + auth;
  return p.protocol === "http" ? base : p.protocol + "://" + base;
}

export function parseProxySource(input: unknown): { proxies: ParsedProxy[]; skipped: number } {
  const text = String(input ?? "").trim();
  let entries: (ParsedProxy | null)[] = [];
  const fromLines = () =>
    text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#")).map(parseProxyLine);
  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      const data = JSON.parse(text);
      const list = Array.isArray(data) ? data : data.data || data.proxies || [];
      entries = Array.isArray(list)
        ? list.map((item: unknown) => {
            if (typeof item === "string") return parseProxyLine(item);
            if (!item || typeof item !== "object") return null;
            const o = item as Record<string, unknown>;
            const protocol = normalizeProtocol(o.protocol || "http");
            const host = o.ip || o.host;
            if (!protocol || !host || o.port == null || o.port === "") return null;
            return parseProxyLine((protocol === "http" ? "" : protocol + "://") + host + ":" + o.port);
          })
        : [];
    } catch {
      entries = fromLines();
    }
  } else {
    entries = fromLines();
  }
  const proxies: ParsedProxy[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const p of entries) {
    if (!p) { skipped += 1; continue; }
    const key = proxyKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    proxies.push(p);
  }
  return { proxies, skipped };
}

function parseSourceLine(raw: string) {
  const text = raw.trim();
  let urlText = text;
  let forceProtocol = "";
  const at = text.lastIndexOf("|");
  if (at > 0) {
    const tag = text.slice(at + 1).trim().toLowerCase();
    if (tag === "socks4" || tag === "socks5") {
      urlText = text.slice(0, at).trim();
      forceProtocol = tag;
    }
  }
  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    throw Error("URL nguồn không hợp lệ: " + text);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw Error("URL nguồn phải là http hoặc https: " + text);
  return { url: url.href, forceProtocol };
}

function formatSourceLine(s: { url: string; forceProtocol: string }) {
  return s.forceProtocol ? s.url + "|" + s.forceProtocol : s.url;
}

export function sourceEntries(text: unknown) {
  const out: { url: string; forceProtocol: string }[] = [];
  const seen = new Set<string>();
  const src = lines(text);
  for (const raw of src.length ? src : lines(DEFAULT_PROXY_SOURCES)) {
    const e = parseSourceLine(raw);
    const key = formatSourceLine(e);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

function sourceLabel(url: string) {
  if (url.includes("cdn.jsdelivr.net")) return "jsDelivr";
  if (url.includes("api.proxyscrape.com")) return "ProxyScrape API";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export async function fetchProxySources(sourceText: unknown) {
  const sources = sourceEntries(sourceText);
  const results = await Promise.all(
    sources.map(async (s) => {
      const label = sourceLabel(s.url) + (s.forceProtocol ? " " + s.forceProtocol : "");
      try {
        const res = await fetch(s.url, { cache: "no-store", signal: AbortSignal.timeout(20000) });
        if (!res.ok) throw Error("HTTP " + res.status);
        const text = await res.text();
        if (text.length > 8 * 1024 * 1024) throw Error("danh sách quá lớn");
        const { proxies } = parseProxySource(text);
        if (s.forceProtocol) for (const p of proxies) p.protocol = s.forceProtocol as ParsedProxy["protocol"];
        return { label, proxies };
      } catch (e) {
        return { label, error: e instanceof Error ? e.message : "không tải được" };
      }
    })
  );
  const merged: ParsedProxy[] = [];
  const seen = new Set<string>();
  const notes: string[] = [];
  const errors: string[] = [];
  for (const r of results) {
    if ("error" in r) { errors.push(r.label + ": " + r.error); continue; }
    notes.push(r.label + " " + r.proxies.length);
    for (const p of r.proxies) {
      const key = proxyKey(p);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(p);
    }
  }
  if (!merged.length) throw Error(errors.join(" · ") || "Không tìm thấy proxy trong các nguồn.");
  return {
    sourceText: sources.map(formatSourceLine).join("\n"),
    proxyText: merged.map(proxyToLine).join("\n"),
    count: merged.length,
    notes,
    errors,
  };
}

export function validateArticles(text: unknown) {
  const urls: string[] = [];
  const seen = new Set<string>();
  const errors: string[] = [];
  lines(text).forEach((line, i) => {
    let url: URL;
    try {
      url = new URL(line);
    } catch {
      errors.push("Dòng " + (i + 1) + " không phải URL hợp lệ.");
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      errors.push("Dòng " + (i + 1) + " phải là URL http hoặc https.");
      return;
    }
    const key = store.articlePairKey(url.href) || url.href;
    if (seen.has(key)) return;
    seen.add(key);
    urls.push(line);
  });
  return { urls, errors };
}

function intIn(value: unknown, min: number, max: number, message: string) {
  const n = Math.round(Number(value));
  if (!Number.isInteger(n) || n < min || n > max) throw Error(message);
  return n;
}

export type SettingsForm = {
  proxySourceUrl: string;
  proxyText: string;
  articleText: string;
  backupArticleText: string;
  waitMinSec: number | string;
  waitMaxSec: number | string;
  proxyTimeoutSec: number | string;
  articleLoadTimeoutSec: number | string;
  scrollEnabled: boolean;
  scrollSpeed: string;
  scrollDepthPercent: number | string;
  loop: boolean;
};

export function settingsPatch(form: Partial<SettingsForm>) {
  const articles = validateArticles(form.articleText);
  if (articles.errors.length) throw Error(articles.errors[0]);
  const backup = validateArticles(form.backupArticleText);
  if (backup.errors.length) throw Error("Link dự phòng: " + backup.errors[0]);
  const parsed = parseProxySource(form.proxyText);
  const raw = lines(form.proxyText).filter((l) => !l.startsWith("#"));
  if (raw.length && !parsed.proxies.length) {
    throw Error("Không có dòng proxy hợp lệ. Dùng ip:port, ip:port:user:pass hoặc socks5://ip:port.");
  }
  let waitMin = intIn(form.waitMinSec, 1, 3600, "Thời gian chờ phải từ 1 đến 3600 giây.");
  let waitMax = intIn(form.waitMaxSec, 1, 3600, "Thời gian chờ phải từ 1 đến 3600 giây.");
  if (waitMin > waitMax) [waitMin, waitMax] = [waitMax, waitMin];
  return {
    proxySourceUrl: sourceEntries(form.proxySourceUrl).map(formatSourceLine).join("\n"),
    proxyText: parsed.proxies.map(proxyToLine).join("\n"),
    proxies: parsed.proxies,
    articleText: articles.urls.join("\n"),
    articles: articles.urls,
    backupArticleText: backup.urls.join("\n"),
    waitMinSec: waitMin,
    waitMaxSec: waitMax,
    proxyTimeoutSec: intIn(form.proxyTimeoutSec, 5, 180, "Timeout proxy phải từ 5 đến 180 giây."),
    articleLoadTimeoutSec: intIn(form.articleLoadTimeoutSec, 15, 300, "Timeout tải bài phải từ 15 đến 300 giây."),
    scrollEnabled: Boolean(form.scrollEnabled),
    scrollSpeed: ["slow", "normal", "fast"].includes(String(form.scrollSpeed)) ? String(form.scrollSpeed) : "normal",
    scrollDepthPercent: intIn(form.scrollDepthPercent, 50, 100, "Độ sâu cuộn phải từ 50 đến 100%."),
    loop: Boolean(form.loop),
  };
}

function configProxyText(config: Record<string, unknown>): string {
  if (typeof config.proxyText === "string" && config.proxyText.trim()) return config.proxyText;
  if (Array.isArray(config.proxies)) {
    return (config.proxies as ParsedProxy[])
      .map((p) => {
        const parsed = parseProxyLine(proxyToLine({ ...p, protocol: normalizeProtocol(p.protocol) || "http" }));
        return parsed ? proxyToLine(parsed) : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

/** Giống configArticles của app: config.articles, không có thì articleText. */
function configArticles(config: Record<string, unknown>): string[] {
  const list = Array.isArray(config.articles) && config.articles.length
    ? (config.articles as unknown[])
    : lines(config.articleText);
  return list.map(String).filter((u) => /^https?:\/\//i.test(u));
}

/** Form hiện tại từ config trên máy chủ (thiếu khoá nào thì lấy mặc định của app). */
export function settingsForm(config: Record<string, unknown>): SettingsForm {
  const t = { ...DEFAULT_TIMING, ...config } as Record<string, unknown>;
  return {
    proxySourceUrl: String(config.proxySourceUrl || DEFAULT_PROXY_SOURCES),
    proxyText: configProxyText(config),
    articleText: configArticles(config).join("\n"),
    backupArticleText: lines(config.backupArticleText).join("\n"),
    waitMinSec: Number(t.waitMinSec),
    waitMaxSec: Number(t.waitMaxSec),
    proxyTimeoutSec: Number(t.proxyTimeoutSec),
    articleLoadTimeoutSec: Number(t.articleLoadTimeoutSec),
    scrollEnabled: t.scrollEnabled !== false,
    scrollSpeed: String(t.scrollSpeed || "normal"),
    scrollDepthPercent: Number(t.scrollDepthPercent),
    loop: Boolean(t.loop),
  };
}

export type ProxyRow = {
  line: string;
  host: string;
  port: number;
  protocol: string;
  auth: boolean;
  status: string;
  kind: "live" | "dead" | "busy" | "untried" | "exhausted" | "unsupported";
  title: string;
};

/**
 * Bảng proxy giống app: Chưa thử · Hết bài · Không · Đang dùng (máy nào giữ) · Live.
 * «Hết bài»: chưa có trạng thái nhưng đã có bản ghi cho mọi bài (vd. sau «Xoá trạng thái»).
 * App bỏ qua những proxy này, nên không tính là Chưa thử.
 */
export function inspectProxies(userId: string, text: unknown) {
  const { proxies, skipped } = parseProxySource(text);
  const health = store.healthMap(userId);
  const leaseBy = new Map<string, store.LeaseRow>();
  for (const l of store.activeLeases(userId)) if (l.key.startsWith("proxy:")) leaseBy.set(l.key.slice(6), l);
  const articleKeys = [
    ...new Set(configArticles(store.configValue(userId)).map((u) => store.articlePairKey(u)).filter(Boolean)),
  ];
  const doneBy = articleKeys.length ? store.doneUrlsByProxy(userId) : new Map<string, Set<string>>();
  const ranAll = (key: string) => {
    const done = doneBy.get(key);
    return Boolean(done) && articleKeys.every((u) => done!.has(u));
  };
  const rows: ProxyRow[] = proxies.map((p) => {
    const row: ProxyRow = {
      line: proxyToLine(p),
      host: p.host,
      port: p.port,
      protocol: p.protocol.toUpperCase(),
      auth: Boolean(p.username),
      status: "Chưa thử",
      kind: "untried",
      title: "",
    };
    if (p.protocol !== "http" && (p.username || p.password)) {
      return { ...row, status: "Không hỗ trợ", kind: "unsupported", title: "SOCKS có mật khẩu: app chỉ hỗ trợ tài khoản với HTTP proxy." };
    }
    const key = proxyKey(p);
    const h = health[key];
    const ip = h?.ip ? "IP " + h.ip : "";
    const lease = leaseBy.get(key);
    if (lease) return { ...row, status: "Đang dùng", kind: "busy", title: `Máy ${lease.machine}` + (ip ? " · " + ip : "") };
    if (h?.status === "live") return { ...row, status: "Live", kind: "live", title: ip || "Kết nối thành công" };
    if (h && h.status !== "unknown" && h.status !== "pending") return { ...row, status: "Không", kind: "dead", title: h.note || "Proxy lỗi" };
    if (ranAll(key)) {
      return { ...row, status: "Hết bài", kind: "exhausted", title: "Đã chạy mọi bài trong danh sách — app bỏ qua." };
    }
    return row;
  });
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
  return { rows, skipped, total: rows.length, counts };
}

// ---- Link dự phòng: Chưa thử < ngưỡng → xoá trạng thái proxy + thay danh sách bài bằng 20 link dự phòng ----

export const BACKUP_UNTRIED_THRESHOLD = 100;
export const BACKUP_BATCH = 20;
const BACKUP_COOLDOWN_MS = 10 * 60_000;

export type BackupRotationInfo = {
  remaining: number;
  rotatedAt: number | null;
  moved: number;
};

function backupInfo(config: Record<string, unknown>): BackupRotationInfo {
  return {
    remaining: lines(config.backupArticleText).length,
    rotatedAt: Number(config.backupRotatedAt) || null,
    moved: Number(config.backupMoved) || 0,
  };
}

/**
 * Chạy khi Chưa thử < BACKUP_UNTRIED_THRESHOLD và còn link dự phòng.
 * Chỉ chạy khi danh sách proxy dùng được > ngưỡng: nếu không, ngay sau khi xoá trạng thái
 * Chưa thử vẫn dưới ngưỡng và link dự phòng sẽ bị cắt liên tục.
 */
export function rotateBackupIfLow(userId: string): { rotated: boolean; info: BackupRotationInfo } {
  const config = store.configValue(userId);
  const backup = lines(config.backupArticleText);
  if (!backup.length) return { rotated: false, info: backupInfo(config) };

  const table = inspectProxies(userId, configProxyText(config));
  const usable = table.total - (table.counts["Không hỗ trợ"] || 0);
  const untried = table.counts["Chưa thử"] || 0;
  const cooling = Date.now() - (Number(config.backupRotatedAt) || 0) < BACKUP_COOLDOWN_MS;
  if (usable <= BACKUP_UNTRIED_THRESHOLD || untried >= BACKUP_UNTRIED_THRESHOLD || cooling) {
    return { rotated: false, info: backupInfo(config) };
  }

  const moved = backup.slice(0, BACKUP_BATCH);
  const rest = backup.slice(BACKUP_BATCH);
  store.applyArticleRotation(userId, {
    articles: moved,
    articleText: moved.join("\n"),
    backupArticleText: rest.join("\n"),
    backupRotatedAt: Date.now(),
    backupMoved: moved.length,
  });
  return { rotated: true, info: backupInfo(store.configValue(userId)) };
}

/** Việc nền (cron mỗi phút): kiểm tra mọi user có link dự phòng. */
export function runGeoBackupRotation(log: (message: string, detail: Record<string, unknown>) => void) {
  for (const userId of store.usersWithConfigKey("backupArticleText")) {
    try {
      const r = rotateBackupIfLow(userId);
      if (r.rotated) {
        log("Geo — Chưa thử dưới ngưỡng: xoá trạng thái proxy, chuyển link dự phòng sang Danh sách bài viết", {
          userId,
          moved: r.info.moved,
          backupRemaining: r.info.remaining,
        });
      }
    } catch (e) {
      log("Geo — chuyển link dự phòng lỗi", { userId, error: e instanceof Error ? e.message : String(e) });
    }
  }
}

export type MachineView = {
  machine: string;
  ip: string;
  online: boolean;
  lastSeen: number;
  tabs: number;
  running: number;
  allowShutdown: boolean;
  proxies: number;
  command: { kind: string; status: string; note: string; createdAt: number; updatedAt: number } | null;
};

/** Các máy: máy báo online gần đây (kể cả đang chờ việc) cộng máy đang giữ proxy, kèm lệnh gần nhất. */
function machineViews(userId: string, leases: store.LeaseRow[], now: number): MachineView[] {
  const byName = new Map<string, MachineView>();
  const get = (machine: string): MachineView => {
    let m = byName.get(machine);
    if (!m) {
      m = { machine, ip: "", online: false, lastSeen: 0, tabs: 0, running: 0, allowShutdown: false, proxies: 0, command: null };
      byName.set(machine, m);
    }
    return m;
  };
  for (const r of store.listMachines(userId)) {
    const m = get(r.machine);
    m.ip = r.info.ip || "";
    m.lastSeen = r.lastSeen;
    m.online = now - r.lastSeen < store.MACHINE_ONLINE_MS;
    m.tabs = r.info.tabs || 0;
    m.running = r.info.running || 0;
    m.allowShutdown = r.info.allowShutdown === true;
  }
  for (const l of leases) {
    const m = get(l.machine);
    if (l.key.startsWith("proxy:")) m.proxies += 1;
    m.online = true;
  }
  const commands = store.latestCommands(userId);
  for (const m of byName.values()) {
    const c = commands[m.machine];
    if (!c) continue;
    const expired = c.status === "pending" && now - c.createdAt > store.COMMAND_TTL_MS;
    m.command = { kind: c.kind, status: expired ? "expired" : c.status, note: c.note, createdAt: c.createdAt, updatedAt: c.updatedAt };
  }
  // Máy offline quá 1 ngày thì listMachines đã bỏ; máy offline không giữ proxy xếp sau.
  return [...byName.values()].sort((a, b) => Number(b.online) - Number(a.online) || a.machine.localeCompare(b.machine));
}

/** Các máy và tổng hợp lịch sử. */
export function overview(userId: string) {
  const snap = store.snapshot(userId);
  const done = { total: 0, ok: 0, bad: 0, unknown: 0 };
  const notes: Record<string, number> = {};
  for (const list of Object.values(snap.proxyArticleDone)) {
    for (const e of list) {
      done.total += 1;
      if (typeof e === "object" && e.ok === true) done.ok += 1;
      else if (typeof e === "object" && e.ok === false) {
        done.bad += 1;
        const n = String(e.note || "Không tải được").slice(0, 80);
        notes[n] = (notes[n] || 0) + 1;
      } else done.unknown += 1;
    }
  }
  const reasons = Object.entries(notes)
    .map(([note, count]) => ({ note, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  return {
    form: settingsForm(snap.config),
    backup: backupInfo(snap.config),
    machines: machineViews(userId, snap.leases, snap.serverTime),
    done: { ...done, reasons },
    seq: snap.seq,
    serverTime: snap.serverTime,
  };
}
