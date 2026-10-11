import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { SystemLogsPanel } from "@/components/system-logs-panel";

export const metadata: Metadata = {
  title: "Log hệ thống",
};

export default function LogsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Log hệ thống"
        description="Xem log cron, luồng AUTO (theo từng bước) và đăng Fanpage. Log mới nhất lưu trong SQLite (tối đa ~5000 dòng)."
      />
      <SystemLogsPanel />
    </div>
  );
}
