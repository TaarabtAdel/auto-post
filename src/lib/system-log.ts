import { randomBytes } from "crypto";
import { sqlite as getSqlite } from "@/lib/db";
import { appTzNowLabel } from "@/lib/scheduled-at";

export type SystemLogLevel = "info" | "error";
export type SystemLogCategory = "auto" | "cron" | "publish";

const MAX_ROWS = 5000;
let insertsSincePrune = 0;

export type SystemLogRow = {
  id: string;
  createdAt: number;
  level: SystemLogLevel;
  category: SystemLogCategory;
  message: string;
  detail: Record<string, unknown> | null;
};

function pruneOldLogs() {
  const sqlite = getSqlite();
  const count = sqlite.prepare("SELECT COUNT(*) AS c FROM system_log").get() as {
    c: number;
  };
  if (count.c <= MAX_ROWS) return;
  const excess = count.c - MAX_ROWS;
  sqlite
    .prepare(
      `DELETE FROM system_log WHERE id IN (
        SELECT id FROM system_log ORDER BY created_at ASC LIMIT ?
      )`
    )
    .run(excess);
}

export function appendSystemLog(params: {
  level?: SystemLogLevel;
  category: SystemLogCategory;
  message: string;
  detail?: Record<string, unknown>;
}) {
  const level = params.level ?? "info";
  const ts = appTzNowLabel();
  const prefix = `[${params.category}]`;
  const line = `[cron] ${ts} ${prefix} ${params.message}`;

  if (params.detail && Object.keys(params.detail).length > 0) {
    console.log(line, params.detail);
  } else {
    console.log(line);
  }

  try {
    const sqlite = getSqlite();
    const id = randomBytes(12).toString("hex");
    const createdAt = Date.now();
    const detailJson = params.detail ? JSON.stringify(params.detail) : null;
    sqlite
      .prepare(
        `INSERT INTO system_log (id, created_at, level, category, message, detail_json)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, createdAt, level, params.category, params.message, detailJson);

    insertsSincePrune += 1;
    if (insertsSincePrune >= 50) {
      insertsSincePrune = 0;
      pruneOldLogs();
    }
  } catch (e) {
    console.error("[cron] Không ghi được system_log:", e);
  }
}

export function querySystemLogs(opts: {
  limit?: number;
  category?: SystemLogCategory | "all";
  campaignId?: string;
}): SystemLogRow[] {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const sqlite = getSqlite();

  let sql = `
    SELECT id, created_at, level, category, message, detail_json
    FROM system_log
  `;
  const params: (string | number)[] = [];

  const clauses: string[] = [];
  if (opts.category && opts.category !== "all") {
    clauses.push("category = ?");
    params.push(opts.category);
  }
  if (opts.campaignId?.trim()) {
    clauses.push("detail_json LIKE ?");
    params.push(`%"campaignId":"${opts.campaignId.trim()}"%`);
  }
  if (clauses.length > 0) {
    sql += ` WHERE ${clauses.join(" AND ")}`;
  }
  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const rows = sqlite.prepare(sql).all(...params) as {
    id: string;
    created_at: number;
    level: string;
    category: string;
    message: string;
    detail_json: string | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    level: r.level === "error" ? "error" : "info",
    category: r.category as SystemLogCategory,
    message: r.message,
    detail: r.detail_json
      ? (JSON.parse(r.detail_json) as Record<string, unknown>)
      : null,
  }));
}
