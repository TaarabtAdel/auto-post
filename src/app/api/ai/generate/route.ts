import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { generatePostContent, downloadImage } from "@/lib/ai";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomBytes } from "crypto";
import { aiLimiter, checkRateLimit as checkLimit } from "@/lib/rate-limit";
import { uploadMediaPublicUrl } from "@/lib/upload-media-url";

/**
 * POST /api/ai/generate — generate Facebook post content using AI
 * Body: { url?: string, topic?: string, tone?: string, customPrompt?: string }
 * Returns: { content: string, images?: MediaFile[], tokensUsed?: number }
 */
export async function POST(request: NextRequest) {
  const session = await getAppSession({
    headers: await headers(),
  });

  // Rate limit: 10 AI requests / min / user
  const limited = checkLimit(aiLimiter, session.user.id);
  if (limited) return limited;

  let body: {
    url?: string;
    topic?: string;
    tone?: string;
    customPrompt?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { url, topic, tone, customPrompt } = body;

  if (!url && !topic && !customPrompt) {
    return NextResponse.json(
      { error: "Vui lòng nhập URL, chủ đề, hoặc yêu cầu." },
      { status: 400 }
    );
  }

  try {
    const result = await generatePostContent({ url, topic, tone, customPrompt });

    // If URL mode returned images, download and save them
    const savedImages: Array<{
      filePath: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      fileType: string;
      url: string;
    }> = [];

    if (result.images && result.images.length > 0) {
      const userDir = join(process.cwd(), "uploads", session.user.id);
      await mkdir(userDir, { recursive: true });

      // Download up to 3 images in parallel
      const downloadPromises = result.images.slice(0, 3).map(async (imgUrl) => {
        try {
          const img = await downloadImage(imgUrl);
          if (!img) return null;

          const timestamp = Date.now();
          const random = randomBytes(8).toString("hex");
          const fileName = `${timestamp}-${random}.${img.ext}`;
          const filePath = join(userDir, fileName);
          const relativePath = `${session.user.id}/${fileName}`;

          await writeFile(filePath, img.buffer);

          return {
            filePath: relativePath,
            fileName: `ai-extract-${random}.${img.ext}`,
            fileSize: img.buffer.length,
            mimeType: img.mimeType,
            fileType: "image" as const,
            url: uploadMediaPublicUrl(relativePath),
          };
        } catch {
          return null;
        }
      });

      const results = await Promise.all(downloadPromises);
      for (const r of results) {
        if (r) savedImages.push(r);
      }
    }

    return NextResponse.json({
      content: result.content,
      images: savedImages.length > 0 ? savedImages : undefined,
      tokensUsed: result.tokensUsed,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Lỗi không xác định.";
    console.error("[AI generate]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
