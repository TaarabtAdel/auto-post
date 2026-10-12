"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getFacebookPageUrl, getFacebookPostUrl } from "@/lib/facebook-page-url";
import { describeDeleteImpact } from "@/lib/post-delete-impact";
import { ui } from "@/lib/dashboard-ui";
import { formatInAppTimezone } from "@/lib/scheduled-at";

interface PostPageMeta {
  facebookPageId: string;
  pageName: string;
  graphPageId: string | null;
  fbPostId: string | null;
  errorMessage: string | null;
  manualPosted?: boolean;
}

interface PostData {
  id: string;
  content: string;
  firstComment: string | null;
  videoUrl: string | null;
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
  pages: PostPageMeta[];
  imageCount: number;
  videoCount: number;
  mediaFiles: { fileName: string; fileType: string }[];
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
  test_scheduled: {
    label: "Test (không đăng FB)",
    color: "bg-violet-100 text-violet-800",
  },
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

function canRunNow(status: string) {
  return ["queued", "scheduled", "draft", "failed"].includes(status);
}

function firstPostedPageUrl(p: PostData): string | null {
  const posted = p.pages.find((pg) => pg.fbPostId);
  if (posted?.fbPostId) {
    return getFacebookPostUrl(posted.fbPostId, posted.graphPageId);
  }
  if (p.status === "posted" && p.fbPostId) {
    return getFacebookPostUrl(p.fbPostId, p.graphPageId);
  }
  return null;
}

function pageFacebookUrl(pg: PostPageMeta): string | null {
  if (!pg.fbPostId) return null;
  return getFacebookPostUrl(pg.fbPostId, pg.graphPageId);
}

function PostActionsMenu({
  postId,
  status,
  fbUrl,
  runningPostId,
  queueRunning,
  deletingPostId,
  onRunNow,
  onDelete,
}: {
  postId: string;
  status: string;
  fbUrl: string | null;
  runningPostId: string | null;
  queueRunning: boolean;
  deletingPostId: string | null;
  onRunNow: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const showRun = canRunNow(status);
  const showFb = status === "posted" && fbUrl;
  const showDelete = describeDeleteImpact(status).allow;
  const busy =
    runningPostId === postId || deletingPostId === postId || queueRunning;

  function closeAnd(fn: () => void) {
    setOpen(false);
    fn();
  }

  return (
    <div ref={rootRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy && runningPostId !== postId && deletingPostId !== postId}
        className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 px-2 py-1 rounded-lg disabled:opacity-50"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        Thao tác
        <span className="text-gray-400 text-[10px]" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-[9.5rem] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          <Link
            href={`/posts/${postId}/edit`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block w-full text-left px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
          >
            Sửa
          </Link>
          {showRun && (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => closeAnd(onRunNow)}
              className="w-full text-left px-3 py-2 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-50"
            >
              {runningPostId === postId ? "Đang chạy…" : "Run now"}
            </button>
          )}
          {showFb && fbUrl && (
            <a
              href={fbUrl}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block w-full text-left px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
            >
              Mở Facebook
            </a>
          )}
          {showDelete && (
            <button
              type="button"
              role="menuitem"
              disabled={deletingPostId === postId || queueRunning}
              onClick={() => closeAnd(onDelete)}
              className="w-full text-left px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {deletingPostId === postId ? "Đang xóa…" : "Xóa"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CopyBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <button
          type="button"
          onClick={() => void copy()}
          className="text-xs font-medium text-blue-600 hover:underline"
        >
          {copied ? "Đã copy" : "Copy"}
        </button>
      </div>
      <textarea
        readOnly
        value={value}
        rows={Math.min(8, Math.max(3, value.split("\n").length))}
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 resize-y"
      />
    </div>
  );
}

export function PostFilters({
  posts,
  counts,
  publishPageIntervalMinutes: initialInterval,
}: {
  posts: PostData[];
  counts: StatusCounts;
  publishPageIntervalMinutes: number;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("all");
  const [queueRunning, setQueueRunning] = useState(false);
  const [runningPostId, setRunningPostId] = useState<string | null>(null);
  const [runError, setRunError] = useState("");
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [pageInterval, setPageInterval] = useState(initialInterval);
  const [savingInterval, setSavingInterval] = useState(false);
  const [manualModal, setManualModal] = useState<{
    post: PostData;
    page: PostPageMeta;
  } | null>(null);
  const [manualPosted, setManualPosted] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);

  useEffect(() => {
    setPageInterval(initialInterval);
  }, [initialInterval]);

  useEffect(() => {
    if (manualModal) {
      setManualPosted(Boolean(manualModal.page.manualPosted || manualModal.page.fbPostId));
    }
  }, [manualModal]);

  const filtered =
    filter === "all"
      ? posts
      : filter === "scheduled"
        ? posts.filter((p) =>
            ["scheduled", "queued", "test_scheduled", "posting"].includes(p.status)
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

  async function savePageInterval() {
    setSavingInterval(true);
    setRunError("");
    try {
      const res = await fetch("/api/settings/publish", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageIntervalMinutes: pageInterval }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRunError(data.error || "Không lưu được cài đặt.");
        return;
      }
      setPageInterval(data.pageIntervalMinutes);
    } catch {
      setRunError("Lỗi kết nối.");
    } finally {
      setSavingInterval(false);
    }
  }

  async function saveManualPosted(checked: boolean) {
    if (!manualModal) return;
    setManualSaving(true);
    setRunError("");
    try {
      const res = await fetch(
        `/api/posts/${manualModal.post.id}/pages/${manualModal.page.facebookPageId}/manual`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ manualPosted: checked }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setRunError(data.error || "Không lưu được.");
        return;
      }
      setManualPosted(checked);
      router.refresh();
    } catch {
      setRunError("Lỗi kết nối.");
    } finally {
      setManualSaving(false);
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
        <div className={`mb-3 ${ui.alertError}`}>
          {runError}
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4 mb-4 p-3 bg-slate-50 border border-slate-200 rounded-xl">
        <div className="space-y-2 min-w-[200px]">
          <p className="text-xs text-gray-600">
            <strong>Đăng tự động:</strong> nhiều Page cùng bài — mỗi Page cách nhau (phút).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-gray-700" htmlFor="page-interval">
              Khoảng cách
            </label>
            <input
              id="page-interval"
              type="number"
              min={1}
              max={120}
              value={pageInterval}
              onChange={(e) => setPageInterval(Number(e.target.value))}
              className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
            <span className="text-sm text-gray-600">phút</span>
            <button
              type="button"
              onClick={() => void savePageInterval()}
              disabled={savingInterval}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              {savingInterval ? "…" : "Lưu"}
            </button>
          </div>
        </div>
        <div className="text-right space-y-2">
          <p className="text-xs text-gray-500 max-w-md">
            Cron mỗi phút xử lý 1 job. Run now đăng ngay cả bài (lần lượt từng Page).
          </p>
          <button
            type="button"
            onClick={runQueueNow}
            disabled={queueRunning}
            className={ui.btnSuccess}
          >
            {queueRunning ? "Running…" : "Run now (cả queue)"}
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg overflow-x-auto">
        {FILTER_TABS.map((tab) => {
          const count = counts[tab.key as keyof StatusCounts];
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm transition-colors whitespace-nowrap ${
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
        <div className={ui.tableShell}>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm text-left">
              <colgroup>
                <col style={{ width: "30%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>
              <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 font-medium">Nội dung</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">App</th>
                  <th className="px-2 py-3 font-medium whitespace-nowrap">Pages</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Trạng thái</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Hẹn / Đăng</th>
                  <th className="px-2 py-3 font-medium text-right whitespace-nowrap">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p) => {
                  const statusInfo =
                    STATUS_LABELS[p.status] || STATUS_LABELS.draft;
                  const fbUrl = firstPostedPageUrl(p);
                  const pageList =
                    p.pages.length > 0
                      ? p.pages
                      : p.pageName
                        ? [
                            {
                              facebookPageId: p.facebookPageId ?? "",
                              pageName: p.pageName,
                              graphPageId: p.graphPageId,
                              fbPostId: p.fbPostId,
                              errorMessage: null,
                            },
                          ]
                        : [];
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/80 align-top">
                      <td className="px-4 py-3 min-w-0">
                        <p className="text-gray-900 line-clamp-2 break-words">
                          {p.content || "(Không có nội dung)"}
                        </p>
                        {p.errorMessage && (
                          <p className="mt-1 text-xs text-red-600 line-clamp-2" title={p.errorMessage}>
                            {p.errorMessage}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 min-w-0">
                        {fbUrl ? (
                          <a
                            href={fbUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate text-blue-600 hover:underline font-medium"
                            title={p.workspaceAppName || "Mở bài viết trên Facebook"}
                          >
                            {p.workspaceAppName || "—"}
                            <span className="sr-only"> (Facebook)</span>
                          </a>
                        ) : (
                          <span
                            className="block truncate text-gray-800"
                            title={p.workspaceAppName || undefined}
                          >
                            {p.workspaceAppName || "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-3 min-w-0">
                        {pageList.length === 0 ? (
                          <span className="text-gray-500">—</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {pageList.map((pg) => {
                              const url = pageFacebookUrl(pg);
                              const done =
                                Boolean(pg.fbPostId) || Boolean(pg.manualPosted);
                              return (
                                <li
                                  key={pg.facebookPageId || pg.pageName}
                                  className="flex items-center gap-0.5 min-w-0"
                                >
                                  {url ? (
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="min-w-0 flex-1 truncate text-blue-600 hover:underline text-xs leading-tight"
                                      title={`${pg.pageName} — mở trên Facebook`}
                                    >
                                      {pg.pageName}
                                    </a>
                                  ) : (
                                    <span
                                      className="min-w-0 flex-1 truncate text-gray-800 text-xs leading-tight"
                                      title={pg.pageName}
                                    >
                                      {pg.pageName}
                                    </span>
                                  )}
                                  {done ? (
                                    <span
                                      className="shrink-0 text-[9px] text-green-700 bg-green-50 px-0.5 rounded leading-none"
                                      title={
                                        pg.manualPosted && !pg.fbPostId
                                          ? "Đã đăng thủ công"
                                          : "Đã đăng qua API"
                                      }
                                    >
                                      {pg.manualPosted && !pg.fbPostId ? "Tay" : "OK"}
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setManualModal({ post: p, page: pg })
                                      }
                                      className="shrink-0 text-[9px] font-medium text-violet-700 hover:underline leading-none"
                                      title="Đăng thủ công"
                                    >
                                      Đăng
                                    </button>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </td>
                      <td className="px-4 py-3 min-w-0">
                        <span
                          className={`inline-flex max-w-full truncate px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}
                          title={statusInfo.label}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 min-w-0 text-gray-800 text-xs leading-relaxed">
                        <div className="space-y-1">
                          <p>
                            <span className="text-gray-500">Tạo:</span>{" "}
                            {formatInAppTimezone(p.createdAt, true)}
                          </p>
                          {p.scheduledAt ? (
                            <p>
                              <span className="text-gray-500">Hẹn:</span>{" "}
                              {formatInAppTimezone(p.scheduledAt, true)}
                            </p>
                          ) : null}
                          {p.postedAt ? (
                            <p>
                              <span className="text-gray-500">Đăng:</span>{" "}
                              {formatInAppTimezone(p.postedAt, true)}
                            </p>
                          ) : null}
                          {p.mediaFiles.length > 0 ? (
                            <ul className="pt-1 mt-1 border-t border-gray-100 space-y-0.5 text-gray-600">
                              {p.mediaFiles.map((m, i) => (
                                <li
                                  key={`${m.fileName}-${i}`}
                                  className="truncate"
                                  title={`${m.fileType === "video" ? "Video" : "Ảnh"}: ${m.fileName}`}
                                >
                                  <span className="text-gray-400">
                                    {m.fileType === "video" ? "vid · " : "img · "}
                                  </span>
                                  {m.fileName}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-2 py-3 whitespace-nowrap text-right align-top">
                        <PostActionsMenu
                          postId={p.id}
                          status={p.status}
                          fbUrl={fbUrl}
                          runningPostId={runningPostId}
                          queueRunning={queueRunning}
                          deletingPostId={deletingPostId}
                          onRunNow={() => void runPostNow(p.id)}
                          onDelete={() => void deletePost(p.id, p.status)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {manualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Đóng"
            className="absolute inset-0 bg-black/40"
            onClick={() => setManualModal(null)}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Đăng thủ công</h3>
                {manualModal.page.graphPageId ? (
                  <a
                    href={getFacebookPageUrl(manualModal.page.graphPageId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-blue-600 hover:underline mt-0.5 inline-block"
                    title="Mở Fanpage trên Facebook"
                  >
                    {manualModal.page.pageName}
                  </a>
                ) : (
                  <p className="text-sm text-gray-600 mt-0.5">{manualModal.page.pageName}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setManualModal(null)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <CopyBlock label="Nội dung bài viết" value={manualModal.post.content || ""} />
              {manualModal.post.firstComment ? (
                <CopyBlock
                  label="Comment đầu tiên"
                  value={manualModal.post.firstComment}
                />
              ) : (
                <p className="text-xs text-gray-500">Không có comment đầu tiên.</p>
              )}
              {manualModal.post.videoUrl ? (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Video</p>
                  <a
                    href={manualModal.post.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline break-all"
                  >
                    Mở / tải video (tab mới)
                  </a>
                </div>
              ) : (
                <p className="text-xs text-gray-500">Bài không có video.</p>
              )}

              <label className="flex items-center gap-2 cursor-pointer pt-2 border-t border-gray-100">
                <input
                  type="checkbox"
                  checked={manualPosted}
                  disabled={manualSaving}
                  onChange={(e) => void saveManualPosted(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-800">Đã đăng lên Page này</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
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
      ) : null}
    </>
  );
}
