import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import {
  getPublishPageIntervalMinutes,
  setPublishPageIntervalMinutes,
} from "@/lib/publish-settings";

export async function GET() {
  await getAppSession({ headers: await headers() });
  return NextResponse.json({
    pageIntervalMinutes: getPublishPageIntervalMinutes(),
  });
}

export async function PATCH(request: NextRequest) {
  await getAppSession({ headers: await headers() });

  let body: { pageIntervalMinutes?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (typeof body.pageIntervalMinutes !== "number") {
    return NextResponse.json(
      { error: "pageIntervalMinutes phải là số." },
      { status: 400 }
    );
  }

  const pageIntervalMinutes = setPublishPageIntervalMinutes(body.pageIntervalMinutes);
  return NextResponse.json({ pageIntervalMinutes });
}
