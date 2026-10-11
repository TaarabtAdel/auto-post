"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ui } from "@/lib/dashboard-ui";
import { IMAGE_ACCEPT, uploadMediaFile } from "@/lib/upload-client";
import { uploadMediaPublicUrl } from "@/lib/upload-media-url";
import { FileDropZone, FileDropHint } from "@/components/file-drop-zone";

export type BackgroundItem = {
  filePath: string;
  fileName: string;
  fileSize: number;
  url: string;
};

type BackgroundLibraryProps = {
  selectMode?: boolean;
  selectedPath?: string | null;
  onSelect?: (item: BackgroundItem) => void;
  compact?: boolean;
  /** Tiêu đề khối preview (mặc định: Ảnh nền đang chọn). */
  previewLabel?: string;
};

function BackgroundPreviewCard({
  url,
  fileName,
  label,
  onClear,
}: {
  url: string;
  fileName: string;
  label: string;
  onClear?: () => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 items-start p-4 rounded-xl border-2 border-blue-500 bg-blue-50/40">
      <div className="w-full sm:w-[140px] shrink-0 rounded-lg overflow-hidden border border-gray-200 shadow-sm bg-gray-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="w-full aspect-[9/16] object-cover" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="text-xs text-gray-600 mt-1 truncate" title={fileName}>
          {fileName}
        </p>
        {onClear && (
          <button type="button" className="text-xs text-red-600 hover:underline mt-2" onClick={onClear}>
            Bỏ chọn
          </button>
        )}
      </div>
    </div>
  );
}

export function BackgroundLibrary({
  selectMode = false,
  selectedPath = null,
  onSelect,
  compact = false,
  previewLabel = "Ảnh nền đang chọn",
}: BackgroundLibraryProps) {
  const [items, setItems] = useState<BackgroundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/uploads/backgrounds");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tải được danh sách.");
      setItems(data.backgrounds ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải danh sách.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedItem = useMemo(
    () => items.find((i) => i.filePath === selectedPath) ?? null,
    [items, selectedPath]
  );

  const previewUrl = selectedItem?.url ?? (selectedPath ? uploadMediaPublicUrl(selectedPath) : null);
  const previewName =
    selectedItem?.fileName ?? selectedPath?.split("/").pop() ?? "Ảnh nền";

  async function onUpload(file: File) {
    setUploading(true);
    setError("");
    try {
      const data = await uploadMediaFile(file, { bucket: "background" });
      const item: BackgroundItem = {
        filePath: data.filePath,
        fileName: data.fileName,
        fileSize: data.fileSize,
        url: data.url,
      };
      setNote("Đã thêm ảnh nền.");
      await refresh();
      if (selectMode && onSelect) onSelect(item);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload thất bại.");
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(filePath: string) {
    if (!confirm("Xóa ảnh nền này? (Không xóa bài đã đăng trên Facebook.)")) return;
    setError("");
    try {
      const res = await fetch("/api/uploads/backgrounds", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không xóa được.");
      if (selectedPath === filePath && onSelect) {
        onSelect({ filePath: "", fileName: "", fileSize: 0, url: "" });
      }
      setNote("Đã xóa.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xóa thất bại.");
    }
  }

  const thumbClass = compact
    ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
    : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";

  return (
    <div className="space-y-4">
      {!compact && (
        <p className={`text-sm ${ui.hint}`}>
          Ảnh trong <code className="text-xs">uploads/backgrounds/…</code>. Bấm thumbnail để
          chọn — preview lớn ở trên.
        </p>
      )}

      {selectMode && previewUrl && (
        <BackgroundPreviewCard
          url={previewUrl}
          fileName={previewName}
          label={previewLabel}
          onClear={
            onSelect
              ? () => onSelect({ filePath: "", fileName: "", fileSize: 0, url: "" })
              : undefined
          }
        />
      )}

      {error && <div className={ui.alertError}>{error}</div>}
      {note && !error && <div className={ui.hint}>{note}</div>}

      <FileDropZone
        accept={IMAGE_ACCEPT}
        disabled={uploading}
        compact={compact}
        onFiles={(files) => {
          const f = files[0];
          if (f) void onUpload(f);
        }}
      >
        <FileDropHint busy={uploading} extra="Upload ảnh nền mới (JPG, PNG, WebP…)" />
      </FileDropZone>

      {loading ? (
        <p className="text-sm text-gray-500">Đang tải thư viện…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">Chưa có ảnh nền — upload ở trên.</p>
      ) : (
        <>
          {selectMode && (
            <p className="text-xs text-gray-500">Thư viện — bấm ảnh để chọn:</p>
          )}
          <div className={`grid gap-3 ${thumbClass}`}>
            {items.map((item) => {
              const selected = selectedPath === item.filePath;
              return (
                <div
                  key={item.filePath}
                  className={`relative rounded-lg border overflow-hidden bg-gray-100 transition-shadow ${
                    selected
                      ? "ring-[3px] ring-blue-600 border-blue-600 shadow-md"
                      : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
                  }`}
                >
                  <button
                    type="button"
                    className="block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    onClick={() => {
                      if (selectMode && onSelect) onSelect(item);
                    }}
                    title={item.fileName}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt=""
                      className="w-full aspect-[9/16] object-cover bg-gray-200"
                    />
                    {selected && (
                      <span className="absolute top-2 right-2 bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow">
                        ✓
                      </span>
                    )}
                  </button>
                  <div className="p-1.5 text-[11px] text-gray-600 truncate bg-white/90" title={item.fileName}>
                    {item.fileName}
                  </div>
                  {!selectMode && (
                    <div className="px-1.5 pb-2">
                      <button
                        type="button"
                        className={`${ui.btnSm} w-full text-red-700 border-red-200`}
                        onClick={() => void onDelete(item.filePath)}
                      >
                        Xóa
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {!compact && (
        <p className="text-xs text-gray-500">
          Dùng trong{" "}
          <Link href="/auto/plans" className="text-blue-600 underline">
            /auto
          </Link>
          {" · "}
          <Link href="/reels" className="text-blue-600 underline">
            /reels
          </Link>
        </p>
      )}
    </div>
  );
}
