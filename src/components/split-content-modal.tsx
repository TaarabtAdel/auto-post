"use client";

import { useEffect, useState } from "react";
import { splitGeminiContent } from "@/lib/split-gemini-content";

const LS_SPLITS = "ytloc_split_contents";

type SavedSplit = {
  id: string;
  name: string;
  raw: string;
  times: string;
  caption1: string;
  caption2: string;
  caption3: string;
};

type SplitContentModalProps = {
  defaultName?: string;
  onClose: () => void;
};

const field =
  "w-full border border-gray-400 bg-white px-2 py-1 text-[13px] text-gray-900";
const btn =
  "px-3 py-1.5 text-xs border border-gray-400 bg-gray-100 hover:bg-gray-200 rounded-sm disabled:opacity-50";

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

function emptyDraft(name = ""): Omit<SavedSplit, "id"> {
  return { name, raw: "", times: "", caption1: "", caption2: "", caption3: "" };
}

function ContentBox({
  label,
  copied,
  creating,
  created,
  value,
  onChange,
  onCopy,
  onCreate,
}: {
  label: string;
  copied: boolean;
  creating: boolean;
  created: boolean;
  value: string;
  onChange: (v: string) => void;
  onCopy: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col min-h-[180px]">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span>{label}</span>
        <div className="flex items-center gap-1">
          <button type="button" className={btn} onClick={onCopy}>
            {copied ? "Đã copy" : "Copy nội dung này"}
          </button>
          <button
            type="button"
            className={btn}
            disabled={creating}
            onClick={onCreate}
          >
            {creating ? "Đang tạo..." : "Tạo bài viết"}
          </button>
          {created && (
            <a
              href="/posts"
              className="inline-flex items-center gap-1 text-green-600 font-medium whitespace-nowrap"
              title="Mở danh sách bài viết"
            >
              <span aria-hidden>✓</span>
              <span className="underline">/posts</span>
            </a>
          )}
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${field} flex-1 min-h-[140px] resize-y`}
      />
    </div>
  );
}

export function SplitContentModal({ defaultName = "", onClose }: SplitContentModalProps) {
  const [saved, setSaved] = useState<SavedSplit[]>([]);
  const [activeId, setActiveId] = useState("");
  const [draft, setDraft] = useState(emptyDraft(defaultName));
  const [copiedKey, setCopiedKey] = useState("");
  const [creatingKey, setCreatingKey] = useState("");
  const [createdKeys, setCreatedKeys] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_SPLITS) || "[]");
      if (Array.isArray(raw)) setSaved(raw);
    } catch {
      // ignore
    }
  }, []);

  function persist(next: SavedSplit[]) {
    setSaved(next);
    localStorage.setItem(LS_SPLITS, JSON.stringify(next));
  }

  function patch(part: Partial<SavedSplit>) {
    setDraft((d) => ({ ...d, ...part }));
  }

  function splitFour() {
    if (!draft.raw.trim()) {
      setNote("Dán kết quả Gemini trước khi tách.");
      return;
    }
    const next = splitGeminiContent(draft.raw);
    if (!next.times && !next.caption1) {
      setNote("Không tách được. Kiểm tra lại nội dung dán.");
      return;
    }
    patch(next);
    const n = [next.caption1, next.caption2, next.caption3].filter(Boolean).length;
    setNote(`Đã tách ${n} phần.`);
  }

  function newDraft() {
    setActiveId("");
    setDraft(emptyDraft(defaultName));
    setCreatedKeys(new Set());
    setNote("Bản mới.");
  }

  function loadSaved(id: string) {
    setActiveId(id);
    const item = saved.find((s) => s.id === id);
    if (item) {
      setDraft({
        name: item.name,
        raw: item.raw,
        times: item.times,
        caption1: item.caption1,
        caption2: item.caption2,
        caption3: item.caption3,
      });
    }
  }

  function deleteSaved() {
    if (!activeId) {
      setNote("Chưa chọn bản đã lưu.");
      return;
    }
    persist(saved.filter((s) => s.id !== activeId));
    setActiveId("");
    setDraft(emptyDraft(defaultName));
    setNote("Đã xóa bản đã lưu.");
  }

  async function copyField(key: string, text: string) {
    if (!text.trim()) {
      setNote("Ô này đang trống.");
      return;
    }
    await copyText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(""), 2000);
    setNote("Đã copy.");
  }

  async function createPost(key: string, text: string) {
    if (!text.trim()) {
      setNote("Ô này đang trống.");
      return;
    }
    setCreatingKey(key);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNote(data.error || "Không tạo được bài viết.");
        return;
      }
      setCreatedKeys((prev) => new Set(prev).add(key));
      setNote("Đã tạo bài viết.");
    } catch {
      setNote("Lỗi kết nối khi tạo bài viết.");
    } finally {
      setCreatingKey("");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3"
      onClick={onClose}
    >
      <div
        className="bg-[#f0f0f0] w-full max-w-[1100px] max-h-[92vh] flex flex-col border border-gray-400 shadow-lg text-[13px] text-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-300 bg-[#e8e8e8]">
          <h3 className="font-semibold">Tách và lưu 4 nội dung</h3>
          <button type="button" className="text-lg leading-none px-2" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span>Bản đã lưu:</span>
            <select
              value={activeId}
              onChange={(e) => loadSaved(e.target.value)}
              className={`${field} max-w-xs`}
            >
              <option value="">—</option>
              {saved.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button type="button" className={btn} onClick={newDraft}>
              Bản mới
            </button>
            <button type="button" className={btn} onClick={deleteSaved}>
              Xóa bản đã lưu
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap">Tên nội dung:</span>
            <input
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              className={field}
            />
          </div>

          <label className="block">
            <span>Dán toàn bộ kết quả như lệnh 2 vào ở đây:</span>
            <textarea
              value={draft.raw}
              onChange={(e) => patch({ raw: e.target.value })}
              rows={7}
              className={`${field} mt-1 resize-y`}
            />
          </label>

          <div>
            <button type="button" className={btn} onClick={splitFour}>
              Tách 4 nội dung
            </button>
          </div>

          {note && <p className="text-xs text-gray-600">{note}</p>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <ContentBox
              label="1. Thời gian cắt clip"
              copied={copiedKey === "times"}
              creating={creatingKey === "times"}
              created={createdKeys.has("times")}
              value={draft.times}
              onChange={(v) => patch({ times: v })}
              onCopy={() => copyField("times", draft.times)}
              onCreate={() => createPost("times", draft.times)}
            />
            <ContentBox
              label="2. Caption đoạn 1"
              copied={copiedKey === "c1"}
              creating={creatingKey === "c1"}
              created={createdKeys.has("c1")}
              value={draft.caption1}
              onChange={(v) => patch({ caption1: v })}
              onCopy={() => copyField("c1", draft.caption1)}
              onCreate={() => createPost("c1", draft.caption1)}
            />
            <ContentBox
              label="3. Caption đoạn 2"
              copied={copiedKey === "c2"}
              creating={creatingKey === "c2"}
              created={createdKeys.has("c2")}
              value={draft.caption2}
              onChange={(v) => patch({ caption2: v })}
              onCopy={() => copyField("c2", draft.caption2)}
              onCreate={() => createPost("c2", draft.caption2)}
            />
            <ContentBox
              label="4. Caption đoạn 3"
              copied={copiedKey === "c3"}
              creating={creatingKey === "c3"}
              created={createdKeys.has("c3")}
              value={draft.caption3}
              onChange={(v) => patch({ caption3: v })}
              onCopy={() => copyField("c3", draft.caption3)}
              onCreate={() => createPost("c3", draft.caption3)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
