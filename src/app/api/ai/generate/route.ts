import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { generatePostContent } from "@/lib/ai";

// Simple in-memory rate limit: max 10 requests per minute per user
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (entry.count >= 10) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * POST /api/ai/generate — generate Facebook post content using AI
 * Body: { url?: string, topic?: string, tone?: string, customPrompt?: string }
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!checkRateLimit(session.user.id)) {
    return NextResponse.json(
      { error: "Quá nhiều yêu cầu. Vui lòng chờ 1 phút." },
      { status: 429 }
    );
  }

  let body: {
    url?: string;
    topic?: string;
    tone?: string;
    customPrompt?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { url, topic, tone, customPrompt } = body;

  if (!url && !topic && !customPrompt) {
    return NextResponse.json(
      { error: "Vui lòng nhập URL, chủ đề, hoặc yêu cầu." },
      { status: 400 }
    );
  }

  try {
    const result = await generatePostContent({ url, topic, tone, customPrompt });

    return NextResponse.json({
      content: result.content,
      tokensUsed: result.tokensUsed,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Lỗi không xác định.";
    console.error("[AI generate]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
