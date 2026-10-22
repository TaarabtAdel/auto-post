import { sqlite as getSqlite } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";

/** Cấu hình đăng tin (/youtube) theo từng user — mật khẩu + token lưu mã hoá. */

export function migrateNewsSettingsSchema() {
  getSqlite().exec(`
    CREATE TABLE IF NOT EXISTS news_publish_setting (
      user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL DEFAULT '',
      password_enc TEXT,
      token_enc TEXT,
      news_group_id TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    );
  `);
}

type Row = {
  user_name: string;
  password_enc: string | null;
  token_enc: string | null;
  news_group_id: string;
};

function readRow(userId: string): Row | undefined {
  migrateNewsSettingsSchema();
  return getSqlite()
    .prepare(
      `SELECT user_name, password_enc, token_enc, news_group_id
       FROM news_publish_setting WHERE user_id = ?`
    )
    .get(userId) as Row | undefined;
}

function safeDecrypt(value: string | null): string {
  if (!value) return "";
  try {
    return decrypt(value);
  } catch {
    return "";
  }
}

export type NewsSettingsPublic = {
  userName: string;
  newsGroupId: string;
  hasPassword: boolean;
  hasToken: boolean;
};

export function getNewsSettingsPublic(userId: string): NewsSettingsPublic {
  const row = readRow(userId);
  return {
    userName: row?.user_name ?? "",
    newsGroupId: row?.news_group_id ?? "",
    hasPassword: !!row?.password_enc,
    hasToken: !!row?.token_enc,
  };
}

/** password / token: undefined hoặc "" = giữ giá trị đã lưu. */
export function saveNewsSettings(
  userId: string,
  input: { userName: string; newsGroupId: string; password?: string; token?: string }
) {
  const prev = readRow(userId);
  const passwordEnc = input.password ? encrypt(input.password) : (prev?.password_enc ?? null);
  const tokenEnc = input.token ? encrypt(input.token) : (prev?.token_enc ?? null);
  getSqlite()
    .prepare(
      `INSERT INTO news_publish_setting
         (user_id, user_name, password_enc, token_enc, news_group_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         user_name = excluded.user_name,
         password_enc = excluded.password_enc,
         token_enc = excluded.token_enc,
         news_group_id = excluded.news_group_id,
         updated_at = excluded.updated_at`
    )
    .run(
      userId,
      input.userName.trim(),
      passwordEnc,
      tokenEnc,
      input.newsGroupId.trim(),
      Date.now()
    );
}

/** Giá trị đã lưu của user; ô trống thì dùng env (NEWS_*) làm mặc định. */
export function resolveNewsCredentials(userId: string) {
  const row = readRow(userId);
  return {
    userName: row?.user_name || process.env.NEWS_PUBLISH_USERNAME?.trim() || "",
    password: safeDecrypt(row?.password_enc ?? null) || process.env.NEWS_PUBLISH_PASSWORD || "",
    authToken: safeDecrypt(row?.token_enc ?? null) || process.env.NEWS_AI_AUTH_TOKEN?.trim() || "",
    newsGroupId: row?.news_group_id || process.env.NEWS_GROUP_ID?.trim() || "",
  };
}
