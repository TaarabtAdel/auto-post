import type { AutoCampaignRow } from "@/db/schema/auto-campaign";
import {
  autoCampaignRunModeLabel,
  parsePageIdsJson,
  parseRunMode,
  parseScheduleHoursJson,
  type AutoCampaignRunMode,
} from "@/lib/auto-campaign-json";

export { autoCampaignRunModeLabel };
export type { AutoCampaignRunMode };
import { formatInAppTimezone } from "@/lib/scheduled-at";

export function autoCampaignStatusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: "Nháp",
    ready: "Sẵn sàng",
    planned: "Đã hẹn AUTO",
    running: "Đang chạy…",
    posts_created: "Đã tạo bài",
    rendered: "Đã render",
    scheduled: "Đã vào queue",
    completed: "Hoàn tất",
    failed: "Lỗi",
  };
  return map[status] ?? status;
}

export type AutoCampaignDto = {
  id: string;
  name: string;
  wizardStep: number;
  batchId: string | null;
  youtubeVideoId: string | null;
  youtubeUrl: string | null;
  youtubeTitle: string | null;
  rawGemini: string | null;
  firstComment: string | null;
  times: string;
  caption1: string;
  caption2: string;
  caption3: string;
  postIds: [string | null, string | null, string | null];
  sourceVideoPath: string | null;
  autoDownloadVideo: boolean;
  backgroundPath: string | null;
  reelPaths: [string | null, string | null, string | null];
  workspaceAppId: string | null;
  facebookPageIds: string[];
  scheduleHours: number[];
  executeAt: string | null;
  executeAtLabel: string | null;
  runMode: AutoCampaignRunMode;
  runModeLabel: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export function autoCampaignToDto(row: AutoCampaignRow): AutoCampaignDto {
  return {
    id: row.id,
    name: row.name,
    wizardStep: row.wizardStep ?? 0,
    batchId: row.batchId,
    youtubeVideoId: row.youtubeVideoId,
    youtubeUrl: row.youtubeUrl,
    youtubeTitle: row.youtubeTitle,
    rawGemini: row.rawGemini,
    firstComment: row.firstComment,
    times: row.times,
    caption1: row.caption1,
    caption2: row.caption2,
    caption3: row.caption3,
    postIds: [row.postId1, row.postId2, row.postId3],
    sourceVideoPath: row.sourceVideoPath,
    autoDownloadVideo: Boolean(row.autoDownloadVideo),
    backgroundPath: row.backgroundPath,
    reelPaths: [row.reelPath1, row.reelPath2, row.reelPath3],
    workspaceAppId: row.workspaceAppId,
    facebookPageIds: parsePageIdsJson(row.facebookPageIds),
    scheduleHours: parseScheduleHoursJson(row.scheduleHours),
    executeAt: row.executeAt ? row.executeAt.toISOString() : null,
    executeAtLabel: row.executeAt
      ? formatInAppTimezone(row.executeAt.toISOString(), true)
      : null,
    runMode: parseRunMode(row.runMode),
    runModeLabel: autoCampaignRunModeLabel(parseRunMode(row.runMode)),
    status: row.status,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
