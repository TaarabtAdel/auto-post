import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomBytes } from "crypto";

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime"];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

function getFileExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
  };
  return map[mimeType] || "bin";
}

/**
 * POST /api/uploads — upload a media file
 * Accepts multipart form data with a 'file' field.
 * Returns file metadata including the serve path.
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
        error: `Loại file không hỗ trợ: ${file.type}. Chấp nhận: ảnh (JPEG, PNG, GIF, WebP) và video (MP4, MOV).`,
      },
      { status: 400 }
    );
  }

  // Validate size
  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);
  const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
  if (file.size > maxSize) {
    const maxMB = maxSize / (1024 * 1024);
    return NextResponse.json(
      { error: `File quá lớn. Giới hạn: ${maxMB}MB.` },
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
    fileType: isVideo ? "video" : "image",
    url: `/api/uploads/${relativePath}`,
  });
}
