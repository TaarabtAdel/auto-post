import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { AutoWizard } from "@/components/auto-wizard";
import { ui } from "@/lib/dashboard-ui";

export const metadata: Metadata = {
  title: "Lập plan AUTO",
};

type Props = { searchParams: Promise<{ id?: string }> };

export default async function AutoPage({ searchParams }: Props) {
  const { id } = await searchParams;
  const campaignId = id?.trim() || null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={campaignId ? "Sửa plan AUTO" : "Plan AUTO mới"}
        description="Bước 1–5 lưu vào CSDL. Queue (Live/Test): hẹn giờ rồi cron tạo bài → render → vào hàng đợi. Thủ công: lưu là chạy ngay, không queue."
        actions={
          <Link href="/auto/plans" className={ui.btnSecondary}>
            ← Danh sách plan
          </Link>
        }
      />
      <AutoWizard initialCampaignId={campaignId} />
    </div>
  );
}
