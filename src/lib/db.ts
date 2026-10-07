import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

let sqlite: Database.Database | undefined;
let dbInstance: BetterSQLite3Database | undefined;

function getSqlite(): Database.Database {
  if (!sqlite) {
    sqlite = new Database("sqlite.db");
    sqlite.pragma("journal_mode = WAL");
  }
  return sqlite;
}

function getDb(): BetterSQLite3Database {
  if (!dbInstance) {
    dbInstance = drizzle(getSqlite());
  }
  return dbInstance;
}

/** Lazy SQLite — tránh mở DB lúc `next build` import route (Docker không có sqlite.db sẵn). */
export const db = new Proxy({} as BetterSQLite3Database, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real as object, prop, real);
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(real);
    }
    return value;
  },
});

export { getSqlite as sqlite };
