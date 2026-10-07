"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

interface MediaItem {
  id: string;
  filePath: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  mimeType: string;
  url: string;
}

interface PostDetail {
  id: string;
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
}

function toLocalDatetimeValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PostEditForm({ post, apps }: Props) {
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

  function toggleExtra(id: string) {
    setExtraPageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
      setSuccess("Đã lưu bài viết.");
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
      setSuccess(`Đã thêm ${data.pageCount} bài vào hàng đợi.`);
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
      {!editable && (
        <div className="bg-amber-50 text-amber-900 px-4 py-3 rounded-lg text-sm">
          Bài đã đăng — chỉ xem, không sửa được nội dung gốc.
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
          Trạng thái: <strong>{post.status}</strong>
          {post.pageName ? ` · Page hiện tại: ${post.pageName}` : null}
        </p>

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
            <ul className="text-xs text-gray-600 space-y-1">
              {post.media.map((m) => (
                <li key={m.id}>
                  {m.fileType === "video" ? "🎬" : "🖼"} {m.fileName}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {editable && otherPages.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">
            Đăng thêm bản copy sang Page khác (cùng App)
          </h3>
          <p className="text-xs text-gray-500 mb-3">
            Tạo bài mới trong hàng đợi với cùng nội dung/media, không đổi bài hiện tại.
          </p>
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
            Thêm vào hàng đợi ({extraPageIds.size} Page)
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
              {loading ? "Đang lưu..." : "Lưu thay đổi"}
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
