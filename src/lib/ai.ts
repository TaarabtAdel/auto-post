const AI_TIMEOUT = 60_000; // 60s

function getAiConfig() {
  const baseUrl = (process.env.AI_API_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  return {
    baseUrl,
    apiKey: process.env.AI_API_KEY || "",
    model: process.env.AI_MODEL || "gpt-4o-mini",
  };
}

const SYSTEM_PROMPT = `Bạn là chuyên gia viết nội dung Facebook. Nhiệm vụ: viết bài đăng Facebook hấp dẫn, thu hút tương tác.

Quy tắc:
- Viết bằng tiếng Việt (trừ khi user yêu cầu khác)
- Ngắn gọn, dễ đọc trên mobile (tối đa 500 từ)
- Có emoji phù hợp nhưng không quá nhiều
- Có call-to-action (like, share, comment)
- Chia đoạn rõ ràng, dùng line break
- KHÔNG dùng hashtag trừ khi user yêu cầu
- KHÔNG thêm link trừ khi user cung cấp
- Chỉ trả về nội dung bài viết, KHÔNG thêm giải thích hay ghi chú`;

interface GenerateInput {
  url?: string;
  topic?: string;
  tone?: string;
  customPrompt?: string;
}

interface AIResponse {
  content: string;
  tokensUsed?: number;
}

/**
 * Fetch and extract text content from a URL.
 * Basic extraction — strips HTML, takes first ~3000 chars.
 */
async function fetchUrlContent(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AutoPost/1.0)",
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const html = await res.text();

    // Basic HTML → text extraction
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();

    // Truncate to ~3000 chars to stay within context limit
    if (text.length > 3000) {
      text = text.slice(0, 3000) + "...";
    }

    return text;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Generate Facebook post content using AI.
 */
export async function generatePostContent(input: GenerateInput): Promise<AIResponse> {
  const config = getAiConfig();

  if (!config.apiKey) {
    throw new Error("AI_API_KEY chưa được cấu hình.");
  }

  let userMessage = "";

  if (input.url) {
    // Fetch URL content first
    let urlContent: string;
    try {
      urlContent = await fetchUrlContent(input.url);
    } catch (err) {
      throw new Error(`Không thể tải nội dung từ URL: ${err instanceof Error ? err.message : "Unknown error"}`);
    }

    userMessage = `Viết bài đăng Facebook dựa trên nội dung sau:\n\nURL: ${input.url}\n\nNội dung:\n${urlContent}`;
  } else if (input.topic) {
    userMessage = `Viết bài đăng Facebook về chủ đề: ${input.topic}`;
  } else if (input.customPrompt) {
    userMessage = input.customPrompt;
  } else {
    throw new Error("Cần cung cấp URL, topic, hoặc custom prompt.");
  }

  // Add tone instruction
  if (input.tone) {
    const toneMap: Record<string, string> = {
      professional: "Giọng văn chuyên nghiệp, uy tín",
      friendly: "Giọng văn thân thiện, gần gũi",
      humorous: "Giọng văn hài hước, vui nhộn",
      inspiring: "Giọng văn truyền cảm hứng, tích cực",
      storytelling: "Viết theo dạng kể chuyện, hấp dẫn",
    };
    const toneDesc = toneMap[input.tone] || input.tone;
    userMessage += `\n\nYêu cầu giọng văn: ${toneDesc}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT);

  try {
    const apiUrl = `${config.baseUrl}/chat/completions`;
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
      signal: controller.signal,
    });

    // Check if response is JSON before parsing
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json") && !contentType.includes("text/json")) {
      const text = await res.text();
      throw new Error(`AI API trả về lỗi (HTTP ${res.status}). Response không phải JSON. Chi tiết: ${text.slice(0, 200)}`);
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(
        errorData?.error?.message || `AI API lỗi HTTP ${res.status}`
      );
    }

    const data = await res.json();

    if (data.error) {
      throw new Error(data.error.message || "AI API error");
    }

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("AI không trả về nội dung.");
    }

    return {
      content,
      tokensUsed: data.usage?.total_tokens,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("AI API timeout — vui lòng thử lại.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
