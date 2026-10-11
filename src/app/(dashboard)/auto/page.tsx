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
        description="Bước 1–5 lưu vào CSDL. Bước 6 hẹn giờ — cron tự tạo 3 bài, render reel và hẹn đăng."
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
