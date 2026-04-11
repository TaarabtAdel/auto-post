const AI_TIMEOUT = 60_000; // 60s

function getAiConfig() {
  const baseUrl = (process.env.AI_API_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  return {
    baseUrl,
    apiKey: process.env.AI_API_KEY || "",
    model: process.env.AI_MODEL || "gpt-4o-mini",
  };
}

const SYSTEM_PROMPT = `Bạn viết bài đăng Facebook giúp user. Viết bằng tiếng Việt, giọng tự nhiên như một người dùng Facebook bình thường — không phải copywriter, không phải bot.

Quy tắc bắt buộc:
- Viết như đang chia sẻ với bạn bè trên Facebook, tự nhiên và chân thực
- Hạn chế emoji — tối đa 2-3 emoji cho cả bài, chỉ dùng khi thực sự phù hợp. KHÔNG rải emoji khắp nơi
- KHÔNG dùng các dạng: "🔥🔥🔥", "💯💯", "✨✨✨" hay emoji lặp lại
- KHÔNG viết kiểu quảng cáo ("Đừng bỏ lỡ!", "Nhanh tay!", "Cực kỳ hot!")
- Ngắn gọn, dễ đọc trên mobile (150-400 từ tùy nội dung)
- Chia đoạn tự nhiên, dùng line break
- Kết bài bằng 3-5 hashtag liên quan, mỗi hashtag trên cùng 1 dòng cuối, cách bài viết 1 dòng trống
- Hashtag viết liền không dấu hoặc tiếng Anh ngắn gọn (VD: #lamdep #skincare #meovatcuocsong)
- Chỉ trả về nội dung bài viết, KHÔNG giải thích hay ghi chú thêm`;

interface GenerateInput {
  url?: string;
  topic?: string;
  tone?: string;
  customPrompt?: string;
}

interface AIResponse {
  content: string;
  images?: string[];
  tokensUsed?: number;
}

/**
 * Extract images from HTML — og:image and large content images.
 */
function extractImages(html: string, baseUrl: string): string[] {
  const images: string[] = [];
  const seen = new Set<string>();

  // 1. og:image (highest priority)
  const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogMatch?.[1]) {
    const url = resolveUrl(ogMatch[1], baseUrl);
    if (url && !seen.has(url)) {
      images.push(url);
      seen.add(url);
    }
  }

  // 2. twitter:image
  const twMatch = html.match(/<meta[^>]+(?:name|property)=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']twitter:image["']/i);
  if (twMatch?.[1]) {
    const url = resolveUrl(twMatch[1], baseUrl);
    if (url && !seen.has(url)) {
      images.push(url);
      seen.add(url);
    }
  }

  // 3. Large content images (from <img> tags with reasonable src)
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null && images.length < 5) {
    const src = match[0];
    const url = resolveUrl(match[1], baseUrl);
    if (!url || seen.has(url)) continue;

    // Skip tiny images (icons, tracking pixels, avatars)
    const widthMatch = src.match(/width=["']?(\d+)/);
    const heightMatch = src.match(/height=["']?(\d+)/);
    if (widthMatch && parseInt(widthMatch[1]) < 200) continue;
    if (heightMatch && parseInt(heightMatch[1]) < 200) continue;

    // Skip common non-content patterns
    if (/logo|icon|avatar|badge|button|sprite|tracking|pixel|ads|banner/i.test(url)) continue;
    if (/\.svg$/i.test(url)) continue;
    if (/1x1|spacer|blank/i.test(url)) continue;

    images.push(url);
    seen.add(url);
  }

  return images.slice(0, 5); // Max 5 images
}

function resolveUrl(src: string, base: string): string | null {
  try {
    if (src.startsWith("data:")) return null;
    if (src.startsWith("//")) return "https:" + src;
    if (src.startsWith("http")) return src;
    return new URL(src, base).href;
  } catch {
    return null;
  }
}

/**
 * Fetch and extract text content + images from a URL.
 */
async function fetchUrlContent(url: string): Promise<{ text: string; images: string[] }> {
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

    // Extract images before stripping HTML
    const images = extractImages(html, url);

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

    return { text, images };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Download an image from URL and return buffer + metadata.
 */
async function downloadImage(imageUrl: string): Promise<{
  buffer: Buffer;
  mimeType: string;
  ext: string;
} | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AutoPost/1.0)",
      },
      redirect: "follow",
    });

    if (!res.ok) return null;

    const contentType = (res.headers.get("content-type") || "").split(";")[0].trim();
    const mimeMap: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
    };

    const ext = mimeMap[contentType];
    if (!ext) return null; // Not a supported image type

    const arrayBuf = await res.arrayBuffer();
    // Skip tiny images (< 10KB likely icons)
    if (arrayBuf.byteLength < 10_000) return null;
    // Skip huge images (> 10MB)
    if (arrayBuf.byteLength > 10 * 1024 * 1024) return null;

    return {
      buffer: Buffer.from(arrayBuf),
      mimeType: contentType,
      ext,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Generate Facebook post content using AI.
 * When URL is provided, also extracts and downloads images from the page.
 */
export async function generatePostContent(input: GenerateInput): Promise<AIResponse> {
  const config = getAiConfig();

  if (!config.apiKey) {
    throw new Error("AI_API_KEY chưa được cấu hình.");
  }

  let userMessage = "";
  let extractedImages: string[] = [];

  if (input.url) {
    // Fetch URL content + images
    let urlData: { text: string; images: string[] };
    try {
      urlData = await fetchUrlContent(input.url);
    } catch (err) {
      throw new Error(`Không thể tải nội dung từ URL: ${err instanceof Error ? err.message : "Unknown error"}`);
    }

    extractedImages = urlData.images;

    userMessage = `Viết bài đăng Facebook dựa trên nội dung bài viết sau. Viết lại theo cách hiểu của bạn, như đang chia sẻ với bạn bè — đừng copy nguyên văn.

URL gốc: ${input.url}

Nội dung bài gốc:
${urlData.text}`;
  } else if (input.topic) {
    userMessage = `Viết bài đăng Facebook về: ${input.topic}

Viết tự nhiên, như đang chia sẻ suy nghĩ cá nhân về chủ đề này.`;
  } else if (input.customPrompt) {
    userMessage = input.customPrompt;
  } else {
    throw new Error("Cần cung cấp URL, topic, hoặc custom prompt.");
  }

  // Add tone instruction
  if (input.tone) {
    const toneMap: Record<string, string> = {
      professional: "Giọng nghiêm túc, có chiều sâu — nhưng vẫn là ngôn ngữ Facebook, không phải báo cáo",
      friendly: "Giọng thoải mái, gần gũi như nói chuyện với bạn",
      humorous: "Giọng hài hước, dí dỏm nhưng tự nhiên — không gượng ép",
      inspiring: "Giọng truyền cảm hứng nhẹ nhàng, chân thành — không sáo rỗng",
      storytelling: "Kể lại như một câu chuyện cá nhân, có mở - thân - kết tự nhiên",
    };
    const toneDesc = toneMap[input.tone] || input.tone;
    userMessage += `\n\nGiọng văn: ${toneDesc}`;
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
        temperature: 0.8,
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
      images: extractedImages,
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

export { downloadImage };
