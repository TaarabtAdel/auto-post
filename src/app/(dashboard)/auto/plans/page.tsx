import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { AutoPlansList } from "@/components/auto-plans-list";
import { ui } from "@/lib/dashboard-ui";

export const metadata: Metadata = {
  title: "Plan AUTO",
};

export default function AutoPlansPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Plan AUTO"
        description="Danh sách plan AUTO. Chế độ Test chạy pipeline thật nhưng đăng Fanpage chỉ ghi log pm2; Live đăng thật qua queue."
        actions={
          <Link href="/auto" className={ui.btnPrimary}>
            + Plan mới
          </Link>
        }
      />
      <AutoPlansList />
    </div>
  );
}
