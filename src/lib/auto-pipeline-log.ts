import { appendSystemLog } from "@/lib/system-log";
import type { AutoCampaignRunMode } from "@/lib/auto-campaign-json";

/** Ba bước chính pipeline AUTO (hiển thị log / lỗi). */
export const AUTO_PIPELINE_STEPS = {
  POSTS: "Tạo bài viết",
  RENDER: "Video & render",
  PUBLISH: "Đăng Fanpage",
} as const;

export type AutoPipelineStepLabel =
  (typeof AUTO_PIPELINE_STEPS)[keyof typeof AUTO_PIPELINE_STEPS];

export type AutoPipelinePhase = "BẮT ĐẦU" | "XONG" | "LỖI" | "TIẾN TRÌNH";

function modeTag(runMode: AutoCampaignRunMode): string {
  return runMode === "test" ? "TEST" : "LIVE";
}

/** Log một bước AUTO — console + bảng system_log. */
export function autoStepLog(
  runMode: AutoCampaignRunMode,
  step: AutoPipelineStepLabel,
  phase: AutoPipelinePhase,
  detail?: Record<string, unknown>
) {
  const level = phase === "LỖI" ? "error" : "info";
  const message = `AUTO [${modeTag(runMode)}] | ${step} | ${phase}`;
  appendSystemLog({
    level,
    category: "auto",
    message,
    detail: { step, phase, runMode, ...detail },
  });
}

export function autoPipelineMessage(
  runMode: AutoCampaignRunMode,
  headline: string,
  detail?: Record<string, unknown>
) {
  appendSystemLog({
    category: "auto",
    message: `AUTO [${modeTag(runMode)}] | ${headline}`,
    detail: { runMode, ...detail },
  });
}
