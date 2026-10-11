import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import {
  deleteUserBackgroundFile,
  listUserBackgroundImages,
} from "@/lib/upload-storage";
import { uploadMediaPublicUrl } from "@/lib/upload-media-url";

export async function GET() {
  const session = await getAppSession({ headers: await headers() });
  const files = await listUserBackgroundImages(session.user.id);
  return NextResponse.json({
    backgrounds: files.map((f) => ({
      ...f,
      url: uploadMediaPublicUrl(f.filePath),
    })),
  });
}

export async function DELETE(request: NextRequest) {
  const session = await getAppSession({ headers: await headers() });

  let body: { filePath?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const filePath = body.filePath?.trim();
  if (!filePath) {
    return NextResponse.json({ error: "Thiếu filePath." }, { status: 400 });
  }

  try {
    await deleteUserBackgroundFile(session.user.id, filePath);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Không xóa được.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
