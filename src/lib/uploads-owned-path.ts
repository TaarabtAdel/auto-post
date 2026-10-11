import { resolveOwnedUploadAbsPath } from "@/lib/upload-storage";

/** @deprecated Dùng resolveOwnedUploadAbsPath */
export function resolveOwnedUploadPath(userId: string, rel: string): string {
  return resolveOwnedUploadAbsPath(userId, rel);
}
