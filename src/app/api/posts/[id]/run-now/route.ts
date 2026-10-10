import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { post } from "@/db/schema/post";
import { publishQueue } from "@/db/schema/publish-queue";
import { eq, and, inArray } from "drizzle-orm";
import { publishPostById } from "@/lib/publish-post";
import { cancelPendingQueueForPost } from "@/lib/publish-queue-processor";

type Params = { params: Promise<{ id: string }> };

/** POST /api/posts/[id]/run-now — đăng ngay, không chờ cron */
export async function POST(_request: Request, { params }: Params) {
  const session = await getAppSession({ headers: await headers() });

  const { id } = await params;
  const rows = await db
    .select()
    .from(post)
    .where(and(eq(post.id, id), eq(post.userId, session.user.id)));

  const p = rows[0];
  if (!p) {
    return NextResponse.json({ error: "Post không tồn tại." }, { status: 404 });
  }

  if (!["queued", "scheduled", "draft", "failed"].includes(p.status)) {
    return NextResponse.json(
      { error: `Không thể chạy ngay ở trạng thái "${p.status}".` },
      { status: 400 }
    );
  }

  if (!p.facebookPageId) {
    return NextResponse.json(
      { error: "Chưa chọn Facebook Page." },
      { status: 400 }
    );
  }

  await cancelPendingQueueForPost(id);

  if (p.status === "queued" || p.status === "scheduled") {
    await db
      .update(post)
      .set({ scheduledAt: new Date(), status: "queued" })
      .where(eq(post.id, id));
  }

  const result = await publishPostById(id);

  if (result.success) {
    await db
      .update(publishQueue)
      .set({
        status: "completed",
        completedAt: new Date(),
        errorMessage: null,
      })
      .where(
        and(
          eq(publishQueue.postId, id),
          inArray(publishQueue.status, ["pending", "processing", "failed"])
        )
      );

    const updated = await db.select().from(post).where(eq(post.id, id));
    return NextResponse.json({
      ok: true,
      fbPostId: result.fbPostId,
      warning: updated[0]?.errorMessage || undefined,
    });
  }

  return NextResponse.json({ error: result.error || "Đăng thất bại." }, { status: 400 });
}
