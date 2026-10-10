import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { post } from "@/db/schema/post";
import { eq } from "drizzle-orm";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { publishPostById } from "@/lib/publish-post";

type Params = { params: Promise<{ id: string }> };

async function getAuthSource(
  request: NextRequest
): Promise<{ source: "session" | "apikey"; userId?: string } | null> {
  const apiKey = process.env.N8N_API_KEY;
  const providedKey = request.headers.get("x-api-key");
  if (apiKey && providedKey === apiKey) {
    return { source: "apikey" };
  }

  const session = await getAppSession({
    headers: await headers(),
  });
  if (session) {
    return { source: "session", userId: session.user.id };
  }

  if (!apiKey) {
    return { source: "apikey" };
  }

  return null;
}

/**
 * POST /api/posts/[id]/publish — publish (+ optional first comment via queue logic)
 */
export async function POST(request: NextRequest, { params }: Params) {
  const authResult = await getAuthSource(request);
  if (!authResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const posts = await db.select().from(post).where(eq(post.id, id));
  if (posts.length === 0) {
    return NextResponse.json({ error: "Post không tồn tại." }, { status: 404 });
  }

  const p = posts[0];

  if (
    authResult.source === "session" &&
    authResult.userId &&
    p.userId !== authResult.userId
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  if (p.status !== "scheduled" && p.status !== "draft" && p.status !== "queued") {
    return NextResponse.json(
      { error: `Post ở trạng thái '${p.status}', không thể đăng.` },
      { status: 400 }
    );
  }

  const result = await publishPostById(id);

  if (result.success) {
    const updated = await db.select().from(post).where(eq(post.id, id));
    return NextResponse.json({
      success: true,
      fbPostId: result.fbPostId,
      warning: updated[0]?.errorMessage || undefined,
    });
  }

  return NextResponse.json({ error: result.error }, { status: 400 });
}
