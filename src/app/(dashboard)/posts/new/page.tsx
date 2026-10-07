"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface MediaFile {
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileType: string;
  url: string;
}

interface FacebookPageOption {
  id: string;
  pageName: string;
  pageAvatar: string | null;
  tokenStatus: string;
  workspaceAppId: string | null;
}

interface AppOption {
  id: string;
  name: string;
}

export default function NewPostPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState("");
  const [firstComment, setFirstComment] = useState("");
  const [apps, setApps] = useState<AppOption[]>([]);
  const [workspaceAppId, setWorkspaceAppId] = useState("");
  const [allPages, setAllPages] = useState<FacebookPageOption[]>([]);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(
    () => new Set()
  );
  const [media, setMedia] = useState<MediaFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [driveUrl, setDriveUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [driveImportType, setDriveImportType] = useState<"text" | "media">("text");
  const [scheduledAt, setScheduledAt] = useState("");
  const [scheduling, setScheduling] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/workspace-apps").then((r) => r.json()),
      fetch("/api/facebook-pages").then((r) => r.json()),
    ])
      .then(([appsData, pagesData]) => {
        if (appsData.apps?.length) {
          setApps(appsData.apps);
          setWorkspaceAppId(appsData.apps[0].id);
        }
        if (pagesData.pages) {
          setAllPages(pagesData.pages);
        }
      })
      .catch(() => {});
  }, []);

  const appPages = allPages.filter(
    (p) =>
      p.tokenStatus === "active" &&
      p.workspaceAppId === workspaceAppId
  );

  useEffect(() => {
    setSelectedPageIds(new Set(appPages.map((p) => p.id)));
  }, [workspaceAppId, allPages]);

  const allSelected =
    appPages.length > 0 && selectedPageIds.size === appPages.length;
  const someSelected =
    selectedPageIds.size > 0 && selectedPageIds.size < appPages.length;

  function togglePage(id: string) {
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedPageIds(new Set());
    } else {
      setSelectedPageIds(new Set(appPages.map((p) => p.id)));
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError("");

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/api/uploads", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Upload thất bại.");
          continue;
        }

        setMedia((prev) => [
          ...prev,
          {
            filePath: data.filePath,
            fileName: data.fileName,
            fileSize: data.fileSize,
            mimeType: data.mimeType,
            fileType: data.fileType,
            url: data.url,
          },
        ]);
      } catch {
        setError("Upload thất bại. Vui lòng thử lại.");
      }
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeMedia(index: number) {
    setMedia((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleImportDrive() {
    if (!driveUrl.trim()) {
      setError("Vui lòng nhập Google Drive URL.");
      return;
    }

    setImporting(true);
    setError("");

    try {
      const res = await fetch("/api/import/gdrive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: driveUrl.trim(), type: driveImportType }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Không thể import nội dung.");
        return;
      }

      if (driveImportType === "media") {
        setMedia((prev) => [
          ...prev,
          {
            filePath: data.filePath,
            fileName: data.fileName,
            fileSize: data.fileSize,
            mimeType: data.mimeType,
            fileType: data.fileType,
            url: data.url,
          },
        ]);
      } else if (content.trim()) {
        setContent((prev) => prev + "\n\n" + data.content);
      } else {
        setContent(data.content);
      }
      setDriveUrl("");
    } catch {
      setError("Lỗi kết nối. Vui lòng thử lại.");
    } finally {
      setImporting(false);
    }
  }

  function mediaPayload() {
    return media.map((m) => ({
      filePath: m.filePath,
      fileName: m.fileName,
      fileSize: m.fileSize,
      mimeType: m.mimeType,
      fileType: m.fileType,
    }));
  }

  async function handleSaveDraft() {
    if (!content.trim() && media.length === 0) {
      setError("Vui lòng nhập nội dung hoặc thêm media.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          firstComment: firstComment.trim() || undefined,
          facebookPageId:
            selectedPageIds.size === 1
              ? [...selectedPageIds][0]
              : undefined,
          media: mediaPayload(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Không thể lưu bài viết.");
        return;
      }

      router.push("/posts");
      router.refresh();
    } catch {
      setError("Lỗi kết nối. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  }

  async function submitToQueue(scheduledAtIso: string) {
    if (!content.trim()) {
      setError("Vui lòng nhập nội dung bài viết.");
      return;
    }
    if (!workspaceAppId) {
      setError("Chọn Facebook App.");
      return;
    }
    if (selectedPageIds.size === 0) {
      setError("Chọn ít nhất một Fanpage.");
      return;
    }

    setScheduling(true);
    setError("");

    try {
      const res = await fetch("/api/posts/schedule-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          firstComment: firstComment.trim() || undefined,
          media: mediaPayload(),
          scheduledAt: scheduledAtIso,
          facebookPageIds: [...selectedPageIds],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Không thể thêm vào hàng đợi.");
        return;
      }

      router.push("/posts");
      router.refresh();
    } catch {
      setError("Lỗi kết nối. Vui lòng thử lại.");
    } finally {
      setScheduling(false);
    }
  }

  async function handleSchedule() {
    if (!scheduledAt) {
      setError("Vui lòng chọn thời gian đăng.");
      return;
    }
    await submitToQueue(new Date(scheduledAt).toISOString());
  }

  async function handlePostNow() {
    await submitToQueue(new Date().toISOString());
  }

  const canPublish = apps.length > 0 && selectedPageIds.size > 0;

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Tạo bài viết mới</h2>
        <p className="text-sm text-gray-500 mt-1">
          Hàng đợi bắt đầu từ &quot;Hẹn giờ đăng&quot;; cron chạy mỗi phút, đăng lần lượt từng Page.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-md text-sm mb-6">
          {error}
        </div>
      )}

      <div className="space-y-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <label className="block text-sm font-medium text-gray-700">
            Đích đăng
          </label>

          {apps.length === 0 ? (
            <p className="text-sm text-amber-800">
              Chưa có Facebook App.{" "}
              <a href="/apps" className="text-blue-600 hover:underline">
                Tạo App
              </a>{" "}
              trước.
            </p>
          ) : (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Facebook App
                </label>
                <select
                  value={workspaceAppId}
                  onChange={(e) => setWorkspaceAppId(e.target.value)}
                  className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  {apps.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              {appPages.length === 0 ? (
                <p className="text-sm text-gray-500">
                  App này chưa có Page active.{" "}
                  <a href="/pages" className="text-blue-600 hover:underline">
                    Kết nối Page
                  </a>
                </p>
              ) : (
                <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
                  <label className="flex items-center gap-3 px-4 py-3 bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm font-medium text-gray-800">
                      Chọn tất cả ({appPages.length} Fanpage)
                    </span>
                  </label>
                  {appPages.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/80"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPageIds.has(p.id)}
                        onChange={() => togglePage(p.id)}
                        className="rounded border-gray-300"
                      />
                      {p.pageAvatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.pageAvatar}
                          alt=""
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium">
                          {p.pageName.charAt(0)}
                        </div>
                      )}
                      <span className="text-sm text-gray-900">{p.pageName}</span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-500">
                Đã chọn {selectedPageIds.size} / {appPages.length} Fanpage trong
                App này.
              </p>
            </>
          )}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Import từ Google Drive
          </label>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setDriveImportType("text")}
              className={`px-3 py-1.5 rounded-md text-sm ${
                driveImportType === "text"
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              Nội dung text
            </button>
            <button
              type="button"
              onClick={() => setDriveImportType("media")}
              className={`px-3 py-1.5 rounded-md text-sm ${
                driveImportType === "media"
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              Ảnh / Video
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="url"
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
              placeholder="Link Google Docs / Drive"
            />
            <button
              type="button"
              onClick={handleImportDrive}
              disabled={importing || !driveUrl.trim()}
              className="bg-green-600 text-white py-2 px-4 rounded-md text-sm disabled:opacity-50"
            >
              {importing ? "..." : "Import"}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nội dung bài viết
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-y"
              placeholder="Viết nội dung bài đăng Facebook..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Bình luận đầu tiên
            </label>
            <textarea
              value={firstComment}
              onChange={(e) => setFirstComment(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-y"
              placeholder="Tùy chọn — sau khi đăng bài, hệ thống tự comment dưới bài (tên Page)."
            />
            <p className="mt-1 text-xs text-gray-500">
              Để trống nếu không cần. Cần quyền{" "}
              <code className="text-gray-600">pages_manage_engagement</code> — có thể
              phải kết nối lại Page nếu token cũ thiếu quyền.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Ảnh / Video
          </label>
          <div className="flex flex-wrap gap-3 mb-4">
            {media.map((m, i) => (
              <div key={i} className="relative group border rounded-lg overflow-hidden">
                {m.fileType === "image" ? (
                  <img src={m.url} alt={m.fileName} className="w-24 h-24 object-cover" />
                ) : (
                  <div className="w-24 h-24 bg-gray-100 flex items-center justify-center text-2xl">
                    🎬
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeMedia(i)}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="border border-gray-300 text-gray-700 py-2 px-4 rounded-md text-sm disabled:opacity-50"
          >
            {uploading ? "Đang tải..." : "Thêm ảnh/video"}
          </button>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Hẹn giờ đăng
          </label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            min={new Date().toISOString().slice(0, 16)}
            className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            Queue chỉ chạy từ thời điểm này. Mỗi Page trong batch cách nhau ~1 phút (cron).
          </p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving || scheduling}
            className="bg-gray-600 text-white py-2 px-6 rounded-md text-sm disabled:opacity-50"
          >
            {saving ? "Đang lưu..." : "Lưu nháp"}
          </button>
          <button
            type="button"
            onClick={handleSchedule}
            disabled={saving || scheduling || !scheduledAt || !canPublish}
            className="bg-blue-600 text-white py-2 px-6 rounded-md text-sm disabled:opacity-50"
          >
            {scheduling ? "Đang xử lý..." : "Hẹn giờ đăng (queue)"}
          </button>
          <button
            type="button"
            onClick={handlePostNow}
            disabled={saving || scheduling || !canPublish}
            className="bg-green-600 text-white py-2 px-6 rounded-md text-sm disabled:opacity-50"
          >
            Đăng ngay (vào queue)
          </button>
          <button
            type="button"
            onClick={() => router.push("/posts")}
            className="border border-gray-300 text-gray-700 py-2 px-6 rounded-md text-sm"
          >
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
}
