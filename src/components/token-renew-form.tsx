"use client";

import Link from "next/link";
import { useState } from "react";
import type { WorkspaceAppOption } from "@/components/add-page-form";

interface PageTokenRow {
  pageId: string;
  pageName: string;
  pageAvatar: string | null;
  accessToken: string;
}

function formatExpiresIn(seconds: number): string {
  if (seconds <= 0) return "—";
  const days = Math.round(seconds / 86400);
  return `~${days} ngày (${seconds.toLocaleString()} giây)`;
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

interface Props {
  apps: WorkspaceAppOption[];
}

export function TokenRenewForm({ apps }: Props) {
  const [workspaceAppId, setWorkspaceAppId] = useState(apps[0]?.id ?? "");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    accessToken: string;
    tokenType: string;
    expiresIn: number;
    pages: PageTokenRow[];
  } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);

    if (!workspaceAppId) {
      setError("Chọn App để dùng App Secret.");
      return;
    }

    if (!token.trim()) {
      setError("Vui lòng dán User Access Token.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/facebook/token/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: token.trim(),
          workspaceAppId,
          includePages: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Không thể gia hạn token.");
        return;
      }
      setResult(data);
    } catch {
      setError("Lỗi kết nối. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(label: string, text: string) {
    try {
      await copyText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Không copy được — hãy chọn và copy thủ công.");
    }
  }

  if (apps.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-sm text-amber-900">
        Tạo{" "}
        <Link href="/apps" className="font-medium text-blue-700 hover:underline">
          Facebook App
        </Link>{" "}
        trước khi gia hạn token.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Chọn App *
            </label>
            <select
              value={workspaceAppId}
              onChange={(e) => setWorkspaceAppId(e.target.value)}
              className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              {apps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name} (ID {app.facebookAppId})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="user-token"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              User Access Token (ngắn hạn)
            </label>
            <textarea
              id="user-token"
              rows={4}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-mono"
              placeholder="Dán token từ Graph API Explorer (bắt đầu bằng EAAG... hoặc EAAX...)"
              spellCheck={false}
            />
            <p className="mt-2 text-xs text-gray-500">
              Lấy token tại{" "}
              <a
                href="https://developers.facebook.com/tools/explorer/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Graph API Explorer
              </a>
              . Chọn đúng Facebook App của bạn, quyền{" "}
              <code className="text-gray-700">pages_show_list</code>,{" "}
              <code className="text-gray-700">pages_manage_posts</code> (nếu cần
              lấy Page token). Server sẽ gọi{" "}
              <code className="text-gray-700">fb_exchange_token</code> — App
              Secret không hiển thị trên trình duyệt.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-[#1877F2] text-white py-2.5 px-5 rounded-md hover:bg-[#166FE5] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {loading ? "Đang gia hạn..." : "Gia hạn token (long-lived ~60 ngày)"}
          </button>
        </form>
      </div>

      {result && (
        <div className="bg-white rounded-lg border border-green-200 p-6 space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Kết quả</h3>

          <div>
            <p className="text-sm text-gray-600 mb-1">
              User token long-lived · {result.tokenType} · hết hạn{" "}
              {formatExpiresIn(result.expiresIn)}
            </p>
            <div className="flex gap-2 items-start">
              <textarea
                readOnly
                rows={3}
                value={result.accessToken}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-md text-xs font-mono bg-gray-50"
              />
              <button
                type="button"
                onClick={() => handleCopy("user", result.accessToken)}
                className="shrink-0 text-sm text-blue-600 hover:underline"
              >
                {copied === "user" ? "Đã copy" : "Copy"}
              </button>
            </div>
          </div>

          {result.pages.length > 0 ? (
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-2">
                Page access token ({result.pages.length})
              </h4>
              <ul className="space-y-3">
                {result.pages.map((page) => (
                  <li
                    key={page.pageId}
                    className="border border-gray-100 rounded-md p-3 bg-gray-50"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {page.pageAvatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={page.pageAvatar}
                          alt=""
                          className="w-8 h-8 rounded-full"
                        />
                      ) : null}
                      <span className="text-sm font-medium text-gray-900">
                        {page.pageName}
                      </span>
                      <span className="text-xs text-gray-400">
                        ID {page.pageId}
                      </span>
                    </div>
                    <div className="flex gap-2 items-start">
                      <input
                        readOnly
                        value={page.accessToken}
                        className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs font-mono bg-white"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(page.pageId, page.accessToken)
                        }
                        className="shrink-0 text-xs text-blue-600 hover:underline"
                      >
                        {copied === page.pageId ? "Đã copy" : "Copy"}
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Dùng token này tại{" "}
                      <a href="/pages" className="text-blue-600 hover:underline">
                        Facebook Pages → Nhập token thủ công
                      </a>{" "}
                      để lưu vào AutoPost.
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-md">
              Không lấy được danh sách Page (thiếu quyền hoặc tài khoản không
              quản lý Page). Bạn vẫn có user token long-lived ở trên; gọi{" "}
              <code>/me/accounts</code> hoặc thêm quyền trong Explorer rồi thử
              lại.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
