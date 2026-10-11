"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  autoCampaignRunModeLabel,
  autoCampaignStatusLabel,
  type AutoCampaignDto,
} from "@/lib/auto-campaign-api";
import { formatInAppTimezone } from "@/lib/scheduled-at";
import { ui } from "@/lib/dashboard-ui";

function statusBadgeClass(status: string): string {
  if (status === "completed") return "bg-green-100 text-green-800";
  if (status === "failed") return "bg-red-100 text-red-800";
  if (status === "planned" || status === "running") return "bg-blue-100 text-blue-800";
  if (status === "draft") return "bg-gray-100 text-gray-700";
  return "bg-amber-100 text-amber-900";
}

function runModeBadgeClass(mode: string): string {
  return mode === "test"
    ? "bg-violet-100 text-violet-800"
    : "bg-emerald-100 text-emerald-800";
}

export function AutoPlansList() {
  const [campaigns, setCampaigns] = useState<AutoCampaignDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/auto/campaigns");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tải được danh sách.");
      setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRunNow(c: AutoCampaignDto) {
    if (c.status !== "planned") return;
    if (
      !window.confirm(
        `Chạy ngay plan "${c.name || "AUTO"}"?\nTạo bài → render reel → hẹn đăng (có thể mất vài phút).`
      )
    ) {
      return;
    }
    setRunningId(c.id);
    try {
      const res = await fetch(`/api/auto/campaigns/${c.id}/run-now`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Run now thất bại.");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Run now thất bại.");
      await load();
    } finally {
      setRunningId(null);
    }
  }

  async function handleDelete(c: AutoCampaignDto) {
    if (c.status === "running") {
      alert("Plan đang chạy — không xóa được.");
      return;
    }
    const ok = window.confirm(
      `Xóa plan "${c.name || "AUTO"}"?\nCác bài viết đã tạo từ plan này (nếu có) cũng sẽ bị xóa.`
    );
    if (!ok) return;

    setDeletingId(c.id);
    try {
      const res = await fetch(`/api/auto/campaigns/${c.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không xóa được.");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Xóa thất bại.");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Đang tải…</p>;
  }

  if (error) {
    return (
      <div className={ui.alertError}>
        {error}{" "}
        <button type="button" className="underline ml-1" onClick={() => void load()}>
          Thử lại
        </button>
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className={`${ui.card} ${ui.cardPad} text-center space-y-4`}>
        <p className="text-sm text-gray-600">Chưa có plan AUTO nào.</p>
        <Link href="/auto" className={ui.btnPrimary}>
          Tạo plan đầu tiên
        </Link>
      </div>
    );
  }

  return (
    <div className={ui.tableShell}>
      <table className="w-full">
        <thead className={ui.tableHead}>
          <tr>
            <th className={ui.th}>Tên plan</th>
            <th className={ui.th}>Chế độ</th>
            <th className={ui.th}>Trạng thái</th>
            <th className={ui.th}>Bước</th>
            <th className={ui.th}>Hẹn chạy AUTO</th>
            <th className={ui.th}>Lần sửa</th>
            <th className={ui.th}>Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {campaigns.map((c) => (
            <tr key={c.id} className="hover:bg-gray-50/80">
              <td className={ui.td}>
                <span className="font-medium text-gray-900">{c.name || "Campaign"}</span>
                {c.youtubeTitle ? (
                  <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">
                    {c.youtubeTitle}
                  </p>
                ) : null}
              </td>
              <td className={ui.td}>
                <span
                  className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${runModeBadgeClass(c.runMode)}`}
                >
                  {autoCampaignRunModeLabel(c.runMode)}
                </span>
              </td>
              <td className={ui.td}>
                <span
                  className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${statusBadgeClass(c.status)}`}
                >
                  {autoCampaignStatusLabel(c.status)}
                </span>
                {c.status === "failed" && c.errorMessage ? (
                  <p
                    className="text-xs text-red-600 mt-1 max-w-xs truncate"
                    title={c.errorMessage}
                  >
                    {c.errorMessage}
                  </p>
                ) : null}
              </td>
              <td className={`${ui.td} text-gray-600`}>
                {Math.min(c.wizardStep + 1, 6)}/6
              </td>
              <td className={`${ui.td} text-gray-600 whitespace-nowrap`}>
                {c.executeAtLabel ?? "—"}
              </td>
              <td className={`${ui.td} text-gray-600 whitespace-nowrap text-xs`}>
                {formatInAppTimezone(c.updatedAt, true)}
              </td>
              <td className={ui.td}>
                <div className="flex flex-wrap gap-2">
                  {c.status === "planned" && (
                    <button
                      type="button"
                      className={ui.btnSmPrimary}
                      disabled={runningId === c.id || deletingId === c.id}
                      onClick={() => void handleRunNow(c)}
                    >
                      {runningId === c.id ? "Đang chạy…" : "Run now"}
                    </button>
                  )}
                  <Link href={`/auto?id=${c.id}`} className={ui.btnSm}>
                    Cập nhật
                  </Link>
                  <button
                    type="button"
                    className={ui.btnSm}
                    disabled={deletingId === c.id || c.status === "running" || runningId === c.id}
                    onClick={() => void handleDelete(c)}
                  >
                    {deletingId === c.id ? "Đang xóa…" : "Xóa"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
