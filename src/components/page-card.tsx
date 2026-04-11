"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PageCardProps {
  id: string;
  pageId: string;
  pageName: string;
  pageAvatar: string | null;
  tokenStatus: string;
}

export function PageCard({
  id,
  pageName,
  pageAvatar,
  tokenStatus,
}: PageCardProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [newToken, setNewToken] = useState("");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    if (!confirm(`Xóa kết nối với "${pageName}"?`)) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/facebook-pages/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.refresh();
      }
    } catch {
      setError("Không thể xóa. Thử lại.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleUpdateToken(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setUpdating(true);

    try {
      const res = await fetch(`/api/facebook-pages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: newToken.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Không thể cập nhật token.");
        setUpdating(false);
        return;
      }

      setNewToken("");
      setShowUpdateForm(false);
      router.refresh();
    } catch {
      setError("Lỗi kết nối. Thử lại.");
    } finally {
      setUpdating(false);
    }
  }

  const isExpired = tokenStatus === "expired" || tokenStatus === "invalid";

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {pageAvatar ? (
            <img
              src={pageAvatar}
              alt={pageName}
              className="w-10 h-10 rounded-full"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
              <span className="text-gray-500 text-sm font-medium">
                {pageName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div>
            <h4 className="font-medium text-gray-900">{pageName}</h4>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                isExpired
                  ? "bg-red-100 text-red-700"
                  : "bg-green-100 text-green-700"
              }`}
            >
              {isExpired ? "Token hết hạn" : "Hoạt động"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUpdateForm(!showUpdateForm)}
            className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
          >
            Cập nhật token
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-sm text-red-600 hover:text-red-800 transition-colors disabled:opacity-50"
          >
            {deleting ? "Đang xóa..." : "Xóa"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 bg-red-50 text-red-600 px-3 py-2 rounded-md text-sm">
          {error}
        </div>
      )}

      {showUpdateForm && (
        <form onSubmit={handleUpdateToken} className="mt-4 flex gap-2">
          <input
            type="text"
            value={newToken}
            onChange={(e) => setNewToken(e.target.value)}
            placeholder="Paste token mới"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-mono"
          />
          <button
            type="submit"
            disabled={updating || !newToken.trim()}
            className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors"
          >
            {updating ? "..." : "Cập nhật"}
          </button>
        </form>
      )}
    </div>
  );
}
