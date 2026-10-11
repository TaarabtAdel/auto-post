import type { Metadata } from "next";
import { ReelEditor } from "@/components/reel-editor";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Tạo Reel",
};

export default function ReelsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Tạo Reel"
        description="Ghép clip, caption, nhạc và khung ảnh — xuất video dọc/ngang rồi đưa sang bài đăng."
      />
      <ReelEditor />
    </div>
  );
}
