import { db } from "@/lib/db";
import { autoCampaign } from "@/db/schema/auto-campaign";
import { eq, and, lte, asc } from "drizzle-orm";
import { cronLog } from "@/lib/cron-log";
import { autoPipelineMessage } from "@/lib/auto-pipeline-log";
import { parseRunMode } from "@/lib/auto-campaign-json";
import {
  executeCampaignPipeline,
  getOwnedCampaign,
  validateCampaignPlan,
} from "@/lib/auto-campaign-service";

let autoPipelineRunning = false;

export function isAutoPipelineBusy(): boolean {
  return autoPipelineRunning;
}

export type RunPlannedCampaignResult =
  | { ok: true }
  | { ok: false; error: string; httpStatus: number };

/** Chạy pipeline cho plan `planned` (cron hoặc Run now). */
export async function runPlannedAutoCampaign(
  campaignId: string,
  userId: string,
  trigger: "cron" | "manual"
): Promise<RunPlannedCampaignResult> {
  if (autoPipelineRunning) {
    return {
      ok: false,
      error: "Pipeline AUTO khác đang chạy — thử lại sau.",
      httpStatus: 409,
    };
  }

  const row = await getOwnedCampaign(campaignId, userId);
  if (!row) {
    return { ok: false, error: "Campaign không tồn tại.", httpStatus: 404 };
  }
  if (row.status !== "planned") {
    return {
      ok: false,
      error: "Chỉ «Run now» được khi plan ở trạng thái «Đã hẹn AUTO».",
      httpStatus: 409,
    };
  }

  const planErr = validateCampaignPlan(row);
  if (planErr) {
    return { ok: false, error: planErr, httpStatus: 400 };
  }

  autoPipelineRunning = true;
  const logLabel =
    trigger === "manual" ? "Run now (thủ công)" : "bắt đầu pipeline (cron)";

  try {
    const runMode = parseRunMode(row.runMode);
    autoPipelineMessage(runMode, trigger === "manual" ? "Run now" : "Cron kích hoạt", {
      campaignId,
      trigger,
    });
    cronLog(`AUTO — ${logLabel}`, { campaignId, runMode });
    await executeCampaignPipeline(row);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    cronLog("AUTO — pipeline thất bại", { campaignId, error: msg });
    return { ok: false, error: msg, httpStatus: 500 };
  } finally {
    autoPipelineRunning = false;
  }
}

export async function processDueAutoCampaigns(): Promise<void> {
  if (autoPipelineRunning) {
    return;
  }

  const now = new Date();
  const due = await db
    .select({ id: autoCampaign.id, userId: autoCampaign.userId })
    .from(autoCampaign)
    .where(and(eq(autoCampaign.status, "planned"), lte(autoCampaign.executeAt, now)))
    .orderBy(asc(autoCampaign.executeAt))
    .limit(1);

  const head = due[0];
  if (!head) return;

  await runPlannedAutoCampaign(head.id, head.userId, "cron");
}

/** Thủ công: lưu xong chạy pipeline ngay — không hẹn executeAt, không vào queue. */
export async function runManualAutoCampaign(
  campaignId: string,
  userId: string
): Promise<RunPlannedCampaignResult> {
  if (autoPipelineRunning) {
    return {
      ok: false,
      error: "Pipeline AUTO khác đang chạy — thử lại sau.",
      httpStatus: 409,
    };
  }

  const row = await getOwnedCampaign(campaignId, userId);
  if (!row) {
    return { ok: false, error: "Campaign không tồn tại.", httpStatus: 404 };
  }
  if (row.status === "running") {
    return { ok: false, error: "Campaign đang chạy.", httpStatus: 409 };
  }
  if (row.status === "planned") {
    return {
      ok: false,
      error: "Plan đang hẹn AUTO (queue). Không chạy thủ công khi đã hẹn giờ.",
      httpStatus: 409,
    };
  }
  if (row.status === "completed") {
    return { ok: false, error: "Plan đã hoàn tất.", httpStatus: 409 };
  }

  await db
    .update(autoCampaign)
    .set({ runMode: "manual", executeAt: null })
    .where(eq(autoCampaign.id, campaignId));

  const next = await getOwnedCampaign(campaignId, userId);
  if (!next) {
    return { ok: false, error: "Campaign không tồn tại.", httpStatus: 404 };
  }

  const planErr = validateCampaignPlan(next);
  if (planErr) {
    return { ok: false, error: planErr, httpStatus: 400 };
  }

  autoPipelineRunning = true;
  try {
    autoPipelineMessage("manual", "Lưu & chạy ngay", { campaignId, trigger: "manual" });
    cronLog("AUTO — chạy thủ công ngay", { campaignId });
    await executeCampaignPipeline(next);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    cronLog("AUTO — pipeline thủ công thất bại", { campaignId, error: msg });
    return { ok: false, error: msg, httpStatus: 500 };
  } finally {
    autoPipelineRunning = false;
  }
}
