"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AddPageForm() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showManual, setShowManual] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!token.trim()) {
      setError("Vui lòng nhập Page Access Token.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/facebook-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: token.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Không thể kết nối Page.");
        setLoading(false);
        return;
      }

      setSuccess(`Đã kết nối "${data.page.pageName}" thành công!`);
      setToken("");
      router.refresh();
    } catch {
      setError("Lỗi kết nối. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        Kết nối Facebook Page
      </h3>

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-md text-sm mb-4">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 text-green-600 px-4 py-3 rounded-md text-sm mb-4">
          {success}
        </div>
      )}

      {/* OAuth button — primary method */}
      <div className="mb-4">
        <a
          href="/api/auth/facebook/connect"
          className="inline-flex items-center gap-2 bg-[#1877F2] text-white py-2.5 px-5 rounded-md hover:bg-[#166FE5] transition-colors text-sm font-medium"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
          Kết nối bằng Facebook
        </a>
        <p className="mt-2 text-xs text-gray-500">
          Đăng nhập Facebook → chọn Pages → tự động lấy token dài hạn (không hết hạn).
        </p>
      </div>

      {/* Manual token input — fallback */}
      <div className="border-t border-gray-200 pt-4">
        <button
          type="button"
          onClick={() => setShowManual(!showManual)}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          {showManual ? "▼" : "▶"} Nhập token thủ công
        </button>

        {showManual && (
          <form onSubmit={handleSubmit} className="space-y-4 mt-3">
            <div>
              <label
                htmlFor="token"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Page Access Token
              </label>
              <input
                id="token"
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-mono"
                placeholder="Paste Page Access Token từ Facebook Developer Tools"
              />
              <p className="mt-1 text-xs text-gray-500">
                Lấy token từ{" "}
                <a
                  href="https://developers.facebook.com/tools/explorer/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Graph API Explorer
                </a>
                . Token thủ công thường hết hạn sau 1-2 giờ.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
            >
              {loading ? "Đang xác thực..." : "Kết nối bằng token"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
