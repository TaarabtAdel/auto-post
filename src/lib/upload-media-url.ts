import { join } from "path";

/**
 * Path stored in DB: relative to project `uploads/` (e.g. userId/file.mp4).
 * Tolerates legacy values with uploads/ or /api/uploads/ prefix.
 */
export function normalizeUploadRelativePath(filePath: string): string {
  let p = filePath.trim().replace(/^\/+/, "");
  if (p.startsWith("api/uploads/")) {
    p = p.slice("api/uploads/".length);
  } else if (p.startsWith("uploads/")) {
    p = p.slice("uploads/".length);
  }
  return p;
}

/** Authenticated URL to stream a file (GET /api/uploads/...). */
export function uploadMediaPublicUrl(filePath: string): string {
  return `/api/uploads/${normalizeUploadRelativePath(filePath)}`;
}

/** Absolute filesystem path for publish / cleanup. */
export function uploadMediaFsPath(cwd: string, filePath: string): string {
  return join(cwd, "uploads", normalizeUploadRelativePath(filePath));
}
