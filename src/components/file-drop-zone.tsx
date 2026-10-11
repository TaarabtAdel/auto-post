"use client";

import { useRef, useState } from "react";
type FileDropZoneProps = {
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void | Promise<void>;
  className?: string;
  /** Nhỏ gọn (Reels từng dòng). */
  compact?: boolean;
  children?: React.ReactNode;
};

export function FileDropZone({
  accept,
  multiple = false,
  disabled = false,
  onFiles,
  className = "",
  compact = false,
  children,
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  function applyFiles(list: FileList | null) {
    if (!list?.length || disabled) return;
    const files = Array.from(list);
    void onFiles(multiple ? files : files.slice(0, 1));
  }

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    dragDepth.current += 1;
    setDragOver(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragOver(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDragOver(false);
    if (disabled) return;
    applyFiles(e.dataTransfer.files);
  }

  return (
    <div
      className={`relative rounded-lg border-2 border-dashed transition-colors ${
        disabled
          ? "border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed"
          : dragOver
            ? "border-blue-500 bg-blue-50/80"
            : "border-gray-300 bg-gray-50/50 hover:border-gray-400 hover:bg-gray-50"
      } ${compact ? "px-3 py-2" : "px-4 py-6"} ${className}`}
      onDragEnter={onDragEnter}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => {
        if (!disabled) inputRef.current?.click();
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          applyFiles(e.target.files);
          e.target.value = "";
        }}
        onClick={(e) => e.stopPropagation()}
      />
      {children ?? (
        <div className={`text-center ${compact ? "text-xs" : "text-sm"} text-gray-600`}>
          <p className="font-medium text-gray-800">
            Kéo thả file vào đây hoặc bấm để chọn
          </p>
          {!compact && (
            <p className="text-xs text-gray-500 mt-1">Hỗ trợ kéo thả từ máy tính</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Gợi ý dùng trong children của FileDropZone. */
export function FileDropHint({
  busy,
  extra,
}: {
  busy?: boolean;
  extra?: string;
}) {
  return (
    <div className="text-center text-sm text-gray-600 pointer-events-none">
      <p className="font-medium text-gray-800">
        {busy ? "Đang tải lên..." : "Kéo thả vào đây hoặc bấm để chọn file"}
      </p>
      {extra ? <p className="text-xs text-gray-500 mt-1">{extra}</p> : null}
    </div>
  );
}
