"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getFacebookPageUrl } from "@/lib/facebook-page-url";

export interface PageRow {
  id: string;
  pageId: string;
  pageName: string;
  pageAvatar: string | null;
  tokenStatus: string;
  workspaceAppId: string | null;
  workspaceAppName: string | null;
  postedCount: number;
  pendingCount: number;
}

export interface AppOption {
  id: string;
  name: string;
  facebookAppId: string;
}

interface Props {
  initialPages: PageRow[];
  apps: AppOption[];
}

type ModalKind = "create" | "edit" | null;

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Đóng"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function PagesManager({ initialPages, apps }: Props) {
  const router = useRouter();
  const [pages, setPages] = useState(initialPages);
  const [modal, setModal] = useState<ModalKind>(null);
  const [editPage, setEditPage] = useState<PageRow | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [createAppId, setCreateAppId] = useState(apps[0]?.id ?? "");
  const [createToken, setCreateToken] = useState("");

  const [editAppId, setEditAppId] = useState("");
  const [editToken, setEditToken] = useState("");
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filterAppId, setFilterAppId] = useState<string>("all");

  useEffect(() => {
    setPages(initialPages);
  }, [initialPages]);

  const filteredPages = useMemo(() => {
    if (filterAppId === "all") return pages;
    if (filterAppId === "unassigned") {
      return pages.filter((p) => !p.workspaceAppId);
    }
    return pages.filter((p) => p.workspaceAppId === filterAppId);
  }, [pages, filterAppId]);

  const closeModal = useCallback(() => {
    setModal(null);
    setEditPage(null);
    setError("");
    setCreateToken("");
    setEditToken("");
    setCurrentToken(null);
  }, []);

  function openCreate() {
    setCreateAppId(apps[0]?.id ?? "");
    setCreateToken("");
    setError("");
    setModal("create");
  }

  function openEdit(page: PageRow) {
    setEditPage(page);
    setEditAppId(page.workspaceAppId ?? "");
    setEditToken("");
    setCurrentToken(null);
    setError("");
    setModal("edit");
  }

  async function handleCreateManual(e: React.FormEvent) {
    e.preventDefault();
    if (!createAppId) {
      setError("Chọn Facebook App.");
      return;
    }
    if (!createToken.trim()) {
      setError("Nhập Page Access Token.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/facebook-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceAppId: createAppId,
          accessToken: createToken.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Không thể thêm Page.");
        return;
      }
      closeModal();
      router.refresh();
    } catch {
      setError("Lỗi kết nối.");
    } finally {
      setLoading(false);
    }
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editPage) return;
    if (!editAppId) {
      setError("Chọn Facebook App.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const body: { workspaceAppId: string; accessToken?: string } = {
        workspaceAppId: editAppId,
      };
      if (editToken.trim()) {
        body.accessToken = editToken.trim();
      }
      const res = await fetch(`/api/facebook-pages/${editPage.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Không thể cập nhật.");
        return;
      }
      closeModal();
      router.refresh();
    } catch {
      setError("Lỗi kết nối.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(page: PageRow) {
    if (!confirm(`Xóa kết nối Page "${page.pageName}"?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/facebook-pages/${page.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Không thể xóa.");
        return;
      }
      router.refresh();
    } catch {
      setError("Lỗi kết nối.");
    } finally {
      setLoading(false);
    }
  }

  async function loadCurrentToken() {
    if (!editPage) return;
    setLoadingToken(true);
    setError("");
    try {
      const res = await fetch(`/api/facebook-pages/${editPage.id}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Không lấy được token.");
        return;
      }
      setCurrentToken(data.accessToken);
    } catch {
      setError("Lỗi kết nối.");
    } finally {
      setLoadingToken(false);
    }
  }

  async function copyToken() {
    if (!currentToken) return;
    try {
      await navigator.clipboard.writeText(currentToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Không copy được.");
    }
  }

  if (apps.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-sm text-amber-900">
        Tạo{" "}
        <Link href="/apps" className="font-medium text-blue-700 hover:underline">
          Facebook App
        </Link>{" "}
        trước khi kết nối Page.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-gray-600 flex items-center gap-2">
            Lọc App
            <select
              value={filterAppId}
              onChange={(e) => setFilterAppId(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="all">Tất cả ({pages.length})</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (
                  {pages.filter((p) => p.workspaceAppId === a.id).length})
                </option>
              ))}
              <option value="unassigned">
                Chưa gán App (
                {pages.filter((p) => !p.workspaceAppId).length})
              </option>
            </select>
          </label>
          <p className="text-sm text-gray-500">
            Hiển thị {filteredPages.length} Page
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          + Kết nối Page
        </button>
      </div>

      {error && !modal && (
        <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Fanpage</th>
                <th className="px-4 py-3 font-medium">Link</th>
                <th className="px-4 py-3 font-medium">App</th>
                <th className="px-4 py-3 font-medium text-center">Đã đăng</th>
                <th className="px-4 py-3 font-medium text-center">Chờ</th>
                <th className="px-4 py-3 font-medium">Token</th>
                <th className="px-4 py-3 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredPages.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    {pages.length === 0
                      ? 'Chưa có Page. Bấm "Kết nối Page" để thêm.'
                      : "Không có Page khớp bộ lọc App."}
                  </td>
                </tr>
              ) : (
                filteredPages.map((page) => {
                  const fanpageUrl = getFacebookPageUrl(page.pageId);
                  const isExpired =
                    page.tokenStatus === "expired" ||
                    page.tokenStatus === "invalid";
                  return (
                    <tr key={page.id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-[180px]">
                          {page.pageAvatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={page.pageAvatar}
                              alt=""
                              className="w-9 h-9 rounded-full shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 shrink-0">
                              {page.pageName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <a
                              href={fanpageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-gray-900 hover:text-blue-600 hover:underline"
                            >
                              {page.pageName}
                            </a>
                            <p className="text-xs text-gray-400">ID {page.pageId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={fanpageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-xs max-w-[120px] truncate inline-block"
                          title={fanpageUrl}
                        >
                          Mở Fanpage ↗
                        </a>
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-[140px] truncate">
                        {page.workspaceAppName ?? (
                          <span className="text-amber-600 text-xs">Chưa gán</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-green-700">
                        {page.postedCount}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-amber-700">
                        {page.pendingCount || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            isExpired
                              ? "bg-red-100 text-red-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {isExpired ? "Hết hạn" : "OK"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEdit(page)}
                          className="text-blue-600 hover:underline text-sm mr-3"
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(page)}
                          disabled={loading}
                          className="text-red-600 hover:underline text-sm disabled:opacity-50"
                        >
                          Xóa
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal === "create" && (
        <Modal title="Kết nối Facebook Page" onClose={closeModal}>
          {error && (
            <div className="bg-red-50 text-red-600 px-3 py-2 rounded-md text-sm mb-4">
              {error}
            </div>
          )}
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Facebook App
          </label>
          <select
            value={createAppId}
            onChange={(e) => setCreateAppId(e.target.value)}
            className="w-full mb-4 px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {apps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <a
            href={`/api/auth/facebook/connect?workspaceAppId=${encodeURIComponent(createAppId)}`}
            className="inline-flex items-center gap-2 bg-[#1877F2] text-white py-2 px-4 rounded-lg text-sm font-medium mb-4"
          >
            Đăng nhập Facebook (OAuth)
          </a>
          <form onSubmit={handleCreateManual} className="border-t border-gray-100 pt-4 space-y-3">
            <p className="text-xs text-gray-500">Hoặc dán Page Access Token thủ công:</p>
            <input
              value={createToken}
              onChange={(e) => setCreateToken(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
              placeholder="EAAG..."
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-800 text-white py-2 rounded-lg text-sm disabled:opacity-50"
            >
              {loading ? "Đang xác thực..." : "Thêm Page"}
            </button>
          </form>
        </Modal>
      )}

      {modal === "edit" && editPage && (
        <Modal title={`Sửa: ${editPage.pageName}`} onClose={closeModal}>
          {error && (
            <div className="bg-red-50 text-red-600 px-3 py-2 rounded-md text-sm mb-4">
              {error}
            </div>
          )}
          <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm">
            <p className="text-gray-600 mb-1">Link Fanpage</p>
            <a
              href={getFacebookPageUrl(editPage.pageId)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline break-all"
            >
              {getFacebookPageUrl(editPage.pageId)}
            </a>
          </div>
          <form onSubmit={handleEditSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Gán Facebook App
              </label>
              <select
                value={editAppId}
                onChange={(e) => setEditAppId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">— Chọn —</option>
                {apps.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-gray-700">
                  Cập nhật token
                </label>
                <button
                  type="button"
                  onClick={loadCurrentToken}
                  disabled={loadingToken}
                  className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                >
                  {loadingToken ? "Đang tải..." : "Xem token hiện tại"}
                </button>
              </div>
              {currentToken && (
                <div className="mb-2 flex gap-2">
                  <textarea
                    readOnly
                    rows={2}
                    value={currentToken}
                    className="flex-1 text-xs font-mono border border-gray-200 rounded-lg p-2 bg-gray-50"
                  />
                  <button
                    type="button"
                    onClick={copyToken}
                    className="text-xs text-blue-600 shrink-0 self-start"
                  >
                    {copied ? "Đã copy" : "Copy"}
                  </button>
                </div>
              )}
              <input
                value={editToken}
                onChange={(e) => setEditToken(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                placeholder="Token mới (để trống nếu chỉ đổi App)"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm disabled:opacity-50"
              >
                {loading ? "Đang lưu..." : "Lưu"}
              </button>
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm"
              >
                Hủy
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
