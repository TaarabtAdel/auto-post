import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { join } from "path";

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

type Params = { params: Promise<{ path: string[] }> };

/**
 * GET /api/uploads/[...path] — serve uploaded files
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const { path: pathSegments } = await params;

  if (!pathSegments || pathSegments.length < 2) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Sanitize: prevent directory traversal
  const safePath = pathSegments.join("/").replace(/\.\./g, "");
  const filePath = join(process.cwd(), "uploads", safePath);

  try {
    await stat(filePath);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ext = safePath.split(".").pop()?.toLowerCase() || "";
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  const buffer = await readFile(filePath);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
