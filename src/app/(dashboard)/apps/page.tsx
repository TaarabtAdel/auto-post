import type { Metadata } from "next";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { listWorkspaceApps } from "@/lib/workspace-app";
import { WorkspaceAppsManager } from "@/components/workspace-apps-manager";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Facebook Apps",
};

export default async function AppsPage() {
  const session = await getAppSession({
    headers: await headers(),
  });

  const apps = await listWorkspaceApps(session!.user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Facebook Apps"
        description="Mỗi tài khoản có thể tạo nhiều App — mỗi App một cặp App ID / Secret riêng."
      />
      <WorkspaceAppsManager initialApps={apps} />
    </div>
  );
}
