"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ui } from "@/lib/dashboard-ui";
import type { CleanupTargetId, CleanupTargetStat } from "@/lib/upload-cleanup";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  let n = bytes;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u += 1;
  }
  return `${n >= 10 || u === 0 ? n.toFixed(u === 0 ? 0 : 1) : n.toFixed(2)} ${units[u]}`;
}

export function UploadsCleanupPanel() {
  const [targets, setTargets] = useState<CleanupTargetStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<Set<CleanupTargetId>>(new Set());

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/uploads/cleanup");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tải được thống kê.");
      setTargets(data.targets ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedStats = useMemo(() => {
    return targets.filter((t) => selected.has(t.id));
  }, [targets, selected]);

  const selectedFiles = selectedStats.reduce((s, t) => s + t.fileCount, 0);
  const selectedBytes = selectedStats.reduce((s, t) => s + t.totalBytes, 0);

  function toggle(id: CleanupTargetId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllWithFiles() {
    setSelected(new Set(targets.filter((t) => t.fileCount > 0).map((t) => t.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function runDelete() {
    if (selected.size === 0) {
      setError("Tick chọn ít nhất một thư mục.");
      return;
    }
    const names = selectedStats.map((t) => t.label).join(", ");
    if (
      !confirm(
        `Xóa ${selectedFiles} file (${formatBytes(selectedBytes)}) trong:\n${names}\n\nBài post vẫn còn trên DB nhưng media có thể lỗi. Tiếp tục?`
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");
    setNote("");
    try {
      const res = await fetch("/api/uploads/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          targets: [...selected],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Dọn thất bại.");
      setNote(`Đã xóa ${data.removedFiles ?? 0} file.`);
      setSelected(new Set());
      setTargets(data.targets ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dọn thất bại.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className={`text-sm ${ui.hint}`}>
        Chọn bucket cần xóa file trên đĩa. Thư mục gốc và <code className="text-xs">.gitkeep</code>{" "}
        giữ nguyên. Không xóa bài viết trên Facebook / SQLite.
      </p>

      {error && <div className={ui.alertError}>{error}</div>}
      {note && !error && <div className={ui.alertSuccess}>{note}</div>}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={ui.btnSm} disabled={loading} onClick={() => void refresh()}>
          Làm mới thống kê
        </button>
        <button type="button" className={ui.btnSm} disabled={loading} onClick={selectAllWithFiles}>
          Chọn mục có file
        </button>
        <button type="button" className={ui.btnSm} disabled={loading} onClick={clearSelection}>
          Bỏ chọn
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Đang đếm file…</p>
      ) : (
        <div className={`${ui.card} divide-y divide-gray-100`}>
          {targets.map((t) => (
            <label
              key={t.id}
              className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/80"
            >
              <input
                type="checkbox"
                className="mt-1 rounded border-gray-300"
                checked={selected.has(t.id)}
                disabled={busy || t.fileCount === 0}
                onChange={() => toggle(t.id)}
              />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-medium text-gray-900">{t.label}</span>
                  <span className="text-sm tabular-nums text-gray-800">
                    {t.fileCount} file · {formatBytes(t.totalBytes)}
                  </span>
                  {t.fileCount === 0 && (
                    <span className="text-xs text-gray-500">(trống)</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
              </div>
            </label>
          ))}
        </div>
      )}

      {selected.size > 0 && (
        <p className="text-sm text-gray-700">
          Sẽ xóa: <strong>{selectedFiles}</strong> file ·{" "}
          <strong>{formatBytes(selectedBytes)}</strong>
        </p>
      )}

      <button
        type="button"
        className={`${ui.btnPrimary} bg-red-600 hover:bg-red-700`}
        disabled={busy || loading || selected.size === 0}
        onClick={() => void runDelete()}
      >
        {busy ? "Đang xóa…" : "Xóa file đã chọn"}
      </button>
    </div>
  );
}
