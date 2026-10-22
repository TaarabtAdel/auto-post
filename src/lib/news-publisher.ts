import { normalizeYouTubeUrl } from "@/lib/youtube-url";
import { resolveNewsCredentials } from "@/lib/news-settings";

/** Pipeline đăng tin: fetch-link-info → generate → publish-news (app AI Studio). */

const DEFAULT_TONE = "Hài hước vỡ ỡ / Uncontrollable Laughter & Breaking Character";
const STEP_TIMEOUT_MS = 180_000;

export type NewsPublishStep = "config" | "fetch-link-info" | "generate" | "publish-news";

export class NewsPublishError extends Error {
  constructor(
    public step: NewsPublishStep,
    message: string
  ) {
    super(message);
  }
}

type NewsConfig = {
  baseUrl: string;
  authToken: string;
  userName: string;
  password: string;
  newsGroupId: string;
  targetTone: string;
};

function readConfig(userId: string): NewsConfig {
  const baseUrl = process.env.NEWS_AI_BASE_URL?.trim().replace(/\/+$/, "") ?? "";
  if (!baseUrl) {
    throw new NewsPublishError("config", "Server thiếu NEWS_AI_BASE_URL trong .env.");
  }
  const { userName, password, authToken, newsGroupId } = resolveNewsCredentials(userId);
  const missing = [
    !userName && "Username",
    !password && "Password",
    !authToken && "Token news API",
    !newsGroupId && "Nhóm tin (newsGroupId)",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new NewsPublishError(
      "config",
      `Chưa cấu hình: ${missing.join(", ")} — bấm «Cấu hình đăng tin».`
    );
  }
  return {
    baseUrl,
    authToken,
    userName,
    password,
    newsGroupId,
    targetTone: process.env.NEWS_TARGET_TONE?.trim() || DEFAULT_TONE,
  };
}

async function callJson<T>(
  cfg: NewsConfig,
  step: NewsPublishStep,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown }
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}${path}`, {
      method: init.method,
      // AI Studio preview: cookie auth; POST còn cần Origin, thiếu sẽ bị 302 về cookie check.
      headers: {
        Cookie: `__SECURE-aistudio_auth_token=${cfg.authToken}`,
        Origin: cfg.baseUrl,
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new NewsPublishError(step, `Không kết nối được (${msg}).`);
  }

  if (res.status >= 300 && res.status < 400) {
    throw new NewsPublishError(
      step,
      "Bị chuyển về trang cookie check — NEWS_AI_AUTH_TOKEN hết hạn hoặc sai."
    );
  }

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new NewsPublishError(step, `Phản hồi không phải JSON (HTTP ${res.status}).`);
  }

  const obj = data as { success?: boolean; error?: string; message?: string };
  if (!res.ok || obj?.success === false) {
    throw new NewsPublishError(
      step,
      obj?.error || obj?.message || `HTTP ${res.status}`
    );
  }
  return data as T;
}

type LinkInfo = {
  title?: string;
  primaryImage?: string;
  images?: { url?: string }[];
};

type GenerateData = {
  blogTitle?: string;
  reelsCopy?: string;
  blogContent?: string;
  hashtags?: string[];
  primaryImage?: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function youtubeId(url: string): string {
  return new URL(url).searchParams.get("v") ?? "";
}

function buildContentHtml(videoUrl: string, blogContent: string): string {
  const id = youtubeId(videoUrl);
  const embed = `<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 28px auto; border-radius: 12px; box-shadow: 0 6px 20px rgba(0,0,0,0.25); background-color: #000;">
  <iframe src="https://www.youtube.com/embed/${id}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; border-radius: 12px;"></iframe>
</div>`;
  const paragraphs = blogContent
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin-bottom: 14px; line-height: 1.75; font-size: 15px; color: #334155;">${escapeHtml(p)}</p>`
    );
  return [embed, ...paragraphs].join("\n");
}

export type NewsPublishResult = {
  title: string;
  response: unknown;
};

export async function publishYouTubeAsNews(
  rawUrl: string,
  userId: string
): Promise<NewsPublishResult> {
  const cfg = readConfig(userId);
  const videoUrl = normalizeYouTubeUrl(rawUrl);

  const info = await callJson<LinkInfo>(
    cfg,
    "fetch-link-info",
    `/api/fetch-link-info?url=${encodeURIComponent(videoUrl)}`,
    { method: "GET" }
  );
  const subjectName = info.title?.trim() || videoUrl;
  const images = (info.images ?? [])
    .map((i) => i.url)
    .filter((u): u is string => !!u);
  const primaryImage = info.primaryImage || images[0] || "";

  const gen = await callJson<{ data?: GenerateData }>(cfg, "generate", "/api/generate", {
    method: "POST",
    body: {
      subjectName,
      description: subjectName,
      videoUrl,
      targetTone: cfg.targetTone,
      primaryImage,
      extractedImages: images,
    },
  });
  const d = gen.data ?? {};
  if (!d.blogTitle || !d.blogContent) {
    throw new NewsPublishError("generate", "Thiếu blogTitle / blogContent trong kết quả.");
  }

  const summary = [d.reelsCopy?.trim(), (d.hashtags ?? []).join(" ")]
    .filter(Boolean)
    .join("\n");

  const response = await callJson<unknown>(cfg, "publish-news", "/api/publish-news", {
    method: "POST",
    body: {
      userName: cfg.userName,
      password: cfg.password,
      name: d.blogTitle,
      newsGroupId: cfg.newsGroupId,
      summary,
      avatarLink: d.primaryImage || primaryImage,
      content: buildContentHtml(videoUrl, d.blogContent),
    },
  });

  return { title: d.blogTitle, response };
}
