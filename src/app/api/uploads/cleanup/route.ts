import { NextRequest, NextResponse } from "next/server";
import { apiUnauthorized } from "@/lib/api-unauthorized";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import {
  formatBytes,
  getCleanupStats,
  parseCleanupTargets,
  runCleanup,
} from "@/lib/upload-cleanup";

export async function GET() {
  const session = await getAppSession({ headers: await headers() });
  if (!session) return apiUnauthorized();
  const targets = await getCleanupStats(session.user.id);
  const totalFiles = targets.reduce((s, t) => s + t.fileCount, 0);
  const totalBytes = targets.reduce((s, t) => s + t.totalBytes, 0);
  return NextResponse.json({
    targets,
    totalFiles,
    totalBytes,
    totalBytesLabel: formatBytes(totalBytes),
  });
}

export async function POST(request: NextRequest) {
  const session = await getAppSession({ headers: await headers() });
  if (!session) return apiUnauthorized();

  let body: { targets?: unknown; confirm?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (body.confirm !== true) {
    return NextResponse.json(
      { error: "Cần xác nhận (confirm: true) trước khi xóa." },
      { status: 400 }
    );
  }

  const targets = parseCleanupTargets(body.targets);
  if (targets.length === 0) {
    return NextResponse.json(
      { error: "Chọn ít nhất một mục cần dọn." },
      { status: 400 }
    );
  }

  const result = await runCleanup(session.user.id, targets);
  const stats = await getCleanupStats(session.user.id);

  return NextResponse.json({
    ok: true,
    removedFiles: result.removedFiles,
    cleaned: result.targets,
    targets: stats,
  });
}
