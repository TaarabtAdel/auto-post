import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { parseDriveUrl, fetchDriveContent } from "@/lib/gdrive";

/**
 * POST /api/import/gdrive — import content from a Google Drive URL
 * Body: { url: string }
 * Returns: { content: string }
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { url } = body;
  if (!url || typeof url !== "string" || url.trim().length === 0) {
    return NextResponse.json(
      { error: "URL là bắt buộc." },
      { status: 400 }
    );
  }

  const fileId = parseDriveUrl(url.trim());
  if (!fileId) {
    return NextResponse.json(
      {
        error:
          "URL không hợp lệ. Hỗ trợ: Google Docs, Google Sheets, Google Drive file links.",
      },
      { status: 400 }
    );
  }

  try {
    const content = await fetchDriveContent(fileId, url.trim());
    return NextResponse.json({ content });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Không thể tải nội dung.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
