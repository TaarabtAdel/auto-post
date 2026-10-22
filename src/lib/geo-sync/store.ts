import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { sqlite as getSqlite } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";

/**
 * Kho dữ liệu dùng chung cho app Geo Proxy Rotator Browser chạy trên nhiều máy, tách theo user auto-post.
 * Định dạng trả về giống geo-proxy-data.json (config / proxyHealth / proxyArticleDone).
 * Giữ chỗ proxy (lease) làm trong transaction SQLite nên hai máy của cùng user không giữ trùng một proxy.
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
const GEO_TABLES = ["geo_kv", "geo_proxy_health", "geo_article_done", "geo_lease", "geo_change"];

let migrated = false;

function hasColumn(table: string, column: string): boolean {
  const cols = getSqlite().prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

export function migrateGeoSyncSchema() {
  if (migrated) return;
  const sqlite = getSqlite();
  // Bản đầu chưa tách theo user: bỏ bảng cũ (chỉ là bản sao từ file geo-proxy-data.json, đẩy lại được).
  const legacy = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'geo_proxy_health'").get();
  if (legacy && !hasColumn("geo_proxy_health", "user_id")) {
    for (const t of GEO_TABLES) sqlite.exec(`DROP TABLE IF EXISTS ${t}`);
  }
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS geo_user_key (
      user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      token_enc TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS geo_kv (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, key)
    );
    CREATE TABLE IF NOT EXISTS geo_proxy_health (
      user_id TEXT NOT NULL,
      proxy_key TEXT NOT NULL,
      status TEXT NOT NULL,
      ip TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      owner TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, proxy_key)
    );
    CREATE TABLE IF NOT EXISTS geo_article_done (
      user_id TEXT NOT NULL,
      proxy_key TEXT NOT NULL,
      url TEXT NOT NULL,
      ok INTEGER,
      note TEXT NOT NULL DEFAULT '',
      at INTEGER NOT NULL,
      PRIMARY KEY (user_id, proxy_key, url)
    );
    CREATE TABLE IF NOT EXISTS geo_lease (
      user_id TEXT NOT NULL,
      lease_key TEXT NOT NULL,
      owner TEXT NOT NULL,
      machine TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      claimed_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, lease_key)
    );
    CREATE INDEX IF NOT EXISTS geo_lease_machine_idx ON geo_lease (user_id, machine);
    CREATE TABLE IF NOT EXISTS geo_change (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      k1 TEXT NOT NULL DEFAULT '',
      k2 TEXT NOT NULL DEFAULT '',
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS geo_change_user_idx ON geo_change (user_id, seq);
    CREATE TABLE IF NOT EXISTS geo_machine (
      user_id TEXT NOT NULL,
      machine TEXT NOT NULL,
      info TEXT NOT NULL DEFAULT '{}',
      last_seen INTEGER NOT NULL,
      PRIMARY KEY (user_id, machine)
    );
    CREATE TABLE IF NOT EXISTS geo_command (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      machine TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS geo_command_machine_idx ON geo_command (user_id, machine, status);
  `);
  migrated = true;
}

function db() {
  migrateGeoSyncSchema();
  return getSqlite();
}

// ---- Khoá đồng bộ của từng user (app nhập ID user + khoá này) ----

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Tạo khoá mới cho user (khoá cũ hết hiệu lực). Lưu băm để xác thực, bản mã hoá để hiện lại trên /geo. */
export function rotateUserKey(userId: string): string {
  const token = randomBytes(24).toString("hex");
  db()
    .prepare(
      "INSERT INTO geo_user_key (user_id, token_hash, token_enc, created_at) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(user_id) DO UPDATE SET token_hash = excluded.token_hash, token_enc = excluded.token_enc, " +
        "created_at = excluded.created_at"
    )
    .run(userId, hashToken(token), encrypt(token), Date.now());
  return token;
}

export function readUserKey(userId: string): { token: string; createdAt: number } | null {
  const row = db().prepare("SELECT token_enc, created_at FROM geo_user_key WHERE user_id = ?").get(userId) as
    | { token_enc: string; created_at: number }
    | undefined;
  if (!row) return null;
  try {
    return { token: decrypt(row.token_enc), createdAt: row.created_at };
  } catch {
    return null;
  }
}

export function verifyUserKey(userIdRaw: unknown, tokenRaw: unknown): boolean {
  const userId = String(userIdRaw ?? "").trim();
  const token = String(tokenRaw ?? "").trim();
  if (!userId || !token) return false;
  const row = db().prepare("SELECT token_hash FROM geo_user_key WHERE user_id = ?").get(userId) as
    | { token_hash: string }
    | undefined;
  if (!row) return false;
  const a = Buffer.from(row.token_hash, "hex");
  const b = Buffer.from(hashToken(token), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
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

function logChange(userId: string, kind: string, k1 = "", k2 = "") {
  db().prepare("INSERT INTO geo_change (user_id, kind, k1, k2, at) VALUES (?, ?, ?, ?, ?)").run(userId, kind, k1, k2, Date.now());
}

function currentSeq(userId: string): number {
  const row = db().prepare("SELECT MAX(seq) AS seq FROM geo_change WHERE user_id = ?").get(userId) as { seq: number | null };
  return row.seq ?? 0;
}

function pruneChanges() {
  const row = db().prepare("SELECT MAX(seq) AS seq FROM geo_change").get() as { seq: number | null };
  const seq = row.seq ?? 0;
  if (seq % 1000 !== 0) return;
  db().prepare("DELETE FROM geo_change WHERE seq <= ?").run(seq - CHANGE_KEEP);
}

function readConfig(userId: string): Record<string, unknown> {
  const row = db().prepare("SELECT value FROM geo_kv WHERE user_id = ? AND key = 'config'").get(userId) as
    | { value: string }
    | undefined;
  if (!row) return {};
  try {
    const value = JSON.parse(row.value);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function writeConfig(userId: string, config: Record<string, unknown>) {
  db()
    .prepare(
      "INSERT INTO geo_kv (user_id, key, value, updated_at) VALUES (?, 'config', ?, ?) " +
        "ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .run(userId, JSON.stringify(config), Date.now());
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

export function healthMap(userId: string): Record<string, HealthEntry> {
  const out: Record<string, HealthEntry> = {};
  for (const r of db().prepare("SELECT * FROM geo_proxy_health WHERE user_id = ?").all(userId) as HealthRow[]) {
    out[r.proxy_key] = healthFromRow(r);
  }
  return out;
}

export function configValue(userId: string): Record<string, unknown> {
  return readConfig(userId);
}

/** Bài (articlePairKey) đã có bản ghi theo từng proxy — kể cả lỗi / chưa rõ: app coi là đã chạy. */
export function doneUrlsByProxy(userId: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const rows = db().prepare("SELECT proxy_key, url FROM geo_article_done WHERE user_id = ?").all(userId) as {
    proxy_key: string;
    url: string;
  }[];
  for (const r of rows) {
    let set = out.get(r.proxy_key);
    if (!set) out.set(r.proxy_key, (set = new Set()));
    set.add(r.url);
  }
  return out;
}

/** User có khoá config này (vd. backupArticleText) — dùng cho việc nền theo từng user. */
export function usersWithConfigKey(key: string): string[] {
  const rows = db()
    .prepare("SELECT user_id, value FROM geo_kv WHERE key = 'config' AND value LIKE ?")
    .all(`%"${key}"%`) as { user_id: string; value: string }[];
  return rows.map((r) => r.user_id);
}

/** Đổi danh sách bài + xoá trạng thái proxy trong cùng transaction; app nhận một snapshot đầy đủ. */
export function applyArticleRotation(userId: string, patch: Record<string, unknown>) {
  const tx = db().transaction(() => {
    writeConfig(userId, { ...readConfig(userId), ...patch });
    db().prepare("DELETE FROM geo_proxy_health WHERE user_id = ?").run(userId);
    logChange(userId, "reset");
  });
  tx();
}

export function activeLeases(userId: string): LeaseRow[] {
  const rows = db()
    .prepare(
      "SELECT lease_key, owner, machine, expires_at, claimed_at FROM geo_lease WHERE user_id = ? AND expires_at > ?"
    )
    .all(userId, Date.now()) as { lease_key: string; owner: string; machine: string; expires_at: number; claimed_at: number }[];
  return rows.map((r) => ({
    key: r.lease_key,
    owner: r.owner,
    machine: r.machine,
    expiresAt: r.expires_at,
    claimedAt: r.claimed_at,
  }));
}

export function snapshot(userId: string) {
  const proxyArticleDone: Record<string, DoneEntry[]> = {};
  const rows = db()
    .prepare("SELECT * FROM geo_article_done WHERE user_id = ? ORDER BY proxy_key, at")
    .all(userId) as DoneRow[];
  for (const r of rows) (proxyArticleDone[r.proxy_key] ||= []).push(doneFromRow(r));
  return {
    full: true,
    seq: currentSeq(userId),
    config: readConfig(userId),
    proxyHealth: healthMap(userId),
    proxyArticleDone,
    leases: activeLeases(userId),
    serverTime: Date.now(),
  };
}

/**
 * Thay đổi kể từ seq (since = -1 để lấy toàn bộ). Trả snapshot đầy đủ khi client quá cũ,
 * máy chủ vừa đổi DB, hoặc dữ liệu vừa bị xoá / nhập hàng loạt.
 */
export function changesSince(userId: string, sinceRaw: unknown) {
  const since = Number(sinceRaw);
  const seq = currentSeq(userId);
  if (!Number.isFinite(since) || since < 0 || since > seq) return snapshot(userId);
  const min = db().prepare("SELECT MIN(seq) AS seq FROM geo_change WHERE user_id = ?").get(userId) as { seq: number | null };
  if (min.seq !== null && since < min.seq - 1) return snapshot(userId);
  const rows = db()
    .prepare("SELECT kind, k1, k2 FROM geo_change WHERE user_id = ? AND seq > ? ORDER BY seq")
    .all(userId, since) as { kind: string; k1: string; k2: string }[];
  if (rows.some((r) => r.kind === "reset")) return snapshot(userId);

  const healthKeys = new Set<string>();
  const donePairs = new Map<string, [string, string]>();
  let configChanged = false;
  for (const r of rows) {
    if (r.kind === "health") healthKeys.add(r.k1);
    else if (r.kind === "done") donePairs.set(r.k1 + "\n" + r.k2, [r.k1, r.k2]);
    else if (r.kind === "config") configChanged = true;
  }
  const health: Record<string, HealthEntry | null> = {};
  const getHealth = db().prepare("SELECT * FROM geo_proxy_health WHERE user_id = ? AND proxy_key = ?");
  for (const key of healthKeys) {
    const row = getHealth.get(userId, key) as HealthRow | undefined;
    health[key] = row ? healthFromRow(row) : null;
  }
  const done: { proxyKey: string; entry: DoneEntry }[] = [];
  const getDone = db().prepare("SELECT * FROM geo_article_done WHERE user_id = ? AND proxy_key = ? AND url = ?");
  for (const [proxyKey, url] of donePairs.values()) {
    const row = getDone.get(userId, proxyKey, url) as DoneRow | undefined;
    if (row) done.push({ proxyKey, entry: doneFromRow(row) });
  }
  return {
    full: false,
    seq,
    config: configChanged ? readConfig(userId) : undefined,
    health,
    done,
    leases: activeLeases(userId),
    serverTime: Date.now(),
  };
}

export function setHealth(userId: string, proxyKeyRaw: unknown, entry: Partial<HealthEntry>) {
  const proxyKey = clip(proxyKeyRaw, 300);
  if (!proxyKey) throw Error("Thiếu proxyKey.");
  const status = clip(entry.status, 20) || "unknown";
  const tx = db().transaction(() => {
    db()
      .prepare(
        "INSERT INTO geo_proxy_health (user_id, proxy_key, status, ip, note, owner, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) " +
          "ON CONFLICT(user_id, proxy_key) DO UPDATE SET status = excluded.status, " +
          "ip = CASE WHEN excluded.ip <> '' THEN excluded.ip ELSE geo_proxy_health.ip END, " +
          "note = excluded.note, owner = excluded.owner, updated_at = excluded.updated_at"
      )
      .run(userId, proxyKey, status, clip(entry.ip, 64), clip(entry.note), clip(entry.owner, 80), Date.now());
    logChange(userId, "health", proxyKey);
  });
  tx();
  pruneChanges();
}

// Thành công giữ lại. Lỗi chỉ ghi khi chưa từng chạy được. Không có ok là cặp chưa rõ kết quả.
export function remember(
  userId: string,
  proxyKeyRaw: unknown,
  urlRaw: unknown,
  outcome: { ok?: unknown; note?: unknown } | null
) {
  const proxyKey = clip(proxyKeyRaw, 300);
  const url = articlePairKey(urlRaw);
  if (!proxyKey || !url) throw Error("Thiếu proxyKey hoặc url.");
  const nextOk = typeof outcome?.ok === "boolean" ? outcome.ok : null;
  const tx = db().transaction(() => {
    const prev = db()
      .prepare("SELECT ok FROM geo_article_done WHERE user_id = ? AND proxy_key = ? AND url = ?")
      .get(userId, proxyKey, url) as { ok: number | null } | undefined;
    const prevOk = prev ? (prev.ok === null ? null : prev.ok === 1) : null;
    if (prevOk === true) return;
    let ok: number | null = null;
    let note = "";
    if (nextOk === true) ok = 1;
    else if (nextOk === false) { ok = 0; note = clip(outcome?.note); }
    else if (prev) return;
    db()
      .prepare(
        "INSERT INTO geo_article_done (user_id, proxy_key, url, ok, note, at) VALUES (?, ?, ?, ?, ?, ?) " +
          "ON CONFLICT(user_id, proxy_key, url) DO UPDATE SET ok = excluded.ok, note = excluded.note, at = excluded.at"
      )
      .run(userId, proxyKey, url, ok, note, Date.now());
    logChange(userId, "done", proxyKey, url);
  });
  tx();
  pruneChanges();
}

export function updateConfig(userId: string, patch: unknown) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw Error("config không hợp lệ.");
  const tx = db().transaction(() => {
    writeConfig(userId, { ...readConfig(userId), ...(patch as Record<string, unknown>) });
    logChange(userId, "config");
  });
  tx();
  return readConfig(userId);
}

export function clear(userId: string, what: unknown) {
  const tx = db().transaction(() => {
    if (what === "health") db().prepare("DELETE FROM geo_proxy_health WHERE user_id = ?").run(userId);
    else if (what === "done") db().prepare("DELETE FROM geo_article_done WHERE user_id = ?").run(userId);
    else if (what === "proxies") {
      writeConfig(userId, { ...readConfig(userId), proxyText: "", proxies: [] });
      db().prepare("DELETE FROM geo_proxy_health WHERE user_id = ?").run(userId);
      db().prepare("DELETE FROM geo_lease WHERE user_id = ?").run(userId);
    } else throw Error("Không rõ mục cần xoá.");
    logChange(userId, "reset");
  });
  tx();
}

/** Giữ chỗ nguyên tử: chỉ được nếu chưa ai giữ, đã hết hạn, hoặc chính owner này đang giữ. */
export function claim(userId: string, input: { key?: unknown; owner?: unknown; machine?: unknown; ttlMs?: unknown }) {
  const key = clip(input.key, 300);
  const owner = clip(input.owner, 120);
  const machine = clip(input.machine, 80);
  if (!key || !owner || !machine) throw Error("Thiếu key / owner / machine.");
  const ttl = clampTtl(input.ttlMs);
  const tx = db().transaction(() => {
    const now = Date.now();
    db().prepare("DELETE FROM geo_lease WHERE user_id = ? AND expires_at <= ?").run(userId, now);
    const row = db().prepare("SELECT owner FROM geo_lease WHERE user_id = ? AND lease_key = ?").get(userId, key) as
      | { owner: string }
      | undefined;
    if (row && row.owner !== owner) return { ok: false as const, owner: row.owner };
    db()
      .prepare(
        "INSERT INTO geo_lease (user_id, lease_key, owner, machine, expires_at, claimed_at) VALUES (?, ?, ?, ?, ?, ?) " +
          "ON CONFLICT(user_id, lease_key) DO UPDATE SET expires_at = excluded.expires_at"
      )
      .run(userId, key, owner, machine, now + ttl, now);
    return { ok: true as const };
  });
  return tx();
}

export function renew(userId: string, input: { machine?: unknown; ttlMs?: unknown }) {
  const machine = clip(input.machine, 80);
  if (!machine) throw Error("Thiếu machine.");
  const now = Date.now();
  const r = db()
    .prepare("UPDATE geo_lease SET expires_at = ? WHERE user_id = ? AND machine = ? AND expires_at > ?")
    .run(now + clampTtl(input.ttlMs), userId, machine, now);
  return { renewed: r.changes };
}

export function release(userId: string, input: { owner?: unknown; machine?: unknown; keys?: unknown }) {
  const keys = Array.isArray(input.keys) ? input.keys.map((k) => clip(k, 300)).filter(Boolean) : [];
  const tx = db().transaction(() => {
    if (input.machine && !input.owner) {
      return db().prepare("DELETE FROM geo_lease WHERE user_id = ? AND machine = ?").run(userId, clip(input.machine, 80)).changes;
    }
    const owner = clip(input.owner, 120);
    if (!owner) throw Error("Thiếu owner.");
    if (!keys.length) return db().prepare("DELETE FROM geo_lease WHERE user_id = ? AND owner = ?").run(userId, owner).changes;
    const del = db().prepare("DELETE FROM geo_lease WHERE user_id = ? AND owner = ? AND lease_key = ?");
    let n = 0;
    for (const key of keys) n += del.run(userId, owner, key).changes;
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
export function importData(userId: string, data: ImportData, overwriteConfig: boolean) {
  let health = 0;
  let done = 0;
  let configTaken = false;
  const tx = db().transaction(() => {
    const getHealth = db().prepare("SELECT updated_at FROM geo_proxy_health WHERE user_id = ? AND proxy_key = ?");
    const putHealth = db().prepare(
      "INSERT INTO geo_proxy_health (user_id, proxy_key, status, ip, note, owner, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(user_id, proxy_key) DO UPDATE SET status = excluded.status, ip = excluded.ip, note = excluded.note, " +
        "owner = excluded.owner, updated_at = excluded.updated_at"
    );
    const healthMapIn =
      data.proxyHealth && typeof data.proxyHealth === "object" ? (data.proxyHealth as Record<string, Partial<HealthEntry>>) : {};
    for (const [keyRaw, h] of Object.entries(healthMapIn)) {
      if (!h || typeof h !== "object" || !h.status) continue;
      const key = clip(keyRaw, 300);
      const at = Number(h.updatedAt) || 0;
      const prev = getHealth.get(userId, key) as { updated_at: number } | undefined;
      if (prev && prev.updated_at >= at) continue;
      putHealth.run(userId, key, clip(h.status, 20), clip(h.ip, 64), clip(h.note), clip(h.owner, 80), at || Date.now());
      health += 1;
    }

    const getDone = db().prepare("SELECT ok FROM geo_article_done WHERE user_id = ? AND proxy_key = ? AND url = ?");
    const putDone = db().prepare(
      "INSERT INTO geo_article_done (user_id, proxy_key, url, ok, note, at) VALUES (?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(user_id, proxy_key, url) DO UPDATE SET ok = excluded.ok, note = excluded.note, at = excluded.at"
    );
    const doneMap =
      data.proxyArticleDone && typeof data.proxyArticleDone === "object" ? (data.proxyArticleDone as Record<string, unknown>) : {};
    for (const [proxyKeyRaw, list] of Object.entries(doneMap)) {
      if (!Array.isArray(list)) continue;
      const proxyKey = clip(proxyKeyRaw, 300);
      for (const item of list) {
        const isObj = item && typeof item === "object";
        const url = articlePairKey(isObj ? (item as { url?: unknown }).url : item);
        if (!url) continue;
        const okRaw = isObj ? (item as { ok?: unknown }).ok : undefined;
        const ok = okRaw === true ? 1 : okRaw === false ? 0 : null;
        const prev = getDone.get(userId, proxyKey, url) as { ok: number | null } | undefined;
        if (prev && (prev.ok === 1 || ok === null || (prev.ok === 0 && ok === 0))) continue;
        const at = isObj ? Number((item as { at?: unknown }).at) || Date.now() : Date.now();
        const note = ok === 0 && isObj ? clip((item as { note?: unknown }).note) : "";
        putDone.run(userId, proxyKey, url, ok, note, at);
        done += 1;
      }
    }

    const current = readConfig(userId);
    if (data.config && typeof data.config === "object" && (overwriteConfig || !Object.keys(current).length)) {
      writeConfig(userId, { ...current, ...(data.config as Record<string, unknown>) });
      configTaken = true;
    }
    logChange(userId, "reset");
  });
  tx();
  return { health, done, configTaken };
}

// ---- Máy đang chạy app (báo mỗi lần đồng bộ) và lệnh gửi xuống máy (tắt máy) ----

export type MachineInfo = {
  ip?: string;
  platform?: string;
  tabs?: number;
  running?: number;
  allowShutdown?: boolean;
};

export type MachineRow = { machine: string; info: MachineInfo; lastSeen: number };

/** Lệnh quá hạn này mà máy chưa nhận thì bỏ: máy đang tắt sẵn mở lên hôm sau không bị tắt bất ngờ. */
export const COMMAND_TTL_MS = 10 * 60_000;
export const MACHINE_ONLINE_MS = 2 * 60_000;

export function touchMachine(userId: string, machineRaw: unknown, infoRaw: unknown) {
  const machine = clip(machineRaw, 80);
  if (!machine) return;
  const src = infoRaw && typeof infoRaw === "object" ? (infoRaw as Record<string, unknown>) : {};
  const info: MachineInfo = {
    ip: clip(src.ip, 64),
    platform: clip(src.platform, 20),
    tabs: Math.max(0, Math.min(999, Number(src.tabs) || 0)),
    running: Math.max(0, Math.min(999, Number(src.running) || 0)),
    allowShutdown: src.allowShutdown === true,
  };
  db()
    .prepare(
      "INSERT INTO geo_machine (user_id, machine, info, last_seen) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(user_id, machine) DO UPDATE SET info = excluded.info, last_seen = excluded.last_seen"
    )
    .run(userId, machine, JSON.stringify(info), Date.now());
}

export function listMachines(userId: string): MachineRow[] {
  const rows = db()
    .prepare("SELECT machine, info, last_seen FROM geo_machine WHERE user_id = ? AND last_seen > ? ORDER BY machine")
    .all(userId, Date.now() - 24 * 3600_000) as { machine: string; info: string; last_seen: number }[];
  return rows.map((r) => {
    let info: MachineInfo = {};
    try { info = JSON.parse(r.info); } catch { /* bỏ qua */ }
    return { machine: r.machine, info, lastSeen: r.last_seen };
  });
}

export type CommandRow = { id: string; machine: string; kind: string; status: string; note: string; createdAt: number; updatedAt: number };

export function queueCommand(userId: string, machineRaw: unknown, kind: "shutdown") {
  const machine = clip(machineRaw, 80);
  if (!machine) throw Error("Thiếu máy.");
  const id = randomBytes(8).toString("hex");
  const now = Date.now();
  const tx = db().transaction(() => {
    db()
      .prepare("UPDATE geo_command SET status = 'replaced', updated_at = ? WHERE user_id = ? AND machine = ? AND kind = ? AND status = 'pending'")
      .run(now, userId, machine, kind);
    db()
      .prepare("INSERT INTO geo_command (id, user_id, machine, kind, status, note, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', '', ?, ?)")
      .run(id, userId, machine, kind, now, now);
  });
  tx();
  return id;
}

/** Lệnh chờ của máy này (còn hạn) — trả về rồi đánh dấu đã giao để không giao hai lần. */
export function takeCommands(userId: string, machineRaw: unknown): { id: string; kind: string; createdAt: number }[] {
  const machine = clip(machineRaw, 80);
  if (!machine) return [];
  const now = Date.now();
  const tx = db().transaction(() => {
    db()
      .prepare("UPDATE geo_command SET status = 'expired', updated_at = ? WHERE user_id = ? AND status = 'pending' AND created_at <= ?")
      .run(now, userId, now - COMMAND_TTL_MS);
    const rows = db()
      .prepare("SELECT id, kind, created_at FROM geo_command WHERE user_id = ? AND machine = ? AND status = 'pending' ORDER BY created_at")
      .all(userId, machine) as { id: string; kind: string; created_at: number }[];
    const mark = db().prepare("UPDATE geo_command SET status = 'delivered', updated_at = ? WHERE id = ?");
    for (const r of rows) mark.run(now, r.id);
    return rows.map((r) => ({ id: r.id, kind: r.kind, createdAt: r.created_at }));
  });
  return tx();
}

export function ackCommand(userId: string, idRaw: unknown, statusRaw: unknown, noteRaw: unknown) {
  const status = ["done", "canceled", "rejected", "failed"].includes(String(statusRaw)) ? String(statusRaw) : "failed";
  db()
    .prepare("UPDATE geo_command SET status = ?, note = ?, updated_at = ? WHERE user_id = ? AND id = ?")
    .run(status, clip(noteRaw), Date.now(), userId, clip(idRaw, 40));
}

/** Lệnh gần nhất của từng máy (để /geo hiện trạng thái "đã gửi / máy đã nhận / đã huỷ"). */
export function latestCommands(userId: string): Record<string, CommandRow> {
  const rows = db()
    .prepare("SELECT * FROM geo_command WHERE user_id = ? AND created_at > ? ORDER BY created_at")
    .all(userId, Date.now() - 24 * 3600_000) as {
    id: string; machine: string; kind: string; status: string; note: string; created_at: number; updated_at: number;
  }[];
  const out: Record<string, CommandRow> = {};
  for (const r of rows) {
    out[r.machine] = { id: r.id, machine: r.machine, kind: r.kind, status: r.status, note: r.note, createdAt: r.created_at, updatedAt: r.updated_at };
  }
  return out;
}

export function stats(userId: string) {
  const one = (sql: string) => (db().prepare(sql).get(userId) as { n: number }).n;
  return {
    seq: currentSeq(userId),
    health: one("SELECT COUNT(*) AS n FROM geo_proxy_health WHERE user_id = ?"),
    dead: one("SELECT COUNT(*) AS n FROM geo_proxy_health WHERE user_id = ? AND status = 'dead'"),
    done: one("SELECT COUNT(*) AS n FROM geo_article_done WHERE user_id = ?"),
    leases: activeLeases(userId).length,
    hasConfig: Object.keys(readConfig(userId)).length > 0,
    serverTime: Date.now(),
  };
}
