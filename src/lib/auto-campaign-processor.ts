import { db } from "@/lib/db";
import { autoCampaign } from "@/db/schema/auto-campaign";
import { eq, and, lte, asc } from "drizzle-orm";
import { cronLog } from "@/lib/cron-log";
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
    cronLog(`AUTO campaign — ${logLabel}`, {
      campaignId,
      runMode: row.runMode ?? "live",
    });
    await executeCampaignPipeline(row);
    cronLog("AUTO campaign — pipeline xong", { campaignId });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    cronLog("AUTO campaign — pipeline LỖI", { campaignId, error: msg });
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
