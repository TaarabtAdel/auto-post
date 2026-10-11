import { db } from "@/lib/db";
import { autoCampaign, type AutoCampaignRow } from "@/db/schema/auto-campaign";
import { post, postMedia } from "@/db/schema/post";
import { facebookPage } from "@/db/schema/facebook-page";
import { eq, and, inArray } from "drizzle-orm";
import { cronLog } from "@/lib/cron-log";
import { formatInAppTimezone } from "@/lib/scheduled-at";
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
  type AutoCampaignRunMode,
} from "@/lib/auto-campaign-json";

function autoPipelineLog(
  runMode: AutoCampaignRunMode,
  message: string,
  detail?: Record<string, unknown>
) {
  const tag = runMode === "test" ? "[TEST]" : "[LIVE]";
  cronLog(`AUTO ${tag} ${message}`, detail);
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

export function validateCampaignPlan(c: AutoCampaignRow): string | null {
  if (!c.caption1.trim() || !c.caption2.trim() || !c.caption3.trim()) {
    return "Thiếu caption (bước Dán Gemini).";
  }
  if (parseCutRanges(c.times).length !== 3) {
    return "Cần đúng 3 khung thời gian cắt clip.";
  }
  if (!c.backgroundPath || !c.sourceVideoPath) {
    return "Thiếu ảnh nền hoặc video full.";
  }
  const pageIds = parsePageIdsJson(c.facebookPageIds);
  if (pageIds.length === 0) {
    return "Chọn ít nhất một Fanpage.";
  }
  if (!c.executeAt || c.executeAt.getTime() <= Date.now()) {
    return "Chọn thời điểm chạy AUTO trong tương lai.";
  }
  return null;
}

export async function createCampaignPosts(campaign: AutoCampaignRow): Promise<{
  postId1: string;
  postId2: string;
  postId3: string;
  batchId: string;
}> {
  if (campaign.postId1 && campaign.postId2 && campaign.postId3) {
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

  const validated = await validateUserPageIds(campaign.userId, pageIds);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  const hours =
    scheduleHours && scheduleHours.length === 3
      ? scheduleHours
      : parseScheduleHoursJson(campaign.scheduleHours);

  if (hours.length !== 3) {
    throw new Error("Cần 3 khung giờ đăn.");
  }

  const postIds = [campaign.postId1, campaign.postId2, campaign.postId3];
  const batchId = campaign.batchId || randomBytes(16).toString("hex");
  const runMode = parseRunMode(campaign.runMode);
  const isTest = runMode === "test";

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

    await db
      .update(post)
      .set({
        scheduledAt: scheduledDate,
        status: isTest ? "test_scheduled" : "queued",
        batchId,
        facebookPageId: pageIds[0] ?? null,
        errorMessage: null,
      })
      .where(eq(post.id, postId));

    if (isTest) {
      autoPipelineLog(runMode, "Giả lập đăng Fanpage (không gọi Facebook API)", {
        campaignId: campaign.id,
        postId,
        segment: i + 1,
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
      autoPipelineLog(runMode, "Đã hẹn queue đăng Fanpage", {
        campaignId: campaign.id,
        postId,
        segment: i + 1,
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

  autoPipelineLog(runMode, "Bắt đầu pipeline", {
    campaignId: campaign.id,
    name: campaign.name,
  });

  try {
    let row = await getOwnedCampaign(campaign.id, campaign.userId);
    if (!row) throw new Error("Campaign không tồn tại.");

    const planErr = validateCampaignPlan(row);
    if (planErr) throw new Error(planErr);

    autoPipelineLog(runMode, "Tạo 3 bài viết (DB)", { campaignId: campaign.id });
    await createCampaignPosts(row);
    row = (await getOwnedCampaign(campaign.id, campaign.userId))!;
    autoPipelineLog(runMode, "Đã tạo 3 bài", {
      campaignId: campaign.id,
      postIds: [row.postId1, row.postId2, row.postId3],
    });

    autoPipelineLog(runMode, "Render 3 reel (ffmpeg)", {
      campaignId: campaign.id,
      backgroundPath: row.backgroundPath,
      sourceVideoPath: row.sourceVideoPath,
    });
    await renderCampaignReels(row, { aspectRatio: "9:16" });
    row = (await getOwnedCampaign(campaign.id, campaign.userId))!;
    autoPipelineLog(runMode, "Đã render 3 reel", {
      campaignId: campaign.id,
      reelPaths: [row.reelPath1, row.reelPath2, row.reelPath3],
    });

    autoPipelineLog(runMode, "Gắn lịch / queue đăng", { campaignId: campaign.id });
    await scheduleCampaignPosts(row);

    await db
      .update(autoCampaign)
      .set({ status: "completed", errorMessage: null })
      .where(eq(autoCampaign.id, campaign.id));

    autoPipelineLog(runMode, "Pipeline hoàn tất", { campaignId: campaign.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .update(autoCampaign)
      .set({ status: "failed", errorMessage: msg })
      .where(eq(autoCampaign.id, campaign.id));
    autoPipelineLog(parseRunMode(campaign.runMode), "Pipeline LỖI", {
      campaignId: campaign.id,
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
