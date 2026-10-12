import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { post } from "@/db/schema/post";
import { postFacebookPage } from "@/db/schema/post-page";
import { publishQueue } from "@/db/schema/publish-queue";
import { eq, and } from "drizzle-orm";
import { refreshPostAggregateStatus } from "@/lib/post-pages";

type Params = {
  params: Promise<{ id: string; facebookPageId: string }>;
};

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await getAppSession({ headers: await headers() });
  const { id: postId, facebookPageId } = await params;

  const owned = await db
    .select({ id: post.id })
    .from(post)
    .where(and(eq(post.id, postId), eq(post.userId, session.user.id)))
    .limit(1);
  if (owned.length === 0) {
    return NextResponse.json({ error: "Post không tồn tại." }, { status: 404 });
  }

  let body: { manualPosted?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const manualPosted = Boolean(body.manualPosted);

  const link = await db
    .select({ id: postFacebookPage.id })
    .from(postFacebookPage)
    .where(
      and(
        eq(postFacebookPage.postId, postId),
        eq(postFacebookPage.facebookPageId, facebookPageId)
      )
    )
    .limit(1);

  if (link.length === 0) {
    return NextResponse.json({ error: "Page không thuộc bài này." }, { status: 404 });
  }

  await db
    .update(postFacebookPage)
    .set({
      manualPosted: manualPosted ? 1 : 0,
      publishedAt: manualPosted ? new Date() : null,
    })
    .where(
      and(
        eq(postFacebookPage.postId, postId),
        eq(postFacebookPage.facebookPageId, facebookPageId)
      )
    );

  if (manualPosted) {
    await db
      .delete(publishQueue)
      .where(
        and(
          eq(publishQueue.postId, postId),
          eq(publishQueue.facebookPageId, facebookPageId),
          eq(publishQueue.status, "pending")
        )
      );
  }

  await refreshPostAggregateStatus(postId);

  return NextResponse.json({ ok: true, manualPosted });
}
