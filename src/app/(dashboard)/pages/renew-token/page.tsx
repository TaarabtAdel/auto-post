import type { Metadata } from "next";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { TokenRenewForm } from "@/components/token-renew-form";
import { PageHeader } from "@/components/page-header";
import { listWorkspaceApps } from "@/lib/workspace-app";

export const metadata: Metadata = {
  title: "Gia hạn Facebook Token",
};

export default async function RenewTokenPage() {
  const session = await getAppSession({
    headers: await headers(),
  });

  const apps = await listWorkspaceApps(session!.user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gia hạn User Access Token"
        description="Trên /pages, nút Gia hạn tự dùng Page token đã lưu. Trang này để dán User token từ Graph API Explorer khi Page token đã chết hẳn."
      />
      <TokenRenewForm apps={apps} />
    </div>
  );
}
