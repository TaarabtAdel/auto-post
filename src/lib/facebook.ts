const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const FETCH_TIMEOUT = 10_000; // 10s

// OAuth URLs
const FB_OAUTH_BASE = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`;
const FB_OAUTH_TOKEN = `${GRAPH_API_BASE}/oauth/access_token`;

export interface FacebookAppCredentials {
  appId: string;
  appSecret: string;
}

/**
 * Build Facebook OAuth authorization URL.
 * Scopes: pages_manage_posts (to publish), pages_read_engagement (to read page info)
 */
export function buildOAuthUrl(
  redirectUri: string,
  state: string,
  credentials: FacebookAppCredentials
): string {
  const params = new URLSearchParams({
    client_id: credentials.appId,
    redirect_uri: redirectUri,
    state,
    scope: "pages_manage_posts,pages_read_engagement,pages_manage_engagement",
    response_type: "code",
  });
  return `${FB_OAUTH_BASE}?${params.toString()}`;
}

/**
 * Exchange OAuth code for short-lived user access token.
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  credentials: FacebookAppCredentials
): Promise<string> {
  const params = new URLSearchParams({
    client_id: credentials.appId,
    client_secret: credentials.appSecret,
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

export interface LongLivedUserTokenResult {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
}

/**
 * Exchange short-lived user token for long-lived user token (~60 days).
 */
export async function exchangeForLongLivedUserToken(
  shortLivedToken: string,
  credentials: FacebookAppCredentials
): Promise<LongLivedUserTokenResult> {
  if (!credentials.appId || !credentials.appSecret) {
    throw new Error("Thiếu Facebook App ID hoặc App Secret.");
  }

  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: credentials.appId,
    client_secret: credentials.appSecret,
    fb_exchange_token: shortLivedToken.trim(),
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(`${FB_OAUTH_TOKEN}?${params.toString()}`, {
      signal: controller.signal,
    });
    const data = await res.json();

    if (data.error) {
      throw new Error(data.error.message || "Không thể đổi sang long-lived token.");
    }

    if (!data.access_token) {
      throw new Error("Facebook không trả về access_token.");
    }

    return {
      accessToken: data.access_token as string,
      expiresIn: typeof data.expires_in === "number" ? data.expires_in : 0,
      tokenType: (data.token_type as string) || "bearer",
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

export async function exchangeForLongLivedToken(
  shortLivedToken: string,
  credentials: FacebookAppCredentials
): Promise<string> {
  const result = await exchangeForLongLivedUserToken(shortLivedToken, credentials);
  return result.accessToken;
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
export interface DebugTokenResult {
  isValid: boolean;
  type: string;
  /** Unix giây; 0 = không hết hạn (thường gặp với Page token). */
  expiresAt: number;
  dataAccessExpiresAt: number;
  scopes: string[];
}

/**
 * GET /debug_token — kiểm tra hết hạn & validity (App access token = app_id|app_secret).
 * @see https://developers.facebook.com/docs/graph-api/reference/debug_token
 */
export async function debugAccessToken(
  inputToken: string,
  credentials: FacebookAppCredentials
): Promise<DebugTokenResult> {
  const appAccessToken = `${credentials.appId}|${credentials.appSecret}`;
  const params = new URLSearchParams({
    input_token: inputToken.trim(),
    access_token: appAccessToken,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(`${GRAPH_API_BASE}/debug_token?${params.toString()}`, {
      signal: controller.signal,
    });
    const json = await res.json();

    if (json.error) {
      throw new Error(json.error.message || "debug_token thất bại.");
    }

    const data = json.data as Record<string, unknown> | undefined;
    if (!data) {
      throw new Error("Facebook không trả về dữ liệu debug_token.");
    }

    const scopes = Array.isArray(data.scopes)
      ? data.scopes.filter((s): s is string => typeof s === "string")
      : [];

    return {
      isValid: Boolean(data.is_valid),
      type: String(data.type ?? ""),
      expiresAt: typeof data.expires_at === "number" ? data.expires_at : 0,
      dataAccessExpiresAt:
        typeof data.data_access_expires_at === "number"
          ? data.data_access_expires_at
          : 0,
      scopes,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Kết nối tới Facebook timeout.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function tokenHasScope(debug: DebugTokenResult, scope: string): boolean {
  return debug.scopes.includes(scope);
}

/** Chọn mốc hết hạn hiển thị từ kết quả debug_token. */
export function resolveTokenExpiryDate(debug: DebugTokenResult): Date | null {
  if (debug.expiresAt > 0) {
    return new Date(debug.expiresAt * 1000);
  }
  if (debug.dataAccessExpiresAt > 0) {
    return new Date(debug.dataAccessExpiresAt * 1000);
  }
  return null;
}

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

export interface PublishResult {
  success: boolean;
  fbPostId?: string;
  error?: string;
  tokenExpired?: boolean;
}

export interface CommentResult {
  success: boolean;
  fbCommentId?: string;
  error?: string;
  tokenExpired?: boolean;
}

/**
 * Comment on a Page post as the Page.
 * POST /{post-id}/comments
 */
async function postCommentOnce(
  token: string,
  fbPostId: string,
  message: string
): Promise<CommentResult> {
  const params = new URLSearchParams({
    access_token: token,
  });
  const url = `${GRAPH_API_BASE}/${encodeURIComponent(fbPostId)}/comments?${params.toString()}`;
  const body = new URLSearchParams({ message });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
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
      fbCommentId: data.id as string | undefined,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { success: false, error: "Facebook API timeout (comment)" };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function enrichCommentPermissionError(
  baseError: string,
  tokenScopes: string[] | null
): string {
  const scopeHint = tokenScopes
    ? ` Scopes trên token Page thực tế: [${tokenScopes.join(", ") || "rỗng"}].`
    : "";
  const missingEngagement =
    tokenScopes && !tokenScopes.includes("pages_manage_engagement");

  if (missingEngagement) {
    return (
      `${baseError} Token Page trong DB thiếu pages_manage_engagement dù App có tick quyền — cần OAuth lại /pages (không chỉ đổi tick Explorer).${scopeHint}`
    );
  }

  return (
    `${baseError} Meta yêu cầu pages_manage_engagement + quyền MODERATE trên Page.${scopeHint} Nếu scopes đủ mà vẫn lỗi: thử OAuth lại hoặc kiểm tra vai trò Page (Admin/Moderator).`
  );
}

/** Comment on a Page post — retry 1 lần sau 3s (post vừa tạo có thể chưa sẵn sàng). */
export async function publishPostComment(
  token: string,
  fbPostId: string,
  message: string,
  options?: { tokenScopes?: string[] | null }
): Promise<CommentResult> {
  let result = await postCommentOnce(token, fbPostId, message);
  if (!result.success && !result.tokenExpired) {
    await new Promise((r) => setTimeout(r, 3000));
    result = await postCommentOnce(token, fbPostId, message);
  }

  if (result.success) return result;

  const errText = result.error || "";
  const isPerm =
    /permission|(#200)|not have sufficient/i.test(errText) ||
    result.error?.includes("200");

  if (isPerm) {
    return {
      ...result,
      error: enrichCommentPermissionError(errText, options?.tokenScopes ?? null),
    };
  }

  return result;
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
    formData.append("published", "true");
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

/**
 * Publish video to Page — POST /{page-id}/videos (multipart).
 * Cần pages_manage_posts trên Page token.
 */
export async function publishVideoPost(
  token: string,
  pageId: string,
  content: string,
  videoBuffer: Buffer,
  fileName: string
): Promise<PublishResult> {
  const url = `${GRAPH_API_BASE}/${pageId}/videos`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 600_000); // 10 phút — video lớn

  try {
    const formData = new FormData();
    formData.append("source", new Blob([new Uint8Array(videoBuffer)]), fileName);
    if (content.trim()) {
      formData.append("description", content.trim());
    }
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
      fbPostId: (data.post_id as string) || (data.id as string),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { success: false, error: "Facebook API timeout (video upload)" };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export type CountryRestrictionType = "whitelist" | "blacklist";

export interface PageCountryRestrictions {
  enabled: boolean;
  restrictionType: CountryRestrictionType;
  countries: string[];
}

function parseCountryRestrictionsValue(
  raw: unknown
): PageCountryRestrictions | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const restrictionType =
    v.restriction_type === "blacklist" ? "blacklist" : "whitelist";
  const countries = Array.isArray(v.countries)
    ? v.countries.filter((c): c is string => typeof c === "string")
    : [];
  if (countries.length === 0) {
    return { enabled: false, restrictionType, countries: [] };
  }
  return { enabled: true, restrictionType, countries };
}

/** GET /{page-id}/settings — COUNTRY_RESTRICTIONS */
export async function getPageCountryRestrictions(
  pageAccessToken: string,
  graphPageId: string
): Promise<PageCountryRestrictions> {
  const params = new URLSearchParams({
    access_token: pageAccessToken,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(
      `${GRAPH_API_BASE}/${graphPageId}/settings?${params.toString()}`,
      { signal: controller.signal }
    );
    const json = await res.json();

    if (json.error) {
      const err = json.error as FacebookApiError;
      if (err.code === 190) {
        throw new Error("Token Page hết hạn hoặc không hợp lệ.");
      }
      if (err.code === 200) {
        throw new Error(
          "Thiếu quyền MANAGE Page trên Facebook — token cần quyền quản trị Page (không chỉ đăng bài)."
        );
      }
      throw new Error(err.message || "Không đọc được cài đặt Page.");
    }

    const data = json.data as Array<{ setting?: string; value?: unknown }> | undefined;
    if (!data?.length) {
      return { enabled: false, restrictionType: "whitelist", countries: [] };
    }

    const row = data.find(
      (item) =>
        item.setting?.toUpperCase() === "COUNTRY_RESTRICTIONS" ||
        item.setting === "country_restrictions"
    );
    if (!row?.value) {
      return { enabled: false, restrictionType: "whitelist", countries: [] };
    }

    return (
      parseCountryRestrictionsValue(row.value) ?? {
        enabled: false,
        restrictionType: "whitelist",
        countries: [],
      }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Kết nối tới Facebook timeout.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/** POST /{page-id}/settings — COUNTRY_RESTRICTIONS */
export async function setPageCountryRestrictions(
  pageAccessToken: string,
  graphPageId: string,
  restrictionType: CountryRestrictionType,
  countries: string[]
): Promise<void> {
  const optionPayload = {
    COUNTRY_RESTRICTIONS: {
      restriction_type: restrictionType,
      countries,
    },
  };

  const body = new URLSearchParams({
    access_token: pageAccessToken,
    option: JSON.stringify(optionPayload),
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(`${GRAPH_API_BASE}/${graphPageId}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    });
    const json = await res.json();

    if (json.error) {
      const err = json.error as FacebookApiError;
      if (err.code === 190) {
        throw new Error("Token Page hết hạn hoặc không hợp lệ.");
      }
      if (err.code === 200) {
        throw new Error(
          "Facebook từ chối — cần quyền quản trị Page (MANAGE). Thử kết nối lại Page với tài khoản Admin."
        );
      }
      throw new Error(err.message || "Không cập nhật giới hạn quốc gia.");
    }

    if (json.success === false) {
      throw new Error("Facebook không xác nhận cập nhật settings.");
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Kết nối tới Facebook timeout.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
