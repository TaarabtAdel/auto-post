import type { Metadata } from "next";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { facebookPage } from "@/db/schema/facebook-page";
import { pageCategory } from "@/db/schema/page-category";
import { workspaceApp } from "@/db/schema/workspace-app";
import { listPageCategories } from "@/lib/page-categories";
import { post } from "@/db/schema/post";
import { postFacebookPage } from "@/db/schema/post-page";
import { eq } from "drizzle-orm";
import { OAuthMessage } from "@/components/oauth-message";
import { listWorkspaceApps } from "@/lib/workspace-app";
import { PagesManager, type PageRow } from "@/components/pages-manager";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Facebook Pages",
};

const PENDING_STATUSES = new Set(["queued", "scheduled", "posting"]);

export default async function PagesPage() {
  const session = await getAppSession({
    headers: await headers(),
  });

  const userId = session!.user.id;

  const [pages, apps, categories, allPosts] = await Promise.all([
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
        categoryId: facebookPage.categoryId,
        categoryName: pageCategory.name,
      })
      .from(facebookPage)
      .leftJoin(workspaceApp, eq(facebookPage.workspaceAppId, workspaceApp.id))
      .leftJoin(pageCategory, eq(facebookPage.categoryId, pageCategory.id))
      .where(eq(facebookPage.userId, userId)),
    listWorkspaceApps(userId),
    listPageCategories(userId),
    db
      .select({
        facebookPageId: postFacebookPage.facebookPageId,
        status: post.status,
      })
      .from(postFacebookPage)
      .innerJoin(post, eq(postFacebookPage.postId, post.id))
      .where(eq(post.userId, userId)),
  ]);

  const statsByPage = new Map<string, { posted: number; pending: number }>();
  for (const p of allPosts) {
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
    <div className="space-y-6">
      <PageHeader
        title="Facebook Pages"
        description="Quản lý Fanpage, danh mục, App và token."
      />

      <OAuthMessage />

      <PagesManager
        initialPages={rows}
        initialCategories={categories}
        apps={apps.map((a) => ({
          id: a.id,
          name: a.name,
          facebookAppId: a.facebookAppId,
        }))}
      />
    </div>
  );
}
