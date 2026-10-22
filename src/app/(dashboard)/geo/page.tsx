import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { GeoSettingsPanel } from "@/components/geo-settings-panel";

export const metadata: Metadata = {
  title: "Geo Proxy Rotator",
};

export default function GeoPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Geo Proxy Rotator"
        description="Theo dõi các máy chạy app Geo Proxy Rotator Browser ở chế độ Host và sửa cài đặt chung (proxy, bài viết, nhịp chạy). Lưu ở đây giống lưu trong cửa sổ Cài đặt của app: mọi máy nhận trong vài giây."
      />
      <GeoSettingsPanel />
    </div>
  );
}
