import { appendSystemLog } from "@/lib/system-log";

export function cronLog(message: string, detail?: Record<string, unknown>) {
  appendSystemLog({
    category: "cron",
    level: detail?.error ? "error" : "info",
    message,
    detail,
  });
}

export function publishLog(message: string, detail?: Record<string, unknown>) {
  appendSystemLog({
    category: "publish",
    level: detail?.error ? "error" : "info",
    message,
    detail,
  });
}
