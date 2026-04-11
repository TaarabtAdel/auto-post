"use client";

import { useState } from "react";
import Link from "next/link";

interface PostData {
  id: string;
  content: string;
  status: string;
  facebookPageId: string | null;
  scheduledAt: string | null;
  postedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  pageName: string | null;
  imageCount: number;
  videoCount: number;
}

interface StatusCounts {
  all: number;
  draft: number;
  scheduled: number;
  posted: number;
  failed: number;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "Nháp", color: "bg-gray-100 text-gray-700" },
  scheduled: { label: "Đã hẹn giờ", color: "bg-yellow-100 text-yellow-700" },
  posting: { label: "Đang đăng", color: "bg-blue-100 text-blue-700" },
  posted: { label: "Đã đăng", color: "bg-green-100 text-green-700" },
  failed: { label: "Thất bại", color: "bg-red-100 text-red-700" },
};

const FILTER_TABS = [
  { key: "all", label: "Tất cả" },
  { key: "draft", label: "Nháp" },
  { key: "scheduled", label: "Đã hẹn giờ" },
  { key: "posted", label: "Đã đăng" },
  { key: "failed", label: "Thất bại" },
] as const;

function formatDate(dateStr: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PostFilters({
  posts,
  counts,
}: {
  posts: PostData[];
  counts: StatusCounts;
}) {
  const [filter, setFilter] = useState<string>("all");

  const filtered =
    filter === "all" ? posts : posts.filter((p) => p.status === filter);

  return (
    <>
      {/* Status filter tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg">
        {FILTER_TABS.map((tab) => {
          const count = counts[tab.key as keyof StatusCounts];
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-4 py-2 rounded-md text-sm transition-colors ${
                filter === tab.key
                  ? "bg-white text-gray-900 shadow-sm font-medium"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className="ml-1.5 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Posts list */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((p) => {
            const statusInfo =
              STATUS_LABELS[p.status] || STATUS_LABELS.draft;

            return (
              <div
                key={p.id}
                className="bg-white rounded-lg border border-gray-200 p-4 hover:border-gray-300 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 text-sm line-clamp-2">
                      {p.content || "(Không có nội dung)"}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 flex-wrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full font-medium ${statusInfo.color}`}
                      >
                        {statusInfo.label}
                      </span>
                      {p.pageName && <span>📄 {p.pageName}</span>}
                      {p.imageCount > 0 && (
                        <span>🖼 {p.imageCount} ảnh</span>
                      )}
                      {p.videoCount > 0 && (
                        <span>🎬 {p.videoCount} video</span>
                      )}
                      {p.scheduledAt && (
                        <span>🕐 {formatDate(p.scheduledAt)}</span>
                      )}
                      {p.postedAt && (
                        <span>✅ Đăng: {formatDate(p.postedAt)}</span>
                      )}
                      <span>{formatDate(p.createdAt)}</span>
                    </div>
                    {p.errorMessage && (
                      <div className="mt-2 bg-red-50 text-red-600 px-3 py-2 rounded-md text-xs">
                        ⚠ {p.errorMessage}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <p className="text-gray-500 mb-4">
            {filter === "all"
              ? "Chưa có bài viết nào."
              : `Không có bài viết "${FILTER_TABS.find((t) => t.key === filter)?.label}".`}
          </p>
          {filter === "all" && (
            <Link
              href="/posts/new"
              className="text-blue-600 hover:underline text-sm"
            >
              Tạo bài viết đầu tiên →
            </Link>
          )}
        </div>
      )}
    </>
  );
}
