"use client";

import Link from "next/link";
import { useMemo } from "react";
import { PageCategorySelectBar } from "@/components/page-category-select-bar";
import { ui } from "@/lib/dashboard-ui";

export type AppOption = { id: string; name: string };

export type PageOption = {
  id: string;
  pageName: string;
  pageAvatar: string | null;
  tokenStatus: string;
  workspaceAppId: string | null;
  categoryId: string | null;
  categoryName: string | null;
};

type FanpageAppPickerProps = {
  apps: AppOption[];
  allPages: PageOption[];
  workspaceAppId: string;
  onWorkspaceAppIdChange: (appId: string) => void;
  selectedPageIds: Set<string>;
  onSelectedPageIdsChange: (next: Set<string>) => void;
  disabled?: boolean;
};

export function FanpageAppPicker({
  apps,
  allPages,
  workspaceAppId,
  onWorkspaceAppIdChange,
  selectedPageIds,
  onSelectedPageIdsChange,
  disabled = false,
}: FanpageAppPickerProps) {
  const appPages = useMemo(
    () =>
      allPages.filter(
        (p) => p.tokenStatus === "active" && p.workspaceAppId === workspaceAppId
      ),
    [allPages, workspaceAppId]
  );

  const allPagesSelected =
    appPages.length > 0 && selectedPageIds.size === appPages.length;
  const somePagesSelected =
    selectedPageIds.size > 0 && selectedPageIds.size < appPages.length;

  function togglePage(id: string) {
    onSelectedPageIdsChange(
      new Set(
        selectedPageIds.has(id)
          ? [...selectedPageIds].filter((x) => x !== id)
          : [...selectedPageIds, id]
      )
    );
  }

  function toggleSelectAllPages() {
    if (allPagesSelected) {
      onSelectedPageIdsChange(new Set());
    } else {
      onSelectedPageIdsChange(new Set(appPages.map((p) => p.id)));
    }
  }

  function invertSelectedPages() {
    const next = new Set<string>();
    for (const p of appPages) {
      if (!selectedPageIds.has(p.id)) next.add(p.id);
    }
    onSelectedPageIdsChange(next);
  }

  function onAppChange(appId: string) {
    onWorkspaceAppIdChange(appId);
    const inApp = allPages.filter(
      (p) => p.tokenStatus === "active" && p.workspaceAppId === appId
    );
    const next = new Set([...selectedPageIds].filter((id) => inApp.some((p) => p.id === id)));
    if (next.size === 0 && inApp[0]) next.add(inApp[0].id);
    onSelectedPageIdsChange(next);
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Facebook App</label>
        <select
          value={workspaceAppId}
          onChange={(e) => onAppChange(e.target.value)}
          disabled={disabled || apps.length === 0}
          className={`${ui.select} w-full max-w-md disabled:opacity-60`}
        >
          {apps.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Fanpage đăng bài</label>
        {appPages.length === 0 ? (
          <p className="text-sm text-gray-500">
            App này chưa có Page active.{" "}
            <Link href="/pages" className="text-blue-600 hover:underline">
              Kết nối Page
            </Link>
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-2">
              <button
                type="button"
                onClick={invertSelectedPages}
                disabled={disabled || appPages.length === 0}
                className={`${ui.btnSm} disabled:opacity-50`}
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
              onSelectedChange={onSelectedPageIdsChange}
              minOne={false}
              disabled={disabled}
            />
            <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 max-w-xl mt-2">
              <label className="flex items-center gap-3 px-4 py-3 bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allPagesSelected}
                  disabled={disabled}
                  ref={(el) => {
                    if (el) el.indeterminate = somePagesSelected;
                  }}
                  onChange={toggleSelectAllPages}
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
                    disabled={disabled}
                    onChange={() => togglePage(p.id)}
                    className="rounded border-gray-300"
                  />
                  {p.pageAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.pageAvatar} alt="" className="w-8 h-8 rounded-full" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium">
                      {p.pageName.charAt(0)}
                    </div>
                  )}
                  <span className="text-sm text-gray-900">{p.pageName}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
