"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { describeDeleteImpact } from "@/lib/post-delete-impact";

interface MediaItem {
  id: string;
  filePath: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  mimeType: string;
  url: string;
}

interface BatchSiblingView {
  id: string;
  status: string;
  pageName: string | null;
  facebookUrl: string | null;
  scheduledAt: string | null;
  postedAt: string | null;
}

interface PostDetail {
  id: string;
  batchId: string | null;
  fbPostId: string | null;
  content: string;
  firstComment: string | null;
  status: string;
  facebookPageId: string | null;
  scheduledAt: string | null;
  pageName: string | null;
  media: MediaItem[];
}

interface AppOption {
  id: string;
  name: string;
}

interface PageOption {
  id: string;
  pageName: string;
  tokenStatus: string;
  workspaceAppId: string | null;
}

interface Props {
  post: PostDetail;
  apps: AppOption[];
  batchSiblings: BatchSiblingView[];
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  queued: "Hàng đợi",
  scheduled: "Hẹn giờ",
  posting: "Đang đăng",
  posted: "Đã đăng",
  failed: "Lỗi",
};

function toLocalDatetimeValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PostEditForm({ post, apps, batchSiblings }: Props) {
  const router = useRouter();
  const [content, setContent] = useState(post.content);
  const [firstComment, setFirstComment] = useState(post.firstComment ?? "");
  const [scheduledAt, setScheduledAt] = useState(toLocalDatetimeValue(post.scheduledAt));
  const [workspaceAppId, setWorkspaceAppId] = useState("");
  const [facebookPageId, setFacebookPageId] = useState(post.facebookPageId ?? "");
  const [allPages, setAllPages] = useState<PageOption[]>([]);
  const [extraPageIds, setExtraPageIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const editable = ["draft", "queued", "scheduled", "failed"].includes(post.status);
  const isPosted = post.status === "posted";

  useEffect(() => {
    fetch("/api/facebook-pages")
      .then((r) => r.json())
      .then((data) => {
        if (data.pages) setAllPages(data.pages);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!facebookPageId || allPages.length === 0) return;
    const page = allPages.find((p) => p.id === facebookPageId);
    if (page?.workspaceAppId) setWorkspaceAppId(page.workspaceAppId);
    else if (apps[0]) setWorkspaceAppId(apps[0].id);
  }, [facebookPageId, allPages, apps]);

  const appPages = useMemo(
    () =>
      allPages.filter(
        (p) =>
          p.tokenStatus === "active" && p.workspaceAppId === workspaceAppId
      ),
    [allPages, workspaceAppId]
  );

  const otherPages = appPages.filter((p) => p.id !== facebookPageId);
  const canCloneToMore = otherPages.length > 0 && (editable || isPosted);

  function toggleExtra(id: string) {
    setExtraPageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllExtraPages() {
    setExtraPageIds(new Set(otherPages.map((p) => p.id)));
  }

  function invertExtraPages() {
    setExtraPageIds((prev) => {
      const next = new Set<string>();
      for (const p of otherPages) {
        if (!prev.has(p.id)) next.add(p.id);
      }
      return next;
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editable) return;
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const payload: Record<string, unknown> = {
        content: content.trim(),
        firstComment: firstComment.trim() || null,
        facebookPageId: facebookPageId || null,
      };
      if (scheduledAt) {
        payload.scheduledAt = new Date(scheduledAt).toISOString();
      }

      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Không thể lưu.");
        return;
      }
      setSuccess(
        batchSiblings.length > 0
          ? "Đã lưu — chỉ áp dụng cho Fanpage này, không đổi các Fanpage khác trong cùng đợt."
          : "Đã lưu bài viết."
      );
      router.refresh();
    } catch {
      setError("Lỗi kết nối.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCloneToPages() {
    if (extraPageIds.size === 0) {
      setError("Chọn ít nhất một Page khác để đăng thêm.");
      return;
    }
    if (!scheduledAt) {
      setError("Chọn thời gian hẹn giờ cho bản copy.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/posts/schedule-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          firstComment: firstComment.trim() || undefined,
          scheduledAt: new Date(scheduledAt).toISOString(),
          facebookPageIds: [...extraPageIds],
          media: post.media.map((m) => ({
            filePath: m.filePath,
            fileName: m.fileName,
            fileSize: m.fileSize,
            mimeType: m.mimeType,
            fileType: m.fileType,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Không thể tạo bản cho Page khác.");
        return;
      }
      setSuccess(
        `Đã tạo ${data.pageCount} bài mới (hàng đợi). Bài đã đăng trên Fanpage hiện tại không bị sửa.`
      );
      router.push("/posts");
      router.refresh();
    } catch {
      setError("Lỗi kết nối.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    const impact = describeDeleteImpact(post.status);
    if (!impact.allow) {
      setError(impact.detail);
      return;
    }
    if (!confirm(`${impact.title}\n\n${impact.detail}`)) return;

    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Không xóa được.");
        return;
      }
      router.push("/posts");
      router.refresh();
    } catch {
      setError("Lỗi kết nối.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-800 space-y-2">
        <p className="font-medium">Cách AutoPost xử lý sửa / xóa</p>
        <ul className="list-disc pl-5 space-y-1 text-slate-700 text-xs">
          <li>
            <strong>Mỗi Fanpage = một bản ghi riêng.</strong> Sửa Page, nội dung, giờ đăng
            chỉ ảnh hưởng <strong>bài này</strong>, không đổi các Fanpage khác (kể cả cùng
            lúc lên lịch batch).
          </li>
          <li>
            <strong>Đã đăng lên Facebook:</strong> không sửa được bài live trên FB từ đây. Muốn
            đăng nội dung khác → chỉnh bản <em>chưa đăng</em> hoặc dùng{" "}
            <strong>Đăng thêm Fanpage khác</strong> (tạo bài queue mới).
          </li>
          <li>
            <strong>Xóa:</strong> chỉ gỡ trong AutoPost + hủy queue.{" "}
            <strong>Không gỡ</strong> bài đã public trên Facebook.
          </li>
        </ul>
      </div>

      {isPosted && (
        <div className="bg-amber-50 text-amber-900 px-4 py-3 rounded-lg text-sm">
          Bài đã đăng — form chỉ xem. Bài trên Facebook giữ nguyên. Dùng phần bên dưới để
          hẹn đăng sang Fanpage khác.
        </div>
      )}

      {batchSiblings.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">
            Cùng đợt đăng ({post.batchId?.slice(0, 8)}…)
          </h3>
          <p className="text-xs text-gray-500 mb-3">
            Các Fanpage khác — sửa/xóa từng dòng riêng tại /posts.
          </p>
          <ul className="text-sm space-y-2">
            {batchSiblings.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-2 border-b border-gray-50 pb-2 last:border-0"
              >
                <span className="font-medium">{s.pageName ?? "—"}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100">
                  {STATUS_LABEL[s.status] ?? s.status}
                </span>
                {s.facebookUrl && (
                  <a
                    href={s.facebookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Facebook ↗
                  </a>
                )}
                <Link
                  href={`/posts/${s.id}/edit`}
                  className="text-xs text-blue-600 hover:underline ml-auto"
                >
                  Mở bài
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg text-sm">{success}</div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <p className="text-sm text-gray-500">
          Trạng thái: <strong>{STATUS_LABEL[post.status] ?? post.status}</strong>
          {post.pageName ? ` · Fanpage: ${post.pageName}` : null}
        </p>

        {editable && (
          <p className="text-xs text-blue-800 bg-blue-50 px-3 py-2 rounded-md">
            Đổi Fanpage bên dưới = chuyển <strong>bài chờ đăng này</strong> sang Page khác, không
            tạo thêm bài trên Page cũ.
          </p>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Facebook App</label>
          <select
            value={workspaceAppId}
            onChange={(e) => {
              setWorkspaceAppId(e.target.value);
              const first = allPages.find(
                (p) =>
                  p.workspaceAppId === e.target.value && p.tokenStatus === "active"
              );
              if (first) setFacebookPageId(first.id);
            }}
            disabled={!editable}
            className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-60"
          >
            {apps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Fanpage cho bài này
          </label>
          <select
            value={facebookPageId}
            onChange={(e) => setFacebookPageId(e.target.value)}
            disabled={!editable}
            className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-60"
          >
            {appPages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.pageName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nội dung</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={!editable}
            rows={8}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-60"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Bình luận đầu tiên
          </label>
          <textarea
            value={firstComment}
            onChange={(e) => setFirstComment(e.target.value)}
            disabled={!editable}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-60"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Hẹn giờ đăng</label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            disabled={!editable}
            className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-60"
          />
        </div>

        {post.media.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Media (giữ nguyên file)</p>
            <ul className="space-y-3">
              {post.media.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-start gap-3 text-xs text-gray-600 border border-gray-100 rounded-lg p-3"
                >
                  {m.fileType === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.url}
                      alt={m.fileName}
                      className="w-28 h-28 object-cover rounded-md border border-gray-200 shrink-0"
                    />
                  ) : (
                    <video
                      src={m.url}
                      controls
                      className="max-w-xs max-h-40 rounded-md border border-gray-200 bg-black shrink-0"
                      preload="metadata"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-800 text-sm mb-1">{m.fileName}</p>
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline break-all"
                    >
                      {m.url}
                    </a>
                    <p className="text-[10px] text-gray-400 mt-1">
                      File trên server: uploads/{m.filePath}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {canCloneToMore && (
        <div className="bg-white border border-green-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">
            Đăng thêm Fanpage khác (tạo bài mới)
          </h3>
          <p className="text-xs text-gray-500 mb-3">
            Tạo bản ghi + hàng đợi mới cho từng Page tick chọn.{" "}
            <strong>Không sửa</strong> bài đã đăng; không đổi bài đang chờ của Fanpage hiện
            tại (trừ khi bạn Lưu ở form trên).
          </p>
          {!editable && (
            <p className="text-xs text-amber-800 bg-amber-50 px-2 py-1.5 rounded mb-3">
              Dùng nội dung đang hiển thị (bài đã đăng) làm mẫu cho lần hẹn mới.
            </p>
          )}
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              type="button"
              onClick={selectAllExtraPages}
              disabled={otherPages.length === 0 || loading}
              className="text-xs font-medium text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-md disabled:opacity-50"
            >
              Chọn tất cả
            </button>
            <button
              type="button"
              onClick={invertExtraPages}
              disabled={otherPages.length === 0 || loading}
              className="text-xs font-medium text-gray-700 border border-gray-200 bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-md disabled:opacity-50"
            >
              Đảo ngược
            </button>
            <span className="text-xs text-gray-500 self-center">
              {extraPageIds.size}/{otherPages.length} Fanpage
            </span>
          </div>
          <ul className="space-y-2 mb-4">
            {otherPages.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={extraPageIds.has(p.id)}
                  onChange={() => toggleExtra(p.id)}
                  className="rounded border-gray-300"
                />
                {p.pageName}
              </label>
            ))}
          </ul>
          <button
            type="button"
            onClick={handleCloneToPages}
            disabled={loading}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
          >
            Tạo hàng đợi cho {extraPageIds.size || "…"} Fanpage
          </button>
        </div>
      )}

      <div className="flex gap-3 flex-wrap items-center">
        {editable && (
          <>
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm disabled:opacity-50"
            >
              {loading ? "Đang lưu..." : "Lưu (chỉ Fanpage này)"}
            </button>
            <button
              type="button"
              disabled={loading || !facebookPageId}
              onClick={async () => {
                setLoading(true);
                setError("");
                try {
                  const saveRes = await fetch(`/api/posts/${post.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      content: content.trim(),
                      firstComment: firstComment.trim() || null,
                      facebookPageId: facebookPageId || null,
                      ...(scheduledAt
                        ? { scheduledAt: new Date(scheduledAt).toISOString() }
                        : {}),
                    }),
                  });
                  if (!saveRes.ok) {
                    const d = await saveRes.json();
                    setError(d.error || "Không lưu được trước khi Run now.");
                    return;
                  }
                  const runRes = await fetch(`/api/posts/${post.id}/run-now`, {
                    method: "POST",
                  });
                  const runData = await runRes.json();
                  if (!runRes.ok) {
                    setError(runData.error || "Run now thất bại.");
                    return;
                  }
                  router.push("/posts");
                  router.refresh();
                } catch {
                  setError("Lỗi kết nối.");
                } finally {
                  setLoading(false);
                }
              }}
              className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Run now
            </button>
          </>
        )}
        {describeDeleteImpact(post.status).allow && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="text-red-600 border border-red-200 hover:bg-red-50 px-5 py-2 rounded-lg text-sm disabled:opacity-50"
          >
            Xóa bản ghi này
          </button>
        )}
        <Link
          href="/posts"
          className="border border-gray-300 text-gray-700 px-5 py-2 rounded-lg text-sm"
        >
          Quay lại
        </Link>
      </div>
    </form>
  );
}
