import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { post, postMedia } from "@/db/schema/post";
import { facebookPage } from "@/db/schema/facebook-page";
import { eq, and } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";
import { publishPost, publishPhotoPost } from "@/lib/facebook";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { readFile } from "fs/promises";
import path from "path";

type Params = { params: Promise<{ id: string }> };

/**
 * Check if request is authorized via N8N_API_KEY or user session.
 * Returns userId if authenticated via session, or "n8n" if via API key, or null.
 */
async function getAuthSource(request: NextRequest): Promise<{ source: "session" | "apikey"; userId?: string } | null> {
  // Check API key first (n8n)
  const apiKey = process.env.N8N_API_KEY;
  const providedKey = request.headers.get("x-api-key");
  if (apiKey && providedKey === apiKey) {
    return { source: "apikey" };
  }

  // Check user session
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (session) {
    return { source: "session", userId: session.user.id };
  }

  // Dev mode: no API key configured = allow (backward compat)
  if (!apiKey) {
    return { source: "apikey" };
  }

  return null;
}

/**
 * POST /api/posts/[id]/publish — publish a post to Facebook
 * Called by n8n or manually. Decrypts token, calls Graph API, updates status.
 * Protected by N8N_API_KEY header.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const authResult = await getAuthSource(request);
  if (!authResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Get post
  const posts = await db.select().from(post).where(eq(post.id, id));
  if (posts.length === 0) {
    return NextResponse.json({ error: "Post không tồn tại." }, { status: 404 });
  }

  const p = posts[0];

  // If authenticated via session, verify post belongs to user
  if (authResult.source === "session" && authResult.userId && p.userId !== authResult.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Only publish scheduled or draft posts
  if (p.status !== "scheduled" && p.status !== "draft") {
    return NextResponse.json(
      { error: `Post ở trạng thái '${p.status}', không thể đăng.` },
      { status: 400 }
    );
  }

  if (!p.facebookPageId) {
    await db
      .update(post)
      .set({ status: "failed", errorMessage: "Chưa chọn Facebook Page." })
      .where(eq(post.id, id));
    return NextResponse.json(
      { error: "Chưa chọn Facebook Page." },
      { status: 400 }
    );
  }

  // Get page + decrypt token
  const pages = await db
    .select()
    .from(facebookPage)
    .where(eq(facebookPage.id, p.facebookPageId));

  if (pages.length === 0) {
    await db
      .update(post)
      .set({ status: "failed", errorMessage: "Facebook Page đã bị xóa." })
      .where(eq(post.id, id));
    return NextResponse.json(
      { error: "Facebook Page đã bị xóa." },
      { status: 400 }
    );
  }

  const fbPage = pages[0];

  let token: string;
  try {
    token = decrypt(fbPage.encryptedToken);
  } catch {
    await db
      .update(post)
      .set({ status: "failed", errorMessage: "Không thể giải mã token." })
      .where(eq(post.id, id));
    return NextResponse.json(
      { error: "Không thể giải mã token." },
      { status: 500 }
    );
  }

  // Mark as posting
  await db
    .update(post)
    .set({ status: "posting" })
    .where(eq(post.id, id));

  // Get media
  const media = await db
    .select()
    .from(postMedia)
    .where(eq(postMedia.postId, id));

  // Determine publish method
  const firstImage = media.find((m) => m.fileType === "image");
  let result;

  if (firstImage) {
    // Read image file from disk and upload binary to Facebook
    try {
      const filePath = path.join(process.cwd(), "uploads", firstImage.filePath);
      const photoBuffer = await readFile(filePath);
      result = await publishPhotoPost(token, fbPage.pageId, p.content, photoBuffer, firstImage.fileName);
    } catch (fileErr) {
      await db
        .update(post)
        .set({ status: "failed", errorMessage: "Không thể đọc file ảnh." })
        .where(eq(post.id, id));
      return NextResponse.json(
        { error: "Không thể đọc file ảnh." },
        { status: 500 }
      );
    }
  } else {
    // Text-only post
    result = await publishPost(token, fbPage.pageId, p.content);
  }

  if (result.success) {
    await db
      .update(post)
      .set({
        status: "posted",
        fbPostId: result.fbPostId || null,
        postedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(post.id, id));

    return NextResponse.json({
      success: true,
      fbPostId: result.fbPostId,
    });
  } else {
    // Mark token as expired if needed
    if (result.tokenExpired) {
      await db
        .update(facebookPage)
        .set({ tokenStatus: "expired" })
        .where(eq(facebookPage.id, p.facebookPageId));
    }

    await db
      .update(post)
      .set({
        status: "failed",
        errorMessage: result.error || "Unknown error",
      })
      .where(eq(post.id, id));

    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    );
  }
}
