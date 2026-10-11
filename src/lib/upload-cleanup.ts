import { existsSync } from "fs";
import { mkdir, readdir, rm, stat, unlink } from "fs/promises";
import { join } from "path";
import {
  UPLOAD_BUCKETS,
  type UploadBucket,
  uploadsRoot,
  userBucketDir,
} from "@/lib/upload-storage";

export type CleanupTargetId = UploadBucket | "legacy" | "tmp-reel";

export type CleanupTargetStat = {
  id: CleanupTargetId;
  label: string;
  description: string;
  fileCount: number;
  totalBytes: number;
};

const TARGET_META: Record<
  CleanupTargetId,
  { label: string; description: string }
> = {
  backgrounds: {
    label: "Ảnh nền",
    description: "uploads/backgrounds/{user}/",
  },
  videos: {
    label: "Video",
    description: "uploads/videos/{user}/",
  },
  reels: {
    label: "Reel đã render",
    description: "uploads/reels/{user}/",
  },
  audio: {
    label: "Nhạc",
    description: "uploads/audio/{user}/",
  },
  images: {
    label: "Ảnh bài post",
    description: "uploads/images/{user}/",
  },
  legacy: {
    label: "File layout cũ",
    description: "uploads/{user}/ (trước khi tách bucket)",
  },
  "tmp-reel": {
    label: "FFmpeg tạm",
    description: "uploads/tmp-reel/ (toàn máy)",
  },
};

async function walkFileStats(absDir: string): Promise<{ fileCount: number; totalBytes: number }> {
  if (!existsSync(absDir)) return { fileCount: 0, totalBytes: 0 };

  let fileCount = 0;
  let totalBytes = 0;

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".gitkeep") continue;
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(p);
      } else if (entry.isFile()) {
        const st = await stat(p);
        fileCount += 1;
        totalBytes += st.size;
      }
    }
  }

  await walk(absDir);
  return { fileCount, totalBytes };
}

async function clearDirectoryContents(absDir: string): Promise<number> {
  if (!existsSync(absDir)) return 0;
  let removed = 0;
  const entries = await readdir(absDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".gitkeep") continue;
    const p = join(absDir, entry.name);
    if (entry.isDirectory()) {
      const sub = await walkFileStats(p);
      removed += sub.fileCount;
      await rm(p, { recursive: true, force: true });
    } else if (entry.isFile()) {
      await unlink(p);
      removed += 1;
    }
  }
  return removed;
}

function legacyUserRoot(userId: string): string {
  return join(uploadsRoot(), userId);
}

function tmpReelRoot(): string {
  return join(uploadsRoot(), "tmp-reel");
}

export async function getCleanupStats(userId: string): Promise<CleanupTargetStat[]> {
  const bucketIds = Object.values(UPLOAD_BUCKETS) as UploadBucket[];
  const stats: CleanupTargetStat[] = [];

  for (const id of bucketIds) {
    const meta = TARGET_META[id];
    const { fileCount, totalBytes } = await walkFileStats(userBucketDir(userId, id));
    stats.push({ id, label: meta.label, description: meta.description, fileCount, totalBytes });
  }

  const legacyMeta = TARGET_META.legacy;
  const legacy = await walkFileStats(legacyUserRoot(userId));
  stats.push({
    id: "legacy",
    label: legacyMeta.label,
    description: legacyMeta.description,
    fileCount: legacy.fileCount,
    totalBytes: legacy.totalBytes,
  });

  const tmpMeta = TARGET_META["tmp-reel"];
  const tmp = await walkFileStats(tmpReelRoot());
  stats.push({
    id: "tmp-reel",
    label: tmpMeta.label,
    description: tmpMeta.description,
    fileCount: tmp.fileCount,
    totalBytes: tmp.totalBytes,
  });

  return stats;
}

const ALLOWED_TARGETS = new Set<CleanupTargetId>([
  ...Object.values(UPLOAD_BUCKETS),
  "legacy",
  "tmp-reel",
]);

export function parseCleanupTargets(raw: unknown): CleanupTargetId[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is CleanupTargetId => typeof id === "string" && ALLOWED_TARGETS.has(id as CleanupTargetId));
}

export async function runCleanup(
  userId: string,
  targets: CleanupTargetId[]
): Promise<{ removedFiles: number; targets: CleanupTargetId[] }> {
  const unique = [...new Set(targets)];
  let removedFiles = 0;

  for (const id of unique) {
    if (id === "legacy") {
      removedFiles += await clearDirectoryContents(legacyUserRoot(userId));
      continue;
    }
    if (id === "tmp-reel") {
      const root = tmpReelRoot();
      if (!existsSync(root)) continue;
      const entries = await readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === ".gitkeep") continue;
        const p = join(root, entry.name);
        if (entry.isDirectory()) {
          const sub = await walkFileStats(p);
          removedFiles += sub.fileCount;
          await rm(p, { recursive: true, force: true });
        } else if (entry.isFile()) {
          await unlink(p);
          removedFiles += 1;
        }
      }
      await mkdir(root, { recursive: true });
      continue;
    }
    const dir = userBucketDir(userId, id);
    removedFiles += await clearDirectoryContents(dir);
    await mkdir(dir, { recursive: true });
  }

  return { removedFiles, targets: unique };
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  let n = bytes;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u += 1;
  }
  return `${n >= 10 || u === 0 ? n.toFixed(u === 0 ? 0 : 1) : n.toFixed(2)} ${units[u]}`;
}
