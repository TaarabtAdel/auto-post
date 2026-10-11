import type { Metadata } from "next";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { post, postMedia } from "@/db/schema/post";
import { facebookPage } from "@/db/schema/facebook-page";
import { workspaceApp } from "@/db/schema/workspace-app";
import { eq, desc, inArray } from "drizzle-orm";
import Link from "next/link";
import { PostFilters } from "@/components/post-filters";
import { PageHeader } from "@/components/page-header";
import { ui } from "@/lib/dashboard-ui";
import { drainPublishQueue } from "@/lib/publish-queue-processor";
import { loadPostPagesDisplay } from "@/lib/post-pages";

export const metadata: Metadata = {
  title: "Bài viết",
};

export const dynamic = "force-dynamic";

export default async function PostsPage() {
  await drainPublishQueue(5);

  const session = await getAppSession({
    headers: await headers(),
  });

  const posts = await db
    .select({
      id: post.id,
      content: post.content,
      status: post.status,
      facebookPageId: post.facebookPageId,
      scheduledAt: post.scheduledAt,
      postedAt: post.postedAt,
      fbPostId: post.fbPostId,
      errorMessage: post.errorMessage,
      createdAt: post.createdAt,
    })
    .from(post)
    .where(eq(post.userId, session!.user.id))
    .orderBy(desc(post.createdAt));

  // Get media counts
  const postIds = posts.map((p) => p.id);
  let mediaList: {
    postId: string;
    fileType: string;
    fileName: string;
    sortOrder: number;
  }[] = [];
  if (postIds.length > 0) {
    mediaList = await db
      .select({
        postId: postMedia.postId,
        fileType: postMedia.fileType,
        fileName: postMedia.fileName,
        sortOrder: postMedia.sortOrder,
      })
      .from(postMedia)
      .where(inArray(postMedia.postId, postIds));
  }

  // Get page names
  const pages = await db
    .select({
      id: facebookPage.id,
      pageName: facebookPage.pageName,
      pageId: facebookPage.pageId,
      workspaceAppId: facebookPage.workspaceAppId,
    })
    .from(facebookPage)
    .where(eq(facebookPage.userId, session!.user.id));

  const apps = await db
    .select({ id: workspaceApp.id, name: workspaceApp.name })
    .from(workspaceApp)
    .where(eq(workspaceApp.userId, session!.user.id));

  const appMap = Object.fromEntries(apps.map((a) => [a.id, a.name]));
  const pagesByPost = await loadPostPagesDisplay(postIds, session!.user.id);

  const pageMetaById = Object.fromEntries(
    pages.map((p) => [
      p.id,
      {
        pageName: p.pageName,
        graphPageId: p.pageId,
        workspaceAppId: p.workspaceAppId,
      },
    ])
  );

  // Prepare data for client component
  const postsWithMeta = posts.map((p) => {
    const postMediaItems = mediaList
      .filter((m) => m.postId === p.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const postPages = pagesByPost.get(p.id) ?? [];
    const primaryPageId =
      postPages[0]?.facebookPageId ?? p.facebookPageId ?? null;
    const workspaceAppId = primaryPageId
      ? pageMetaById[primaryPageId]?.workspaceAppId ?? null
      : null;

    return {
      ...p,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
      scheduledAt: p.scheduledAt instanceof Date ? p.scheduledAt.toISOString() : p.scheduledAt,
      postedAt: p.postedAt instanceof Date ? p.postedAt.toISOString() : p.postedAt,
      pages: postPages,
      pageName: postPages[0]?.pageName ?? null,
      graphPageId: postPages[0]?.graphPageId ?? null,
      workspaceAppName: workspaceAppId ? appMap[workspaceAppId] ?? null : null,
      fbPostId: p.fbPostId,
      imageCount: postMediaItems.filter((m) => m.fileType === "image").length,
      videoCount: postMediaItems.filter((m) => m.fileType === "video").length,
      mediaFiles: postMediaItems.map((m) => ({
        fileName: m.fileName,
        fileType: m.fileType,
      })),
    };
  });

  // Status counts
  const counts = {
    all: posts.length,
    draft: posts.filter((p) => p.status === "draft").length,
    scheduled: posts.filter((p) =>
      ["scheduled", "queued", "posting"].includes(p.status)
    ).length,
    posted: posts.filter((p) => p.status === "posted").length,
    failed: posts.filter((p) => p.status === "failed").length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bài viết"
        description="Một bài có thể đăng nhiều Fanpage. Quản lý hàng đợi và trạng thái đăng."
        actions={
          <Link href="/posts/new" className={ui.btnPrimary}>
            + Tạo bài viết
          </Link>
        }
      />

      <PostFilters posts={postsWithMeta} counts={counts} />
    </div>
  );
}
