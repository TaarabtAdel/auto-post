import { db } from "@/lib/db";
import { post } from "@/db/schema/post";
import { postFacebookPage } from "@/db/schema/post-page";
import { facebookPage } from "@/db/schema/facebook-page";
import { publishQueue } from "@/db/schema/publish-queue";
import { eq, and, inArray, asc, isNotNull } from "drizzle-orm";
import { randomBytes } from "crypto";
import { sqlite as getSqlite } from "@/lib/db";

export type PostPageRow = {
  id: string;
  postId: string;
  facebookPageId: string;
  sortOrder: number;
  fbPostId: string | null;
  errorMessage: string | null;
  publishedAt: Date | null;
};

export type PostPageDisplay = {
  facebookPageId: string;
  pageName: string;
  graphPageId: string | null;
  fbPostId: string | null;
  errorMessage: string | null;
};

/** Tạo bảng / cột (SQLite) — idempotent khi khởi động app. */
export function migratePostPagesSchema() {
  const sqlite = getSqlite();
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS post_facebook_page (
      id TEXT PRIMARY KEY NOT NULL,
      post_id TEXT NOT NULL REFERENCES post(id) ON DELETE CASCADE,
      facebook_page_id TEXT NOT NULL REFERENCES facebook_page(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      fb_post_id TEXT,
      error_message TEXT,
      published_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS post_facebook_page_post_page_idx
      ON post_facebook_page(post_id, facebook_page_id);
    CREATE INDEX IF NOT EXISTS post_facebook_page_post_idx ON post_facebook_page(post_id);
  `);

  const cols = sqlite
    .prepare(`PRAGMA table_info(publish_queue)`)
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === "facebook_page_id")) {
    sqlite.exec(`
      ALTER TABLE publish_queue ADD COLUMN facebook_page_id TEXT REFERENCES facebook_page(id);
    `);
  }
}

/** Copy post.facebook_page_id → junction nếu chưa có row. */
export async function migrateLegacyPostPageLinks() {
  const rows = await db
    .select({ id: post.id, facebookPageId: post.facebookPageId })
    .from(post)
    .where(isNotNull(post.facebookPageId));

  for (const row of rows) {
    if (!row.facebookPageId) continue;
    const existing = await db
      .select({ id: postFacebookPage.id })
      .from(postFacebookPage)
      .where(eq(postFacebookPage.postId, row.id))
      .limit(1);
    if (existing.length > 0) continue;

    await db.insert(postFacebookPage).values({
      id: randomBytes(16).toString("hex"),
      postId: row.id,
      facebookPageId: row.facebookPageId,
      sortOrder: 0,
      fbPostId: null,
    });
  }

  const queueRows = await db.select().from(publishQueue);
  for (const job of queueRows) {
    if (job.facebookPageId) continue;
    const posts = await db
      .select({ facebookPageId: post.facebookPageId })
      .from(post)
      .where(eq(post.id, job.postId));
    const pageId = posts[0]?.facebookPageId;
    if (pageId) {
      await db
        .update(publishQueue)
        .set({ facebookPageId: pageId })
        .where(eq(publishQueue.id, job.id));
    }
  }
}

export async function getFacebookPageIdsForPost(postId: string): Promise<string[]> {
  const rows = await db
    .select({ facebookPageId: postFacebookPage.facebookPageId })
    .from(postFacebookPage)
    .where(eq(postFacebookPage.postId, postId))
    .orderBy(asc(postFacebookPage.sortOrder));

  if (rows.length > 0) {
    return rows.map((r) => r.facebookPageId);
  }

  const legacy = await db
    .select({ facebookPageId: post.facebookPageId })
    .from(post)
    .where(eq(post.id, postId));
  return legacy[0]?.facebookPageId ? [legacy[0].facebookPageId] : [];
}

export async function replacePostFacebookPages(
  postId: string,
  pageIds: string[]
) {
  const unique = [...new Set(pageIds.filter(Boolean))];
  await db.delete(postFacebookPage).where(eq(postFacebookPage.postId, postId));

  for (let i = 0; i < unique.length; i++) {
    await db.insert(postFacebookPage).values({
      id: randomBytes(16).toString("hex"),
      postId,
      facebookPageId: unique[i],
      sortOrder: i,
    });
  }

  await db
    .update(post)
    .set({ facebookPageId: unique[0] ?? null })
    .where(eq(post.id, postId));
}

export async function validateUserPageIds(
  userId: string,
  pageIds: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const unique = [...new Set(pageIds.filter(Boolean))];
  if (unique.length === 0) {
    return { ok: false, error: "Chọn ít nhất một Fanpage." };
  }

  const found = await db
    .select({ id: facebookPage.id })
    .from(facebookPage)
    .where(
      and(
        eq(facebookPage.userId, userId),
        eq(facebookPage.tokenStatus, "active"),
        inArray(facebookPage.id, unique)
      )
    );

  if (found.length !== unique.length) {
    return {
      ok: false,
      error:
        "Một hoặc nhiều Page không hợp lệ, không thuộc tài khoản hoặc token không active.",
    };
  }
  return { ok: true };
}

export async function loadPostPagesDisplay(
  postIds: string[],
  userId: string
): Promise<Map<string, PostPageDisplay[]>> {
  const map = new Map<string, PostPageDisplay[]>();
  if (postIds.length === 0) return map;

  const links = await db
    .select({
      postId: postFacebookPage.postId,
      facebookPageId: postFacebookPage.facebookPageId,
      sortOrder: postFacebookPage.sortOrder,
      fbPostId: postFacebookPage.fbPostId,
      errorMessage: postFacebookPage.errorMessage,
      pageName: facebookPage.pageName,
      graphPageId: facebookPage.pageId,
    })
    .from(postFacebookPage)
    .innerJoin(facebookPage, eq(postFacebookPage.facebookPageId, facebookPage.id))
    .where(
      and(
        inArray(postFacebookPage.postId, postIds),
        eq(facebookPage.userId, userId)
      )
    )
    .orderBy(asc(postFacebookPage.sortOrder));

  for (const row of links) {
    const list = map.get(row.postId) ?? [];
    list.push({
      facebookPageId: row.facebookPageId,
      pageName: row.pageName,
      graphPageId: row.graphPageId,
      fbPostId: row.fbPostId,
      errorMessage: row.errorMessage,
    });
    map.set(row.postId, list);
  }

  const missing = postIds.filter((id) => !map.has(id) || map.get(id)!.length === 0);
  if (missing.length > 0) {
    const legacyPosts = await db
      .select({
        id: post.id,
        facebookPageId: post.facebookPageId,
        fbPostId: post.fbPostId,
      })
      .from(post)
      .where(inArray(post.id, missing));

    const legacyPageIds = legacyPosts
      .map((p) => p.facebookPageId)
      .filter(Boolean) as string[];

    if (legacyPageIds.length > 0) {
      const pages = await db
        .select({
          id: facebookPage.id,
          pageName: facebookPage.pageName,
          pageId: facebookPage.pageId,
        })
        .from(facebookPage)
        .where(
          and(eq(facebookPage.userId, userId), inArray(facebookPage.id, legacyPageIds))
        );
      const pageById = Object.fromEntries(pages.map((p) => [p.id, p]));

      for (const p of legacyPosts) {
        if (!p.facebookPageId) continue;
        const fp = pageById[p.facebookPageId];
        if (!fp) continue;
        map.set(p.id, [
          {
            facebookPageId: p.facebookPageId,
            pageName: fp.pageName,
            graphPageId: fp.pageId,
            fbPostId: p.fbPostId,
            errorMessage: null,
          },
        ]);
      }
    }
  }

  return map;
}

export async function markPostPagePublished(
  postId: string,
  facebookPageId: string,
  fbPostId: string | null
) {
  await db
    .update(postFacebookPage)
    .set({
      fbPostId,
      publishedAt: new Date(),
      errorMessage: null,
    })
    .where(
      and(
        eq(postFacebookPage.postId, postId),
        eq(postFacebookPage.facebookPageId, facebookPageId)
      )
    );
}

export async function markPostPageFailed(
  postId: string,
  facebookPageId: string,
  errorMessage: string
) {
  await db
    .update(postFacebookPage)
    .set({ errorMessage })
    .where(
      and(
        eq(postFacebookPage.postId, postId),
        eq(postFacebookPage.facebookPageId, facebookPageId)
      )
    );
}

/** Cập nhật trạng thái tổng của post sau khi đăng từng Page. */
export async function refreshPostAggregateStatus(postId: string) {
  const pageIds = await getFacebookPageIdsForPost(postId);
  if (pageIds.length === 0) return;

  const junction = await db
    .select({
      fbPostId: postFacebookPage.fbPostId,
      errorMessage: postFacebookPage.errorMessage,
    })
    .from(postFacebookPage)
    .where(eq(postFacebookPage.postId, postId));

  const jobs = await db
    .select({ status: publishQueue.status, errorMessage: publishQueue.errorMessage })
    .from(publishQueue)
    .where(eq(publishQueue.postId, postId));

  const publishedCount =
    junction.length > 0
      ? junction.filter((j) => j.fbPostId).length
      : 0;
  const total = pageIds.length;

  const hasPending = jobs.some(
    (j) => j.status === "pending" || j.status === "processing"
  );

  if (hasPending) {
    await db.update(post).set({ status: "posting" }).where(eq(post.id, postId));
    return;
  }

  if (publishedCount >= total && total > 0) {
    const firstFb = junction.find((j) => j.fbPostId)?.fbPostId ?? null;
    const warnings = junction
      .map((j) => j.errorMessage)
      .filter(Boolean) as string[];
    await db
      .update(post)
      .set({
        status: "posted",
        postedAt: new Date(),
        fbPostId: firstFb,
        errorMessage: warnings[0] ?? null,
      })
      .where(eq(post.id, postId));
    return;
  }

  if (publishedCount === 0) {
    const failedJob = jobs.find((j) => j.status === "failed");
    const err =
      junction.find((j) => j.errorMessage)?.errorMessage ||
      failedJob?.errorMessage ||
      "Đăng thất bại.";
    await db
      .update(post)
      .set({
        status: "failed",
        errorMessage: err,
      })
      .where(eq(post.id, postId));
    return;
  }

  await db
    .update(post)
    .set({
      status: "failed",
      errorMessage: `Đăng được ${publishedCount}/${total} Fanpage.`,
    })
    .where(eq(post.id, postId));
}
