"use client";

import { useCallback, useEffect, useState } from "react";
import { ui } from "@/lib/dashboard-ui";

type LogEntry = {
  id: string;
  createdAtLabel: string;
  level: string;
  category: string;
  message: string;
  detail: Record<string, unknown> | null;
};

const CATEGORY_TABS = [
  { id: "all", label: "Tất cả" },
  { id: "auto", label: "Luồng AUTO" },
  { id: "publish", label: "Đăng Fanpage" },
  { id: "cron", label: "Cron / hệ thống" },
] as const;

function levelClass(level: string): string {
  return level === "error" ? "text-red-700 bg-red-50" : "text-gray-800";
}

function categoryBadge(category: string): string {
  if (category === "auto") return "bg-violet-100 text-violet-800";
  if (category === "publish") return "bg-blue-100 text-blue-800";
  return "bg-gray-100 text-gray-700";
}

export function SystemLogsPanel() {
  const [category, setCategory] = useState<(typeof CATEGORY_TABS)[number]["id"]>("auto");
  const [campaignId, setCampaignId] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams({ category, limit: "250" });
      if (campaignId.trim()) params.set("campaignId", campaignId.trim());
      const res = await fetch(`/api/logs?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tải log.");
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải log.");
    } finally {
      setLoading(false);
    }
  }, [category, campaignId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  return (
    <div className="space-y-4">
      <div className={`${ui.card} ${ui.cardPadSm} flex flex-wrap gap-3 items-end`}>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`text-xs px-3 py-1.5 rounded-lg border ${
                category === tab.id
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white border-gray-300 hover:bg-gray-50"
              }`}
              onClick={() => setCategory(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <label className="text-sm flex flex-col gap-1 min-w-[12rem]">
          <span className="text-gray-600 text-xs">Lọc campaign ID (AUTO)</span>
          <input
            className={ui.input}
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            placeholder="0a9c1b1c…"
          />
        </label>
        <button type="button" className={ui.btnSecondary} onClick={() => void load()}>
          Làm mới
        </button>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Tự làm mới 4s
        </label>
      </div>

      <p className={`text-xs ${ui.hint}`}>
        Log AUTO theo bước: <strong>Tạo bài viết</strong> → <strong>Video & render</strong> →{" "}
        <strong>Đăng Fanpage</strong>. Dòng <strong>LỖI</strong> kèm tên bước trong message và{" "}
        <code className="text-[11px]">detail.step</code>.
      </p>

      {error && <div className={ui.alertError}>{error}</div>}
      {loading && logs.length === 0 ? (
        <p className="text-sm text-gray-500">Đang tải…</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-gray-500">Chưa có log (chạy AUTO hoặc cron để ghi log).</p>
      ) : (
        <div className={`${ui.tableShell} max-h-[70vh] overflow-y-auto`}>
          <table className="w-full text-left">
            <thead className={`${ui.tableHead} sticky top-0 z-10`}>
              <tr>
                <th className={`${ui.th} w-[9.5rem]`}>Thời gian</th>
                <th className={`${ui.th} w-[5rem]`}>Loại</th>
                <th className={ui.th}>Nội dung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => (
                <tr key={log.id} className={levelClass(log.level)}>
                  <td className={`${ui.td} text-xs whitespace-nowrap align-top`}>
                    {log.createdAtLabel}
                  </td>
                  <td className={`${ui.td} align-top`}>
                    <span
                      className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${categoryBadge(log.category)}`}
                    >
                      {log.category}
                    </span>
                  </td>
                  <td className={`${ui.td} align-top`}>
                    <p className="text-sm font-mono break-words">{log.message}</p>
                    {log.detail && Object.keys(log.detail).length > 0 ? (
                      <pre className="mt-1 text-[11px] text-gray-600 whitespace-pre-wrap break-all bg-black/5 rounded p-2 max-h-40 overflow-y-auto">
                        {JSON.stringify(log.detail, null, 2)}
                      </pre>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
