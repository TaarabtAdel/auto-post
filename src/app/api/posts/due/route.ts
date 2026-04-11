import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { post } from "@/db/schema/post";
import { facebookPage } from "@/db/schema/facebook-page";
import { eq, and, lte } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";

function verifyApiKey(request: NextRequest): boolean {
  const apiKey = process.env.N8N_API_KEY;
  if (!apiKey) return true; // No key configured = open (dev mode)
  const provided = request.headers.get("x-api-key");
  return provided === apiKey;
}

/**
 * GET /api/posts/due — get posts that are due for publishing
 * Returns posts with scheduledAt <= now AND status === 'scheduled'
 * Protected by N8N_API_KEY header for n8n access.
 * Includes decrypted FB token for each post.
 */
export async function GET(request: NextRequest) {
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 403 });
  }

  const now = new Date();

  const duePosts = await db
    .select({
      id: post.id,
      userId: post.userId,
      content: post.content,
      facebookPageId: post.facebookPageId,
      scheduledAt: post.scheduledAt,
    })
    .from(post)
    .where(and(eq(post.status, "scheduled"), lte(post.scheduledAt, now)));

  // Get FB page info + decrypted tokens for each post
  const results = [];
  for (const p of duePosts) {
    if (!p.facebookPageId) continue;

    const page = await db
      .select({
        pageId: facebookPage.pageId,
        encryptedToken: facebookPage.encryptedToken,
        tokenStatus: facebookPage.tokenStatus,
      })
      .from(facebookPage)
      .where(eq(facebookPage.id, p.facebookPageId));

    if (page.length === 0 || page[0].tokenStatus !== "active") continue;

    results.push({
      id: p.id,
      content: p.content,
      fbPageId: page[0].pageId,
      scheduledAt: p.scheduledAt,
    });
  }

  return NextResponse.json({ posts: results });
}
