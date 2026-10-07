import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { parseDriveUrl, fetchDriveContent, fetchDriveMedia } from "@/lib/gdrive";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomBytes } from "crypto";
import { uploadMediaPublicUrl } from "@/lib/upload-media-url";

/**
 * POST /api/import/gdrive — import content or media from a Google Drive URL
 * Body: { url: string, type?: "text" | "media" }
 *   type="text" (default): import text content from Docs/Sheets/text files
 *   type="media": download image/video/PDF and save to uploads
 * Returns:
 *   text: { content: string }
 *   media: { filePath, fileName, fileSize, mimeType, fileType, url }
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { url?: string; type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { url, type = "text" } = body;
  if (!url || typeof url !== "string" || url.trim().length === 0) {
    return NextResponse.json(
      { error: "URL là bắt buộc." },
      { status: 400 }
    );
  }

  // Only allow Google Drive URLs
  const trimmedUrl = url.trim();
  if (!trimmedUrl.startsWith("https://docs.google.com/") && 
      !trimmedUrl.startsWith("https://drive.google.com/")) {
    return NextResponse.json(
      { error: "Chỉ hỗ trợ URL từ Google Drive (docs.google.com hoặc drive.google.com)." },
      { status: 400 }
    );
  }

  const fileId = parseDriveUrl(trimmedUrl);
  if (!fileId) {
    return NextResponse.json(
      {
        error:
          "URL không hợp lệ. Hỗ trợ: Google Docs, Google Sheets, Google Drive file links.",
      },
      { status: 400 }
    );
  }

  try {
    if (type === "media") {
      // Download media file from Drive
      const media = await fetchDriveMedia(fileId);

      // Save to uploads directory
      const timestamp = Date.now();
      const random = randomBytes(8).toString("hex");
      const fileName = `${timestamp}-${random}.${media.ext}`;
      const userDir = join(process.cwd(), "uploads", session.user.id);
      const filePath = join(userDir, fileName);
      const relativePath = `${session.user.id}/${fileName}`;

      await mkdir(userDir, { recursive: true });
      await writeFile(filePath, media.buffer);

      return NextResponse.json({
        filePath: relativePath,
        fileName: `gdrive-${fileId}.${media.ext}`,
        fileSize: media.size,
        mimeType: media.mimeType,
        fileType: media.fileType,
        url: uploadMediaPublicUrl(relativePath),
      });
    }

    // Default: text import
    const content = await fetchDriveContent(fileId, url.trim());
    return NextResponse.json({ content });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Không thể tải nội dung.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
