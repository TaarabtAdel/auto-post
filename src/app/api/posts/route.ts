import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { post, postMedia } from "@/db/schema/post";
import { facebookPage } from "@/db/schema/facebook-page";
import { eq, and, desc, inArray } from "drizzle-orm";
import { randomBytes } from "crypto";
import { postsLimiter, checkRateLimit } from "@/lib/rate-limit";
import { uploadMediaPublicUrl } from "@/lib/upload-media-url";
import {
  loadPostPagesDisplay,
  replacePostFacebookPages,
  validateUserPageIds,
} from "@/lib/post-pages";

interface MediaInput {
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileType: string;
}

/**
 * GET /api/posts — list posts for authenticated user
 */
export async function GET() {
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
      errorMessage: post.errorMessage,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    })
    .from(post)
    .where(eq(post.userId, session.user.id))
    .orderBy(desc(post.createdAt));

  // Get media for each post
  const postIds = posts.map((p) => p.id);
  let allMedia: { postId: string; id: string; filePath: string; fileType: string; fileName: string; fileSize: number; mimeType: string; sortOrder: number }[] = [];
  if (postIds.length > 0) {
    allMedia = await db
      .select({
        postId: postMedia.postId,
        id: postMedia.id,
        filePath: postMedia.filePath,
        fileType: postMedia.fileType,
        fileName: postMedia.fileName,
        fileSize: postMedia.fileSize,
        mimeType: postMedia.mimeType,
        sortOrder: postMedia.sortOrder,
      })
      .from(postMedia)
      .where(inArray(postMedia.postId, postIds));
  }

  // Get page names
  const pages = await db
    .select({ id: facebookPage.id, pageName: facebookPage.pageName })
    .from(facebookPage)
    .where(eq(facebookPage.userId, session.user.id));

  const pageMap = Object.fromEntries(pages.map((p) => [p.id, p.pageName]));

  const pagesByPost = await loadPostPagesDisplay(postIds, session.user.id);

  const result = posts.map((p) => {
    const postPages = pagesByPost.get(p.id) ?? [];
    return {
    ...p,
    pages: postPages,
    pageName: postPages[0]?.pageName ?? (p.facebookPageId ? pageMap[p.facebookPageId] || null : null),
    media: allMedia
      .filter((m) => m.postId === p.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((m) => ({
        id: m.id,
        filePath: m.filePath,
        fileType: m.fileType,
        fileName: m.fileName,
        fileSize: m.fileSize,
        mimeType: m.mimeType,
        url: uploadMediaPublicUrl(m.filePath),
      })),
  };
  });

  return NextResponse.json({ posts: result });
}

/**
 * POST /api/posts — create a new post
 * Body: { content, facebookPageId?, media?: MediaInput[] }
 */
export async function POST(request: NextRequest) {
  const session = await getAppSession({
    headers: await headers(),
  });

  // Rate limit: 30 posts / min / user
  const limited = checkRateLimit(postsLimiter, session.user.id);
  if (limited) return limited;

  let body: {
    content?: string;
    firstComment?: string;
    facebookPageId?: string;
    facebookPageIds?: string[];
    media?: MediaInput[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const {
    content = "",
    firstComment: rawFirstComment,
    facebookPageId,
    facebookPageIds: rawPageIds,
    media = [],
  } = body;
  const pageIdsFromBody =
    rawPageIds && rawPageIds.length > 0
      ? [...new Set(rawPageIds.filter(Boolean))]
      : facebookPageId
        ? [facebookPageId]
        : [];
  const firstComment = (rawFirstComment ?? "").trim() || null;

  // Input validation
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

  if (firstComment && firstComment.length > 8000) {
    return NextResponse.json(
      { error: "Bình luận đầu tiên tối đa 8.000 ký tự." },
      { status: 400 }
    );
  }

  if (pageIdsFromBody.length > 0) {
    const validated = await validateUserPageIds(
      session.user.id,
      pageIdsFromBody
    );
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
  }

  const postId = randomBytes(16).toString("hex");

  await db.insert(post).values({
    id: postId,
    userId: session.user.id,
    facebookPageId: pageIdsFromBody[0] || null,
    content,
    firstComment,
    status: "draft",
  });

  if (pageIdsFromBody.length > 0) {
    await replacePostFacebookPages(postId, pageIdsFromBody);
  }

  // Insert media
  for (let i = 0; i < media.length; i++) {
    const m = media[i];
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

  return NextResponse.json({
    post: {
      id: postId,
      content,
      facebookPageId: pageIdsFromBody[0] || null,
      facebookPageIds: pageIdsFromBody,
      status: "draft",
      media: media.map((m, i) => ({
        ...m,
        sortOrder: i,
        url: uploadMediaPublicUrl(m.filePath),
      })),
    },
  });
}
