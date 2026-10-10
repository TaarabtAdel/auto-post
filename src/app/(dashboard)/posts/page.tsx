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
import { drainPublishQueue } from "@/lib/publish-queue-processor";

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
  let mediaList: { postId: string; fileType: string }[] = [];
  if (postIds.length > 0) {
    mediaList = await db
      .select({
        postId: postMedia.postId,
        fileType: postMedia.fileType,
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

  const pageMap = Object.fromEntries(
    pages.map((p) => [
      p.id,
      {
        pageName: p.pageName,
        graphPageId: p.pageId,
        workspaceAppId: p.workspaceAppId,
      },
    ])
  );
  const appMap = Object.fromEntries(apps.map((a) => [a.id, a.name]));

  // Prepare data for client component
  const postsWithMeta = posts.map((p) => {
    const postMediaItems = mediaList.filter((m) => m.postId === p.id);
    return {
      ...p,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
      scheduledAt: p.scheduledAt instanceof Date ? p.scheduledAt.toISOString() : p.scheduledAt,
      postedAt: p.postedAt instanceof Date ? p.postedAt.toISOString() : p.postedAt,
      pageName: p.facebookPageId
        ? pageMap[p.facebookPageId]?.pageName ?? null
        : null,
      graphPageId: p.facebookPageId
        ? pageMap[p.facebookPageId]?.graphPageId ?? null
        : null,
      workspaceAppName: p.facebookPageId
        ? appMap[pageMap[p.facebookPageId]?.workspaceAppId ?? ""] ?? null
        : null,
      fbPostId: p.fbPostId,
      imageCount: postMediaItems.filter((m) => m.fileType === "image").length,
      videoCount: postMediaItems.filter((m) => m.fileType === "video").length,
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
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Bài viết</h2>
          <p className="text-gray-600 mt-1">
            Quản lý bài viết của bạn.
          </p>
        </div>
        <Link
          href="/posts/new"
          className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 text-sm transition-colors"
        >
          + Tạo bài viết
        </Link>
      </div>

      <PostFilters posts={postsWithMeta} counts={counts} />
    </div>
  );
}
