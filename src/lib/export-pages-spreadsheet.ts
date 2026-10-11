import { getFacebookPageUrl } from "@/lib/facebook-page-url";

export type PageExportRow = {
  pageName: string;
  pageId: string;
  workspaceAppName: string | null;
  categoryName?: string | null;
  facebookAppId: string | null;
  tokenStatus: string;
  tokenRenewedAt: string | null;
  tokenExpiresAt: string | null;
  postedCount: number;
  pendingCount: number;
  internalId: string;
};

function escapeCsvCell(value: string | number): string {
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const TOKEN_STATUS_LABEL: Record<string, string> = {
  active: "Hoạt động",
  expired: "Hết hạn",
  invalid: "Không hợp lệ",
};

export function buildPagesExportCsv(rows: PageExportRow[]): string {
  const header = [
    "Tên Fanpage",
    "Facebook Page ID",
    "Link Fanpage",
    "Danh mục",
    "Facebook App",
    "Facebook App ID",
    "Trạng thái token",
    "Gia hạn lúc",
    "Hết hạn token",
    "Bài đã đăng",
    "Bài chờ đăng",
    "ID nội bộ (AutoPost)",
  ];

  const lines = [
    header.map(escapeCsvCell).join(","),
    ...rows.map((r) =>
      [
        r.pageName,
        r.pageId,
        getFacebookPageUrl(r.pageId),
        r.categoryName ?? "",
        r.workspaceAppName ?? "",
        r.facebookAppId ?? "",
        TOKEN_STATUS_LABEL[r.tokenStatus] ?? r.tokenStatus,
        r.tokenRenewedAt
          ? new Date(r.tokenRenewedAt).toLocaleString("vi-VN")
          : "",
        r.tokenExpiresAt
          ? new Date(r.tokenExpiresAt).toLocaleString("vi-VN")
          : "",
        r.postedCount,
        r.pendingCount,
        r.internalId,
      ]
        .map(escapeCsvCell)
        .join(",")
    ),
  ];

  return `\uFEFF${lines.join("\r\n")}`;
}

export function downloadPagesSpreadsheet(
  rows: PageExportRow[],
  filenameBase = "facebook-pages"
): void {
  const csv = buildPagesExportCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameBase}-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
