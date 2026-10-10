import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomBytes } from "crypto";
import { uploadLimiter, checkRateLimit } from "@/lib/rate-limit";
import { uploadMediaPublicUrl } from "@/lib/upload-media-url";

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime"];
const ALLOWED_AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
  "audio/mp4",
  "audio/m4a",
];
const ALLOWED_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_VIDEO_TYPES,
  ...ALLOWED_AUDIO_TYPES,
];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 1024 * 1024 * 1024; // 1GB

function getFileExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/aac": "aac",
    "audio/mp4": "m4a",
    "audio/m4a": "m4a",
  };
  return map[mimeType] || "bin";
}

/**
 * POST /api/uploads — upload a media file
 * Accepts multipart form data with a 'file' field.
 * Returns file metadata including the serve path.
 */
export async function POST(request: NextRequest) {
  const session = await getAppSession({
    headers: await headers(),
  });

  // Rate limit: 20 uploads / min / user
  const limited = checkRateLimit(uploadLimiter, session.user.id);
  if (limited) return limited;

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data" },
      { status: 400 }
    );
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json(
      { error: "File là bắt buộc." },
      { status: 400 }
    );
  }

  // Validate type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      {
        error: `Loại file không hỗ trợ: ${file.type}. Chấp nhận: ảnh, video (MP4, MOV) và nhạc (MP3, WAV, AAC).`,
      },
      { status: 400 }
    );
  }

  // Validate size
  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);
  const isAudio = ALLOWED_AUDIO_TYPES.includes(file.type);
  const maxSize = isVideo || isAudio ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
  if (file.size > maxSize) {
    const maxLabel =
      maxSize >= 1024 * 1024 * 1024
        ? `${maxSize / (1024 * 1024 * 1024)}GB`
        : `${maxSize / (1024 * 1024)}MB`;
    return NextResponse.json(
      { error: `File quá lớn. Giới hạn: ${maxLabel}.` },
      { status: 400 }
    );
  }

  // Generate unique filename
  const ext = getFileExtension(file.type);
  const timestamp = Date.now();
  const random = randomBytes(8).toString("hex");
  const fileName = `${timestamp}-${random}.${ext}`;
  const userDir = join(process.cwd(), "uploads", session.user.id);
  const filePath = join(userDir, fileName);
  const relativePath = `${session.user.id}/${fileName}`;

  // Ensure directory exists
  await mkdir(userDir, { recursive: true });

  // Write file
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  return NextResponse.json({
    filePath: relativePath,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
    fileType: isVideo ? "video" : isAudio ? "audio" : "image",
    url: uploadMediaPublicUrl(relativePath),
  });
}
