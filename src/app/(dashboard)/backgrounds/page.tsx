import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { BackgroundLibrary } from "@/components/background-library";

export const metadata: Metadata = {
  title: "Quản lý ảnh nền",
};

export default function BackgroundsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý ảnh nền"
        description="Thư viện ảnh nền cho Reels / AUTO. Video: uploads/videos/, reel: uploads/reels/."
      />
      <BackgroundLibrary />
    </div>
  );
}
