"use client";

export interface PageWithCategory {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
}

export type PageCategoryGroup = {
  key: string;
  categoryId: string | null;
  name: string;
  pageIds: string[];
};

export function groupPagesByCategory(pages: PageWithCategory[]): PageCategoryGroup[] {
  const map = new Map<string, PageCategoryGroup>();
  for (const p of pages) {
    const key = p.categoryId ?? "__none__";
    const name = p.categoryName?.trim() || "Chưa phân loại";
    if (!map.has(key)) {
      map.set(key, { key, categoryId: p.categoryId, name, pageIds: [] });
    }
    map.get(key)!.pageIds.push(p.id);
  }
  return [...map.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "vi", { sensitivity: "base" })
  );
}

export function toggleCategoryInSelection(
  categoryPageIds: string[],
  selected: Set<string>,
  options?: { minOne?: boolean }
): Set<string> {
  const minOne = options?.minOne ?? false;
  const allIn = categoryPageIds.length > 0 && categoryPageIds.every((id) => selected.has(id));
  const next = new Set(selected);
  if (allIn) {
    for (const id of categoryPageIds) next.delete(id);
    if (minOne && next.size === 0) {
      next.add(categoryPageIds[0]);
    }
  } else {
    for (const id of categoryPageIds) next.add(id);
  }
  return next;
}

export function PageCategorySelectBar({
  pages,
  selected,
  onSelectedChange,
  minOne = false,
  disabled = false,
}: {
  pages: PageWithCategory[];
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  minOne?: boolean;
  disabled?: boolean;
}) {
  const groups = groupPagesByCategory(pages);
  if (groups.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <span className="text-xs text-gray-600 shrink-0">Phân loại:</span>
      {groups.map((g) => {
        const active =
          g.pageIds.length > 0 && g.pageIds.every((id) => selected.has(id));
        const partial =
          !active && g.pageIds.some((id) => selected.has(id));
        return (
          <button
            key={g.key}
            type="button"
            disabled={disabled}
            title={`${g.pageIds.length} Fanpage — bấm để chọn/bỏ cả nhóm`}
            onClick={() =>
              onSelectedChange(
                toggleCategoryInSelection(g.pageIds, selected, { minOne })
              )
            }
            className={`text-xs font-medium px-2.5 py-1 rounded-lg border disabled:opacity-50 transition-colors ${
              active
                ? "bg-violet-600 text-white border-violet-600"
                : partial
                  ? "bg-violet-50 text-violet-900 border-violet-300 ring-1 ring-violet-200"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {g.name} ({g.pageIds.length})
          </button>
        );
      })}
    </div>
  );
}
