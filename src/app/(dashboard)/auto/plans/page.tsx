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
        description="Danh sách plan AUTO. Test: pipeline thật, không đăng FB (test_scheduled). Live: sau khi plan chạy xong, bài nằm trên /posts — queue tự đăng nếu Page có token; hoặc đăng tay trên FB rồi bật «Đã đăng» (hủy job queue Page đó). Khoảng cách giữa các Page cấu hình tại /posts. Page chưa token (thêm thủ công) không chọn được trong wizard AUTO."
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
