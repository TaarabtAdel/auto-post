import { unlink } from "fs/promises";
import { uploadMediaFsPath } from "@/lib/upload-media-url";
import { db } from "@/lib/db";
import { postMedia } from "@/db/schema/post";
import { eq, and, ne } from "drizzle-orm";

/** Chỉ xóa file upload nếu không còn post_media nào khác trỏ tới (batch dùng chung ảnh). */
export async function deleteMediaFilesForPost(postId: string): Promise<void> {
  const media = await db
    .select({ filePath: postMedia.filePath })
    .from(postMedia)
    .where(eq(postMedia.postId, postId));

  for (const m of media) {
    const shared = await db
      .select({ id: postMedia.id })
      .from(postMedia)
      .where(
        and(eq(postMedia.filePath, m.filePath), ne(postMedia.postId, postId))
      )
      .limit(1);

    if (shared.length > 0) continue;

    try {
      await unlink(uploadMediaFsPath(process.cwd(), m.filePath));
    } catch {
      /* ignore */
    }
  }
}
