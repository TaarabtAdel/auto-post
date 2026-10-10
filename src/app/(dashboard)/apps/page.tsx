import type { Metadata } from "next";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { listWorkspaceApps } from "@/lib/workspace-app";
import { WorkspaceAppsManager } from "@/components/workspace-apps-manager";

export const metadata: Metadata = {
  title: "Facebook Apps",
};

export default async function AppsPage() {
  const session = await getAppSession({
    headers: await headers(),
  });

  const apps = await listWorkspaceApps(session!.user.id);

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Facebook Apps</h2>
        <p className="text-gray-600 mt-1">
          Mỗi tài khoản có thể tạo nhiều App — mỗi App một cặp App ID / Secret riêng.
        </p>
      </div>
      <WorkspaceAppsManager initialApps={apps} />
    </div>
  );
}
