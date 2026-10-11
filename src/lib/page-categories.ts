import { db } from "@/lib/db";
import { pageCategory } from "@/db/schema/page-category";
import { facebookPage } from "@/db/schema/facebook-page";
import { eq, and, asc } from "drizzle-orm";
import { randomBytes } from "crypto";
import { sqlite as getSqlite } from "@/lib/db";

export type PageCategoryRow = {
  id: string;
  name: string;
  sortOrder: number;
  pageCount?: number;
};

export function migratePageCategoriesSchema() {
  const sqlite = getSqlite();
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS page_category (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
    );
    CREATE INDEX IF NOT EXISTS page_category_user_idx ON page_category(user_id);
  `);

  const cols = sqlite
    .prepare(`PRAGMA table_info(facebook_page)`)
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === "category_id")) {
    sqlite.exec(`
      ALTER TABLE facebook_page ADD COLUMN category_id TEXT REFERENCES page_category(id) ON DELETE SET NULL;
    `);
  }
}

export async function listPageCategories(userId: string): Promise<PageCategoryRow[]> {
  const categories = await db
    .select({
      id: pageCategory.id,
      name: pageCategory.name,
      sortOrder: pageCategory.sortOrder,
    })
    .from(pageCategory)
    .where(eq(pageCategory.userId, userId))
    .orderBy(asc(pageCategory.sortOrder), asc(pageCategory.name));

  const pages = await db
    .select({
      categoryId: facebookPage.categoryId,
    })
    .from(facebookPage)
    .where(eq(facebookPage.userId, userId));

  const counts = new Map<string, number>();
  for (const p of pages) {
    if (!p.categoryId) continue;
    counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);
  }

  return categories.map((c) => ({
    ...c,
    pageCount: counts.get(c.id) ?? 0,
  }));
}

export async function createPageCategory(userId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false as const, error: "Tên danh mục không được để trống." };
  }
  if (trimmed.length > 80) {
    return { ok: false as const, error: "Tên danh mục tối đa 80 ký tự." };
  }

  const existing = await db
    .select({ sortOrder: pageCategory.sortOrder })
    .from(pageCategory)
    .where(eq(pageCategory.userId, userId))
    .orderBy(asc(pageCategory.sortOrder));

  const maxSort =
    existing.length > 0
      ? Math.max(...existing.map((r) => r.sortOrder))
      : -1;

  const id = randomBytes(16).toString("hex");
  await db.insert(pageCategory).values({
    id,
    userId,
    name: trimmed,
    sortOrder: maxSort + 1,
  });

  return { ok: true as const, id, name: trimmed, sortOrder: maxSort + 1 };
}

export async function updatePageCategory(
  userId: string,
  categoryId: string,
  updates: { name?: string; sortOrder?: number }
) {
  const rows = await db
    .select({ id: pageCategory.id })
    .from(pageCategory)
    .where(and(eq(pageCategory.id, categoryId), eq(pageCategory.userId, userId)));
  if (rows.length === 0) {
    return { ok: false as const, error: "Danh mục không tồn tại." };
  }

  const set: Record<string, unknown> = {};
  if (updates.name !== undefined) {
    const trimmed = updates.name.trim();
    if (!trimmed) {
      return { ok: false as const, error: "Tên danh mục không được để trống." };
    }
    set.name = trimmed;
  }
  if (updates.sortOrder !== undefined) {
    set.sortOrder = updates.sortOrder;
  }

  if (Object.keys(set).length === 0) {
    return { ok: false as const, error: "Không có thay đổi." };
  }

  await db.update(pageCategory).set(set).where(eq(pageCategory.id, categoryId));
  return { ok: true as const };
}

export async function deletePageCategory(userId: string, categoryId: string) {
  const rows = await db
    .select({ id: pageCategory.id })
    .from(pageCategory)
    .where(and(eq(pageCategory.id, categoryId), eq(pageCategory.userId, userId)));
  if (rows.length === 0) {
    return { ok: false as const, error: "Danh mục không tồn tại." };
  }

  await db
    .update(facebookPage)
    .set({ categoryId: null })
    .where(
      and(eq(facebookPage.userId, userId), eq(facebookPage.categoryId, categoryId))
    );

  await db.delete(pageCategory).where(eq(pageCategory.id, categoryId));
  return { ok: true as const };
}
