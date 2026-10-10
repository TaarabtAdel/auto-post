import { db } from "@/lib/db";
import { post, postMedia } from "@/db/schema/post";
import { facebookPage } from "@/db/schema/facebook-page";
import { eq } from "drizzle-orm";
import { decryptPageToken } from "@/lib/crypto";
import {
  publishPost,
  publishPhotoPost,
  publishVideoPost,
  publishPostComment,
  debugAccessToken,
  tokenHasScope,
} from "@/lib/facebook";
import { getFacebookCredentials } from "@/lib/workspace-app";
import { uploadMediaFsPath } from "@/lib/upload-media-url";
import { readFile } from "fs/promises";
import {
  getFacebookPageIdsForPost,
  markPostPageFailed,
  markPostPagePublished,
  refreshPostAggregateStatus,
} from "@/lib/post-pages";

export interface PublishPostResult {
  success: boolean;
  fbPostId?: string;
  error?: string;
  tokenExpired?: boolean;
}

export async function publishPostById(
  postId: string,
  targetFacebookPageId?: string | null
): Promise<PublishPostResult> {
  const rows = await db.select().from(post).where(eq(post.id, postId));
  const p = rows[0];

  let facebookPageId =
    targetFacebookPageId ?? p?.facebookPageId ?? null;

  if (!facebookPageId) {
    const ids = await getFacebookPageIdsForPost(postId);
    facebookPageId = ids[0] ?? null;
  }

  if (!p || !facebookPageId) {
    return { success: false, error: "Thiếu Facebook Page." };
  }

  const pages = await db
    .select()
    .from(facebookPage)
    .where(eq(facebookPage.id, facebookPageId));

  if (pages.length === 0) {
    return { success: false, error: "Facebook Page đã bị xóa." };
  }

  const fbPage = pages[0];
  if (fbPage.tokenStatus !== "active") {
    return { success: false, error: "Token đã hết hạn." };
  }

  const tokenResult = decryptPageToken(fbPage.encryptedToken);
  if (!tokenResult.ok) {
    return { success: false, error: tokenResult.message };
  }
  const token = tokenResult.value;

  await db.update(post).set({ status: "posting" }).where(eq(post.id, postId));

  const media = await db
    .select()
    .from(postMedia)
    .where(eq(postMedia.postId, postId));

  const sortedMedia = [...media].sort((a, b) => a.sortOrder - b.sortOrder);
  const primary = sortedMedia[0];
  let result: PublishPostResult;

  try {
    if (primary?.fileType === "image") {
      const filePath = uploadMediaFsPath(process.cwd(), primary.filePath);
      const photoBuffer = await readFile(filePath);
      result = await publishPhotoPost(
        token,
        fbPage.pageId,
        p.content,
        photoBuffer,
        primary.fileName
      );
    } else if (primary?.fileType === "video") {
      const filePath = uploadMediaFsPath(process.cwd(), primary.filePath);
      const videoBuffer = await readFile(filePath);
      result = await publishVideoPost(
        token,
        fbPage.pageId,
        p.content,
        videoBuffer,
        primary.fileName
      );
    } else {
      if (sortedMedia.some((m) => m.fileType === "video")) {
        console.warn(
          `[publish] Post ${postId} có video nhưng không có file video hợp lệ ở sortOrder đầu — đăng text-only.`
        );
      }
      result = await publishPost(token, fbPage.pageId, p.content);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await markPostPageFailed(postId, facebookPageId, msg);
    await refreshPostAggregateStatus(postId);
    return { success: false, error: msg };
  }

  if (result.success) {
    let commentWarning: string | null = null;
    const firstComment = p.firstComment?.trim();

    if (firstComment && result.fbPostId) {
      await new Promise((r) => setTimeout(r, 2000));

      let tokenScopes: string[] | null = null;
      if (fbPage.workspaceAppId) {
        try {
          const creds = await getFacebookCredentials(
            fbPage.workspaceAppId,
            p.userId
          );
          const debug = await debugAccessToken(token, creds);
          tokenScopes = debug.scopes;
          if (!tokenHasScope(debug, "pages_manage_engagement")) {
            console.warn(
              `[publish] Page token thiếu pages_manage_engagement trong debug_token. scopes=`,
              debug.scopes
            );
          }
        } catch (e) {
          console.warn("[publish] debug_token trước comment:", e);
        }
      }

      const commentResult = await publishPostComment(
        token,
        result.fbPostId,
        firstComment,
        { tokenScopes }
      );
      if (!commentResult.success) {
        commentWarning = `Bài đã đăng; bình luận đầu thất bại: ${commentResult.error || "Unknown"}`;
        if (commentResult.tokenExpired) {
          await db
            .update(facebookPage)
            .set({ tokenStatus: "expired" })
            .where(eq(facebookPage.id, facebookPageId));
        }
        console.warn(`[publish] Comment failed for post ${postId}:`, commentResult.error);
      }
    }

    await markPostPagePublished(postId, facebookPageId, result.fbPostId || null);
    await refreshPostAggregateStatus(postId);
    if (commentWarning) {
      await db
        .update(post)
        .set({ errorMessage: commentWarning })
        .where(eq(post.id, postId));
      return { ...result, error: commentWarning };
    }
  } else {
    if (result.tokenExpired) {
      await db
        .update(facebookPage)
        .set({ tokenStatus: "expired" })
        .where(eq(facebookPage.id, facebookPageId));
    }
    await markPostPageFailed(
      postId,
      facebookPageId,
      result.error || "Unknown error"
    );
    await refreshPostAggregateStatus(postId);
  }

  return result;
}
