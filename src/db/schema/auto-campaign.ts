import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

/** draft = wizard; ready = đủ dữ liệu; planned = chờ executeAt; running/completed/failed */
export const autoCampaignStatus = [
  "draft",
  "ready",
  "planned",
  "running",
  "posts_created",
  "rendered",
  "scheduled",
  "completed",
  "failed",
] as const;

export type AutoCampaignStatus = (typeof autoCampaignStatus)[number];

export const autoCampaign = sqliteTable("auto_campaign", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull().default(""),
  wizardStep: integer("wizard_step").notNull().default(0),
  batchId: text("batch_id"),
  youtubeVideoId: text("youtube_video_id"),
  youtubeUrl: text("youtube_url"),
  youtubeTitle: text("youtube_title"),
  rawGemini: text("raw_gemini"),
  firstComment: text("first_comment"),
  times: text("times").notNull().default(""),
  caption1: text("caption1").notNull().default(""),
  caption2: text("caption2").notNull().default(""),
  caption3: text("caption3").notNull().default(""),
  caption4: text("caption4").notNull().default(""),
  postId1: text("post_id1"),
  postId2: text("post_id2"),
  postId3: text("post_id3"),
  postId4: text("post_id4"),
  sourceVideoPath: text("source_video_path"),
  /** 1 = tải video bằng yt-dlp (link plan) thay vì upload tay */
  autoDownloadVideo: integer("auto_download_video").notNull().default(0),
  backgroundPath: text("background_path"),
  reelPath1: text("reel_path1"),
  reelPath2: text("reel_path2"),
  reelPath3: text("reel_path3"),
  reelPath4: text("reel_path4"),
  workspaceAppId: text("workspace_app_id"),
  /** JSON string[] */
  facebookPageIds: text("facebook_page_ids"),
  /** JSON number[] — giờ đăn từng đoạn (VN) */
  scheduleHours: text("schedule_hours"),
  /** Thời điểm chạy pipeline: tạo bài → render → hẹn queue */
  executeAt: integer("execute_at", { mode: "timestamp_ms" }),
  /** live = queue Fanpage thật; test = log giả; manual = lưu nháp, đăng tay trên /posts */
  runMode: text("run_mode").notNull().default("live"),
  status: text("status").notNull().default("draft"),
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export type AutoCampaignRow = typeof autoCampaign.$inferSelect;
