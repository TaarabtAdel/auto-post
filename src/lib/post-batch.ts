import { db } from "@/lib/db";
import { post } from "@/db/schema/post";
import { facebookPage } from "@/db/schema/facebook-page";
import { eq, and } from "drizzle-orm";

export type BatchSibling = {
  id: string;
  status: string;
  pageName: string | null;
  fbPostId: string | null;
  graphPageId: string | null;
  scheduledAt: Date | null;
  postedAt: Date | null;
};

export async function getBatchSiblings(
  userId: string,
  batchId: string | null,
  excludePostId: string
): Promise<BatchSibling[]> {
  if (!batchId) return [];

  const rows = await db
    .select({
      id: post.id,
      status: post.status,
      fbPostId: post.fbPostId,
      scheduledAt: post.scheduledAt,
      postedAt: post.postedAt,
      pageName: facebookPage.pageName,
      graphPageId: facebookPage.pageId,
    })
    .from(post)
    .leftJoin(facebookPage, eq(post.facebookPageId, facebookPage.id))
    .where(and(eq(post.userId, userId), eq(post.batchId, batchId)));

  return rows
    .filter((r) => r.id !== excludePostId)
    .map((r) => ({
      id: r.id,
      status: r.status,
      pageName: r.pageName,
      fbPostId: r.fbPostId,
      graphPageId: r.graphPageId,
      scheduledAt: r.scheduledAt,
      postedAt: r.postedAt,
    }));
}

