import { sqlite as getSqlite } from "@/lib/db";

/**
 * Kho dữ liệu dùng chung cho app Geo Proxy Rotator Browser chạy trên nhiều máy.
 * Định dạng trả về giống geo-proxy-data.json (config / proxyHealth / proxyArticleDone).
 * Giữ chỗ proxy (lease) làm trong transaction SQLite nên hai máy không thể giữ cùng một proxy.
 */

export type HealthEntry = {
  status: string;
  updatedAt: number;
  owner: string;
  ip: string;
  note: string;
};

export type DoneEntry = string | { url: string; ok: boolean; at: number; note?: string };

export type LeaseRow = {
  key: string;
  owner: string;
  machine: string;
  expiresAt: number;
  claimedAt: number;
};

const TRACKING = ["fbclid", "gclid", "dclid", "msclkid", "twclid", "wbraid", "gbraid", "mc_eid"];
const CHANGE_KEEP = 200_000;
const MIN_TTL = 30_000;
const MAX_TTL = 600_000;

let migrated = false;

export function migrateGeoSyncSchema() {
  if (migrated) return;
  getSqlite().exec(`
    CREATE TABLE IF NOT EXISTS geo_kv (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS geo_proxy_health (
      proxy_key TEXT PRIMARY KEY NOT NULL,
      status TEXT NOT NULL,
      ip TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      owner TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS geo_article_done (
      proxy_key TEXT NOT NULL,
      url TEXT NOT NULL,
      ok INTEGER,
      note TEXT NOT NULL DEFAULT '',
      at INTEGER NOT NULL,
      PRIMARY KEY (proxy_key, url)
    );
    CREATE TABLE IF NOT EXISTS geo_lease (
      lease_key TEXT PRIMARY KEY NOT NULL,
      owner TEXT NOT NULL,
      machine TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      claimed_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS geo_lease_machine_idx ON geo_lease (machine);
    CREATE TABLE IF NOT EXISTS geo_change (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      k1 TEXT NOT NULL DEFAULT '',
      k2 TEXT NOT NULL DEFAULT '',
      at INTEGER NOT NULL
    );
  `);
  migrated = true;
}

function db() {
  migrateGeoSyncSchema();
  return getSqlite();
}

// Giống articlePairKey của extension / app: bỏ fbclid, utm_*, hash để so cặp proxy–bài.
export function articlePairKey(raw: unknown): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    for (const name of TRACKING) url.searchParams.delete(name);
    for (const name of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(name)) url.searchParams.delete(name);
    }
    url.hash = "";
    return url.href;
  } catch {
    return text.replace(/([?&])fbclid=[^&#]*/gi, "$1").replace(/[?&]$/, "");
  }
}

function clip(text: unknown, max = 160): string {
  return String(text ?? "").slice(0, max);
}

function clampTtl(ttl: unknown): number {
  const n = Number(ttl);
  if (!Number.isFinite(n)) return 180_000;
  return Math.min(MAX_TTL, Math.max(MIN_TTL, Math.round(n)));
}

function logChange(kind: string, k1 = "", k2 = "") {
  db().prepare("INSERT INTO geo_change (kind, k1, k2, at) VALUES (?, ?, ?, ?)").run(kind, k1, k2, Date.now());
}

function currentSeq(): number {
  const row = db().prepare("SELECT MAX(seq) AS seq FROM geo_change").get() as { seq: number | null };
  return row.seq ?? 0;
}

function pruneChanges() {
  const seq = currentSeq();
  if (seq % 1000 !== 0) return;
  db().prepare("DELETE FROM geo_change WHERE seq <= ?").run(seq - CHANGE_KEEP);
}

function readConfig(): Record<string, unknown> {
  const row = db().prepare("SELECT value FROM geo_kv WHERE key = 'config'").get() as { value: string } | undefined;
  if (!row) return {};
  try {
    const value = JSON.parse(row.value);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function writeConfig(config: Record<string, unknown>) {
  db()
    .prepare(
      "INSERT INTO geo_kv (key, value, updated_at) VALUES ('config', ?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .run(JSON.stringify(config), Date.now());
}

type HealthRow = { proxy_key: string; status: string; ip: string; note: string; owner: string; updated_at: number };
type DoneRow = { proxy_key: string; url: string; ok: number | null; note: string; at: number };

function healthFromRow(r: HealthRow): HealthEntry {
  return { status: r.status, updatedAt: r.updated_at, owner: r.owner, ip: r.ip, note: r.note };
}

function doneFromRow(r: DoneRow): DoneEntry {
  if (r.ok === null) return r.url;
  const entry: DoneEntry = { url: r.url, ok: r.ok === 1, at: r.at };
  if (r.ok === 0 && r.note) entry.note = r.note;
  return entry;
}

export function healthMap(): Record<string, HealthEntry> {
  const out: Record<string, HealthEntry> = {};
  for (const r of db().prepare("SELECT * FROM geo_proxy_health").all() as HealthRow[]) {
    out[r.proxy_key] = healthFromRow(r);
  }
  return out;
}

export function configValue(): Record<string, unknown> {
  return readConfig();
}

export function activeLeases(): LeaseRow[] {
  const now = Date.now();
  const rows = db()
    .prepare("SELECT lease_key, owner, machine, expires_at, claimed_at FROM geo_lease WHERE expires_at > ?")
    .all(now) as { lease_key: string; owner: string; machine: string; expires_at: number; claimed_at: number }[];
  return rows.map((r) => ({
    key: r.lease_key,
    owner: r.owner,
    machine: r.machine,
    expiresAt: r.expires_at,
    claimedAt: r.claimed_at,
  }));
}

export function snapshot() {
  const proxyHealth = healthMap();
  const proxyArticleDone: Record<string, DoneEntry[]> = {};
  for (const r of db().prepare("SELECT * FROM geo_article_done ORDER BY proxy_key, at").all() as DoneRow[]) {
    (proxyArticleDone[r.proxy_key] ||= []).push(doneFromRow(r));
  }
  return {
    full: true,
    seq: currentSeq(),
    config: readConfig(),
    proxyHealth,
    proxyArticleDone,
    leases: activeLeases(),
    serverTime: Date.now(),
  };
}

/**
 * Thay đổi kể từ seq (since = -1 để lấy toàn bộ). Trả snapshot đầy đủ khi client quá cũ,
 * máy chủ vừa đổi DB, hoặc dữ liệu vừa bị xoá / nhập hàng loạt.
 */
export function changesSince(sinceRaw: unknown) {
  const since = Number(sinceRaw);
  const seq = currentSeq();
  if (!Number.isFinite(since) || since < 0 || since > seq) return snapshot();
  const min = db().prepare("SELECT MIN(seq) AS seq FROM geo_change").get() as { seq: number | null };
  if (min.seq !== null && since < min.seq - 1) return snapshot();
  const rows = db()
    .prepare("SELECT kind, k1, k2 FROM geo_change WHERE seq > ? ORDER BY seq")
    .all(since) as { kind: string; k1: string; k2: string }[];
  if (rows.some((r) => r.kind === "reset")) return snapshot();

  const healthKeys = new Set<string>();
  const donePairs = new Map<string, [string, string]>();
  let configChanged = false;
  for (const r of rows) {
    if (r.kind === "health") healthKeys.add(r.k1);
    else if (r.kind === "done") donePairs.set(r.k1 + "\n" + r.k2, [r.k1, r.k2]);
    else if (r.kind === "config") configChanged = true;
  }
  const health: Record<string, HealthEntry | null> = {};
  const getHealth = db().prepare("SELECT * FROM geo_proxy_health WHERE proxy_key = ?");
  for (const key of healthKeys) {
    const row = getHealth.get(key) as HealthRow | undefined;
    health[key] = row ? healthFromRow(row) : null;
  }
  const done: { proxyKey: string; entry: DoneEntry }[] = [];
  const getDone = db().prepare("SELECT * FROM geo_article_done WHERE proxy_key = ? AND url = ?");
  for (const [proxyKey, url] of donePairs.values()) {
    const row = getDone.get(proxyKey, url) as DoneRow | undefined;
    if (row) done.push({ proxyKey, entry: doneFromRow(row) });
  }
  return {
    full: false,
    seq,
    config: configChanged ? readConfig() : undefined,
    health,
    done,
    leases: activeLeases(),
    serverTime: Date.now(),
  };
}

export function setHealth(proxyKeyRaw: unknown, entry: Partial<HealthEntry>) {
  const proxyKey = clip(proxyKeyRaw, 300);
  if (!proxyKey) throw Error("Thiếu proxyKey.");
  const status = clip(entry.status, 20) || "unknown";
  const tx = db().transaction(() => {
    db()
      .prepare(
        "INSERT INTO geo_proxy_health (proxy_key, status, ip, note, owner, updated_at) VALUES (?, ?, ?, ?, ?, ?) " +
          "ON CONFLICT(proxy_key) DO UPDATE SET status = excluded.status, " +
          "ip = CASE WHEN excluded.ip <> '' THEN excluded.ip ELSE geo_proxy_health.ip END, " +
          "note = excluded.note, owner = excluded.owner, updated_at = excluded.updated_at"
      )
      .run(proxyKey, status, clip(entry.ip, 64), clip(entry.note), clip(entry.owner, 80), Date.now());
    logChange("health", proxyKey);
  });
  tx();
  pruneChanges();
}

// Thành công giữ lại. Lỗi chỉ ghi khi chưa từng chạy được. Không có ok là cặp chưa rõ kết quả.
export function remember(proxyKeyRaw: unknown, urlRaw: unknown, outcome: { ok?: unknown; note?: unknown } | null) {
  const proxyKey = clip(proxyKeyRaw, 300);
  const url = articlePairKey(urlRaw);
  if (!proxyKey || !url) throw Error("Thiếu proxyKey hoặc url.");
  const nextOk = typeof outcome?.ok === "boolean" ? outcome.ok : null;
  const tx = db().transaction(() => {
    const prev = db()
      .prepare("SELECT ok FROM geo_article_done WHERE proxy_key = ? AND url = ?")
      .get(proxyKey, url) as { ok: number | null } | undefined;
    const prevOk = prev ? (prev.ok === null ? null : prev.ok === 1) : null;
    if (prevOk === true) return;
    let ok: number | null = null;
    let note = "";
    if (nextOk === true) ok = 1;
    else if (nextOk === false) { ok = 0; note = clip(outcome?.note); }
    else if (prevOk === false) return;
    else if (prev) return;
    db()
      .prepare(
        "INSERT INTO geo_article_done (proxy_key, url, ok, note, at) VALUES (?, ?, ?, ?, ?) " +
          "ON CONFLICT(proxy_key, url) DO UPDATE SET ok = excluded.ok, note = excluded.note, at = excluded.at"
      )
      .run(proxyKey, url, ok, note, Date.now());
    logChange("done", proxyKey, url);
  });
  tx();
  pruneChanges();
}

export function updateConfig(patch: unknown) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw Error("config không hợp lệ.");
  const tx = db().transaction(() => {
    writeConfig({ ...readConfig(), ...(patch as Record<string, unknown>) });
    logChange("config");
  });
  tx();
  return readConfig();
}

export function clear(what: unknown) {
  const tx = db().transaction(() => {
    if (what === "health") db().exec("DELETE FROM geo_proxy_health");
    else if (what === "done") db().exec("DELETE FROM geo_article_done");
    else if (what === "proxies") {
      writeConfig({ ...readConfig(), proxyText: "", proxies: [] });
      db().exec("DELETE FROM geo_proxy_health; DELETE FROM geo_lease;");
    } else throw Error("Không rõ mục cần xoá.");
    logChange("reset");
  });
  tx();
}

/** Giữ chỗ nguyên tử: chỉ được nếu chưa ai giữ, đã hết hạn, hoặc chính owner này đang giữ. */
export function claim(input: { key?: unknown; owner?: unknown; machine?: unknown; ttlMs?: unknown }) {
  const key = clip(input.key, 300);
  const owner = clip(input.owner, 120);
  const machine = clip(input.machine, 80);
  if (!key || !owner || !machine) throw Error("Thiếu key / owner / machine.");
  const ttl = clampTtl(input.ttlMs);
  const tx = db().transaction(() => {
    const now = Date.now();
    db().prepare("DELETE FROM geo_lease WHERE expires_at <= ?").run(now);
    const row = db().prepare("SELECT owner FROM geo_lease WHERE lease_key = ?").get(key) as { owner: string } | undefined;
    if (row && row.owner !== owner) return { ok: false as const, owner: row.owner };
    db()
      .prepare(
        "INSERT INTO geo_lease (lease_key, owner, machine, expires_at, claimed_at) VALUES (?, ?, ?, ?, ?) " +
          "ON CONFLICT(lease_key) DO UPDATE SET expires_at = excluded.expires_at"
      )
      .run(key, owner, machine, now + ttl, now);
    return { ok: true as const };
  });
  return tx();
}

export function renew(input: { machine?: unknown; ttlMs?: unknown }) {
  const machine = clip(input.machine, 80);
  if (!machine) throw Error("Thiếu machine.");
  const r = db()
    .prepare("UPDATE geo_lease SET expires_at = ? WHERE machine = ? AND expires_at > ?")
    .run(Date.now() + clampTtl(input.ttlMs), machine, Date.now());
  return { renewed: r.changes };
}

export function release(input: { owner?: unknown; machine?: unknown; keys?: unknown }) {
  const keys = Array.isArray(input.keys) ? input.keys.map((k) => clip(k, 300)).filter(Boolean) : [];
  const tx = db().transaction(() => {
    if (input.machine && !input.owner) {
      return db().prepare("DELETE FROM geo_lease WHERE machine = ?").run(clip(input.machine, 80)).changes;
    }
    const owner = clip(input.owner, 120);
    if (!owner) throw Error("Thiếu owner.");
    if (!keys.length) return db().prepare("DELETE FROM geo_lease WHERE owner = ?").run(owner).changes;
    const del = db().prepare("DELETE FROM geo_lease WHERE owner = ? AND lease_key = ?");
    let n = 0;
    for (const key of keys) n += del.run(owner, key).changes;
    return n;
  });
  return { released: tx() };
}

type ImportData = {
  config?: unknown;
  proxyHealth?: unknown;
  proxyArticleDone?: unknown;
};

/** Gộp geo-proxy-data.json của một máy lên máy chủ (trạng thái mới hơn thắng, cặp thành công giữ lại). */
export function importData(data: ImportData, overwriteConfig: boolean) {
  let health = 0;
  let done = 0;
  let configTaken = false;
  const tx = db().transaction(() => {
    const getHealth = db().prepare("SELECT updated_at FROM geo_proxy_health WHERE proxy_key = ?");
    const putHealth = db().prepare(
      "INSERT INTO geo_proxy_health (proxy_key, status, ip, note, owner, updated_at) VALUES (?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(proxy_key) DO UPDATE SET status = excluded.status, ip = excluded.ip, note = excluded.note, " +
        "owner = excluded.owner, updated_at = excluded.updated_at"
    );
    const healthMap = data.proxyHealth && typeof data.proxyHealth === "object" ? (data.proxyHealth as Record<string, Partial<HealthEntry>>) : {};
    for (const [key, h] of Object.entries(healthMap)) {
      if (!h || typeof h !== "object" || !h.status) continue;
      const at = Number(h.updatedAt) || 0;
      const prev = getHealth.get(clip(key, 300)) as { updated_at: number } | undefined;
      if (prev && prev.updated_at >= at) continue;
      putHealth.run(clip(key, 300), clip(h.status, 20), clip(h.ip, 64), clip(h.note), clip(h.owner, 80), at || Date.now());
      health += 1;
    }

    const getDone = db().prepare("SELECT ok FROM geo_article_done WHERE proxy_key = ? AND url = ?");
    const putDone = db().prepare(
      "INSERT INTO geo_article_done (proxy_key, url, ok, note, at) VALUES (?, ?, ?, ?, ?) " +
        "ON CONFLICT(proxy_key, url) DO UPDATE SET ok = excluded.ok, note = excluded.note, at = excluded.at"
    );
    const doneMap = data.proxyArticleDone && typeof data.proxyArticleDone === "object" ? (data.proxyArticleDone as Record<string, unknown>) : {};
    for (const [proxyKeyRaw, list] of Object.entries(doneMap)) {
      if (!Array.isArray(list)) continue;
      const proxyKey = clip(proxyKeyRaw, 300);
      for (const item of list) {
        const isObj = item && typeof item === "object";
        const url = articlePairKey(isObj ? (item as { url?: unknown }).url : item);
        if (!url) continue;
        const okRaw = isObj ? (item as { ok?: unknown }).ok : undefined;
        const ok = okRaw === true ? 1 : okRaw === false ? 0 : null;
        const prev = getDone.get(proxyKey, url) as { ok: number | null } | undefined;
        if (prev && (prev.ok === 1 || ok === null || (prev.ok === 0 && ok === 0))) continue;
        const at = isObj ? Number((item as { at?: unknown }).at) || Date.now() : Date.now();
        const note = ok === 0 && isObj ? clip((item as { note?: unknown }).note) : "";
        putDone.run(proxyKey, url, ok, note, at);
        done += 1;
      }
    }

    const current = readConfig();
    if (data.config && typeof data.config === "object" && (overwriteConfig || !Object.keys(current).length)) {
      writeConfig({ ...current, ...(data.config as Record<string, unknown>) });
      configTaken = true;
    }
    logChange("reset");
  });
  tx();
  return { health, done, configTaken };
}

export function stats() {
  const one = (sql: string) => (db().prepare(sql).get() as { n: number }).n;
  return {
    seq: currentSeq(),
    health: one("SELECT COUNT(*) AS n FROM geo_proxy_health"),
    dead: one("SELECT COUNT(*) AS n FROM geo_proxy_health WHERE status = 'dead'"),
    done: one("SELECT COUNT(*) AS n FROM geo_article_done"),
    leases: activeLeases().length,
    hasConfig: Object.keys(readConfig()).length > 0,
    serverTime: Date.now(),
  };
}
