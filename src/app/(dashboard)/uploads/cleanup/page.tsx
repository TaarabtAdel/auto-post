import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { UploadsCleanupPanel } from "@/components/uploads-cleanup-panel";

export const metadata: Metadata = {
  title: "Dọn uploads",
};

export default function UploadsCleanupPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dọn thư mục uploads"
        description="Tick bucket cần xóa file (video, reel, …). Giữ ảnh nền nếu vẫn dùng cho AUTO/Reels."
      />
      <UploadsCleanupPanel />
    </div>
  );
}
