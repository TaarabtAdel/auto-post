import type { Metadata } from "next";
import { ReelEditor } from "@/components/reel-editor";

export const metadata: Metadata = {
  title: "Tạo Reel",
};

export default function ReelsPage() {
  return <ReelEditor />;
}
