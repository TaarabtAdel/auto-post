const DRIVE_URL_PATTERNS = [
  // Google Docs: https://docs.google.com/document/d/{fileId}/...
  /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/,
  // Google Sheets: https://docs.google.com/spreadsheets/d/{fileId}/...
  /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
  // Google Drive file: https://drive.google.com/file/d/{fileId}/...
  /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
  // Google Drive open: https://drive.google.com/open?id={fileId}
  /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
];

/**
 * Extract file ID from a Google Drive/Docs URL.
 * Returns null if URL doesn't match any known pattern.
 */
export function parseDriveUrl(url: string): string | null {
  for (const pattern of DRIVE_URL_PATTERNS) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Detect the type of Google Drive content from the URL.
 */
function detectType(url: string): "doc" | "sheet" | "file" {
  if (url.includes("docs.google.com/document")) return "doc";
  if (url.includes("docs.google.com/spreadsheets")) return "sheet";
  return "file";
}

/**
 * Fetch text content from a Google Drive public file.
 * - Google Docs → export as plain text
 * - Google Sheets → export as CSV
 * - Other files → direct download (text files only)
 */
export async function fetchDriveContent(
  fileId: string,
  originalUrl: string
): Promise<string> {
  const type = detectType(originalUrl);

  let exportUrl: string;
  if (type === "doc") {
    exportUrl = `https://docs.google.com/document/d/${fileId}/export?format=txt`;
  } else if (type === "sheet") {
    exportUrl = `https://docs.google.com/spreadsheets/d/${fileId}/export?format=csv`;
  } else {
    exportUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(exportUrl, {
      signal: controller.signal,
      redirect: "follow",
    });

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error("File không tồn tại hoặc đã bị xóa.");
      }
      if (res.status === 403 || res.status === 401) {
        throw new Error(
          "Không có quyền truy cập. Vui lòng đặt file ở chế độ 'Anyone with the link'."
        );
      }
      throw new Error(`Không thể tải file (HTTP ${res.status}).`);
    }

    const contentType = res.headers.get("content-type") || "";
    // Check if response is HTML (error page) instead of text
    if (contentType.includes("text/html")) {
      const html = await res.text();
      if (html.includes("ServiceLogin") || html.includes("accounts.google.com")) {
        throw new Error(
          "File yêu cầu đăng nhập. Vui lòng đặt file ở chế độ 'Anyone with the link'."
        );
      }
      // Some Google Docs export as HTML for some reason, strip tags
      return html.replace(/<[^>]*>/g, "").trim();
    }

    const text = await res.text();
    if (!text || text.trim().length === 0) {
      throw new Error("File rỗng hoặc không có nội dung text.");
    }

    return text.trim();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Tải file timeout. Vui lòng thử lại.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
