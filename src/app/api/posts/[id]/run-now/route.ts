import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { post } from "@/db/schema/post";
import { publishQueue } from "@/db/schema/publish-queue";
import { eq, and, inArray } from "drizzle-orm";
import { publishPostById } from "@/lib/publish-post";
import {
  cancelPendingQueueForPost,
  enqueueScheduledPostPages,
} from "@/lib/publish-queue-processor";
import { getFacebookPageIdsForPost } from "@/lib/post-pages";
import { randomBytes } from "crypto";

type Params = { params: Promise<{ id: string }> };

/** POST /api/posts/[id]/run-now — đăng ngay tất cả Fanpage của bài (lần lượt). */
export async function POST(_request: Request, { params }: Params) {
  const session = await getAppSession({ headers: await headers() });

  const { id } = await params;
  const rows = await db
    .select()
    .from(post)
    .where(and(eq(post.id, id), eq(post.userId, session.user.id)));

  const p = rows[0];
  if (!p) {
    return NextResponse.json({ error: "Post không tồn tại." }, { status: 404 });
  }

  if (!["queued", "scheduled", "draft", "failed"].includes(p.status)) {
    return NextResponse.json(
      { error: `Không thể chạy ngay ở trạng thái "${p.status}".` },
      { status: 400 }
    );
  }

  const pageIds = await getFacebookPageIdsForPost(id);
  if (pageIds.length === 0) {
    return NextResponse.json(
      { error: "Chưa chọn Fanpage nào." },
      { status: 400 }
    );
  }

  await cancelPendingQueueForPost(id);

  const now = new Date();
  await db
    .update(post)
    .set({ scheduledAt: now, status: "queued" })
    .where(eq(post.id, id));

  const batchId = p.batchId || randomBytes(8).toString("hex");
  await db.update(post).set({ batchId }).where(eq(post.id, id));

  await enqueueScheduledPostPages({
    userId: session.user.id,
    postId: id,
    batchId,
    scheduledAt: now,
  });

  const warnings: string[] = [];
  let lastFbPostId: string | undefined;

  for (const pageId of pageIds) {
    const jobs = await db
      .select({ id: publishQueue.id })
      .from(publishQueue)
      .where(
        and(
          eq(publishQueue.postId, id),
          eq(publishQueue.facebookPageId, pageId),
          inArray(publishQueue.status, ["pending", "processing"])
        )
      );

    for (const job of jobs) {
      await db
        .update(publishQueue)
        .set({ status: "processing", startedAt: new Date() })
        .where(eq(publishQueue.id, job.id));
    }

    const result = await publishPostById(id, pageId);
    if (result.success) {
      lastFbPostId = result.fbPostId;
      if (result.error) warnings.push(result.error);
      await db
        .update(publishQueue)
        .set({
          status: "completed",
          completedAt: new Date(),
          errorMessage: result.error ?? null,
        })
        .where(
          and(
            eq(publishQueue.postId, id),
            eq(publishQueue.facebookPageId, pageId),
            inArray(publishQueue.status, ["pending", "processing"])
          )
        );
    } else {
      await db
        .update(publishQueue)
        .set({
          status: "failed",
          completedAt: new Date(),
          errorMessage: result.error || "Publish failed",
        })
        .where(
          and(
            eq(publishQueue.postId, id),
            eq(publishQueue.facebookPageId, pageId),
            inArray(publishQueue.status, ["pending", "processing", "failed"])
          )
        );
      return NextResponse.json({
        error: result.error || "Đăng thất bại.",
        partial: true,
      }, { status: 400 });
    }
  }

  const updated = await db.select().from(post).where(eq(post.id, id));
  return NextResponse.json({
    ok: true,
    fbPostId: lastFbPostId,
    warning: warnings[0] || updated[0]?.errorMessage || undefined,
  });
}
