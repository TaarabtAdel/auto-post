import { db } from "@/lib/db";
import { post } from "@/db/schema/post";
import { publishQueue } from "@/db/schema/publish-queue";
import { eq, and, lte, asc, desc, inArray, isNotNull } from "drizzle-orm";
import { randomBytes } from "crypto";
import { publishPostById } from "@/lib/publish-post";
import { cronLog, publishLog } from "@/lib/cron-log";
import { appTzNowLabel } from "@/lib/scheduled-at";
import {
  getFacebookPageIdsForPost,
  refreshPostAggregateStatus,
} from "@/lib/post-pages";
import {
  getPublishPageIntervalMinutes,
  getPublishPageIntervalMs,
  scheduledAtForPageInBatch,
} from "@/lib/publish-settings";

export type PublishQueueTickResult =
  | "processed"
  | "none_due"
  | "spacing_wait"
  | "busy";

async function getLastQueuePublishFinishedAt(): Promise<Date | null> {
  const rows = await db
    .select({ completedAt: publishQueue.completedAt })
    .from(publishQueue)
    .where(
      and(
        inArray(publishQueue.status, ["completed", "failed"]),
        isNotNull(publishQueue.completedAt)
      )
    )
    .orderBy(desc(publishQueue.completedAt))
    .limit(1);
  return rows[0]?.completedAt ?? null;
}

/** Xếp lại scheduledAt pending — luôn cách nhau đủ interval (kể cả bắt kịp quá hạn). */
export async function enforcePendingJobSpacing(): Promise<number> {
  const spacingMs = getPublishPageIntervalMs();
  const pending = await db
    .select()
    .from(publishQueue)
    .where(eq(publishQueue.status, "pending"))
    .orderBy(asc(publishQueue.scheduledAt), asc(publishQueue.queueOrder));

  if (pending.length === 0) return 0;

  const lastDone = await getLastQueuePublishFinishedAt();
  let nextAllowedMs = lastDone
    ? lastDone.getTime() + spacingMs
    : Date.now();

  let shifted = 0;
  for (const job of pending) {
    const intendedMs = new Date(job.scheduledAt).getTime();
    const runAtMs = Math.max(intendedMs, nextAllowedMs);
    if (runAtMs !== intendedMs) {
      await db
        .update(publishQueue)
        .set({ scheduledAt: new Date(runAtMs) })
        .where(eq(publishQueue.id, job.id));
      shifted++;
    }
    nextAllowedMs = runAtMs + spacingMs;
  }

  if (shifted > 0) {
    cronLog("đã dời lịch queue pending theo khoảng cách Fanpage", {
      shifted,
      intervalMinutes: getPublishPageIntervalMinutes(),
    });
  }
  return shifted;
}

const STALE_PROCESSING_MS = 3 * 60 * 1000;

/** Legacy posts scheduled before queue existed → enqueue once */
export async function migrateLegacyScheduledToQueue() {
  const legacy = await db
    .select({ id: post.id, userId: post.userId, scheduledAt: post.scheduledAt })
    .from(post)
    .where(eq(post.status, "scheduled"));

  for (const p of legacy) {
    if (!p.scheduledAt) continue;

    const existing = await db
      .select({ id: publishQueue.id })
      .from(publishQueue)
      .where(eq(publishQueue.postId, p.id))
      .limit(1);

    if (existing.length > 0) continue;

    const batchId = randomBytes(8).toString("hex");
    await db
      .update(post)
      .set({ status: "queued", batchId })
      .where(eq(post.id, p.id));

    await db.insert(publishQueue).values({
      id: randomBytes(16).toString("hex"),
      userId: p.userId,
      postId: p.id,
      batchId,
      queueOrder: 0,
      scheduledAt: p.scheduledAt,
      status: "pending",
    });
  }
}

async function resetStaleProcessingJobs() {
  const cutoff = new Date(Date.now() - STALE_PROCESSING_MS);
  const processing = await db
    .select({
      id: publishQueue.id,
      postId: publishQueue.postId,
      startedAt: publishQueue.startedAt,
    })
    .from(publishQueue)
    .where(eq(publishQueue.status, "processing"));

  const stale = processing.filter(
    (j) => !j.startedAt || j.startedAt <= cutoff
  );

  if (stale.length > 0) {
    cronLog("reset job processing quá hạn", { count: stale.length });
  }

  for (const job of stale) {
    await db
      .update(publishQueue)
      .set({ status: "pending", startedAt: null, errorMessage: "Timeout — thử lại." })
      .where(eq(publishQueue.id, job.id));
    await db
      .update(post)
      .set({ status: "queued" })
      .where(eq(post.id, job.postId));
  }
}

/** Bài đã quá giờ đăng (scheduledAt <= now) nhưng chưa posted — đảm bảo còn job pending. */
async function syncOverduePostsToQueue(): Promise<void> {
  const now = new Date();
  const overdue = await db
    .select()
    .from(post)
    .where(
      and(
        inArray(post.status, ["queued", "scheduled"]),
        isNotNull(post.scheduledAt),
        lte(post.scheduledAt, now)
      )
    );

  if (overdue.length === 0) return;

  cronLog("bài quá hạn chưa đăng — đưa vào queue", {
    count: overdue.length,
    now: appTzNowLabel(now),
    samples: overdue.slice(0, 5).map((p) => ({
      postId: p.id,
      status: p.status,
      scheduledAt: appTzNowLabel(p.scheduledAt!),
    })),
  });

  for (const p of overdue) {
    if (p.status === "scheduled") {
      const batchId = p.batchId || randomBytes(8).toString("hex");
      await db
        .update(post)
        .set({ status: "queued", batchId })
        .where(eq(post.id, p.id));
    }

    const jobs = await db
      .select()
      .from(publishQueue)
      .where(eq(publishQueue.postId, p.id));

    const hasRunnable = jobs.some(
      (j) => j.status === "pending" || j.status === "processing"
    );
    if (hasRunnable) continue;

    const batchId = p.batchId || randomBytes(8).toString("hex");
    if (!p.batchId) {
      await db.update(post).set({ batchId }).where(eq(post.id, p.id));
    }

    if (jobs.length === 0) {
      await db.insert(publishQueue).values({
        id: randomBytes(16).toString("hex"),
        userId: p.userId,
        postId: p.id,
        batchId,
        queueOrder: 0,
        scheduledAt: p.scheduledAt!,
        status: "pending",
      });
      continue;
    }

    if (jobs.every((j) => j.status === "failed")) {
      await db
        .update(publishQueue)
        .set({
          status: "pending",
          startedAt: null,
          completedAt: null,
          errorMessage: null,
        })
        .where(
          and(eq(publishQueue.postId, p.id), eq(publishQueue.status, "failed"))
        );
      await db.update(post).set({ status: "queued" }).where(eq(post.id, p.id));
    }
  }
}

/** Khôi phục job / post lệch trạng thái (dev, crash, thiếu queue row). */
export async function repairPublishQueue(): Promise<void> {
  await migrateLegacyScheduledToQueue();
  await resetStaleProcessingJobs();
  await syncOverduePostsToQueue();

  const queuedPosts = await db
    .select()
    .from(post)
    .where(eq(post.status, "queued"));

  for (const p of queuedPosts) {
    if (!p.scheduledAt) continue;

    const jobs = await db
      .select()
      .from(publishQueue)
      .where(eq(publishQueue.postId, p.id));

    if (jobs.length === 0) {
      const batchId = p.batchId || randomBytes(8).toString("hex");
      await db.update(post).set({ batchId }).where(eq(post.id, p.id));
      await db.insert(publishQueue).values({
        id: randomBytes(16).toString("hex"),
        userId: p.userId,
        postId: p.id,
        batchId,
        queueOrder: 0,
        scheduledAt: p.scheduledAt,
        status: "pending",
      });
      cronLog("repair: tạo lại queue row cho post queued", {
        postId: p.id,
        scheduledAt: appTzNowLabel(p.scheduledAt),
      });
      continue;
    }

    const hasActive = jobs.some(
      (j) => j.status === "pending" || j.status === "processing"
    );
    if (!hasActive && jobs.every((j) => j.status === "failed")) {
      await db
        .update(publishQueue)
        .set({
          status: "pending",
          startedAt: null,
          completedAt: null,
          errorMessage: null,
        })
        .where(
          and(eq(publishQueue.postId, p.id), eq(publishQueue.status, "failed"))
        );
    }
  }

  const stuckPosting = await db
    .select({ id: post.id })
    .from(post)
    .where(eq(post.status, "posting"));

  for (const row of stuckPosting) {
    const active = await db
      .select({ id: publishQueue.id })
      .from(publishQueue)
      .where(
        and(
          eq(publishQueue.postId, row.id),
          eq(publishQueue.status, "processing")
        )
      )
      .limit(1);
    if (active.length === 0) {
      await refreshPostAggregateStatus(row.id);
    }
  }

  const queuedWithDoneJobs = await db
    .select({ id: post.id })
    .from(post)
    .where(inArray(post.status, ["queued", "scheduled", "posting"]));

  for (const row of queuedWithDoneJobs) {
    const jobs = await db
      .select({ status: publishQueue.status })
      .from(publishQueue)
      .where(eq(publishQueue.postId, row.id));
    if (jobs.length === 0) continue;
    const allDone = jobs.every(
      (j) => j.status === "completed" || j.status === "failed"
    );
    if (allDone) {
      await refreshPostAggregateStatus(row.id);
    }
  }

  await enforcePendingJobSpacing();
}

/** Chạy nhiều tick liên tiếp (khi mở /posts hoặc bấm nút xử lý queue). */
export async function drainPublishQueue(maxTicks = 10): Promise<number> {
  cronLog("drainPublishQueue bắt đầu", { maxTicks });
  await migrateLegacyScheduledToQueue();
  await repairPublishQueue();

  let processed = 0;
  for (let i = 0; i < maxTicks; i++) {
    const outcome = await processPublishQueueTick();
    if (outcome === "processed") processed++;
    else break;
  }
  cronLog("drainPublishQueue xong", { processed });
  return processed;
}

/**
 * Cron tick (1 phút): xử lý tối đa 1 job pending có scheduledAt <= now.
 * Các page trong cùng batch chạy lần lượt qua queueOrder.
 */
export async function processPublishQueueTick(): Promise<PublishQueueTickResult> {
  await resetStaleProcessingJobs();

  const processing = await db
    .select({ id: publishQueue.id })
    .from(publishQueue)
    .where(eq(publishQueue.status, "processing"))
    .limit(1);

  if (processing.length > 0) {
    cronLog("tick bỏ qua — có job đang processing", {
      queueJobId: processing[0].id,
    });
    return "busy";
  }

  const now = new Date();
  const spacingMs = getPublishPageIntervalMs();
  const lastDone = await getLastQueuePublishFinishedAt();
  if (lastDone && now.getTime() - lastDone.getTime() < spacingMs) {
    const waitMin = Math.ceil(
      (spacingMs - (now.getTime() - lastDone.getTime())) / 60_000
    );
    cronLog("tick — chờ khoảng cách Fanpage", {
      intervalMinutes: getPublishPageIntervalMinutes(),
      waitMinutes: waitMin,
      lastFinishedAt: appTzNowLabel(lastDone),
    });
    return "spacing_wait";
  }
  const pendingCount = await db
    .select({ id: publishQueue.id })
    .from(publishQueue)
    .where(eq(publishQueue.status, "pending"));

  const due = await db
    .select()
    .from(publishQueue)
    .where(and(eq(publishQueue.status, "pending"), lte(publishQueue.scheduledAt, now)))
    .orderBy(asc(publishQueue.scheduledAt), asc(publishQueue.queueOrder))
    .limit(1);

  const job = due[0];
  if (!job) {
    const nextRow = await db
      .select({ scheduledAt: publishQueue.scheduledAt })
      .from(publishQueue)
      .where(eq(publishQueue.status, "pending"))
      .orderBy(asc(publishQueue.scheduledAt))
      .limit(1);
    cronLog("tick — không có job đến hạn", {
      pendingTotal: pendingCount.length,
      now: appTzNowLabel(now),
      nextScheduledAt: nextRow[0]?.scheduledAt
        ? appTzNowLabel(new Date(nextRow[0].scheduledAt))
        : null,
    });
    return "none_due";
  }

  const overdueMs = now.getTime() - new Date(job.scheduledAt).getTime();
  cronLog("tick — xử lý job", {
    queueJobId: job.id,
    postId: job.postId,
    batchId: job.batchId,
    queueOrder: job.queueOrder,
    scheduledAt: appTzNowLabel(new Date(job.scheduledAt)),
    overdueMinutes: overdueMs > 0 ? Math.round(overdueMs / 60_000) : 0,
  });

  await db
    .update(publishQueue)
    .set({ status: "processing", startedAt: new Date(), errorMessage: null })
    .where(eq(publishQueue.id, job.id));

  const result = await publishPostById(job.postId, job.facebookPageId);

  if (result.success) {
    await db
      .update(publishQueue)
      .set({
        status: "completed",
        completedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(publishQueue.id, job.id));
    publishLog("Đăng Fanpage | XONG", {
      postId: job.postId,
      fbPostId: result.fbPostId,
      batchId: job.batchId,
    });
  } else {
    await db
      .update(publishQueue)
      .set({
        status: "failed",
        completedAt: new Date(),
        errorMessage: result.error || "Publish failed",
      })
      .where(eq(publishQueue.id, job.id));
    publishLog("Đăng Fanpage | LỖI", {
      postId: job.postId,
      error: result.error,
      batchId: job.batchId,
    });
  }

  await refreshPostAggregateStatus(job.postId);
  return "processed";
}

export async function enqueuePostsForBatch(
  items: {
    userId: string;
    postId: string;
    batchId: string;
    queueOrder: number;
    scheduledAt: Date;
    facebookPageId?: string | null;
  }[]
) {
  for (const item of items) {
    const scheduledAt = scheduledAtForPageInBatch(
      item.scheduledAt,
      item.queueOrder
    );
    await db.insert(publishQueue).values({
      id: randomBytes(16).toString("hex"),
      userId: item.userId,
      postId: item.postId,
      facebookPageId: item.facebookPageId ?? null,
      batchId: item.batchId,
      queueOrder: item.queueOrder,
      scheduledAt,
      status: "pending",
    });
  }
}

export async function enqueueScheduledPostPages(params: {
  userId: string;
  postId: string;
  batchId: string;
  scheduledAt: Date;
}) {
  const pageIds = await getFacebookPageIdsForPost(params.postId);
  if (pageIds.length === 0) return;

  await enqueuePostsForBatch(
    pageIds.map((facebookPageId, queueOrder) => ({
      userId: params.userId,
      postId: params.postId,
      batchId: params.batchId,
      queueOrder,
      scheduledAt: params.scheduledAt,
      facebookPageId,
    }))
  );
}

export async function cancelPendingQueueForPost(postId: string) {
  await db
    .delete(publishQueue)
    .where(
      and(
        eq(publishQueue.postId, postId),
        inArray(publishQueue.status, ["pending", "processing"])
      )
    );
}
