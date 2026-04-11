const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const FETCH_TIMEOUT = 10_000; // 10s

// OAuth URLs
const FB_OAUTH_BASE = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`;
const FB_OAUTH_TOKEN = `${GRAPH_API_BASE}/oauth/access_token`;

/**
 * Build Facebook OAuth authorization URL.
 * Scopes: pages_manage_posts (to publish), pages_read_engagement (to read page info)
 */
export function buildOAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID || "",
    redirect_uri: redirectUri,
    state,
    scope: "pages_manage_posts,pages_read_engagement",
    response_type: "code",
  });
  return `${FB_OAUTH_BASE}?${params.toString()}`;
}

/**
 * Exchange OAuth code for short-lived user access token.
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID || "",
    client_secret: process.env.FACEBOOK_APP_SECRET || "",
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetch(`${FB_OAUTH_TOKEN}?${params.toString()}`);
  const data = await res.json();

  if (data.error) {
    throw new Error(data.error.message || "Không thể đổi code lấy token.");
  }

  return data.access_token;
}

/**
 * Exchange short-lived user token for long-lived user token (~60 days).
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: process.env.FACEBOOK_APP_ID || "",
    client_secret: process.env.FACEBOOK_APP_SECRET || "",
    fb_exchange_token: shortLivedToken,
  });

  const res = await fetch(`${FB_OAUTH_TOKEN}?${params.toString()}`);
  const data = await res.json();

  if (data.error) {
    throw new Error(data.error.message || "Không thể đổi sang long-lived token.");
  }

  return data.access_token;
}

export interface PageWithToken {
  pageId: string;
  pageName: string;
  pageAvatar: string | null;
  accessToken: string; // Page access token (permanent when from long-lived user token)
}

/**
 * Get all pages the user manages, along with page access tokens.
 * Uses long-lived user token → page tokens returned are permanent.
 */
export async function getUserPages(
  userToken: string
): Promise<PageWithToken[]> {
  const url = `${GRAPH_API_BASE}/me/accounts?fields=id,name,picture,access_token&access_token=${encodeURIComponent(userToken)}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.error) {
    throw new Error(data.error.message || "Không thể lấy danh sách Pages.");
  }

  if (!data.data || !Array.isArray(data.data)) {
    return [];
  }

  return data.data.map((page: Record<string, unknown>) => ({
    pageId: page.id as string,
    pageName: page.name as string,
    pageAvatar: (page.picture as { data?: { url?: string } })?.data?.url || null,
    accessToken: page.access_token as string,
  }));
}

export interface FacebookPageInfo {
  pageId: string;
  pageName: string;
  pageAvatar: string | null;
}

export interface FacebookApiError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
}

/**
 * Verify a Page Access Token by calling GET /me on Graph API.
 * If token is a Page token, /me returns the Page info.
 * Throws on invalid/expired token or network error.
 */
export async function verifyPageToken(
  token: string
): Promise<FacebookPageInfo> {
  const url = `${GRAPH_API_BASE}/me?fields=id,name,picture&access_token=${encodeURIComponent(token)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(url, { signal: controller.signal });
    const data = await res.json();

    if (data.error) {
      const err = data.error as FacebookApiError;
      if (err.code === 190) {
        throw new Error("Token hết hạn hoặc không hợp lệ. Vui lòng tạo token mới.");
      }
      throw new Error(err.message || "Facebook API error");
    }

    if (!data.id || !data.name) {
      throw new Error("Token không phải Page Access Token hợp lệ.");
    }

    return {
      pageId: data.id,
      pageName: data.name,
      pageAvatar: data.picture?.data?.url || null,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Kết nối tới Facebook timeout. Vui lòng thử lại.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check if a Graph API error indicates token expiry.
 * Error code 190 = OAuthException (expired/invalid token).
 */
export function isTokenExpiredError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes("190") || error.message.includes("hết hạn");
  }
  return false;
}

export interface PublishResult {
  success: boolean;
  fbPostId?: string;
  error?: string;
  tokenExpired?: boolean;
}

/**
 * Publish a text post to a Facebook Page.
 * POST /{page-id}/feed?message={text}&access_token={token}
 */
export async function publishPost(
  token: string,
  pageId: string,
  content: string
): Promise<PublishResult> {
  const url = `${GRAPH_API_BASE}/${pageId}/feed`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000); // 30s for publish

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: content,
        access_token: token,
      }),
      signal: controller.signal,
    });

    const data = await res.json();

    if (data.error) {
      const err = data.error as FacebookApiError;
      return {
        success: false,
        error: err.message || "Facebook API error",
        tokenExpired: err.code === 190,
      };
    }

    return {
      success: true,
      fbPostId: data.id,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { success: false, error: "Facebook API timeout" };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Publish a photo post to a Facebook Page using binary upload (multipart/form-data).
 * Works from localhost — no need for public URL.
 */
export async function publishPhotoPost(
  token: string,
  pageId: string,
  content: string,
  photoBuffer: Buffer,
  fileName: string
): Promise<PublishResult> {
  const url = `${GRAPH_API_BASE}/${pageId}/photos`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000); // 60s for photo upload

  try {
    const formData = new FormData();
    formData.append("source", new Blob([new Uint8Array(photoBuffer)]), fileName);
    formData.append("message", content);
    formData.append("access_token", token);

    const res = await fetch(url, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    const data = await res.json();

    if (data.error) {
      const err = data.error as FacebookApiError;
      return {
        success: false,
        error: err.message || "Facebook API error",
        tokenExpired: err.code === 190,
      };
    }

    return {
      success: true,
      fbPostId: data.post_id || data.id,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { success: false, error: "Facebook API timeout (photo upload)" };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    clearTimeout(timeout);
  }
}
