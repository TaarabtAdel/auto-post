import { NextRequest, NextResponse } from "next/server";
import { apiUnauthorized } from "@/lib/api-unauthorized";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import {
  createPageCategory,
  listPageCategories,
} from "@/lib/page-categories";

export async function GET() {
  const session = await getAppSession({ headers: await headers() });
  if (!session) return apiUnauthorized();
  const categories = await listPageCategories(session.user.id);
  return NextResponse.json({ categories });
}

export async function POST(request: NextRequest) {
  const session = await getAppSession({ headers: await headers() });
  if (!session) return apiUnauthorized();

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const result = await createPageCategory(session.user.id, body.name ?? "");
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    category: {
      id: result.id,
      name: result.name,
      sortOrder: result.sortOrder,
      pageCount: 0,
    },
  });
}
