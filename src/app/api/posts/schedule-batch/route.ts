import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { facebookPage } from "@/db/schema/facebook-page";
import { eq, and, inArray } from "drizzle-orm";
import { randomBytes } from "crypto";
import { postsLimiter, checkRateLimit } from "@/lib/rate-limit";
import {
  createPostWithMedia,
  type MediaInput,
} from "@/lib/create-post-with-media";
import { enqueuePostsForBatch } from "@/lib/publish-queue-processor";

/**
 * POST /api/posts/schedule-batch
 * Body: { content, media?, scheduledAt, facebookPageIds: string[] }
 */
export async function POST(request: NextRequest) {
  const session = await getAppSession({ headers: await headers() });

  const limited = checkRateLimit(postsLimiter, session.user.id);
  if (limited) return limited;

  let body: {
    content?: string;
    media?: MediaInput[];
    scheduledAt?: string;
    facebookPageIds?: string[];
    firstComment?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const content = (body.content ?? "").trim();
  const firstComment = (body.firstComment ?? "").trim() || null;
  const media = body.media ?? [];
  const pageIds = [...new Set((body.facebookPageIds ?? []).filter(Boolean))];

  if (firstComment && firstComment.length > 8000) {
    return NextResponse.json(
      { error: "Bình luận đầu tiên tối đa 8.000 ký tự." },
      { status: 400 }
    );
  }

  if (!content && media.length === 0) {
    return NextResponse.json(
      { error: "Vui lòng nhập nội dung hoặc thêm media." },
      { status: 400 }
    );
  }

  if (pageIds.length === 0) {
    return NextResponse.json(
      { error: "Chọn ít nhất một Fanpage để đăng." },
      { status: 400 }
    );
  }

  if (content.length > 10000) {
    return NextResponse.json(
      { error: "Nội dung quá dài. Tối đa 10.000 ký tự." },
      { status: 400 }
    );
  }

  if (media.length > 10) {
    return NextResponse.json(
      { error: "Tối đa 10 file media." },
      { status: 400 }
    );
  }

  if (!body.scheduledAt) {
    return NextResponse.json(
      { error: "scheduledAt là bắt buộc." },
      { status: 400 }
    );
  }

  const scheduledDate = new Date(body.scheduledAt);
  if (isNaN(scheduledDate.getTime())) {
    return NextResponse.json(
      { error: "scheduledAt không hợp lệ." },
      { status: 400 }
    );
  }

  const targetPages = await db
    .select({ id: facebookPage.id, pageName: facebookPage.pageName })
    .from(facebookPage)
    .where(
      and(
        eq(facebookPage.userId, session.user.id),
        eq(facebookPage.tokenStatus, "active"),
        inArray(facebookPage.id, pageIds)
      )
    );

  if (targetPages.length !== pageIds.length) {
    return NextResponse.json(
      {
        error:
          "Một hoặc nhiều Page không hợp lệ, không thuộc tài khoản hoặc token không active.",
      },
      { status: 400 }
    );
  }

  const pageOrder = new Map(pageIds.map((id, i) => [id, i]));
  targetPages.sort(
    (a, b) => (pageOrder.get(a.id) ?? 0) - (pageOrder.get(b.id) ?? 0)
  );

  const batchId = randomBytes(16).toString("hex");
  const postIds: string[] = [];
  const queueItems: Parameters<typeof enqueuePostsForBatch>[0] = [];

  for (let i = 0; i < targetPages.length; i++) {
    const page = targetPages[i];
    const postId = await createPostWithMedia({
      userId: session.user.id,
      content,
      firstComment,
      facebookPageId: page.id,
      media,
      batchId,
      scheduledAt: scheduledDate,
      status: "queued",
    });
    postIds.push(postId);
    queueItems.push({
      userId: session.user.id,
      postId,
      batchId,
      queueOrder: i,
      scheduledAt: scheduledDate,
    });
  }

  await enqueuePostsForBatch(queueItems);

  return NextResponse.json({
    batchId,
    postIds,
    pageCount: targetPages.length,
    scheduledAt: scheduledDate.toISOString(),
    pages: targetPages.map((p) => p.pageName),
  });
}
