import { NextRequest, NextResponse } from "next/server";
import { apiUnauthorized } from "@/lib/api-unauthorized";
import { readFile, stat } from "fs/promises";
import { resolve, relative } from "path";
import { normalizeUploadRelativePath } from "@/lib/upload-media-url";
import { getAppSession } from "@/lib/app-session";
import {
  isOwnedUploadPath,
  ownerUserIdFromUploadPath,
} from "@/lib/upload-storage";
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

  if (!pathSegments?.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await getAppSession({
    headers: await headers(),
  });
  if (!session) return apiUnauthorized();

  const requestedPath = normalizeUploadRelativePath(pathSegments.join("/"));
  if (!requestedPath || requestedPath.includes("..")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ownerId = ownerUserIdFromUploadPath(requestedPath);
  if (!ownerId || ownerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isOwnedUploadPath(session.user.id, requestedPath)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const uploadsDir = resolve(process.cwd(), "uploads");
  const filePath = resolve(uploadsDir, ...requestedPath.split("/"));

  const relFromRoot = relative(uploadsDir, filePath);
  if (relFromRoot.startsWith("..") || relFromRoot.includes("..")) {
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
