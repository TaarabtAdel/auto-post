import type { Metadata } from "next";
import { YouTubeLocVideo } from "@/components/youtube-loc-video";

export const metadata: Metadata = {
  title: "Tìm video YouTube",
};

export default function YouTubePage() {
  return <YouTubeLocVideo />;
}
