import { db } from "@/lib/db";
import { autoCampaign, type AutoCampaignRow } from "@/db/schema/auto-campaign";
import { post, postMedia } from "@/db/schema/post";
import { facebookPage } from "@/db/schema/facebook-page";
import { eq, and, inArray } from "drizzle-orm";
import { formatInAppTimezone } from "@/lib/scheduled-at";
import { downloadYouTubeVideoWithFallback } from "@/lib/youtube";
import {
  AUTO_PIPELINE_STEPS,
  autoPipelineMessage,
  autoStepLog,
  type AutoPipelineStepLabel,
} from "@/lib/auto-pipeline-log";
import { randomBytes } from "crypto";
import { stat } from "fs/promises";
import { join } from "path";
import {
  UPLOAD_BUCKETS,
  ensureUserBucket,
  uploadRelativePath,
} from "@/lib/upload-storage";
import { composeFramedCuts } from "@/lib/reel/compose-framed";
import { parseCutRanges } from "@/lib/reel/cuts";
import type { AspectRatioId } from "@/lib/reel/types";
import { resolveOwnedUploadPath } from "@/lib/uploads-owned-path";
import {
  cancelPendingQueueForPost,
  enqueueScheduledPostPages,
} from "@/lib/publish-queue-processor";
import { replacePostFacebookPages, validateUserPageIds } from "@/lib/post-pages";
import {
  datetimeLocalInAppTzToIso,
  nextAppTzDatetimeLocal,
} from "@/lib/scheduled-at";
import {
  DEFAULT_SCHEDULE_HOURS,
  parsePageIdsJson,
  parseRunMode,
  parseScheduleHoursJson,
} from "@/lib/auto-campaign-json";

function stepError(step: AutoPipelineStepLabel, cause: unknown): Error {
  const msg = cause instanceof Error ? cause.message : String(cause);
  return new Error(`[${step}] ${msg}`);
}

export async function getOwnedCampaign(
  id: string,
  userId: string
): Promise<AutoCampaignRow | null> {
  const rows = await db
    .select()
    .from(autoCampaign)
    .where(and(eq(autoCampaign.id, id), eq(autoCampaign.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export type ValidateCampaignPlanOptions = {
  /** Wizard «Hẹn chạy» — executeAt phải sau thời điểm hiện tại. */
  requireFutureExecuteAt?: boolean;
};

export function validateCampaignPlan(
  c: AutoCampaignRow,
  opts?: ValidateCampaignPlanOptions
): string | null {
  if (!c.caption1.trim() || !c.caption2.trim() || !c.caption3.trim()) {
    return "Thiếu caption (bước Dán Gemini).";
  }
  if (parseCutRanges(c.times).length !== 3) {
    return "Cần đúng 3 khung thời gian cắt clip.";
  }
  if (!c.backgroundPath) {
    return "Thiếu ảnh nền.";
  }
  if (!c.sourceVideoPath?.trim()) {
    if (!c.autoDownloadVideo || !c.youtubeUrl?.trim()) {
      return "Thiếu video full (upload hoặc bật «Tự tải» + link YouTube).";
    }
  }
  const pageIds = parsePageIdsJson(c.facebookPageIds);
  if (pageIds.length === 0) {
    return "Chọn ít nhất một Fanpage.";
  }
  const runMode = parseRunMode(c.runMode);
  if (runMode !== "manual") {
    if (!c.executeAt) {
      return "Thiếu thời điểm hẹn AUTO.";
    }
    if (opts?.requireFutureExecuteAt && c.executeAt.getTime() <= Date.now()) {
      return "Chọn thời điểm chạy AUTO trong tương lai.";
    }
  }
  return null;
}

/** Tải YouTube vào bucket videos nếu plan bật «Tự tải» và chưa có file. */
export async function ensureCampaignSourceVideo(
  campaign: AutoCampaignRow
): Promise<AutoCampaignRow> {
  if (campaign.sourceVideoPath?.trim()) {
    return campaign;
  }
  if (!campaign.autoDownloadVideo || !campaign.youtubeUrl?.trim()) {
    throw new Error("Thiếu video full (upload hoặc bật Tự tải).");
  }

  const userDir = await ensureUserBucket(campaign.userId, UPLOAD_BUCKETS.videos);
  const downloaded = await downloadYouTubeVideoWithFallback(
    campaign.youtubeUrl,
    userDir,
    "best"
  );
  const rel = uploadRelativePath(
    UPLOAD_BUCKETS.videos,
    campaign.userId,
    downloaded.fileName
  );

  await db
    .update(autoCampaign)
    .set({ sourceVideoPath: rel })
    .where(eq(autoCampaign.id, campaign.id));

  const next = await getOwnedCampaign(campaign.id, campaign.userId);
  if (!next?.sourceVideoPath) {
    throw new Error("Không lưu được đường dẫn video sau khi tải.");
  }
  return next;
}

export async function createCampaignPosts(campaign: AutoCampaignRow): Promise<{
  postId1: string;
  postId2: string;
  postId3: string;
  batchId: string;
}> {
  if (campaign.postId1 && campaign.postId2 && campaign.postId3) {
    const existingIds = [campaign.postId1, campaign.postId2, campaign.postId3];
    const firstComment = campaign.firstComment?.trim() || null;
    for (const postId of existingIds) {
      await db.update(post).set({ firstComment }).where(eq(post.id, postId));
    }
    await attachCampaignPagesToPosts(campaign, existingIds);
    return {
      postId1: campaign.postId1,
      postId2: campaign.postId2,
      postId3: campaign.postId3,
      batchId: campaign.batchId || randomBytes(16).toString("hex"),
    };
  }

  const captions = [campaign.caption1, campaign.caption2, campaign.caption3].map(
    (c) => c.trim()
  );
  if (captions.some((c) => !c)) {
    throw new Error("Cần đủ 3 caption.");
  }

  const batchId = campaign.batchId || randomBytes(16).toString("hex");
  const firstComment = campaign.firstComment?.trim() || null;
  const ids: string[] = [];

  for (const content of captions) {
    const postId = randomBytes(16).toString("hex");
    await db.insert(post).values({
      id: postId,
      userId: campaign.userId,
      content,
      firstComment,
      status: "draft",
      batchId,
    });
    ids.push(postId);
  }

  await attachCampaignPagesToPosts(campaign, ids);

  await db
    .update(autoCampaign)
    .set({
      batchId,
      postId1: ids[0],
      postId2: ids[1],
      postId3: ids[2],
      status: "posts_created",
      errorMessage: null,
    })
    .where(eq(autoCampaign.id, campaign.id));

  return { postId1: ids[0], postId2: ids[1], postId3: ids[2], batchId };
}

async function attachCampaignPagesToPosts(
  campaign: AutoCampaignRow,
  postIds: string[]
): Promise<string[]> {
  const pageIds = parsePageIdsJson(campaign.facebookPageIds);
  if (pageIds.length === 0) {
    throw new Error("Chọn ít nhất một Fanpage.");
  }
  const validated = await validateUserPageIds(campaign.userId, pageIds, {
    requireActiveToken: false,
  });
  if (!validated.ok) {
    throw new Error(validated.error);
  }
  for (const postId of postIds) {
    await replacePostFacebookPages(postId, pageIds);
  }
  return pageIds;
}

/** Gắn lại Fanpage plan vào 3 bài đã tạo (khi sửa plan). */
export async function syncExistingCampaignPostPages(
  campaign: AutoCampaignRow
): Promise<void> {
  if (!campaign.postId1 || !campaign.postId2 || !campaign.postId3) return;
  if (parsePageIdsJson(campaign.facebookPageIds).length === 0) return;
  await attachCampaignPagesToPosts(campaign, [
    campaign.postId1,
    campaign.postId2,
    campaign.postId3,
  ]);
}

async function attachVideoToPost(
  postId: string,
  filePath: string,
  fileName: string,
  fileSize: number
) {
  await db.delete(postMedia).where(eq(postMedia.postId, postId));
  await db.insert(postMedia).values({
    id: randomBytes(16).toString("hex"),
    postId,
    filePath,
    fileType: "video",
    fileName,
    fileSize,
    mimeType: "video/mp4",
    sortOrder: 0,
  });
}

export async function renderCampaignReels(
  campaign: AutoCampaignRow,
  opts: { aspectRatio?: AspectRatioId; flipVideo?: boolean; videoVolume?: number }
): Promise<string[]> {
  if (!campaign.postId1 || !campaign.postId2 || !campaign.postId3) {
    throw new Error("Chưa tạo 3 bài viết.");
  }
  if (campaign.reelPath1 && campaign.reelPath2 && campaign.reelPath3) {
    return [campaign.reelPath1, campaign.reelPath2, campaign.reelPath3];
  }
  if (!campaign.backgroundPath || !campaign.sourceVideoPath) {
    throw new Error("Thiếu ảnh nền hoặc video full.");
  }

  const cuts = parseCutRanges(campaign.times);
  if (cuts.length !== 3) {
    throw new Error(
      `Cần đúng 3 khung thời gian (hiện có ${cuts.length}).`
    );
  }

  const userId = campaign.userId;
  const userDir = await ensureUserBucket(userId, UPLOAD_BUCKETS.reels);
  const clips = await composeFramedCuts({
    backgroundPath: resolveOwnedUploadPath(userId, campaign.backgroundPath),
    videoPath: resolveOwnedUploadPath(userId, campaign.sourceVideoPath),
    cuts,
    aspectRatio: opts.aspectRatio ?? "9:16",
    flipVideo: opts.flipVideo,
    videoVolume: opts.videoVolume ?? 1,
    outputDir: userDir,
  });

  if (clips.length !== 3) {
    throw new Error("Render không trả đủ 3 video.");
  }

  const postIds = [campaign.postId1, campaign.postId2, campaign.postId3];
  const reelPaths: string[] = [];

  for (let i = 0; i < 3; i++) {
    const c = clips[i];
    const fileName = c.outputPath.split(/[/\\]/).pop() || "reel.mp4";
    const rel = uploadRelativePath(UPLOAD_BUCKETS.reels, userId, fileName);
    const st = await stat(c.outputPath);
    await attachVideoToPost(postIds[i], rel, fileName, st.size);
    reelPaths.push(rel);
  }

  await db
    .update(autoCampaign)
    .set({
      reelPath1: reelPaths[0],
      reelPath2: reelPaths[1],
      reelPath3: reelPaths[2],
      status: "rendered",
      errorMessage: null,
    })
    .where(eq(autoCampaign.id, campaign.id));

  return reelPaths;
}

export async function scheduleCampaignPosts(
  campaign: AutoCampaignRow,
  facebookPageIds?: string[],
  scheduleHours?: number[]
): Promise<void> {
  if (!campaign.postId1 || !campaign.postId2 || !campaign.postId3) {
    throw new Error("Chưa tạo 3 bài viết.");
  }

  const pageIds =
    facebookPageIds && facebookPageIds.length > 0
      ? facebookPageIds
      : parsePageIdsJson(campaign.facebookPageIds);

  const validated = await validateUserPageIds(campaign.userId, pageIds, {
    requireActiveToken: false,
  });
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  const postIds = [campaign.postId1, campaign.postId2, campaign.postId3];
  const batchId = campaign.batchId || randomBytes(16).toString("hex");
  const runMode = parseRunMode(campaign.runMode);
  const isTest = runMode === "test";
  const isManual = runMode === "manual";

  if (isManual) {
    for (const postId of postIds) {
      await replacePostFacebookPages(postId, pageIds);
      await cancelPendingQueueForPost(postId);
      await db
        .update(post)
        .set({
          scheduledAt: null,
          status: "draft",
          batchId,
          facebookPageId: pageIds[0] ?? null,
          errorMessage: null,
        })
        .where(eq(post.id, postId));
    }
    autoStepLog(runMode, AUTO_PIPELINE_STEPS.PUBLISH, "TIẾN TRÌNH", {
      campaignId: campaign.id,
      sub: "Gắn Fanpage — lưu nháp, không đưa queue. Đăng tay trên /posts.",
      pageCount: pageIds.length,
    });
    await db
      .update(autoCampaign)
      .set({
        batchId,
        status: "scheduled",
        errorMessage: null,
        executeAt: null,
      })
      .where(eq(autoCampaign.id, campaign.id));
    return;
  }

  const hours =
    scheduleHours && scheduleHours.length === 3
      ? scheduleHours
      : parseScheduleHoursJson(campaign.scheduleHours);

  if (hours.length !== 3) {
    throw new Error("Cần 3 khung giờ đăn.");
  }

  const pageRows =
    pageIds.length > 0
      ? await db
          .select({
            id: facebookPage.id,
            pageName: facebookPage.pageName,
            pageId: facebookPage.pageId,
          })
          .from(facebookPage)
          .where(inArray(facebookPage.id, pageIds))
      : [];

  for (let i = 0; i < 3; i++) {
    const hour = hours[i] ?? DEFAULT_SCHEDULE_HOURS[i];
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
      throw new Error(`Giờ hẹn không hợp lệ: ${hour}`);
    }
    const iso = datetimeLocalInAppTzToIso(nextAppTzDatetimeLocal(hour));
    const scheduledDate = new Date(iso);
    const postId = postIds[i];

    await replacePostFacebookPages(postId, pageIds);
    await cancelPendingQueueForPost(postId);

    const postRow = await db.select().from(post).where(eq(post.id, postId)).limit(1);
    const contentPreview = postRow[0]?.content?.slice(0, 120) ?? "";

    const postStatus = isTest ? "test_scheduled" : "queued";

    await db
      .update(post)
      .set({
        scheduledAt: scheduledDate,
        status: postStatus,
        batchId,
        facebookPageId: pageIds[0] ?? null,
        errorMessage: null,
      })
      .where(eq(post.id, postId));

    if (isTest) {
      autoStepLog(runMode, AUTO_PIPELINE_STEPS.PUBLISH, "TIẾN TRÌNH", {
        campaignId: campaign.id,
        sub: "Giả lập đăng (Test — không gọi Facebook API)",
        postId,
        segment: `${i + 1}/3`,
        scheduledAt: formatInAppTimezone(scheduledDate.toISOString(), true),
        pages: pageRows.map((p) => ({
          id: p.id,
          name: p.pageName,
          fbPageId: p.pageId,
        })),
        captionPreview: contentPreview,
        reelPath: [campaign.reelPath1, campaign.reelPath2, campaign.reelPath3][i],
      });
    } else {
      await enqueueScheduledPostPages({
        userId: campaign.userId,
        postId,
        batchId,
        scheduledAt: scheduledDate,
      });
      autoStepLog(runMode, AUTO_PIPELINE_STEPS.PUBLISH, "TIẾN TRÌNH", {
        campaignId: campaign.id,
        sub: "Đã hẹn queue đăng Fanpage",
        postId,
        segment: `${i + 1}/3`,
        scheduledAt: formatInAppTimezone(scheduledDate.toISOString(), true),
        pageCount: pageIds.length,
      });
    }
  }

  await db
    .update(autoCampaign)
    .set({
      batchId,
      status: "scheduled",
      errorMessage: null,
    })
    .where(eq(autoCampaign.id, campaign.id));
}

/** Cron: tạo 3 bài → render → hẹn queue (theo plan đã lưu). */
export async function executeCampaignPipeline(campaign: AutoCampaignRow): Promise<void> {
  const runMode = parseRunMode(campaign.runMode);

  await db
    .update(autoCampaign)
    .set({ status: "running", errorMessage: null })
    .where(eq(autoCampaign.id, campaign.id));

  autoPipelineMessage(runMode, "Pipeline — BẮT ĐẦU", {
    campaignId: campaign.id,
    name: campaign.name,
  });

  let activeStep: AutoPipelineStepLabel = AUTO_PIPELINE_STEPS.POSTS;

  try {
    let row = await getOwnedCampaign(campaign.id, campaign.userId);
    if (!row) throw new Error("Campaign không tồn tại.");

    const planErr = validateCampaignPlan(row);
    if (planErr) {
      activeStep = AUTO_PIPELINE_STEPS.POSTS;
      throw new Error(planErr);
    }

    activeStep = AUTO_PIPELINE_STEPS.POSTS;
    autoStepLog(runMode, activeStep, "BẮT ĐẦU", {
      campaignId: campaign.id,
      name: row.name,
    });
    try {
      await createCampaignPosts(row);
      row = (await getOwnedCampaign(campaign.id, campaign.userId))!;
      autoStepLog(runMode, activeStep, "XONG", {
        campaignId: campaign.id,
        postIds: [row.postId1, row.postId2, row.postId3],
      });
    } catch (e) {
      autoStepLog(runMode, activeStep, "LỖI", {
        campaignId: campaign.id,
        error: e instanceof Error ? e.message : String(e),
      });
      throw stepError(activeStep, e);
    }

    row = await ensureCampaignSourceVideo(row);

    activeStep = AUTO_PIPELINE_STEPS.RENDER;
    autoStepLog(runMode, activeStep, "BẮT ĐẦU", {
      campaignId: campaign.id,
      backgroundPath: row.backgroundPath,
      sourceVideoPath: row.sourceVideoPath,
    });
    try {
      await renderCampaignReels(row, { aspectRatio: "9:16" });
      row = (await getOwnedCampaign(campaign.id, campaign.userId))!;
      autoStepLog(runMode, activeStep, "XONG", {
        campaignId: campaign.id,
        reelPaths: [row.reelPath1, row.reelPath2, row.reelPath3],
      });
    } catch (e) {
      autoStepLog(runMode, activeStep, "LỖI", {
        campaignId: campaign.id,
        error: e instanceof Error ? e.message : String(e),
      });
      throw stepError(activeStep, e);
    }

    activeStep = AUTO_PIPELINE_STEPS.PUBLISH;
    autoStepLog(runMode, activeStep, "BẮT ĐẦU", {
      campaignId: campaign.id,
      runMode,
      note:
        runMode === "test"
          ? "Test: giả lập đăng Fanpage (log only)"
          : runMode === "manual"
            ? "Thủ công: gắn Fanpage, lưu nháp — đăng tay trên /posts"
            : "Live: hẹn queue đăng Fanpage thật",
    });
    try {
      await scheduleCampaignPosts(row);
      autoStepLog(runMode, activeStep, "XONG", {
        campaignId: campaign.id,
        segments: 3,
      });
    } catch (e) {
      autoStepLog(runMode, activeStep, "LỖI", {
        campaignId: campaign.id,
        error: e instanceof Error ? e.message : String(e),
      });
      throw stepError(activeStep, e);
    }

    await db
      .update(autoCampaign)
      .set({ status: "completed", errorMessage: null })
      .where(eq(autoCampaign.id, campaign.id));

    autoPipelineMessage(runMode, "Pipeline — XONG", { campaignId: campaign.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .update(autoCampaign)
      .set({ status: "failed", errorMessage: msg })
      .where(eq(autoCampaign.id, campaign.id));
    autoPipelineMessage(parseRunMode(campaign.runMode), "Pipeline — LỖI", {
      campaignId: campaign.id,
      step: activeStep,
      error: msg,
    });
    throw e;
  }
}

export async function deleteOwnedCampaign(id: string, userId: string): Promise<void> {
  const row = await getOwnedCampaign(id, userId);
  if (!row) {
    throw new Error("Campaign không tồn tại.");
  }
  if (row.status === "running") {
    throw new Error("Campaign đang chạy — không xóa được.");
  }

  const postIds = [row.postId1, row.postId2, row.postId3].filter(
    (p): p is string => !!p
  );

  for (const postId of postIds) {
    await cancelPendingQueueForPost(postId);
    await db.delete(postMedia).where(eq(postMedia.postId, postId));
    await db.delete(post).where(and(eq(post.id, postId), eq(post.userId, userId)));
  }

  await db
    .delete(autoCampaign)
    .where(and(eq(autoCampaign.id, id), eq(autoCampaign.userId, userId)));
}
