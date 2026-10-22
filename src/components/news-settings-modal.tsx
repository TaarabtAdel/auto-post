"use client";

import { useEffect, useState } from "react";
import { ui } from "@/lib/dashboard-ui";

type NewsSettings = {
  userName: string;
  newsGroupId: string;
  hasPassword: boolean;
  hasToken: boolean;
};

export function NewsSettingsModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [newsGroupId, setNewsGroupId] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/youtube/news-settings");
        const data = (await res.json()) as NewsSettings & { error?: string };
        if (!res.ok) throw new Error(data.error || "Không tải được cấu hình.");
        setUserName(data.userName);
        setNewsGroupId(data.newsGroupId);
        setHasPassword(data.hasPassword);
        setHasToken(data.hasToken);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Không tải được cấu hình.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/youtube/news-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName, password, token, newsGroupId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Không lưu được.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được.");
    } finally {
      setSaving(false);
    }
  }

  const keepHint = "Đã lưu — để trống giữ nguyên";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form
        className={`${ui.card} ${ui.cardPad} w-full max-w-md space-y-3 shadow-lg`}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void save(e)}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Cấu hình đăng tin</h3>
          <button type="button" className="text-lg leading-none px-2" onClick={onClose}>
            ×
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Đang tải…</p>
        ) : (
          <>
            <label className="block text-sm">
              Username
              <input
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className={`${ui.input} mt-1`}
                autoComplete="off"
              />
            </label>
            <label className="block text-sm">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${ui.input} mt-1`}
                placeholder={hasPassword ? keepHint : ""}
                autoComplete="new-password"
              />
            </label>
            <label className="block text-sm">
              Token news API
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className={`${ui.input} mt-1 font-mono`}
                placeholder={hasToken ? keepHint : "Giá trị cookie __SECURE-aistudio_auth_token"}
                autoComplete="off"
              />
            </label>
            <label className="block text-sm">
              Nhóm tin (newsGroupId)
              <input
                value={newsGroupId}
                onChange={(e) => setNewsGroupId(e.target.value)}
                className={`${ui.input} mt-1 font-mono`}
                autoComplete="off"
              />
            </label>
          </>
        )}

        {error && <div className={ui.alertError}>{error}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={ui.btnSecondary} onClick={onClose}>
            Đóng
          </button>
          <button type="submit" className={ui.btnPrimary} disabled={loading || saving}>
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>
    </div>
  );
}
