import { db } from "@/lib/db";
import { post, postMedia } from "@/db/schema/post";
import { facebookPage } from "@/db/schema/facebook-page";
import { eq, and, lte } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";
import { publishPost, publishPhotoPost } from "@/lib/facebook";
import { readFile } from "fs/promises";
import path from "path";

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Process all scheduled posts that are due (scheduledAt <= now).
 * Called by the internal scheduler every 30 seconds.
 */
async function processDuePosts() {
  try {
    const now = new Date();

    const duePosts = await db
      .select()
      .from(post)
      .where(and(eq(post.status, "scheduled"), lte(post.scheduledAt, now)));

    for (const p of duePosts) {
      if (!p.facebookPageId) continue;

      try {
        // Get page + token
        const pages = await db
          .select()
          .from(facebookPage)
          .where(eq(facebookPage.id, p.facebookPageId));

        if (pages.length === 0) {
          await db
            .update(post)
            .set({ status: "failed", errorMessage: "Facebook Page đã bị xóa." })
            .where(eq(post.id, p.id));
          continue;
        }

        const fbPage = pages[0];
        if (fbPage.tokenStatus !== "active") {
          await db
            .update(post)
            .set({ status: "failed", errorMessage: "Token đã hết hạn." })
            .where(eq(post.id, p.id));
          continue;
        }

        let token: string;
        try {
          token = decrypt(fbPage.encryptedToken);
        } catch {
          await db
            .update(post)
            .set({ status: "failed", errorMessage: "Không thể giải mã token." })
            .where(eq(post.id, p.id));
          continue;
        }

        // Mark as posting
        await db.update(post).set({ status: "posting" }).where(eq(post.id, p.id));

        // Get media
        const media = await db
          .select()
          .from(postMedia)
          .where(eq(postMedia.postId, p.id));

        const firstImage = media.find((m) => m.fileType === "image");
        let result;

        if (firstImage) {
          const filePath = path.join(process.cwd(), "uploads", firstImage.filePath);
          const photoBuffer = await readFile(filePath);
          result = await publishPhotoPost(token, fbPage.pageId, p.content, photoBuffer, firstImage.fileName);
        } else {
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
            .where(eq(post.id, p.id));
          console.log(`[scheduler] Published post ${p.id} → ${result.fbPostId}`);
        } else {
          if (result.tokenExpired) {
            await db
              .update(facebookPage)
              .set({ tokenStatus: "expired" })
              .where(eq(facebookPage.id, p.facebookPageId));
          }
          await db
            .update(post)
            .set({ status: "failed", errorMessage: result.error || "Unknown error" })
            .where(eq(post.id, p.id));
          console.log(`[scheduler] Failed post ${p.id}: ${result.error}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        await db
          .update(post)
          .set({ status: "failed", errorMessage: msg })
          .where(eq(post.id, p.id));
        console.error(`[scheduler] Error processing post ${p.id}:`, msg);
      }
    }
  } catch (err) {
    console.error("[scheduler] Error in processDuePosts:", err);
  }
}

/**
 * Start the internal post scheduler.
 * Checks for due posts every 30 seconds.
 */
export function startScheduler() {
  if (schedulerInterval) return; // Already running

  console.log("[scheduler] Started — checking due posts every 30s");
  schedulerInterval = setInterval(processDuePosts, 30_000);

  // Also run immediately
  processDuePosts();
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[scheduler] Stopped");
  }
}
