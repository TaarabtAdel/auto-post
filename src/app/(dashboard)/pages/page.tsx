import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { facebookPage } from "@/db/schema/facebook-page";
import { workspaceApp } from "@/db/schema/workspace-app";
import { post } from "@/db/schema/post";
import { eq } from "drizzle-orm";
import { OAuthMessage } from "@/components/oauth-message";
import { listWorkspaceApps } from "@/lib/workspace-app";
import { PagesManager, type PageRow } from "@/components/pages-manager";

export const metadata: Metadata = {
  title: "Facebook Pages",
};

const PENDING_STATUSES = new Set(["queued", "scheduled", "posting"]);

export default async function PagesPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const userId = session!.user.id;

  const [pages, apps, allPosts] = await Promise.all([
    db
      .select({
        id: facebookPage.id,
        pageId: facebookPage.pageId,
        pageName: facebookPage.pageName,
        pageAvatar: facebookPage.pageAvatar,
        tokenStatus: facebookPage.tokenStatus,
        tokenRenewedAt: facebookPage.tokenRenewedAt,
        tokenExpiresAt: facebookPage.tokenExpiresAt,
        workspaceAppId: facebookPage.workspaceAppId,
        workspaceAppName: workspaceApp.name,
      })
      .from(facebookPage)
      .leftJoin(workspaceApp, eq(facebookPage.workspaceAppId, workspaceApp.id))
      .where(eq(facebookPage.userId, userId)),
    listWorkspaceApps(userId),
    db
      .select({
        facebookPageId: post.facebookPageId,
        status: post.status,
      })
      .from(post)
      .where(eq(post.userId, userId)),
  ]);

  const statsByPage = new Map<string, { posted: number; pending: number }>();
  for (const p of allPosts) {
    if (!p.facebookPageId) continue;
    const cur = statsByPage.get(p.facebookPageId) ?? { posted: 0, pending: 0 };
    if (p.status === "posted") cur.posted++;
    if (PENDING_STATUSES.has(p.status)) cur.pending++;
    statsByPage.set(p.facebookPageId, cur);
  }

  const rows: PageRow[] = pages.map((page) => {
    const stats = statsByPage.get(page.id) ?? { posted: 0, pending: 0 };
    return {
      ...page,
      postedCount: stats.posted,
      pendingCount: stats.pending,
      tokenRenewedAt:
        page.tokenRenewedAt instanceof Date
          ? page.tokenRenewedAt.toISOString()
          : page.tokenRenewedAt
            ? String(page.tokenRenewedAt)
            : null,
      tokenExpiresAt:
        page.tokenExpiresAt instanceof Date
          ? page.tokenExpiresAt.toISOString()
          : page.tokenExpiresAt
            ? String(page.tokenExpiresAt)
            : null,
    };
  });

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Facebook Pages</h2>
        <p className="text-gray-600 mt-1 text-sm">
          Quản lý Fanpage, link công khai, gán App và token.
        </p>
      </div>

      <OAuthMessage />

      <PagesManager
        initialPages={rows}
        apps={apps.map((a) => ({
          id: a.id,
          name: a.name,
          facebookAppId: a.facebookAppId,
        }))}
      />
    </div>
  );
}
