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
  // For local preview before upload
  previewUrl?: string;
}

interface FacebookPageOption {
  id: string;
  pageName: string;
  tokenStatus: string;
}

export default function NewPostPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState("");
  const [facebookPageId, setFacebookPageId] = useState("");
  const [pages, setPages] = useState<FacebookPageOption[]>([]);
  const [media, setMedia] = useState<MediaFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [driveUrl, setDriveUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [aiUrl, setAiUrl] = useState("");
  const [aiTopic, setAiTopic] = useState("");
  const [aiTone, setAiTone] = useState("friendly");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiMode, setAiMode] = useState<"url" | "topic">("topic");

  useEffect(() => {
    fetch("/api/facebook-pages")
      .then((r) => r.json())
      .then((data) => {
        if (data.pages) {
          setPages(data.pages.filter((p: FacebookPageOption) => p.tokenStatus === "active"));
        }
      })
      .catch(() => {});
  }, []);

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
    // Reset input
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
        body: JSON.stringify({ url: driveUrl.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Không thể import nội dung.");
        setImporting(false);
        return;
      }

      // Append or replace content
      if (content.trim()) {
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

  async function handleAiGenerate() {
    const input = aiMode === "url" ? aiUrl.trim() : aiTopic.trim();
    if (!input) {
      setError(aiMode === "url" ? "Vui lòng nhập URL." : "Vui lòng nhập chủ đề.");
      return;
    }

    setAiGenerating(true);
    setError("");

    try {
      const body: Record<string, string> = { tone: aiTone };
      if (aiMode === "url") body.url = input;
      else body.topic = input;

      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      // Check response is JSON
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        setError("Lỗi server. Vui lòng thử lại.");
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Không thể tạo nội dung AI.");
        return;
      }

      if (content.trim()) {
        setContent((prev) => prev + "\n\n" + data.content);
      } else {
        setContent(data.content);
      }
    } catch {
      setError("Lỗi kết nối AI. Vui lòng thử lại.");
    } finally {
      setAiGenerating(false);
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
          facebookPageId: facebookPageId || undefined,
          media: media.map((m) => ({
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
        setError(data.error || "Không thể lưu bài viết.");
        setSaving(false);
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

  async function handleSchedule() {
    if (!content.trim()) {
      setError("Vui lòng nhập nội dung bài viết.");
      return;
    }
    if (!facebookPageId) {
      setError("Vui lòng chọn Facebook Page.");
      return;
    }
    if (!scheduledAt) {
      setError("Vui lòng chọn thời gian đăng.");
      return;
    }

    setScheduling(true);
    setError("");

    try {
      // Create draft first
      const createRes = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          facebookPageId,
          media: media.map((m) => ({
            filePath: m.filePath,
            fileName: m.fileName,
            fileSize: m.fileSize,
            mimeType: m.mimeType,
            fileType: m.fileType,
          })),
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) {
        setError(createData.error || "Không thể tạo bài viết.");
        setScheduling(false);
        return;
      }

      // Schedule it — send with timezone info
      const scheduleRes = await fetch(`/api/posts/${createData.post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: new Date(scheduledAt).toISOString() }),
      });

      const scheduleData = await scheduleRes.json();
      if (!scheduleRes.ok) {
        setError(scheduleData.error || "Không thể hẹn giờ.");
        setScheduling(false);
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

  async function handlePostNow() {
    if (!content.trim()) {
      setError("Vui lòng nhập nội dung bài viết.");
      return;
    }
    if (!facebookPageId) {
      setError("Vui lòng chọn Facebook Page.");
      return;
    }

    setScheduling(true);
    setError("");

    try {
      // Create draft
      const createRes = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          facebookPageId,
          media: media.map((m) => ({
            filePath: m.filePath,
            fileName: m.fileName,
            fileSize: m.fileSize,
            mimeType: m.mimeType,
            fileType: m.fileType,
          })),
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) {
        setError(createData.error || "Không thể tạo bài viết.");
        setScheduling(false);
        return;
      }

      // Publish immediately via publish endpoint
      const publishRes = await fetch(`/api/posts/${createData.post.id}/publish`, {
        method: "POST",
      });

      const publishData = await publishRes.json();
      if (!publishRes.ok) {
        setError(publishData.error || "Không thể đăng bài lên Facebook.");
        setScheduling(false);
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

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Tạo bài viết mới</h2>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-md text-sm mb-6">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Facebook Page selector */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Facebook Page
          </label>
          {pages.length > 0 ? (
            <select
              value={facebookPageId}
              onChange={(e) => setFacebookPageId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">Chọn Page (tùy chọn)</option>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.pageName}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-gray-500">
              Chưa kết nối Page nào.{" "}
              <a href="/pages" className="text-blue-600 hover:underline">
                Kết nối Page
              </a>
            </p>
          )}
        </div>

        {/* AI Content Generation */}
        <div className="bg-white rounded-lg border border-purple-200 p-6">
          <label className="block text-sm font-medium text-purple-700 mb-3">
            ✨ AI Tạo nội dung
          </label>

          {/* Mode toggle */}
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setAiMode("topic")}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                aiMode === "topic"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              📝 Theo chủ đề
            </button>
            <button
              type="button"
              onClick={() => setAiMode("url")}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                aiMode === "url"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              🔗 Từ URL
            </button>
          </div>

          {/* Input */}
          {aiMode === "topic" ? (
            <input
              type="text"
              value={aiTopic}
              onChange={(e) => setAiTopic(e.target.value)}
              placeholder="Nhập chủ đề (VD: kinh nghiệm chăm sóc da mùa hè)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm mb-3"
            />
          ) : (
            <input
              type="url"
              value={aiUrl}
              onChange={(e) => setAiUrl(e.target.value)}
              placeholder="Paste URL bài viết (VD: https://example.com/bai-viet)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm mb-3"
            />
          )}

          {/* Tone selector + Generate button */}
          <div className="flex gap-2 items-center">
            <select
              value={aiTone}
              onChange={(e) => setAiTone(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="friendly">🤝 Thân thiện</option>
              <option value="professional">💼 Chuyên nghiệp</option>
              <option value="humorous">😄 Hài hước</option>
              <option value="inspiring">🌟 Truyền cảm hứng</option>
              <option value="storytelling">📖 Kể chuyện</option>
            </select>
            <button
              type="button"
              onClick={handleAiGenerate}
              disabled={aiGenerating}
              className="bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 disabled:opacity-50 text-sm transition-colors whitespace-nowrap"
            >
              {aiGenerating ? "⏳ Đang tạo..." : "✨ Tạo nội dung"}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            AI sẽ viết bài Facebook dựa trên chủ đề hoặc nội dung URL. Bạn có thể chỉnh sửa trước khi đăng.
          </p>
        </div>

        {/* Google Drive import */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Import từ Google Drive
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
              placeholder="Paste link Google Docs / Drive"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <button
              onClick={handleImportDrive}
              disabled={importing || !driveUrl.trim()}
              className="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50 text-sm transition-colors whitespace-nowrap"
            >
              {importing ? "Đang import..." : "📥 Import"}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Hỗ trợ: Google Docs, Google Sheets, Google Drive files (public link).
          </p>
        </div>

        {/* Content editor */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Nội dung bài viết
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-y"
            placeholder="Viết nội dung bài đăng Facebook..."
          />
          <p className="mt-1 text-xs text-gray-400">
            {content.length} ký tự
          </p>
        </div>

        {/* Media upload */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Ảnh / Video
          </label>

          <div className="flex flex-wrap gap-3 mb-4">
            {media.map((m, i) => (
              <div
                key={i}
                className="relative group border border-gray-200 rounded-lg overflow-hidden"
              >
                {m.fileType === "image" ? (
                  <img
                    src={m.url}
                    alt={m.fileName}
                    className="w-24 h-24 object-cover"
                  />
                ) : (
                  <div className="w-24 h-24 bg-gray-100 flex items-center justify-center">
                    <div className="text-center">
                      <span className="text-2xl">🎬</span>
                      <p className="text-xs text-gray-500 truncate w-20 px-1">
                        {m.fileName}
                      </p>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => removeMedia(i)}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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
            id="media-upload"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="border border-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-50 disabled:opacity-50 text-sm transition-colors"
          >
            {uploading ? "Đang tải lên..." : "📎 Thêm ảnh/video"}
          </button>
        </div>

        {/* Schedule */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Hẹn giờ đăng
          </label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            min={new Date().toISOString().slice(0, 16)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            Để trống nếu chỉ muốn lưu nháp.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={handleSaveDraft}
            disabled={saving || scheduling}
            className="bg-gray-600 text-white py-2 px-6 rounded-md hover:bg-gray-700 disabled:opacity-50 text-sm transition-colors"
          >
            {saving ? "Đang lưu..." : "💾 Lưu nháp"}
          </button>
          <button
            onClick={handleSchedule}
            disabled={saving || scheduling || !scheduledAt || !facebookPageId}
            className="bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors"
          >
            {scheduling ? "Đang xử lý..." : "🕐 Hẹn giờ đăng"}
          </button>
          <button
            onClick={handlePostNow}
            disabled={saving || scheduling || !facebookPageId}
            className="bg-green-600 text-white py-2 px-6 rounded-md hover:bg-green-700 disabled:opacity-50 text-sm transition-colors"
          >
            🚀 Đăng ngay
          </button>
          <button
            onClick={() => router.push("/posts")}
            className="border border-gray-300 text-gray-700 py-2 px-6 rounded-md hover:bg-gray-50 text-sm transition-colors"
          >
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
}
