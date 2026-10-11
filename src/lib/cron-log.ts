import { APP_TIMEZONE, appTzNowLabel } from "@/lib/scheduled-at";

const PREFIX = "[cron]";

export function cronLog(message: string, detail?: Record<string, unknown>) {
  const ts = appTzNowLabel();
  if (detail && Object.keys(detail).length > 0) {
    console.log(`${PREFIX} ${ts} ${message}`, detail);
  } else {
    console.log(`${PREFIX} ${ts} ${message}`);
  }
}
