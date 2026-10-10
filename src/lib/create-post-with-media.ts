import { db } from "@/lib/db";
import { post, postMedia } from "@/db/schema/post";
import { randomBytes } from "crypto";
import { replacePostFacebookPages } from "@/lib/post-pages";
import { enqueuePostsForBatch } from "@/lib/publish-queue-processor";

export interface MediaInput {
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileType: string;
}

export async function createPostWithMedia(params: {
  userId: string;
  content: string;
  firstComment?: string | null;
  facebookPageIds: string[];
  media: MediaInput[];
  batchId: string;
  scheduledAt: Date;
  status: "queued" | "draft";
}) {
  const postId = randomBytes(16).toString("hex");
  const pageIds = [...new Set(params.facebookPageIds.filter(Boolean))];
  const primary = pageIds[0];

  await db.insert(post).values({
    id: postId,
    userId: params.userId,
    facebookPageId: primary,
    content: params.content,
    firstComment: params.firstComment?.trim() || null,
    status: params.status,
    batchId: params.batchId,
    scheduledAt: params.scheduledAt,
  });

  await replacePostFacebookPages(postId, pageIds);

  for (let i = 0; i < params.media.length; i++) {
    const m = params.media[i];
    await db.insert(postMedia).values({
      id: randomBytes(16).toString("hex"),
      postId,
      filePath: m.filePath,
      fileType: m.fileType,
      fileName: m.fileName,
      fileSize: m.fileSize,
      mimeType: m.mimeType,
      sortOrder: i,
    });
  }

  if (params.status === "queued" && pageIds.length > 0) {
    await enqueuePostsForBatch(
      pageIds.map((facebookPageId, queueOrder) => ({
        userId: params.userId,
        postId,
        batchId: params.batchId,
        queueOrder,
        scheduledAt: params.scheduledAt,
        facebookPageId,
      }))
    );
  }

  return postId;
}
