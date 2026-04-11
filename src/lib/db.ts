import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

const sqlite = new Database("sqlite.db");

// Enable WAL mode for concurrent read support (D002 constraint)
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);
export { sqlite };
