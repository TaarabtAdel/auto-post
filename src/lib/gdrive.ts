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

/** Supported media MIME types and their extensions */
const MEDIA_MIME_MAP: Record<string, { ext: string; fileType: "image" | "video" }> = {
  "image/jpeg": { ext: "jpg", fileType: "image" },
  "image/png": { ext: "png", fileType: "image" },
  "image/gif": { ext: "gif", fileType: "image" },
  "image/webp": { ext: "webp", fileType: "image" },
  "video/mp4": { ext: "mp4", fileType: "video" },
  "video/quicktime": { ext: "mov", fileType: "video" },
  "application/pdf": { ext: "pdf", fileType: "image" }, // treat PDF as image for storage
};

const MAX_MEDIA_SIZE = 1024 * 1024 * 1024; // 1GB

export interface DriveMediaResult {
  buffer: Buffer;
  mimeType: string;
  fileType: "image" | "video";
  ext: string;
  size: number;
}

/**
 * Download a media file (image/video/PDF) from Google Drive.
 * File must be publicly shared ("Anyone with the link").
 * Returns buffer + metadata for saving to disk.
 */
export async function fetchDriveMedia(fileId: string): Promise<DriveMediaResult> {
  const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000); // 60s for large files

  try {
    const res = await fetch(downloadUrl, {
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

    const contentType = (res.headers.get("content-type") || "").split(";")[0].trim();

    // Check if response is HTML (Google login page or virus scan warning)
    if (contentType === "text/html") {
      const html = await res.text();
      if (html.includes("ServiceLogin") || html.includes("accounts.google.com")) {
        throw new Error(
          "File yêu cầu đăng nhập. Vui lòng đặt file ở chế độ 'Anyone with the link'."
        );
      }
      // Google virus scan confirm page for large files
      if (html.includes("confirm=") || html.includes("download_warning")) {
        // Extract confirm token and retry
        const confirmMatch = html.match(/confirm=([a-zA-Z0-9_-]+)/);
        if (confirmMatch) {
          const confirmUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=${confirmMatch[1]}`;
          const retryRes = await fetch(confirmUrl, {
            signal: controller.signal,
            redirect: "follow",
          });
          if (!retryRes.ok) {
            throw new Error("Không thể tải file sau xác nhận virus scan.");
          }
          const retryType = (retryRes.headers.get("content-type") || "").split(";")[0].trim();
          const mediaInfo = MEDIA_MIME_MAP[retryType];
          if (!mediaInfo) {
            throw new Error(`Loại file không hỗ trợ: ${retryType}. Hỗ trợ: ảnh (JPEG, PNG, GIF, WebP), video (MP4, MOV), PDF.`);
          }
          const arrayBuf = await retryRes.arrayBuffer();
          if (arrayBuf.byteLength > MAX_MEDIA_SIZE) {
            throw new Error("File quá lớn. Giới hạn 1GB.");
          }
          return {
            buffer: Buffer.from(arrayBuf),
            mimeType: retryType,
            fileType: mediaInfo.fileType,
            ext: mediaInfo.ext,
            size: arrayBuf.byteLength,
          };
        }
      }
      throw new Error("Không thể tải file media. Google Drive trả về trang HTML thay vì file.");
    }

    const mediaInfo = MEDIA_MIME_MAP[contentType];
    if (!mediaInfo) {
      throw new Error(
        `Loại file không hỗ trợ: ${contentType}. Hỗ trợ: ảnh (JPEG, PNG, GIF, WebP), video (MP4, MOV), PDF.`
      );
    }

    const arrayBuf = await res.arrayBuffer();
    if (arrayBuf.byteLength > MAX_MEDIA_SIZE) {
      throw new Error("File quá lớn. Giới hạn 1GB.");
    }

    return {
      buffer: Buffer.from(arrayBuf),
      mimeType: contentType,
      fileType: mediaInfo.fileType,
      ext: mediaInfo.ext,
      size: arrayBuf.byteLength,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Tải file timeout (60s). File quá lớn hoặc mạng chậm.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
