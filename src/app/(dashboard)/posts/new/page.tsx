"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageCategorySelectBar } from "@/components/page-category-select-bar";
import { PageHeader } from "@/components/page-header";
import { ui } from "@/lib/dashboard-ui";
import { MediaThumbList } from "@/components/media-thumb-list";
import { FileDropHint, FileDropZone } from "@/components/file-drop-zone";
import { POST_MEDIA_ACCEPT, uploadMediaFiles } from "@/lib/upload-client";
import { datetimeLocalInAppTzToIso } from "@/lib/scheduled-at";

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
  categoryId: string | null;
  categoryName: string | null;
}

interface AppOption {
  id: string;
  name: string;
}

export default function NewPostPage() {
  const router = useRouter();
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
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [importingYt, setImportingYt] = useState(false);
  const [driveImportType, setDriveImportType] = useState<"text" | "media">("text");
  const [scheduledAt, setScheduledAt] = useState("");
  const [scheduling, setScheduling] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("autopost_reel");
      if (raw) {
        const reel = JSON.parse(raw) as MediaFile;
        if (reel?.filePath && reel?.url) {
          setMedia((prev) =>
            prev.some((m) => m.filePath === reel.filePath) ? prev : [...prev, reel]
          );
        }
        sessionStorage.removeItem("autopost_reel");
      }
    } catch {
      // ignore
    }
  }, []);

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

  function invertPageSelection() {
    setSelectedPageIds((prev) => {
      const next = new Set<string>();
      for (const p of appPages) {
        if (!prev.has(p.id)) next.add(p.id);
      }
      return next;
    });
  }

  async function addMediaFiles(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    setError("");
    const { uploaded, errors } = await uploadMediaFiles(files);
    if (errors.length > 0) setError(errors[0]);
    if (uploaded.length > 0) {
      setMedia((prev) => [
        ...prev,
        ...uploaded.map((data) => ({
          filePath: data.filePath,
          fileName: data.fileName,
          fileSize: data.fileSize,
          mimeType: data.mimeType,
          fileType: data.fileType,
          url: data.url,
        })),
      ]);
    }
    setUploading(false);
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

  async function handleImportYouTube() {
    if (!youtubeUrl.trim()) {
      setError("Dán link YouTube.");
      return;
    }
    setImportingYt(true);
    setError("");
    try {
      const res = await fetch("/api/import/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: youtubeUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Không tải được video YouTube.");
        return;
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
      setYoutubeUrl("");
    } catch {
      setError("Lỗi kết nối khi tải YouTube.");
    } finally {
      setImportingYt(false);
    }
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
          facebookPageIds: [...selectedPageIds],
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
    await submitToQueue(datetimeLocalInAppTzToIso(scheduledAt));
  }

  async function handlePostNow() {
    await submitToQueue(new Date().toISOString());
  }

  const canPublish = apps.length > 0 && selectedPageIds.size > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tạo bài viết mới"
        description='Hàng đợi bắt đầu từ "Hẹn giờ đăng"; cron chạy mỗi phút, đăng lần lượt từng Fanpage.'
      />

      {error && <div className={ui.alertError}>{error}</div>}

      <div className="space-y-6">
        <div className={`${ui.card} ${ui.cardPad} space-y-4`}>
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
                  className={`${ui.select} w-full max-w-md`}
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
                <>
                <div className="flex flex-wrap gap-2 mb-2">
                  <button
                    type="button"
                    onClick={invertPageSelection}
                    className={ui.btnSm}
                  >
                    Đảo ngược
                  </button>
                  <span className="text-xs text-gray-500 self-center">
                    {selectedPageIds.size}/{appPages.length} Fanpage
                  </span>
                </div>
                <PageCategorySelectBar
                  pages={appPages}
                  selected={selectedPageIds}
                  onSelectedChange={setSelectedPageIds}
                />
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
                      <span className="text-sm text-gray-900 flex-1 min-w-0">
                        {p.pageName}
                        {p.categoryName ? (
                          <span className="block text-[10px] text-gray-400 truncate">
                            {p.categoryName}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
                </>
              )}
              <p className="text-xs text-gray-500">
                Đã chọn {selectedPageIds.size} / {appPages.length} Fanpage trong
                App này.
              </p>
            </>
          )}
        </div>

        <div className={`${ui.card} ${ui.cardPad}`}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Import từ Google Drive
          </label>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setDriveImportType("text")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                driveImportType === "text"
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Nội dung text
            </button>
            <button
              type="button"
              onClick={() => setDriveImportType("media")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                driveImportType === "media"
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
              className={`${ui.input} flex-1`}
              placeholder="Link Google Docs / Drive"
            />
            <button
              type="button"
              onClick={handleImportDrive}
              disabled={importing || !driveUrl.trim()}
              className={ui.btnSuccess}
            >
              {importing ? "..." : "Import"}
            </button>
          </div>
        </div>

        <div className={`${ui.card} ${ui.cardPad}`}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tải video từ YouTube
          </label>
          <p className="text-xs text-gray-500 mb-3">
            Giống YouTubeLocVideo: dán 1 link watch / Shorts / youtu.be — server
            tải mp4 (tối đa 1080p, 80MB), không tải cả playlist.
          </p>
          <div className="flex gap-2">
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              className={`${ui.input} flex-1`}
              placeholder="https://www.youtube.com/watch?v=..."
            />
            <button
              type="button"
              onClick={handleImportYouTube}
              disabled={importingYt || !youtubeUrl.trim()}
              className="inline-flex items-center justify-center bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {importingYt ? "Đang tải..." : "Tải video"}
            </button>
          </div>
        </div>

        <div className={`${ui.card} ${ui.cardPad} space-y-6`}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nội dung bài viết
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              className={ui.textarea}
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
              className={ui.textarea}
              placeholder="Tùy chọn — sau khi đăng bài, hệ thống tự comment dưới bài (tên Page)."
            />
            <p className="mt-1 text-xs text-gray-500">
              Để trống nếu không cần. Cần quyền{" "}
              <code className="text-gray-600">pages_manage_engagement</code> — có thể
              phải kết nối lại Page nếu token cũ thiếu quyền.
            </p>
          </div>
        </div>

        <div className={`${ui.card} ${ui.cardPad}`}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Ảnh / Video
          </label>
          <MediaThumbList items={media} onRemove={removeMedia} />
          <FileDropZone
            accept={POST_MEDIA_ACCEPT}
            multiple
            disabled={uploading}
            onFiles={addMediaFiles}
            className="mt-2"
          >
            <FileDropHint
              busy={uploading}
              extra="Ảnh JPG/PNG/GIF/WebP · Video MP4/MOV · Nhiều file"
            />
          </FileDropZone>
        </div>

        <div className={`${ui.card} ${ui.cardPad}`}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Hẹn giờ đăng
          </label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            min={new Date().toISOString().slice(0, 16)}
            className={`${ui.input} w-full max-w-md`}
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
            className="inline-flex items-center justify-center bg-gray-600 text-white text-sm font-medium px-6 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Đang lưu..." : "Lưu nháp"}
          </button>
          <button
            type="button"
            onClick={handleSchedule}
            disabled={saving || scheduling || !scheduledAt || !canPublish}
            className={ui.btnPrimary}
          >
            {scheduling ? "Đang xử lý..." : "Hẹn giờ đăng (queue)"}
          </button>
          <button
            type="button"
            onClick={handlePostNow}
            disabled={saving || scheduling || !canPublish}
            className={ui.btnSuccess}
          >
            Đăng ngay (vào queue)
          </button>
          <button
            type="button"
            onClick={() => router.push("/posts")}
            className={ui.btnSecondary}
          >
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
}
