import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { post, postMedia } from "@/db/schema/post";
import { facebookPage } from "@/db/schema/facebook-page";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import { unlink } from "fs/promises";
import { join } from "path";
import {
  cancelPendingQueueForPost,
  enqueuePostsForBatch,
} from "@/lib/publish-queue-processor";

type Params = { params: Promise<{ id: string }> };

interface MediaInput {
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileType: string;
}

async function getOwnedPost(postId: string, userId: string) {
  const result = await db
    .select()
    .from(post)
    .where(and(eq(post.id, postId), eq(post.userId, userId)));
  return result[0] || null;
}

/**
 * GET /api/posts/[id] — get post details with media
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const p = await getOwnedPost(id, session.user.id);
  if (!p) {
    return NextResponse.json({ error: "Post không tồn tại." }, { status: 404 });
  }

  const media = await db
    .select()
    .from(postMedia)
    .where(eq(postMedia.postId, id));

  // Get page name
  let pageName = null;
  if (p.facebookPageId) {
    const page = await db
      .select({ pageName: facebookPage.pageName })
      .from(facebookPage)
      .where(eq(facebookPage.id, p.facebookPageId));
    pageName = page[0]?.pageName || null;
  }

  return NextResponse.json({
    post: {
      ...p,
      pageName,
      media: media
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((m) => ({
          id: m.id,
          filePath: m.filePath,
          fileType: m.fileType,
          fileName: m.fileName,
          fileSize: m.fileSize,
          mimeType: m.mimeType,
          url: `/api/uploads/${m.filePath}`,
        })),
    },
  });
}

/**
 * PATCH /api/posts/[id] — update post content, page, or media
 * Body: { content?, facebookPageId?, media?: MediaInput[] }
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const p = await getOwnedPost(id, session.user.id);
  if (!p) {
    return NextResponse.json({ error: "Post không tồn tại." }, { status: 404 });
  }

  // Only allow editing drafts (or scheduling)
  if (p.status !== "draft" && p.status !== "scheduled" && p.status !== "queued") {
    return NextResponse.json(
      { error: "Chỉ có thể sửa bài ở trạng thái draft, queued hoặc scheduled." },
      { status: 400 }
    );
  }

  let body: {
    content?: string;
    facebookPageId?: string | null;
    media?: MediaInput[];
    scheduledAt?: string | null;
    firstComment?: string | null;
    status?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  // Validate facebookPageId if provided
  if (body.facebookPageId) {
    const page = await db
      .select({ id: facebookPage.id })
      .from(facebookPage)
      .where(
        and(
          eq(facebookPage.id, body.facebookPageId),
          eq(facebookPage.userId, session.user.id)
        )
      );
    if (page.length === 0) {
      return NextResponse.json(
        { error: "Facebook Page không tồn tại." },
        { status: 400 }
      );
    }
  }

  // Update post fields
  const updates: Record<string, unknown> = {};
  if (body.content !== undefined) updates.content = body.content;
  if (body.firstComment !== undefined) {
    const fc = body.firstComment?.trim() || null;
    if (fc && fc.length > 8000) {
      return NextResponse.json(
        { error: "Bình luận đầu tiên tối đa 8.000 ký tự." },
        { status: 400 }
      );
    }
    updates.firstComment = fc;
  }
  if (body.facebookPageId !== undefined)
    updates.facebookPageId = body.facebookPageId;

  // Handle scheduling
  if (body.scheduledAt !== undefined) {
    if (body.scheduledAt) {
      const scheduledDate = new Date(body.scheduledAt);
      if (isNaN(scheduledDate.getTime())) {
        return NextResponse.json(
          { error: "scheduledAt không hợp lệ." },
          { status: 400 }
        );
      }
      // Require facebookPageId for scheduling
      const pageId = body.facebookPageId ?? p.facebookPageId;
      if (!pageId) {
        return NextResponse.json(
          { error: "Phải chọn Facebook Page trước khi hẹn giờ." },
          { status: 400 }
        );
      }
      const batchId = p.batchId || randomBytes(16).toString("hex");
      updates.scheduledAt = scheduledDate;
      updates.status = "queued";
      updates.batchId = batchId;

      await cancelPendingQueueForPost(id);
      await enqueuePostsForBatch([
        {
          userId: session.user.id,
          postId: id,
          batchId,
          queueOrder: 0,
          scheduledAt: scheduledDate,
        },
      ]);
    } else {
      updates.scheduledAt = null;
      updates.status = "draft";
      await cancelPendingQueueForPost(id);
    }
  }

  // Allow explicit status override (e.g. from publish endpoint)
  if (body.status && !body.scheduledAt) {
    updates.status = body.status;
  }

  if (Object.keys(updates).length > 0) {
    await db
      .update(post)
      .set(updates)
      .where(eq(post.id, id));
  }

  // Replace media if provided
  if (body.media !== undefined) {
    // Delete old media records
    await db.delete(postMedia).where(eq(postMedia.postId, id));

    // Insert new media
    for (let i = 0; i < body.media.length; i++) {
      const m = body.media[i];
      await db.insert(postMedia).values({
        id: randomBytes(16).toString("hex"),
        postId: id,
        filePath: m.filePath,
        fileType: m.fileType,
        fileName: m.fileName,
        fileSize: m.fileSize,
        mimeType: m.mimeType,
        sortOrder: i,
      });
    }
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/posts/[id] — delete post and its media files
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const p = await getOwnedPost(id, session.user.id);
  if (!p) {
    return NextResponse.json({ error: "Post không tồn tại." }, { status: 404 });
  }

  // Get media files to delete from disk
  const media = await db
    .select({ filePath: postMedia.filePath })
    .from(postMedia)
    .where(eq(postMedia.postId, id));

  // Delete post (cascades to post_media)
  await db.delete(post).where(eq(post.id, id));

  // Best-effort delete files from disk
  for (const m of media) {
    try {
      await unlink(join(process.cwd(), "uploads", m.filePath));
    } catch {
      // File may already be deleted — ignore
    }
  }

  return NextResponse.json({ success: true });
}
