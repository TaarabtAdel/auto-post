import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { apiUnauthorized } from "@/lib/api-unauthorized";
import { headers } from "next/headers";
import {
  querySystemLogs,
  type SystemLogCategory,
} from "@/lib/system-log";

const CATEGORIES = new Set<SystemLogCategory | "all">([
  "all",
  "auto",
  "cron",
  "publish",
]);

export async function GET(request: NextRequest) {
  const session = await getAppSession({ headers: await headers() });
  if (!session) return apiUnauthorized();

  const sp = request.nextUrl.searchParams;
  const limitRaw = Number(sp.get("limit") ?? "200");
  const categoryRaw = sp.get("category") ?? "all";
  const category = CATEGORIES.has(categoryRaw as SystemLogCategory | "all")
    ? (categoryRaw as SystemLogCategory | "all")
    : "all";
  const campaignId = sp.get("campaignId")?.trim() || undefined;

  const logs = querySystemLogs({
    limit: Number.isFinite(limitRaw) ? limitRaw : 200,
    category,
    campaignId,
  });

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      createdAt: new Date(l.createdAt).toISOString(),
      createdAtLabel: new Date(l.createdAt).toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour12: false,
      }),
      level: l.level,
      category: l.category,
      message: l.message,
      detail: l.detail,
    })),
  });
}
