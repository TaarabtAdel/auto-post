"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ui } from "@/lib/dashboard-ui";

export interface WorkspaceAppRow {
  id: string;
  name: string;
  description: string | null;
  facebookAppId: string;
  hasUserToken?: boolean;
}

interface Props {
  initialApps: WorkspaceAppRow[];
}

export function WorkspaceAppsManager({ initialApps }: Props) {
  const router = useRouter();
  const [apps, setApps] = useState(initialApps);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [facebookAppId, setFacebookAppId] = useState("");
  const [facebookAppSecret, setFacebookAppSecret] = useState("");
  const [userAccessToken, setUserAccessToken] = useState("");
  const [clearUserToken, setClearUserToken] = useState(false);

  function resetForm() {
    setName("");
    setDescription("");
    setFacebookAppId("");
    setFacebookAppSecret("");
    setUserAccessToken("");
    setClearUserToken(false);
    setEditingId(null);
  }

  function startEdit(app: WorkspaceAppRow) {
    setEditingId(app.id);
    setName(app.name);
    setDescription(app.description || "");
    setFacebookAppId(app.facebookAppId);
    setFacebookAppSecret("");
    setUserAccessToken("");
    setClearUserToken(false);
    setError("");
    setSuccess("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const payload: Record<string, string | null> = {
        name: name.trim(),
        description: description.trim(),
        facebookAppId: facebookAppId.trim(),
      };
      if (facebookAppSecret.trim()) {
        payload.facebookAppSecret = facebookAppSecret.trim();
      }
      if (clearUserToken && editingId) {
        payload.userAccessToken = null;
      } else if (userAccessToken.trim()) {
        payload.userAccessToken = userAccessToken.trim();
      }

      const url = editingId
        ? `/api/workspace-apps/${editingId}`
        : "/api/workspace-apps";
      const method = editingId ? "PATCH" : "POST";

      if (!editingId && !facebookAppSecret.trim()) {
        setError("App Secret là bắt buộc khi tạo mới.");
        setLoading(false);
        return;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingId
            ? payload
            : { ...payload, facebookAppSecret: facebookAppSecret.trim() }
        ),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Không thể lưu App.");
        return;
      }

      setSuccess(editingId ? "Đã cập nhật App." : "Đã tạo App mới.");
      resetForm();
      router.refresh();

      const listRes = await fetch("/api/workspace-apps");
      const listData = await listRes.json();
      if (listRes.ok) {
        setApps(listData.apps);
      }
    } catch {
      setError("Lỗi kết nối. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Xóa App này? (Chỉ xóa được khi chưa có Page liên kết.)")) {
      return;
    }
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace-apps/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Không thể xóa App.");
        return;
      }
      setSuccess("Đã xóa App.");
      setApps((prev) => prev.filter((a) => a.id !== id));
      if (editingId === id) resetForm();
      router.refresh();
    } catch {
      setError("Lỗi kết nối.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className={`${ui.card} ${ui.cardPad}`}>
        <h3 className="text-lg font-medium text-gray-900 mb-1">
          {editingId ? "Sửa App" : "Tạo App mới"}
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Mỗi App gắn một Facebook App (App ID + Secret) từ{" "}
          <a
            href="https://developers.facebook.com/apps/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            Developer Console
          </a>
          . Redirect OAuth:{" "}
          <code className="text-xs bg-gray-100 px-1 rounded">
            /api/auth/facebook/callback
          </code>
        </p>

        {error && (
          <div className={`mb-4 ${ui.alertError}`}>{error}</div>
        )}
        {success && (
          <div className={`mb-4 ${ui.alertSuccess}`}>{success}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tên App *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={ui.input}
              placeholder="VD: Shop ABC Fanpage"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mô tả
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={ui.input}
              placeholder="Ghi chú nội bộ (tùy chọn)"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Facebook App ID *
            </label>
            <input
              value={facebookAppId}
              onChange={(e) => setFacebookAppId(e.target.value)}
              className={`${ui.input} font-mono`}
              placeholder="1631592615023549"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Facebook App Secret {editingId ? "(để trống nếu không đổi)" : "*"}
            </label>
            <input
              type="password"
              value={facebookAppSecret}
              onChange={(e) => setFacebookAppSecret(e.target.value)}
              className={`${ui.input} font-mono`}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              User Token (Graph API Explorer)
            </label>
            <input
              type="password"
              value={userAccessToken}
              onChange={(e) => {
                setUserAccessToken(e.target.value);
                setClearUserToken(false);
              }}
              className={`${ui.input} font-mono`}
              placeholder={
                editingId
                  ? "Dán token mới hoặc tick xóa bên dưới"
                  : "Tùy chọn — dùng cho giới hạn quốc gia /pages"
              }
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-gray-500">
              User access token có quyền quản trị Page. Lưu trên server (mã hóa). Khi sửa{" "}
              <strong>Giới hạn quốc gia</strong>, hệ thống ưu tiên lấy Page token từ User token
              này.
            </p>
            {editingId && (
              <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={clearUserToken}
                  onChange={(e) => {
                    setClearUserToken(e.target.checked);
                    if (e.target.checked) setUserAccessToken("");
                  }}
                  className="rounded border-gray-300"
                />
                Xóa User token đã lưu
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className={ui.btnPrimary}
            >
              {loading ? "Đang lưu..." : editingId ? "Cập nhật" : "Tạo App"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-sm text-gray-600 hover:text-gray-900 px-3"
              >
                Hủy
              </button>
            )}
          </div>
        </form>
      </div>

      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-3">
          Apps của bạn ({apps.length})
        </h3>
        {apps.length === 0 ? (
          <p className="text-gray-500 text-sm">
            Chưa có App. Tạo App trước khi kết nối Facebook Page.
          </p>
        ) : (
          <ul className="space-y-3">
            {apps.map((app) => (
              <li
                key={app.id}
                className={`${ui.card} ${ui.cardPadSm} flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3`}
              >
                <div>
                  <p className="font-medium text-gray-900">{app.name}</p>
                  {app.description ? (
                    <p className="text-sm text-gray-600 mt-1">{app.description}</p>
                  ) : null}
                  <p className="text-xs text-gray-400 mt-2 font-mono">
                    App ID: {app.facebookAppId}
                    {app.hasUserToken ? (
                      <span className="ml-2 text-green-700 font-sans">· đã lưu User token</span>
                    ) : (
                      <span className="ml-2 text-amber-700 font-sans">· chưa có User token</span>
                    )}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(app)}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Sửa
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(app.id)}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Xóa
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
