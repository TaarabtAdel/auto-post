import type { Metadata } from "next";
import { YouTubeLocVideo } from "@/components/youtube-loc-video";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Tìm video YouTube",
};

export default function YouTubePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Tìm video YouTube"
        description="Tìm theo từ khóa (≥ N phút), dán nhiều link. Danh sách + đã xem lưu theo tài khoản (đồng bộ mọi máy)."
      />
      <YouTubeLocVideo />
    </div>
  );
}
