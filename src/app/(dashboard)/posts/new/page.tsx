"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  FanpageAppPicker,
  filterPagesForApp,
  type PageOption,
} from "@/components/fanpage-app-picker";
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
  const [allPages, setAllPages] = useState<PageOption[]>([]);
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
  const [postMode, setPostMode] = useState<"queue" | "manual">("queue");

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

  const pickerPages = useMemo(
    () =>
      filterPagesForApp(allPages, workspaceAppId, {
        includePendingManual: postMode === "manual",
      }),
    [allPages, workspaceAppId, postMode]
  );

  useEffect(() => {
    setSelectedPageIds(new Set(pickerPages.map((p) => p.id)));
  }, [pickerPages, workspaceAppId, postMode]);

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
    if (selectedPageIds.size === 0) {
      setError("Chọn ít nhất một Fanpage.");
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

  const canPublish =
    postMode === "queue" &&
    apps.length > 0 &&
    selectedPageIds.size > 0 &&
    pickerPages.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tạo bài viết mới"
        description={
          postMode === "manual"
            ? "Lưu nháp rồi vào /posts → «Đăng» từng Page, copy nội dung/video và tick «Đã đăng». Không cần token active."
            : 'Hàng đợi bắt đầu từ "Hẹn giờ đăng"; cron chạy mỗi phút, đăng lần lượt từng Fanpage (Page cách nhau theo cài đặt trên /posts).'
        }
      />

      {error && <div className={ui.alertError}>{error}</div>}

      <div className="space-y-6">
        <div className={`${ui.card} ${ui.cardPad} space-y-4`}>
          <label className="block text-sm font-medium text-gray-700">
            Cách đăng
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPostMode("queue")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                postMode === "queue"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Queue (token active)
            </button>
            <button
              type="button"
              onClick={() => setPostMode("manual")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                postMode === "manual"
                  ? "bg-violet-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Đăng thủ công
            </button>
          </div>
          {postMode === "manual" ? (
            <p className={`text-xs ${ui.hint}`}>
              Chọn <strong>Facebook App</strong> rồi Fanpage (token hoặc <strong>Thủ công</strong> đã
              gán App trên /pages). Lưu nháp → /posts → «Đăng» từng Page.
            </p>
          ) : null}

          <label className="block text-sm font-medium text-gray-700 pt-2">
            Đích đăng
          </label>

          {apps.length === 0 ? (
            <p className="text-sm text-amber-800">
              Chưa có Facebook App.{" "}
              <a href="/apps" className="text-blue-600 hover:underline">
                Tạo App
              </a>{" "}
              {postMode === "queue"
                ? "trước khi queue."
                : "và gán App cho Page thủ công trên /pages."}
            </p>
          ) : (
            <FanpageAppPicker
              apps={apps}
              allPages={allPages}
              workspaceAppId={workspaceAppId}
              onWorkspaceAppIdChange={setWorkspaceAppId}
              selectedPageIds={selectedPageIds}
              onSelectedPageIdsChange={setSelectedPageIds}
              includePendingManual={postMode === "manual"}
            />
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

        {postMode === "queue" ? (
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
              Queue chỉ chạy từ thời điểm này. Khoảng cách giữa các Page: cài trên /posts.
            </p>
          </div>
        ) : null}

        <div className="flex gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving || scheduling}
            className={
              postMode === "manual"
                ? ui.btnPrimary
                : "inline-flex items-center justify-center bg-gray-600 text-white text-sm font-medium px-6 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
            }
          >
            {saving
              ? "Đang lưu..."
              : postMode === "manual"
                ? "Lưu — đăng thủ công trên /posts"
                : "Lưu nháp"}
          </button>
          {postMode === "queue" ? (
            <>
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
            </>
          ) : null}
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
