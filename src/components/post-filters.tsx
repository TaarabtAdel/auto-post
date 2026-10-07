"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getFacebookPostUrl } from "@/lib/facebook-page-url";
import { describeDeleteImpact } from "@/lib/post-delete-impact";

interface PostData {
  id: string;
  content: string;
  status: string;
  facebookPageId: string | null;
  scheduledAt: string | null;
  postedAt: string | null;
  fbPostId: string | null;
  errorMessage: string | null;
  createdAt: string;
  pageName: string | null;
  graphPageId: string | null;
  workspaceAppName: string | null;
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
  queued: { label: "Trong hàng đợi", color: "bg-amber-100 text-amber-800" },
  scheduled: { label: "Đã hẹn giờ", color: "bg-yellow-100 text-yellow-700" },
  posting: { label: "Đang đăng", color: "bg-blue-100 text-blue-700" },
  posted: { label: "Đã đăng", color: "bg-green-100 text-green-700" },
  failed: { label: "Thất bại", color: "bg-red-100 text-red-700" },
};

const FILTER_TABS = [
  { key: "all", label: "Tất cả" },
  { key: "draft", label: "Nháp" },
  { key: "scheduled", label: "Chờ / hẹn giờ" },
  { key: "posted", label: "Đã đăng" },
  { key: "failed", label: "Thất bại" },
] as const;

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function canRunNow(status: string) {
  return ["queued", "scheduled", "draft", "failed"].includes(status);
}

function postFacebookUrl(p: PostData): string | null {
  if (p.status !== "posted" || !p.fbPostId) return null;
  return getFacebookPostUrl(p.fbPostId, p.graphPageId);
}

export function PostFilters({
  posts,
  counts,
}: {
  posts: PostData[];
  counts: StatusCounts;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("all");
  const [queueRunning, setQueueRunning] = useState(false);
  const [runningPostId, setRunningPostId] = useState<string | null>(null);
  const [runError, setRunError] = useState("");
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);

  const filtered =
    filter === "all"
      ? posts
      : filter === "scheduled"
        ? posts.filter((p) =>
            ["scheduled", "queued", "posting"].includes(p.status)
          )
        : posts.filter((p) => p.status === filter);

  async function runQueueNow() {
    setQueueRunning(true);
    try {
      await fetch("/api/posts/process-queue", { method: "POST" });
      router.refresh();
    } finally {
      setQueueRunning(false);
    }
  }

  async function deletePost(postId: string, status: string) {
    const impact = describeDeleteImpact(status);
    if (!impact.allow) {
      setRunError(impact.detail);
      return;
    }
    if (!confirm(`${impact.title}\n\n${impact.detail}`)) return;

    setDeletingPostId(postId);
    setRunError("");
    try {
      const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setRunError(data.error || "Không xóa được.");
        return;
      }
      router.refresh();
    } catch {
      setRunError("Lỗi kết nối.");
    } finally {
      setDeletingPostId(null);
    }
  }

  async function runPostNow(postId: string) {
    setRunningPostId(postId);
    setRunError("");
    try {
      const res = await fetch(`/api/posts/${postId}/run-now`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setRunError(data.error || "Run now thất bại.");
        return;
      }
      router.refresh();
    } catch {
      setRunError("Lỗi kết nối.");
    } finally {
      setRunningPostId(null);
    }
  }

  return (
    <>
      {runError && (
        <div className="mb-3 bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm">
          {runError}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-xs text-gray-500">
          Cron mỗi phút — Run now để đăng ngay. Bài đã đăng: bấm tên App/Page để mở trên Facebook.
        </p>
        <button
          type="button"
          onClick={runQueueNow}
          disabled={queueRunning}
          className="text-sm font-medium bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {queueRunning ? "Running…" : "Run now (cả queue)"}
        </button>
      </div>

      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg overflow-x-auto">
        {FILTER_TABS.map((tab) => {
          const count = counts[tab.key as keyof StatusCounts];
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-4 py-2 rounded-md text-sm transition-colors whitespace-nowrap ${
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

      {filtered.length > 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 font-medium min-w-[200px]">Nội dung</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">App</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Page</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Trạng thái</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Hẹn / Đăng</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Media</th>
                  <th className="px-4 py-3 font-medium text-right whitespace-nowrap">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p) => {
                  const statusInfo =
                    STATUS_LABELS[p.status] || STATUS_LABELS.draft;
                  const fbUrl = postFacebookUrl(p);
                  const timeLabel =
                    p.status === "posted" && p.postedAt
                      ? formatDate(p.postedAt)
                      : p.scheduledAt
                        ? formatDate(p.scheduledAt)
                        : formatDate(p.createdAt);
                  const timeHint =
                    p.status === "posted"
                      ? "Đã đăng"
                      : p.scheduledAt
                        ? "Hẹn giờ"
                        : "Tạo lúc";

                  return (
                    <tr key={p.id} className="hover:bg-gray-50/80 align-top">
                      <td className="px-4 py-3 max-w-xs">
                        <p className="text-gray-900 line-clamp-2">
                          {p.content || "(Không có nội dung)"}
                        </p>
                        {p.errorMessage && (
                          <p className="mt-1 text-xs text-red-600 line-clamp-2" title={p.errorMessage}>
                            {p.errorMessage}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {fbUrl ? (
                          <a
                            href={fbUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline font-medium"
                            title="Mở bài viết trên Facebook"
                          >
                            {p.workspaceAppName || "—"}
                            <span className="sr-only"> (Facebook)</span>
                          </a>
                        ) : (
                          <span className="text-gray-800">
                            {p.workspaceAppName || "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {fbUrl && p.pageName ? (
                          <a
                            href={fbUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                            title="Mở bài viết trên Facebook"
                          >
                            {p.pageName}
                          </a>
                        ) : (
                          <span className="text-gray-800">{p.pageName || "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600 text-xs">
                        <span className="text-gray-400 block">{timeHint}</span>
                        {timeLabel}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500 text-xs">
                        {p.imageCount > 0 && <span>{p.imageCount} ảnh </span>}
                        {p.videoCount > 0 && <span>{p.videoCount} video</span>}
                        {p.imageCount === 0 && p.videoCount === 0 && "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <Link
                            href={`/posts/${p.id}/edit`}
                            className="inline-flex items-center text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 px-2.5 py-1 rounded-md"
                          >
                            Sửa
                          </Link>
                          {canRunNow(p.status) && (
                            <button
                              type="button"
                              onClick={() => runPostNow(p.id)}
                              disabled={runningPostId === p.id || queueRunning}
                              className="text-xs font-medium text-white bg-green-600 hover:bg-green-700 px-2.5 py-1 rounded-md disabled:opacity-50"
                            >
                              {runningPostId === p.id ? "…" : "Run now"}
                            </button>
                          )}
                          {p.status === "posted" && fbUrl && (
                            <a
                              href={fbUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 px-2.5 py-1 rounded-md"
                            >
                              Facebook
                            </a>
                          )}
                          {describeDeleteImpact(p.status).allow && (
                            <button
                              type="button"
                              onClick={() => deletePost(p.id, p.status)}
                              disabled={deletingPostId === p.id || queueRunning}
                              className="text-xs font-medium text-red-700 border border-red-200 hover:bg-red-50 px-2.5 py-1 rounded-md disabled:opacity-50"
                              title="Chỉ xóa trong AutoPost; bài Facebook (nếu đã đăng) vẫn còn"
                            >
                              {deletingPostId === p.id ? "…" : "Xóa"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
