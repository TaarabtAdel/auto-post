"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getFacebookPageUrl } from "@/lib/facebook-page-url";
import { downloadPagesSpreadsheet } from "@/lib/export-pages-spreadsheet";
import { PAGE_COUNTRY_OPTIONS } from "@/lib/page-country-options";
import { ui } from "@/lib/dashboard-ui";

export interface PageRow {
  id: string;
  pageId: string;
  pageName: string;
  pageAvatar: string | null;
  tokenStatus: string;
  tokenRenewedAt: string | null;
  tokenExpiresAt: string | null;
  workspaceAppId: string | null;
  workspaceAppName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  postedCount: number;
  pendingCount: number;
}

export interface PageCategoryOption {
  id: string;
  name: string;
  sortOrder: number;
  pageCount?: number;
}

const CATEGORY_CHIP_COLORS = [
  "bg-sky-100 text-sky-900 ring-sky-200",
  "bg-violet-100 text-violet-900 ring-violet-200",
  "bg-emerald-100 text-emerald-900 ring-emerald-200",
  "bg-amber-100 text-amber-900 ring-amber-200",
  "bg-rose-100 text-rose-900 ring-rose-200",
  "bg-teal-100 text-teal-900 ring-teal-200",
];

function categoryAccentBg(categoryId: string, categories: PageCategoryOption[]) {
  const idx = categories.findIndex((c) => c.id === categoryId);
  const palette =
    CATEGORY_CHIP_COLORS[idx >= 0 ? idx % CATEGORY_CHIP_COLORS.length : 0];
  return palette.split(" ")[0] ?? "bg-gray-200";
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TRACKED_TOKEN_SCOPES = [
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_manage_engagement",
] as const;

type TokenScopeState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ok";
      scopes: string[];
      tracked: Record<(typeof TRACKED_TOKEN_SCOPES)[number], boolean>;
    };

function TokenScopesCell({
  page,
  state,
  onCheck,
}: {
  page: PageRow;
  state: TokenScopeState;
  onCheck: () => void;
}) {
  if (!page.workspaceAppId) {
    return <span className="text-xs text-amber-600">Gán App trước</span>;
  }

  if (state.status === "idle") {
    return (
      <button
        type="button"
        onClick={onCheck}
        className="text-xs font-medium text-blue-600 hover:underline"
      >
        Kiểm tra
      </button>
    );
  }

  if (state.status === "loading") {
    return <span className="text-xs text-gray-500">Đang kiểm tra…</span>;
  }

  if (state.status === "error") {
    return (
      <div className="space-y-1 max-w-[220px]">
        <p className="text-xs text-red-600 line-clamp-2" title={state.message}>
          {state.message}
        </p>
        <button
          type="button"
          onClick={onCheck}
          className="text-xs text-blue-600 hover:underline"
        >
          Thử lại
        </button>
      </div>
    );
  }

  const extra = state.scopes.filter(
    (s) => !(TRACKED_TOKEN_SCOPES as readonly string[]).includes(s)
  );

  return (
    <div className="max-w-[240px] space-y-1">
      <div className="flex flex-wrap gap-1">
        {TRACKED_TOKEN_SCOPES.map((scope) => {
          const ok = state.tracked[scope];
          const short = scope.replace(/^pages_/, "").replace(/^instagram_/, "ig_");
          return (
            <span
              key={scope}
              title={scope}
              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium leading-tight ${
                ok
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800 ring-1 ring-red-200"
              }`}
            >
              {short}
            </span>
          );
        })}
      </div>
      {extra.length > 0 && (
        <p className="text-[10px] text-gray-500" title={extra.join(", ")}>
          +{extra.length} scope khác
        </p>
      )}
      <button
        type="button"
        onClick={onCheck}
        className="text-[10px] text-gray-500 hover:text-blue-600 hover:underline"
      >
        Làm mới
      </button>
    </div>
  );
}

const COUNTRY_LABEL_BY_CODE = Object.fromEntries(
  PAGE_COUNTRY_OPTIONS.map((c) => [c.code, c.label])
) as Record<string, string>;

type CountryRestrictionState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; selected: string[]; enabled: boolean };

function CountryRestrictionsCell({
  state,
  onLoad,
  onEdit,
}: {
  state: CountryRestrictionState;
  onLoad: () => void;
  onEdit: () => void;
}) {
  if (state.status === "idle") {
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={onLoad}
          className="text-xs font-medium text-violet-700 hover:underline"
        >
          Tải
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="block text-[10px] text-gray-500 hover:text-violet-700 hover:underline"
        >
          Sửa
        </button>
      </div>
    );
  }

  if (state.status === "loading") {
    return <span className="text-xs text-gray-500">Đang tải…</span>;
  }

  if (state.status === "error") {
    return (
      <div className="space-y-1 max-w-[160px]">
        <p className="text-xs text-red-600 line-clamp-2" title={state.message}>
          {state.message}
        </p>
        <button type="button" onClick={onLoad} className="text-xs text-violet-700 hover:underline">
          Thử lại
        </button>
      </div>
    );
  }

  const hasRestriction = state.enabled && state.selected.length > 0;

  return (
    <div className="max-w-[180px] space-y-1">
      {hasRestriction ? (
        <ul className="text-xs text-violet-900 space-y-0.5">
          {state.selected.map((code) => (
            <li key={code} className="font-medium">
              {COUNTRY_LABEL_BY_CODE[code] ?? code}
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-xs text-gray-500">Không giới hạn</span>
      )}
      <button
        type="button"
        onClick={onEdit}
        className="text-[10px] text-violet-700 hover:underline"
      >
        Sửa quốc gia
      </button>
    </div>
  );
}

function formatExpiry(dateStr: string | null, tokenStatus: string) {
  if (!dateStr) {
    if (tokenStatus === "active") return "Không hết hạn*";
    return "—";
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  const now = Date.now();
  if (d.getTime() < now) {
    return `Đã hết hạn (${formatDateTime(dateStr)})`;
  }
  return formatDateTime(dateStr);
}

export interface AppOption {
  id: string;
  name: string;
  facebookAppId: string;
}

interface Props {
  initialPages: PageRow[];
  initialCategories: PageCategoryOption[];
  apps: AppOption[];
}

type ModalKind = "create" | "edit" | "country" | "categories" | null;

function PageActionsMenu({
  page,
  loading,
  renewingPageId,
  renewBatchRunning,
  onRenew,
  onCountry,
  onEditToken,
  onEdit,
  onDelete,
}: {
  page: PageRow;
  loading: boolean;
  renewingPageId: string | null;
  renewBatchRunning: boolean;
  onRenew: () => void;
  onCountry: () => void;
  onEditToken: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const renewDisabled =
    !page.workspaceAppId ||
    loading ||
    renewingPageId === page.id ||
    renewBatchRunning;

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div ref={rootRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 px-3 py-1.5 rounded-lg shadow-sm"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        Thao tác
        <span className="text-gray-400 text-xs" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            disabled={loading}
            onClick={() => run(onEditToken)}
            className="w-full text-left px-3 py-2 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-50"
          >
            Cập nhật token (dán)
          </button>
          {page.workspaceAppId ? (
            <a
              role="menuitem"
              href={`/api/auth/facebook/connect?workspaceAppId=${encodeURIComponent(page.workspaceAppId)}`}
              className="block w-full text-left px-3 py-2 text-sm text-[#1877F2] hover:bg-gray-50"
              title="Đăng nhập FB lại — Page token mới kèm scope app yêu cầu"
              onClick={() => setOpen(false)}
            >
              OAuth lại (scope mới)
            </a>
          ) : (
            <span
              role="menuitem"
              className="block px-3 py-2 text-xs text-gray-400 cursor-not-allowed"
              title="Gán App trước"
            >
              OAuth lại — cần gán App
            </span>
          )}
          <button
            type="button"
            role="menuitem"
            disabled={renewDisabled}
            onClick={() => run(onRenew)}
            className="w-full text-left px-3 py-2 text-sm text-[#1877F2] hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Tự động từ token đã lưu — không cần dán"
          >
            {renewingPageId === page.id ? "Đang gia hạn…" : "Gia hạn token (tự động)"}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={loading}
            onClick={() => run(onCountry)}
            className="w-full text-left px-3 py-2 text-sm text-violet-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Giới hạn quốc gia
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => run(onEdit)}
            className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
          >
            Sửa gán App
          </button>
          <div className="my-1 border-t border-gray-100" />
          <button
            type="button"
            role="menuitem"
            disabled={loading}
            onClick={() => run(onDelete)}
            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Xóa kết nối
          </button>
        </div>
      )}
    </div>
  );
}

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

export function PagesManager({
  initialPages,
  initialCategories,
  apps,
}: Props) {
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
  /** true = mở từ "Cập nhật token" — bắt buộc dán token mới */
  const [editRequireToken, setEditRequireToken] = useState(false);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filterAppId, setFilterAppId] = useState<string>("all");
  const [filterCategoryId, setFilterCategoryId] = useState<string>("all");
  const [categories, setCategories] = useState(initialCategories);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [assigningCategoryPageId, setAssigningCategoryPageId] = useState<
    string | null
  >(null);
  const [renewSuccess, setRenewSuccess] = useState("");
  const [renewingPageId, setRenewingPageId] = useState<string | null>(null);
  const [renewBatchRunning, setRenewBatchRunning] = useState(false);
  const [syncingExpiry, setSyncingExpiry] = useState(false);
  const [countryPage, setCountryPage] = useState<PageRow | null>(null);
  const [countrySelected, setCountrySelected] = useState<Set<string>>(
    () => new Set()
  );
  const [countryLoadingFetch, setCountryLoadingFetch] = useState(false);
  const [countryHint, setCountryHint] = useState("");
  const [scopeByPageId, setScopeByPageId] = useState<
    Record<string, TokenScopeState>
  >({});
  const [scopeBatchRunning, setScopeBatchRunning] = useState(false);
  const [countryByPageId, setCountryByPageId] = useState<
    Record<string, CountryRestrictionState>
  >({});
  const [countryBatchRunning, setCountryBatchRunning] = useState(false);

  useEffect(() => {
    setPages(initialPages);
  }, [initialPages]);

  useEffect(() => {
    setCategories(initialCategories);
  }, [initialCategories]);

  useEffect(() => {
    let cancelled = false;
    const needsSync = initialPages.some(
      (p) => p.tokenStatus === "active" && !p.tokenExpiresAt && !p.tokenRenewedAt
    );
    if (!needsSync || initialPages.length === 0) return;

    (async () => {
      setSyncingExpiry(true);
      try {
        await fetch("/api/facebook-pages/sync-expiry", { method: "POST" });
        if (!cancelled) router.refresh();
      } finally {
        if (!cancelled) setSyncingExpiry(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialPages, router]);

  const filteredPages = useMemo(() => {
    let list = pages;
    if (filterAppId === "unassigned") {
      list = list.filter((p) => !p.workspaceAppId);
    } else if (filterAppId !== "all") {
      list = list.filter((p) => p.workspaceAppId === filterAppId);
    }
    if (filterCategoryId === "uncategorized") {
      list = list.filter((p) => !p.categoryId);
    } else if (filterCategoryId !== "all") {
      list = list.filter((p) => p.categoryId === filterCategoryId);
    }
    return list;
  }, [pages, filterAppId, filterCategoryId]);

  async function assignPageCategory(pageId: string, categoryId: string | null) {
    setAssigningCategoryPageId(pageId);
    setError("");
    try {
      const res = await fetch(`/api/facebook-pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Không gán được danh mục.");
        return;
      }
      const cat = categoryId
        ? categories.find((c) => c.id === categoryId)
        : null;
      setPages((prev) =>
        prev.map((p) =>
          p.id === pageId
            ? {
                ...p,
                categoryId,
                categoryName: cat?.name ?? null,
              }
            : p
        )
      );
      setCategories((prev) =>
        prev.map((c) => {
          const old = pages.find((p) => p.id === pageId);
          let count = c.pageCount ?? 0;
          if (old?.categoryId === c.id) count = Math.max(0, count - 1);
          if (categoryId === c.id) count += 1;
          return { ...c, pageCount: count };
        })
      );
    } catch {
      setError("Lỗi kết nối.");
    } finally {
      setAssigningCategoryPageId(null);
    }
  }

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setCategorySaving(true);
    setError("");
    try {
      const res = await fetch("/api/page-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Không tạo được danh mục.");
        return;
      }
      setCategories((prev) => [...prev, data.category]);
      setNewCategoryName("");
    } catch {
      setError("Lỗi kết nối.");
    } finally {
      setCategorySaving(false);
    }
  }

  async function handleDeleteCategory(categoryId: string) {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;
    if (
      !confirm(
        `Xóa danh mục "${cat.name}"?\nCác Page trong danh mục sẽ chuyển về "Chưa phân loại".`
      )
    ) {
      return;
    }
    setCategorySaving(true);
    setError("");
    try {
      const res = await fetch(`/api/page-categories/${categoryId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Không xóa được danh mục.");
        return;
      }
      setCategories((prev) => prev.filter((c) => c.id !== categoryId));
      setPages((prev) =>
        prev.map((p) =>
          p.categoryId === categoryId
            ? { ...p, categoryId: null, categoryName: null }
            : p
        )
      );
      if (filterCategoryId === categoryId) setFilterCategoryId("all");
    } catch {
      setError("Lỗi kết nối.");
    } finally {
      setCategorySaving(false);
    }
  }

  async function handleRenameCategory(categoryId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCategorySaving(true);
    try {
      const res = await fetch(`/api/page-categories/${categoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Không đổi tên được.");
        return;
      }
      setCategories((prev) =>
        prev.map((c) => (c.id === categoryId ? { ...c, name: trimmed } : c))
      );
      setPages((prev) =>
        prev.map((p) =>
          p.categoryId === categoryId ? { ...p, categoryName: trimmed } : p
        )
      );
    } catch {
      setError("Lỗi kết nối.");
    } finally {
      setCategorySaving(false);
    }
  }

  const closeModal = useCallback(() => {
    setModal(null);
    setEditPage(null);
    setError("");
    setCreateToken("");
    setEditToken("");
    setEditRequireToken(false);
    setCurrentToken(null);
    setCountryPage(null);
    setCountrySelected(new Set());
    setCountryHint("");
  }, []);

  function applyCountryApiToState(
    pageId: string,
    data: {
      selectedCountries?: string[];
      enabled?: boolean;
      countries?: string[];
      restrictionType?: string;
    }
  ): Set<string> {
    const selected = new Set<string>(data.selectedCountries ?? []);
    setCountryByPageId((prev) => ({
      ...prev,
      [pageId]: {
        status: "ok",
        selected: [...selected],
        enabled: Boolean(data.enabled),
      },
    }));
    return selected;
  }

  async function fetchCountryRestrictions(pageId: string) {
    setCountryByPageId((prev) => ({ ...prev, [pageId]: { status: "loading" } }));
    try {
      const res = await fetch(`/api/facebook-pages/${pageId}/country-restrictions`);
      const data = await res.json();
      if (!res.ok) {
        setCountryByPageId((prev) => ({
          ...prev,
          [pageId]: {
            status: "error",
            message: data.error || "Không tải được.",
          },
        }));
        return null;
      }
      applyCountryApiToState(pageId, data);
      return data;
    } catch {
      setCountryByPageId((prev) => ({
        ...prev,
        [pageId]: { status: "error", message: "Lỗi kết nối." },
      }));
      return null;
    }
  }

  async function loadCountriesForFiltered() {
    if (filteredPages.length === 0) {
      setError("Không có Page trong bộ lọc hiện tại.");
      return;
    }
    setCountryBatchRunning(true);
    setError("");
    await Promise.all(filteredPages.map((p) => fetchCountryRestrictions(p.id)));
    setCountryBatchRunning(false);
  }

  async function openCountryRestrictions(page: PageRow) {
    setCountryPage(page);
    setCountrySelected(new Set());
    setCountryHint("");
    setError("");
    setModal("country");
    setCountryLoadingFetch(true);
    try {
      const data = await fetchCountryRestrictions(page.id);
      if (!data) return;
      setCountrySelected(new Set(data.selectedCountries ?? []));
      const hints: string[] = [];
      if (data.tokenSource === "app_user_token") {
        hints.push(
          "Token API: Page token lấy từ User token đã lưu trên /apps (ưu tiên cho giới hạn quốc gia)."
        );
      } else {
        hints.push(
          "Token API: Page token trong DB. Nếu Facebook báo thiếu quyền MANAGE, thêm User token tại /apps."
        );
      }
      if (data.countries?.length && !(data.selectedCountries?.length > 0)) {
        hints.push(
          `Facebook đang có: ${data.restrictionType} — ${(data.countries as string[]).join(", ")} (ngoài danh sách UI).`
        );
      }
      setCountryHint(hints.join(" "));
    } finally {
      setCountryLoadingFetch(false);
    }
  }

  function toggleCountry(code: string) {
    setCountrySelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function saveCountryRestrictions(e: React.FormEvent) {
    e.preventDefault();
    if (!countryPage) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/facebook-pages/${countryPage.id}/country-restrictions`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            restrictionType: "whitelist",
            countries: [...countrySelected],
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Không lưu được.");
        return;
      }
      setRenewSuccess(data.message || "Đã cập nhật giới hạn quốc gia.");
      if (countryPage) {
        setCountryByPageId((prev) => ({
          ...prev,
          [countryPage.id]: {
            status: "ok",
            selected: [...countrySelected],
            enabled: countrySelected.size > 0,
          },
        }));
      }
      closeModal();
    } catch {
      setError("Lỗi kết nối.");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setCreateAppId(apps[0]?.id ?? "");
    setCreateToken("");
    setError("");
    setModal("create");
  }

  function openEditToken(page: PageRow) {
    setEditPage(page);
    setEditAppId(page.workspaceAppId ?? "");
    setEditToken("");
    setCurrentToken(null);
    setEditRequireToken(true);
    setError("");
    setModal("edit");
  }

  function openEdit(page: PageRow) {
    setEditPage(page);
    setEditAppId(page.workspaceAppId ?? "");
    setEditToken("");
    setCurrentToken(null);
    setEditRequireToken(false);
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
    const appId = editAppId || editPage.workspaceAppId || "";
    if (!appId) {
      setError("Chọn Facebook App.");
      return;
    }
    const appChanged = editAppId !== (editPage.workspaceAppId ?? "");
    const hasNewToken = Boolean(editToken.trim());
    if (editRequireToken && !hasNewToken) {
      setError("Dán Page Access Token mới.");
      return;
    }
    if (!editRequireToken && !hasNewToken && !appChanged) {
      setError("Chọn App khác hoặc dán token mới.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const body: { workspaceAppId: string; accessToken?: string } = {
        workspaceAppId: appId,
      };
      if (hasNewToken) {
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

  async function fetchTokenScopes(pageId: string) {
    setScopeByPageId((prev) => ({ ...prev, [pageId]: { status: "loading" } }));
    try {
      const res = await fetch(`/api/facebook-pages/${pageId}/token-scopes`);
      const data = await res.json();
      if (!res.ok) {
        setScopeByPageId((prev) => ({
          ...prev,
          [pageId]: {
            status: "error",
            message: data.error || "Không kiểm tra được.",
          },
        }));
        return;
      }
      setScopeByPageId((prev) => ({
        ...prev,
        [pageId]: {
          status: "ok",
          scopes: data.scopes ?? [],
          tracked: data.tracked ?? {
            pages_manage_posts: false,
            pages_read_engagement: false,
            pages_manage_engagement: false,
          },
        },
      }));
    } catch {
      setScopeByPageId((prev) => ({
        ...prev,
        [pageId]: { status: "error", message: "Lỗi kết nối." },
      }));
    }
  }

  async function checkScopesForFiltered() {
    const targets = filteredPages.filter((p) => p.workspaceAppId);
    if (targets.length === 0) {
      setError("Không có Page (đã gán App) trong bộ lọc hiện tại.");
      return;
    }
    setScopeBatchRunning(true);
    setError("");
    await Promise.all(targets.map((p) => fetchTokenScopes(p.id)));
    setScopeBatchRunning(false);
  }

  async function renewOnePage(page: PageRow) {
    if (!page.workspaceAppId) {
      setError("Page chưa gán App — gán App trước khi gia hạn.");
      return;
    }
    setRenewingPageId(page.id);
    setError("");
    setRenewSuccess("");
    try {
      const res = await fetch(`/api/facebook-pages/${page.id}/renew`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gia hạn thất bại.");
        return;
      }
      setRenewSuccess(data.message || "Đã gia hạn token.");
      router.refresh();
    } catch {
      setError("Lỗi kết nối.");
    } finally {
      setRenewingPageId(null);
    }
  }

  async function renewBatchAuto() {
    const pageIds = filteredPages
      .filter((p) => p.workspaceAppId)
      .map((p) => p.id);
    if (pageIds.length === 0) {
      setError("Không có Page nào (đã gán App) trong bộ lọc hiện tại.");
      return;
    }
    setRenewBatchRunning(true);
    setError("");
    setRenewSuccess("");
    try {
      const res = await fetch("/api/facebook-pages/renew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gia hạn thất bại.");
        return;
      }
      let msg = data.message || "Đã gia hạn.";
      if (data.failed?.length) {
        msg += ` Lỗi: ${data.failed.map((f: { pageName: string }) => f.pageName).join(", ")}.`;
      }
      setRenewSuccess(msg);
      router.refresh();
    } catch {
      setError("Lỗi kết nối.");
    } finally {
      setRenewBatchRunning(false);
    }
  }

  function exportExcel() {
    const appFbId = Object.fromEntries(
      apps.map((a) => [a.id, a.facebookAppId])
    );
    downloadPagesSpreadsheet(
      filteredPages.map((p) => ({
        pageName: p.pageName,
        pageId: p.pageId,
        workspaceAppName: p.workspaceAppName,
        categoryName: p.categoryName,
        facebookAppId: p.workspaceAppId
          ? appFbId[p.workspaceAppId] ?? null
          : null,
        tokenStatus: p.tokenStatus,
        tokenRenewedAt: p.tokenRenewedAt,
        tokenExpiresAt: p.tokenExpiresAt,
        postedCount: p.postedCount,
        pendingCount: p.pendingCount,
        internalId: p.id,
      })),
      filterAppId === "all"
        ? "facebook-pages"
        : `facebook-pages-${filterAppId.slice(0, 8)}`
    );
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
            {syncingExpiry ? " · đang cập nhật hết hạn…" : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={renewBatchAuto}
            disabled={renewBatchRunning}
            className="bg-[#1877F2] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#166FE5] disabled:opacity-50"
            title="Tự động từ token đã lưu — không cần dán. Muốn dán token mới → Cập nhật token từng Page."
          >
            {renewBatchRunning ? "Đang gia hạn…" : "Gia hạn token (tự động)"}
          </button>
          <button
            type="button"
            onClick={loadCountriesForFiltered}
            disabled={countryBatchRunning || filteredPages.length === 0}
            className="border border-violet-200 bg-violet-50 text-violet-900 text-sm font-medium px-4 py-2 rounded-lg hover:bg-violet-100 disabled:opacity-50"
            title="Đọc giới hạn quốc gia từ Facebook (Page settings)"
          >
            {countryBatchRunning ? "Đang tải quốc gia…" : "Tải quốc gia"}
          </button>
          <button
            type="button"
            onClick={checkScopesForFiltered}
            disabled={scopeBatchRunning || filteredPages.length === 0}
            className="border border-gray-300 bg-white text-gray-800 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            title="Gọi debug_token cho các Page đang lọc (cần App Secret)"
          >
            {scopeBatchRunning ? "Đang kiểm tra scopes…" : "Kiểm tra scopes"}
          </button>
          <button
            type="button"
            onClick={exportExcel}
            disabled={filteredPages.length === 0}
            className="border border-gray-300 bg-white text-gray-800 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            title="Tải file CSV — mở bằng Microsoft Excel"
          >
            Xuất Excel
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            + Kết nối Page
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-600 shrink-0">Danh mục</span>
        <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setFilterCategoryId("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterCategoryId === "all"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Tất cả ({pages.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterCategoryId("uncategorized")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterCategoryId === "uncategorized"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Chưa phân loại ({pages.filter((p) => !p.categoryId).length})
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilterCategoryId(c.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterCategoryId === c.id
                  ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {c.name} ({c.pageCount ?? pages.filter((p) => p.categoryId === c.id).length})
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setModal("categories");
            setError("");
          }}
          className="text-xs font-medium text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg"
        >
          Quản lý danh mục
        </button>
      </div>

      <p className="text-xs text-gray-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
        Scope nằm trên <strong>Page token trong DB</strong>, không phải tick Explorer. Đổi
        scope → <strong>OAuth lại</strong> hoặc <strong>Cập nhật token (dán)</strong>, rồi{" "}
        <strong>Kiểm tra scopes</strong>.
      </p>

      {renewSuccess && !modal && (
        <div className="bg-green-50 text-green-800 px-4 py-2 rounded-lg text-sm">
          {renewSuccess}
        </div>
      )}

      {error && !modal && (
        <div className={ui.alertError}>
          {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Fanpage</th>
                <th className="px-4 py-3 font-medium min-w-[130px]">Danh mục</th>
                <th className="px-4 py-3 font-medium">App</th>
                <th className="px-4 py-3 font-medium text-center min-w-[72px]">
                  <span className="block">Đã đăng</span>
                  <span className="block text-xs font-normal text-gray-500 mt-0.5">
                    Chờ
                  </span>
                </th>
                <th className="px-4 py-3 font-medium min-w-[100px]">
                  <span className="block whitespace-nowrap">Đã gia hạn</span>
                  <span className="block text-xs font-normal text-gray-500 mt-0.5 whitespace-nowrap">
                    Hết hạn
                  </span>
                </th>
                <th className="px-4 py-3 font-medium">Token</th>
                <th className="px-4 py-3 font-medium min-w-[120px]">Quốc gia</th>
                <th className="px-4 py-3 font-medium min-w-[140px]">Scopes token</th>
                <th className="px-4 py-3 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredPages.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                    {pages.length === 0
                      ? 'Chưa có Page. Bấm "Kết nối Page" để thêm.'
                      : "Không có Page khớp bộ lọc."}
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
                            <p className="text-xs text-gray-400">
                              ID{" "}
                              <a
                                href={fanpageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                                title={fanpageUrl}
                              >
                                {page.pageId}
                              </a>
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={page.categoryId ?? ""}
                          disabled={assigningCategoryPageId === page.id}
                          onChange={(e) => {
                            const v = e.target.value;
                            void assignPageCategory(page.id, v ? v : null);
                          }}
                          className={`${ui.select} w-full max-w-[140px] text-xs py-1.5 disabled:opacity-50`}
                        >
                          <option value="">— Chưa phân loại —</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-[140px] truncate">
                        {page.workspaceAppName ?? (
                          <span className="text-amber-600 text-xs">Chưa gán</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center align-middle">
                        <div className="font-semibold text-green-700 leading-tight">
                          {page.postedCount}
                        </div>
                        <div className="text-xs font-semibold text-amber-700 leading-tight mt-1">
                          {page.pendingCount || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs align-middle max-w-[140px]">
                        <div className="text-gray-700 whitespace-nowrap leading-tight">
                          {page.tokenRenewedAt ? (
                            <span
                              className="text-green-700 font-medium"
                              title={page.tokenRenewedAt}
                            >
                              {formatDateTime(page.tokenRenewedAt)}
                            </span>
                          ) : (
                            <span className="text-gray-400">Chưa</span>
                          )}
                        </div>
                        <div className="text-gray-600 whitespace-nowrap leading-tight mt-1">
                          {formatExpiry(page.tokenExpiresAt, page.tokenStatus)}
                        </div>
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
                      <td className="px-4 py-3 align-top">
                        <CountryRestrictionsCell
                          state={countryByPageId[page.id] ?? { status: "idle" }}
                          onLoad={() => fetchCountryRestrictions(page.id)}
                          onEdit={() => openCountryRestrictions(page)}
                        />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <TokenScopesCell
                          page={page}
                          state={scopeByPageId[page.id] ?? { status: "idle" }}
                          onCheck={() => fetchTokenScopes(page.id)}
                        />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <PageActionsMenu
                          page={page}
                          loading={loading}
                          renewingPageId={renewingPageId}
                          renewBatchRunning={renewBatchRunning}
                          onRenew={() => renewOnePage(page)}
                          onCountry={() => openCountryRestrictions(page)}
                          onEditToken={() => openEditToken(page)}
                          onEdit={() => openEdit(page)}
                          onDelete={() => handleDelete(page)}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal === "categories" && (
        <Modal title="Quản lý danh mục Fanpage" onClose={closeModal}>
          {error && (
            <div className={`mb-4 ${ui.alertError}`}>
              {error}
            </div>
          )}
          <form onSubmit={handleCreateCategory} className="flex gap-2 mb-4">
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Tên danh mục mới…"
              maxLength={80}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <button
              type="submit"
              disabled={categorySaving || !newCategoryName.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Thêm
            </button>
          </form>
          {categories.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">
              Chưa có danh mục. Thêm tên ở trên (vd. Thể thao, Tin tức…).
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
              {categories.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50/80"
                >
                  <span
                    className={`shrink-0 w-2.5 h-2.5 rounded-full ${categoryAccentBg(c.id, categories)}`}
                    aria-hidden
                  />
                  <input
                    key={`${c.id}-${c.name}`}
                    defaultValue={c.name}
                    onBlur={(e) => {
                      if (e.target.value.trim() !== c.name) {
                        void handleRenameCategory(c.id, e.target.value);
                      }
                    }}
                    className="flex-1 min-w-0 text-sm border-0 bg-transparent focus:ring-1 focus:ring-blue-300 rounded px-1 py-0.5"
                  />
                  <span className="text-xs text-gray-400 shrink-0">
                    {c.pageCount ?? pages.filter((p) => p.categoryId === c.id).length} Page
                  </span>
                  <button
                    type="button"
                    disabled={categorySaving}
                    onClick={() => void handleDeleteCategory(c.id)}
                    className="text-xs text-red-600 hover:underline disabled:opacity-50 shrink-0"
                  >
                    Xóa
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-gray-500 mt-4">
            Gán danh mục từ cột <strong>Danh mục</strong> trong bảng, hoặc lọc nhanh bằng tab phía
            trên.
          </p>
        </Modal>
      )}

      {modal === "create" && (
        <Modal title="Kết nối Facebook Page" onClose={closeModal}>
          {error && (
            <div className={`mb-4 ${ui.alertError}`}>
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
        <Modal
          title={
            editRequireToken
              ? `Cập nhật token — ${editPage.pageName}`
              : `Sửa gán App — ${editPage.pageName}`
          }
          onClose={closeModal}
        >
          {error && (
            <div className={`mb-4 ${ui.alertError}`}>
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
                placeholder={
                  editRequireToken
                    ? "Dán Page Access Token từ Graph API Explorer"
                    : "Token mới (tùy chọn nếu chỉ đổi App)"
                }
                autoFocus={editRequireToken}
              />
              <p className="mt-1 text-xs text-gray-500">
                {editRequireToken ? (
                  <>
                    <strong>Muốn scope khác</strong> (vd.{" "}
                    <code className="text-[10px]">pages_manage_engagement</code>): token phải
                    được cấp lại sau khi App có quyền —{" "}
                    <strong>Gia hạn tự động không thêm scope</strong>. Cách làm: (1){" "}
                    {editPage.workspaceAppId ? (
                      <a
                        href={`/api/auth/facebook/connect?workspaceAppId=${encodeURIComponent(editPage.workspaceAppId)}`}
                        className="text-blue-600 hover:underline"
                      >
                        OAuth lại
                      </a>
                    ) : (
                      "OAuth (gán App trước)"
                    )}{" "}
                    hoặc (2) lấy Page token mới từ Graph API Explorer rồi dán ở đây. Sau đó{" "}
                    <strong>Kiểm tra scopes</strong> trên bảng.{" "}
                    <Link href="/pages/renew-token" className="text-blue-600 hover:underline">
                      User token (token chết)
                    </Link>
                  </>
                ) : (
                  "Chỉ đổi App: chọn App rồi Lưu; thêm token nếu muốn đổi luôn Page token."
                )}
              </p>
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

      {modal === "country" && countryPage && (
        <Modal
          title={`Giới hạn quốc gia — ${countryPage.pageName}`}
          onClose={closeModal}
        >
          <p className="text-xs text-gray-500 mb-4">
            Fanpage này <strong>chỉ dành cho</strong> người dùng tại các quốc gia được tick
            (whitelist trên Facebook — người ngoài danh sách sẽ không thấy Page). Bỏ tick hết
            → gỡ giới hạn (Page public lại theo cài đặt Facebook).
          </p>
          {error && (
            <div className={`mb-4 ${ui.alertError}`}>
              {error}
            </div>
          )}
          {countryHint && (
            <div className={`mb-4 text-xs ${ui.hint}`}>
              {countryHint}
            </div>
          )}
          {countryLoadingFetch ? (
            <p className="text-sm text-gray-500">Đang tải từ Facebook…</p>
          ) : (
            <form onSubmit={saveCountryRestrictions} className="space-y-4">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-gray-800 mb-2">
                  Fanpage chỉ dành cho quốc gia:
                </legend>
                {PAGE_COUNTRY_OPTIONS.map((c) => (
                  <label
                    key={c.code}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={countrySelected.has(c.code)}
                      onChange={() => toggleCountry(c.code)}
                      className="rounded border-gray-300"
                    />
                    {c.label}
                  </label>
                ))}
              </fieldset>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-violet-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {loading ? "Đang lưu…" : "Áp dụng lên Facebook"}
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
          )}
        </Modal>
      )}

    </div>
  );
}
