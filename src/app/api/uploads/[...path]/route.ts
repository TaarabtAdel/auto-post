import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { resolve, normalize } from "path";
import { normalizeUploadRelativePath } from "@/lib/upload-media-url";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  pdf: "application/pdf",
};

type Params = { params: Promise<{ path: string[] }> };

/**
 * GET /api/uploads/[...path] — serve uploaded files
 * Auth required: user can only access their own files.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const { path: pathSegments } = await params;

  if (!pathSegments || pathSegments.length < 2) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Auth check
  const session = await getAppSession({
    headers: await headers(),
  });

  // Ownership check: first segment must be the user's ID
  const requestedUserId = pathSegments[0];
  if (requestedUserId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Path traversal protection: resolve and validate
  const uploadsDir = resolve(process.cwd(), "uploads");
  const requestedPath = normalize(
    normalizeUploadRelativePath(pathSegments.join("/"))
  );
  const filePath = resolve(uploadsDir, requestedPath);

  // Ensure resolved path is within uploads directory
  if (!filePath.startsWith(uploadsDir)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await stat(filePath);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  const buffer = await readFile(filePath);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
