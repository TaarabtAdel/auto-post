import { existsSync } from "fs";
import { mkdir, readdir, stat, unlink } from "fs/promises";
import { join, normalize, relative } from "path";

/** Thư mục gốc trong `uploads/` — ảnh nền / video / reel tách riêng trên VPS. */
export const UPLOAD_BUCKETS = {
  backgrounds: "backgrounds",
  videos: "videos",
  reels: "reels",
  audio: "audio",
  images: "images",
} as const;

export type UploadBucket = (typeof UPLOAD_BUCKETS)[keyof typeof UPLOAD_BUCKETS];

const BUCKET_SET = new Set<string>(Object.values(UPLOAD_BUCKETS));

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

export function uploadsRoot(): string {
  return join(process.cwd(), "uploads");
}

export function bucketRootDir(bucket: UploadBucket): string {
  return join(uploadsRoot(), bucket);
}

/** `backgrounds/{userId}/…` */
export function userBucketDir(userId: string, bucket: UploadBucket): string {
  return join(bucketRootDir(bucket), userId);
}

/** Đường dẫn lưu DB / API. */
export function uploadRelativePath(
  bucket: UploadBucket,
  userId: string,
  fileName: string
): string {
  return `${bucket}/${userId}/${fileName}`;
}

export function parseUploadBucket(raw: string | null | undefined): UploadBucket | null {
  if (!raw?.trim()) return null;
  const v = raw.trim().toLowerCase();
  if (v === "background" || v === "backgrounds") return UPLOAD_BUCKETS.backgrounds;
  if (v === "video" || v === "videos") return UPLOAD_BUCKETS.videos;
  if (v === "reel" || v === "reels") return UPLOAD_BUCKETS.reels;
  if (v === "audio") return UPLOAD_BUCKETS.audio;
  if (v === "image" || v === "images") return UPLOAD_BUCKETS.images;
  return null;
}

export function inferBucketFromMime(
  mimeType: string,
  explicit: UploadBucket | null
): UploadBucket {
  if (explicit) return explicit;
  if (mimeType.startsWith("video/")) return UPLOAD_BUCKETS.videos;
  if (mimeType.startsWith("audio/")) return UPLOAD_BUCKETS.audio;
  if (mimeType.startsWith("image/")) return UPLOAD_BUCKETS.images;
  return UPLOAD_BUCKETS.images;
}

export function isImageFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return [...IMAGE_EXT].some((ext) => lower.endsWith(ext));
}

/** Tạo các thư mục bucket gốc (có .gitkeep trên git). */
export async function ensureUploadBucketRoots(): Promise<void> {
  for (const bucket of Object.values(UPLOAD_BUCKETS)) {
    await mkdir(bucketRootDir(bucket), { recursive: true });
  }
  await mkdir(join(uploadsRoot(), "tmp-reel"), { recursive: true });
}

export async function ensureUserBucket(userId: string, bucket: UploadBucket): Promise<string> {
  await ensureUploadBucketRoots();
  const dir = userBucketDir(userId, bucket);
  await mkdir(dir, { recursive: true });
  return dir;
}

function normalizeStoredPath(filePath: string): string {
  return filePath
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^uploads\//, "")
    .replace(/\/+/g, "/");
}

/** User id trong path lưu DB: `{bucket}/{userId}/…` hoặc legacy `{userId}/…`. */
export function ownerUserIdFromUploadPath(rel: string): string | null {
  const cleaned = normalizeStoredPath(rel);
  if (!cleaned || cleaned.includes("..")) return null;
  const first = cleaned.split("/")[0] ?? "";
  if (BUCKET_SET.has(first)) {
    const parts = cleaned.split("/");
    if (parts.length < 3) return null;
    return parts[1] || null;
  }
  const slash = cleaned.indexOf("/");
  if (slash === -1) return null;
  return cleaned.slice(0, slash) || null;
}

/** Legacy: `{userId}/…` — mới: `{bucket}/{userId}/…` */
export function isOwnedUploadPath(userId: string, rel: string): boolean {
  const cleaned = normalizeStoredPath(rel);
  if (cleaned.includes("..")) return false;
  for (const bucket of BUCKET_SET) {
    if (cleaned.startsWith(`${bucket}/${userId}/`)) return true;
  }
  if (cleaned.startsWith(`${userId}/`)) return true;
  return false;
}

export function resolveOwnedUploadAbsPath(userId: string, rel: string): string {
  const cleaned = normalizeStoredPath(rel);
  if (!isOwnedUploadPath(userId, cleaned)) {
    throw new Error("File không thuộc tài khoản này.");
  }
  const abs = normalize(join(uploadsRoot(), cleaned));
  const relFromRoot = relative(uploadsRoot(), abs);
  if (relFromRoot.startsWith("..") || relFromRoot.includes("..")) {
    throw new Error("Đường dẫn file không hợp lệ.");
  }
  if (!existsSync(abs)) {
    throw new Error("Không tìm thấy file media. Hãy tải lên lại.");
  }
  return abs;
}

export type ListedUploadFile = {
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  mtime: number;
};

function guessImageMime(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

async function listImagesInDir(
  absDir: string,
  pathPrefix: string
): Promise<ListedUploadFile[]> {
  if (!existsSync(absDir)) return [];
  const names = await readdir(absDir);
  const rows: ListedUploadFile[] = [];
  for (const fileName of names) {
    if (!isImageFileName(fileName)) continue;
    const abs = join(absDir, fileName);
    try {
      const st = await stat(abs);
      if (!st.isFile()) continue;
      rows.push({
        filePath: `${pathPrefix}/${fileName}`.replace(/\/+/g, "/"),
        fileName,
        fileSize: st.size,
        mimeType: guessImageMime(fileName),
        mtime: st.mtimeMs,
      });
    } catch {
      // skip
    }
  }
  return rows;
}

/** Ảnh nền: `backgrounds/{userId}/` + legacy. */
export async function listUserBackgroundImages(userId: string): Promise<ListedUploadFile[]> {
  const [fromNew, fromLegacyBucket, fromLegacyRoot] = await Promise.all([
    listImagesInDir(
      userBucketDir(userId, UPLOAD_BUCKETS.backgrounds),
      `${UPLOAD_BUCKETS.backgrounds}/${userId}`
    ),
    listImagesInDir(
      join(uploadsRoot(), userId, UPLOAD_BUCKETS.backgrounds),
      `${userId}/${UPLOAD_BUCKETS.backgrounds}`
    ),
    listImagesInDir(join(uploadsRoot(), userId), userId),
  ]);
  const seen = new Set<string>();
  return [...fromNew, ...fromLegacyBucket, ...fromLegacyRoot]
    .filter((f) => {
      if (seen.has(f.filePath)) return false;
      seen.add(f.filePath);
      return true;
    })
    .sort((a, b) => b.mtime - a.mtime);
}

export function isUserBackgroundPath(userId: string, rel: string): boolean {
  const cleaned = normalizeStoredPath(rel);
  if (!isOwnedUploadPath(userId, cleaned)) return false;
  if (cleaned.startsWith(`${UPLOAD_BUCKETS.backgrounds}/${userId}/`)) return true;
  if (cleaned.startsWith(`${userId}/${UPLOAD_BUCKETS.backgrounds}/`)) return true;
  const rest = cleaned.startsWith(`${userId}/`)
    ? cleaned.slice(`${userId}/`.length)
    : cleaned;
  if (!rest.includes("/") && isImageFileName(rest)) return true;
  return false;
}

export async function deleteUserBackgroundFile(userId: string, rel: string): Promise<void> {
  if (!isUserBackgroundPath(userId, rel)) {
    throw new Error("Chỉ xóa được ảnh nền thuộc tài khoản này.");
  }
  const cleaned = normalizeStoredPath(rel);
  const abs = join(uploadsRoot(), cleaned);
  if (!existsSync(abs)) {
    throw new Error("File không tồn tại.");
  }
  await unlink(abs);
}
