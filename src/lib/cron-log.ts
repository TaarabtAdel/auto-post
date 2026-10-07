const PREFIX = "[cron]";

export function cronLog(message: string, detail?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  if (detail && Object.keys(detail).length > 0) {
    console.log(`${PREFIX} ${ts} ${message}`, detail);
  } else {
    console.log(`${PREFIX} ${ts} ${message}`);
  }
}
