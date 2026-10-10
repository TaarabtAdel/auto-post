import type { Metadata } from "next";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { post, postMedia } from "@/db/schema/post";
import { facebookPage } from "@/db/schema/facebook-page";
import { eq, and } from "drizzle-orm";
import { getBatchSiblings } from "@/lib/post-batch";
import { getFacebookPostUrl } from "@/lib/facebook-page-url";
import { notFound } from "next/navigation";
import { listWorkspaceApps } from "@/lib/workspace-app";
import { PostEditForm } from "@/components/post-edit-form";
import { uploadMediaPublicUrl } from "@/lib/upload-media-url";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Sửa bài ${id.slice(0, 8)}…` };
}

export default async function EditPostPage({ params }: Props) {
  const session = await getAppSession({ headers: await headers() });
  const { id } = await params;

  const rows = await db
    .select()
    .from(post)
    .where(and(eq(post.id, id), eq(post.userId, session!.user.id)));
  const p = rows[0];
  if (!p) notFound();

  const media = await db
    .select()
    .from(postMedia)
    .where(eq(postMedia.postId, id));

  let pageName: string | null = null;
  if (p.facebookPageId) {
    const pg = await db
      .select({ pageName: facebookPage.pageName })
      .from(facebookPage)
      .where(eq(facebookPage.id, p.facebookPageId));
    pageName = pg[0]?.pageName ?? null;
  }

  const apps = await listWorkspaceApps(session!.user.id);

  const batchSiblings = await getBatchSiblings(
    session!.user.id,
    p.batchId,
    p.id
  );

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Sửa bài viết</h2>
        <p className="text-sm text-gray-500 mt-1">
          Đổi Page, nội dung, giờ đăng — hoặc copy sang Fanpage khác.
        </p>
      </div>
      <PostEditForm
        post={{
          id: p.id,
          batchId: p.batchId,
          fbPostId: p.fbPostId,
          content: p.content,
          firstComment: p.firstComment,
          status: p.status,
          facebookPageId: p.facebookPageId,
          scheduledAt:
            p.scheduledAt instanceof Date
              ? p.scheduledAt.toISOString()
              : p.scheduledAt
                ? String(p.scheduledAt)
                : null,
          pageName,
          media: media
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((m) => ({
              id: m.id,
              filePath: m.filePath,
              fileName: m.fileName,
              fileType: m.fileType,
              fileSize: m.fileSize,
              mimeType: m.mimeType,
              url: uploadMediaPublicUrl(m.filePath),
            })),
        }}
        apps={apps.map((a) => ({ id: a.id, name: a.name }))}
        batchSiblings={batchSiblings.map((s) => ({
          ...s,
          scheduledAt: s.scheduledAt?.toISOString() ?? null,
          postedAt: s.postedAt?.toISOString() ?? null,
          facebookUrl:
            s.status === "posted" && s.fbPostId
              ? getFacebookPostUrl(s.fbPostId, s.graphPageId)
              : null,
        }))}
      />
    </div>
  );
}
