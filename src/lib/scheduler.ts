import cron, { type ScheduledTask } from "node-cron";
import {
  processPublishQueueTick,
  repairPublishQueue,
  drainPublishQueue,
} from "@/lib/publish-queue-processor";
import { cronLog } from "@/lib/cron-log";
import { APP_TIMEZONE, appTzNowLabel } from "@/lib/scheduled-at";

let cronTask: ScheduledTask | null = null;
let started = false;

/** Mỗi phút, giây 0 — tương đương cron `0 * * * * *` (node-cron có seconds field) */
const CRON_EXPR = "0 * * * * *";

/** Sau restart app: xử lý hết job đã quá hạn (mỗi tick 1 bài, tuần tự). */
const STARTUP_CATCHUP_MAX = 50;

async function runCronTick(source: "startup" | "interval") {
  cronLog(`tick bắt đầu (${source})`);
  try {
    await repairPublishQueue();
    if (source === "startup") {
      const processed = await drainPublishQueue(STARTUP_CATCHUP_MAX);
      cronLog(`startup — đã xử lý bài quá hạn`, { processed });
    } else {
      await processPublishQueueTick();
    }
    cronLog(`tick xong (${source})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    cronLog(`tick LỖI (${source})`, { error: msg });
  }
}

export function startScheduler() {
  if (started) {
    cronLog("startScheduler bỏ qua — đã chạy rồi");
    return;
  }
  started = true;

  cronLog("khởi động publish queue scheduler", {
    engine: "node-cron",
    expression: CRON_EXPR,
    meaning: "mỗi phút (giây 0)",
    appTimezone: APP_TIMEZONE,
    now: appTzNowLabel(),
    processTz: process.env.TZ ?? "(unset)",
    pid: process.pid,
    nodeEnv: process.env.NODE_ENV,
  });

  void runCronTick("startup");

  cronTask = cron.schedule(
    CRON_EXPR,
    () => {
      void runCronTick("interval");
    },
    { timezone: "Asia/Ho_Chi_Minh" }
  );

  cronLog("node-cron đã schedule — xem log tại terminal chạy npm run dev / docker logs");
}

export function stopScheduler() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    started = false;
    cronLog("scheduler đã dừng");
  }
}
