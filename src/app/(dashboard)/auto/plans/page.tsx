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
        description="Queue: Live đăng thật / Test giả lập — hẹn giờ rồi vào hàng đợi. Thủ công: lưu là chạy ngay, không queue; bài nháp trên /posts để Đăng từng Page."
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
