"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collectYouTubeUrlsFromText,
  normalizeYouTubeUrl,
  type YouTubeSearchHit,
} from "@/lib/youtube-url";
import { SplitContentModal } from "@/components/split-content-modal";
import { ui } from "@/lib/dashboard-ui";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { DEFAULT_YOUTUBE_GEMINI_TEMPLATE } from "@/lib/youtube-gemini-template";

const LS_KEYWORDS = "ytloc_keywords";
const LS_WATCHED = "ytloc_watched";
const LS_RESULTS = "ytloc_results";
const LS_TEMPLATE = "ytloc_cmd_template_v3";
const DEFAULT_TEMPLATE = DEFAULT_YOUTUBE_GEMINI_TEMPLATE;
const LIST_PAGE_SIZE = 50;

type FailedLink = { url: string; reason: string };

function paginateSlice<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (Math.max(1, page) - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

function totalPages(total: number, pageSize: number): number {
  if (total <= 0) return 1;
  return Math.ceil(total / pageSize);
}

function ListPagination({
  page,
  setPage,
  total,
  pageSize,
  label,
}: {
  page: number;
  setPage: (n: number) => void;
  total: number;
  pageSize: number;
  label?: string;
}) {
  const pages = totalPages(total, pageSize);
  const current = Math.min(Math.max(1, page), pages);
  if (total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs text-gray-600 border-t border-gray-100">
      <span>
        {label ? `${label} · ` : ""}
        {total} mục · trang {current}/{pages} ({pageSize}/trang)
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          className={ui.btnSm}
          disabled={current <= 1}
          onClick={() => setPage(current - 1)}
        >
          Trước
        </button>
        <button
          type="button"
          className={ui.btnSm}
          disabled={current >= pages}
          onClick={() => setPage(current + 1)}
        >
          Sau
        </button>
      </div>
    </div>
  );
}

function formatDuration(sec: number): string {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parseMaxDuration(label: string): number {
  const [mm, ss] = label.split(":").map(Number);
  return (mm || 0) * 60 + (ss || 0);
}

function commandFor(v: YouTubeSearchHit, template: string): string {
  return template
    .replaceAll("{title}", v.title)
    .replaceAll("{url}", v.url)
    .replaceAll("{duration}", formatDuration(v.durationSec))
    .replaceAll("{channel}", v.channel)
    .replaceAll("{id}", v.id);
}

async function copyText(text: string): Promise<boolean> {
  return copyToClipboard(text);
}

function looksLikeYouTubeUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return /youtube\.com|youtu\.be/i.test(u.hostname);
  } catch {
    return false;
  }
}

export function YouTubeLocVideo() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [minDur, setMinDur] = useState("30:00");
  const [busy, setBusy] = useState(false);
  const [addingUrl, setAddingUrl] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<YouTubeSearchHit[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [savedKeyword, setSavedKeyword] = useState("");
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [seenFilter, setSeenFilter] = useState<"all" | "unseen" | "seen">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [showTemplate, setShowTemplate] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCmdPreview, setShowCmdPreview] = useState(false);
  const [cmdCopied, setCmdCopied] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadLinks, setDownloadLinks] = useState<
    { title: string; url: string; fileName?: string }[]
  >([]);
  const [listPage, setListPage] = useState(1);
  const [failedLinks, setFailedLinks] = useState<FailedLink[]>([]);
  const [failedPage, setFailedPage] = useState(1);
  const [listReady, setListReady] = useState(false);

  async function persistResults(next: YouTubeSearchHit[]) {
    try {
      const res = await fetch("/api/youtube/list", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          (data as { error?: string }).error ||
            "Không lưu được danh sách video lên server."
        );
        return false;
      }
      localStorage.removeItem(LS_RESULTS);
      return true;
    } catch {
      setError("Lỗi kết nối khi lưu danh sách video.");
      return false;
    }
  }

  useEffect(() => {
    try {
      const kw = JSON.parse(localStorage.getItem(LS_KEYWORDS) || "[]");
      if (Array.isArray(kw)) setKeywords(kw);
      const t = localStorage.getItem(LS_TEMPLATE);
      if (t) setTemplate(t);
    } catch {
      // ignore
    }

    let localWatched: string[] = [];
    try {
      const w = JSON.parse(localStorage.getItem(LS_WATCHED) || "[]");
      if (Array.isArray(w)) localWatched = w.filter((id) => typeof id === "string");
    } catch {
      // ignore
    }

    let localResults: YouTubeSearchHit[] = [];
    try {
      const r = JSON.parse(localStorage.getItem(LS_RESULTS) || "[]");
      if (Array.isArray(r)) localResults = r;
    } catch {
      // ignore
    }

    (async () => {
      try {
        const listRes = await fetch("/api/youtube/list");
        const listData = await listRes.json();
        if (listRes.ok) {
          let serverList = (listData.results ?? []) as YouTubeSearchHit[];
          if (serverList.length === 0 && localResults.length > 0) {
            const sync = await fetch("/api/youtube/list", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ results: localResults }),
            });
            if (sync.ok) {
              serverList = localResults;
              localStorage.removeItem(LS_RESULTS);
            } else {
              setResults(localResults);
            }
          } else if (serverList.length > 0 && localResults.length > 0) {
            const seen = new Set(serverList.map((h) => h.id));
            const extras = localResults.filter((h) => h?.id && !seen.has(h.id));
            if (extras.length > 0) {
              const merged = [...serverList, ...extras];
              const sync = await fetch("/api/youtube/list", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ results: merged }),
              });
              if (sync.ok) {
                serverList = merged;
                localStorage.removeItem(LS_RESULTS);
              }
            } else {
              localStorage.removeItem(LS_RESULTS);
            }
          } else if (serverList.length > 0) {
            localStorage.removeItem(LS_RESULTS);
          }
          setResults(serverList);
        } else if (localResults.length) {
          setResults(localResults);
        }
      } catch {
        if (localResults.length) setResults(localResults);
      } finally {
        setListReady(true);
      }

      try {
        const res = await fetch("/api/youtube/watched");
        const data = await res.json();
        if (!res.ok) return;
        let ids = (data.ids ?? []) as string[];
        const missing = localWatched.filter((id) => !ids.includes(id));
        if (missing.length > 0) {
          const sync = await fetch("/api/youtube/watched", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoIds: missing, watched: true }),
          });
          const synced = await sync.json();
          if (sync.ok) ids = (synced.ids ?? ids) as string[];
        }
        setWatched(new Set(ids));
        localStorage.removeItem(LS_WATCHED);
      } catch {
        if (localWatched.length) setWatched(new Set(localWatched));
      }
    })();
  }, []);

  const visible = useMemo(() => {
    return results.filter((v) => {
      if (seenFilter === "seen") return watched.has(v.id);
      if (seenFilter === "unseen") return !watched.has(v.id);
      return true;
    });
  }, [results, seenFilter, watched]);

  useEffect(() => {
    setListPage(1);
  }, [seenFilter]);

  useEffect(() => {
    const pages = totalPages(visible.length, LIST_PAGE_SIZE);
    if (listPage > pages) setListPage(pages);
  }, [visible.length, listPage]);

  useEffect(() => {
    const pages = totalPages(failedLinks.length, LIST_PAGE_SIZE);
    if (failedPage > pages) setFailedPage(pages);
  }, [failedLinks.length, failedPage]);

  const visiblePageItems = useMemo(
    () => paginateSlice(visible, listPage, LIST_PAGE_SIZE),
    [visible, listPage]
  );

  const failedPageItems = useMemo(
    () => paginateSlice(failedLinks, failedPage, LIST_PAGE_SIZE),
    [failedLinks, failedPage]
  );

  function mergeHits(hits: YouTubeSearchHit[]) {
    const seen = new Set(hits.map((h) => h.id));
    const merged = [...hits];
    for (const old of results) {
      if (!seen.has(old.id)) {
        merged.push(old);
        seen.add(old.id);
      }
    }
    setResults(merged);
    void persistResults(merged);
    return merged;
  }

  async function fetchHitFromUrl(
    url: string
  ): Promise<
    | { ok: true; hit: YouTubeSearchHit; already: boolean }
    | { ok: false; error: string }
  > {
    const res = await fetch("/api/import/youtube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "info", url }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.error || "Không lấy được video từ URL." };
    }
    const info = data.info as {
      id?: string;
      title?: string;
      channel?: string;
      durationSec?: number;
      webpageUrl?: string;
    };
    if (!info?.id) {
      return { ok: false, error: "Không lấy được ID video." };
    }
    const hit: YouTubeSearchHit = {
      id: info.id,
      title: info.title || "(không tiêu đề)",
      channel: info.channel || "",
      durationSec: info.durationSec || 0,
      url: info.webpageUrl || url,
    };
    const already = results.some((v) => v.id === hit.id);
    return { ok: true, hit, already };
  }

  async function addByUrl(rawUrl: string) {
    const url = rawUrl.trim();
    if (!url || !looksLikeYouTubeUrl(url)) {
      setError("Dán link YouTube hợp lệ.");
      return;
    }
    setAddingUrl(true);
    setError("");
    setStatus("Đang lấy thông tin video...");
    try {
      const result = await fetchHitFromUrl(url);
      if (!result.ok) {
        setError(result.error);
        setStatus("");
        return;
      }
      mergeHits([result.hit]);
      setUrlInput("");
      setStatus(
        result.already
          ? `Video đã có trong danh sách: ${result.hit.title}`
          : `Đã thêm: ${result.hit.title}`
      );
    } catch {
      setError("Lỗi kết nối khi thêm URL.");
      setStatus("");
    } finally {
      setAddingUrl(false);
    }
  }

  async function addUrlsFromInput() {
    const { valid: urls, invalid } = collectYouTubeUrlsFromText(urlInput);
    const batchFailed: FailedLink[] = invalid.map((i) => ({
      url: i.raw,
      reason: i.reason,
    }));

    if (urls.length === 0 && batchFailed.length === 0) {
      setError(
        "Dán ít nhất một link YouTube hợp lệ (mỗi dòng một link, hoặc cách bằng dấu phẩy / khoảng trắng)."
      );
      return;
    }

    if (urls.length === 0) {
      setFailedLinks(batchFailed);
      setFailedPage(1);
      setError("Không có link YouTube hợp lệ trong ô dán.");
      return;
    }

    if (urls.length === 1 && batchFailed.length === 0) {
      await addByUrl(urls[0]);
      return;
    }

    setAddingUrl(true);
    setError("");
    let added = 0;
    let skipped = 0;
    let failed = batchFailed.length;
    const hitsToMerge: YouTubeSearchHit[] = [];
    const knownIds = new Set(results.map((r) => r.id));

    try {
      for (let i = 0; i < urls.length; i++) {
        setStatus(`Đang thêm ${i + 1}/${urls.length}…`);
        try {
          const result = await fetchHitFromUrl(urls[i]);
          if (!result.ok) {
            failed++;
            batchFailed.push({ url: urls[i], reason: result.error });
            continue;
          }
          if (knownIds.has(result.hit.id)) {
            skipped++;
          } else {
            added++;
            knownIds.add(result.hit.id);
            hitsToMerge.push(result.hit);
          }
        } catch {
          failed++;
          batchFailed.push({
            url: urls[i],
            reason: "Lỗi kết nối khi lấy thông tin video.",
          });
        }
      }

      if (hitsToMerge.length > 0) mergeHits(hitsToMerge);

      setFailedLinks(batchFailed);
      setFailedPage(1);
      setUrlInput("");
      const parts = [`${added} video mới`];
      if (skipped > 0) parts.push(`${skipped} đã có sẵn`);
      if (failed > 0) parts.push(`${failed} lỗi`);
      setStatus(
        `Đã xử lý ${urls.length + invalid.length} dòng: ${parts.join(", ")}.`
      );
    } finally {
      setAddingUrl(false);
    }
  }

  async function persistWatched(ids: string[], nextWatched: boolean): Promise<boolean> {
    const prev = watched;
    const optimistic = new Set(prev);
    for (const id of ids) {
      if (nextWatched) optimistic.add(id);
      else optimistic.delete(id);
    }
    setWatched(optimistic);
    try {
      const res = await fetch("/api/youtube/watched", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoIds: ids, watched: nextWatched }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWatched(prev);
        setError(data.error || "Không lưu được trạng thái đã xem.");
        return false;
      }
      setWatched(new Set((data.ids ?? []) as string[]));
      return true;
    } catch {
      setWatched(prev);
      setError("Lỗi kết nối khi lưu đã xem.");
      return false;
    }
  }

  async function toggleWatched(id: string) {
    await persistWatched([id], !watched.has(id));
  }

  async function handleSearch() {
    const q = query.trim() || savedKeyword.trim();
    if (!q) {
      setError("Nhập từ khóa hoặc dán link YouTube.");
      return;
    }
    if (looksLikeYouTubeUrl(q)) {
      await addByUrl(q);
      return;
    }
    setBusy(true);
    setError("");
    setStatus("Đang tìm trên YouTube...");
    try {
      const res = await fetch("/api/import/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "search",
          query: q,
          limit: 30,
          minDurationSec: parseMaxDuration(minDur) || 30 * 60,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Tìm kiếm thất bại.");
        setStatus("");
        return;
      }
      const hits = (data.results ?? []) as YouTubeSearchHit[];
      const merged = mergeHits(hits);
      if (!keywords.includes(q)) {
        const next = [q, ...keywords].slice(0, 30);
        setKeywords(next);
        localStorage.setItem(LS_KEYWORDS, JSON.stringify(next));
      }
      setSavedKeyword(q);
      setQuery(q);
      setSelected(new Set());
      setStatus(
        `Tìm thấy ${hits.length} video (thời lượng ≥ ${minDur}, hoặc chưa có metadata). Tổng kho: ${merged.length}.`
      );
    } catch {
      setError("Lỗi kết nối khi tìm kiếm.");
    } finally {
      setBusy(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectedVideos(): YouTubeSearchHit[] {
    return results.filter((v) => selected.has(v.id));
  }

  function removeFromList(ids: string[]) {
    if (ids.length === 0) return;
    setResults((prev) => {
      const next = prev.filter((v) => !ids.includes(v.id));
      void persistResults(next);
      return next;
    });
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
    setStatus(`Đã xóa ${ids.length} video khỏi danh sách.`);
  }

  function removeOneFromList(id: string) {
    removeFromList([id]);
  }

  function removeSelectedFromList() {
    const ids = [...selected];
    if (ids.length === 0) {
      setError("Chọn video cần xóa khỏi danh sách.");
      return;
    }
    removeFromList(ids);
  }

  async function copyCommands() {
    const list = selectedVideos();
    if (list.length === 0) {
      setError("Chọn ít nhất 1 video.");
      return;
    }
    const ok = await copyText(
      list.map((v) => commandFor(v, template)).join("\n\n")
    );
    if (!ok) {
      setError("Không copy được — hãy dùng «Xem lệnh + link» rồi Ctrl+C.");
      return;
    }
    setError("");
    setStatus(`Đã copy ${list.length} lệnh.`);
  }

  /** Đánh dấu đã xem → tạo plan AUTO (video đầu trong các dòng chọn) → /auto?id=… */
  async function createAutoFromSelected() {
    const list = selectedVideos();
    if (list.length === 0) {
      setError("Chọn ít nhất 1 video (cột Chọn).");
      return;
    }
    const primary = list[0];
    setBusy(true);
    setError("");
    setStatus("Đang đánh dấu đã xem và tạo plan AUTO…");
    try {
      const marked = await persistWatched(
        list.map((v) => v.id),
        true
      );
      if (!marked) {
        setStatus("");
        return;
      }

      let youtubeUrl = primary.url;
      try {
        youtubeUrl = normalizeYouTubeUrl(primary.url);
      } catch {
        // giữ url gốc
      }

      const res = await fetch("/api/auto/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: (primary.title || "Campaign AUTO").slice(0, 240),
          youtubeUrl,
          youtubeVideoId: primary.id,
          youtubeTitle: primary.title,
          wizardStep: 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không tạo được plan AUTO.");
      }
      const id = data.campaign?.id as string | undefined;
      if (!id) {
        throw new Error("Server không trả id plan.");
      }
      if (list.length > 1) {
        setStatus(
          `Đã đánh dấu ${list.length} video «Đã xem». Mở plan AUTO cho: ${primary.title}`
        );
      }
      router.push(`/auto?id=${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tạo AUTO thất bại.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  function splitNameHint() {
    const v = selectedVideos()[0];
    if (!v) return "";
    return [v.title, v.channel].filter(Boolean).join(" | ");
  }

  function removeKeyword() {
    if (!savedKeyword) return;
    const next = keywords.filter((k) => k !== savedKeyword);
    setKeywords(next);
    localStorage.setItem(LS_KEYWORDS, JSON.stringify(next));
    setSavedKeyword("");
    setStatus("Đã xóa từ khóa.");
  }

  /** Tải qua server → uploads (tạm ẩn nút; bật lại khi cần). */
  async function downloadSelectedToUploads() {
    const list = selectedVideos();
    if (list.length === 0) {
      setError("Chọn ít nhất 1 video (tick cột Chọn — không phụ thuộc bộ lọc đã xem).");
      return;
    }
    setDownloading(true);
    setError("");
    setDownloadLinks([]);
    const links: { title: string; url: string; fileName?: string }[] = [];
    const failures: string[] = [];

    for (const [i, v] of list.entries()) {
      setStatus(`Đang tải ${i + 1}/${list.length}: ${v.title}`);
      let fetchUrl = v.url;
      try {
        fetchUrl = normalizeYouTubeUrl(v.url);
      } catch {
        failures.push(`${v.title}: link không hợp lệ`);
        continue;
      }

      try {
        const res = await fetch("/api/import/youtube", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: fetchUrl,
            action: "download",
            quality: "720",
          }),
        });
        let data: { url?: string; title?: string; fileName?: string; error?: string } =
          {};
        try {
          data = await res.json();
        } catch {
          failures.push(`${v.title}: phản hồi server không hợp lệ (${res.status})`);
          continue;
        }
        if (res.ok && data.url) {
          links.push({
            title: data.title || v.title,
            url: data.url,
            fileName: data.fileName,
          });
        } else {
          const msg =
            data.error ||
            (res.status === 429
              ? "Quá giới hạn tải — đợi vài phút."
              : `HTTP ${res.status}`);
          failures.push(`${v.title}: ${msg}`);
        }
      } catch {
        failures.push(`${v.title}: lỗi kết nối (timeout hoặc mạng)`);
      }
    }

    setDownloading(false);
    setDownloadLinks(links);
    if (failures.length > 0) {
      setError(failures.slice(0, 5).join(" · ") + (failures.length > 5 ? " …" : ""));
    }
    setStatus(
      links.length
        ? `Tải xong ${links.length}/${list.length} video vào uploads.`
        : `Không tải được video nào (${list.length} đã thử).`
    );
  }

  async function copySelectedLinksAndOpenYtsave() {
    const list = selectedVideos();
    if (list.length === 0) {
      setError(
        "Chọn ít nhất 1 video (tick cột Chọn — không phụ thuộc bộ lọc đã xem)."
      );
      return;
    }
    setError("");
    const text = list
      .map((v) => {
        try {
          return normalizeYouTubeUrl(v.url);
        } catch {
          return v.url;
        }
      })
      .join("\n");
    const ok = await copyText(text);
    if (!ok) {
      setError("Không copy được — hãy copy link thủ công.");
      return;
    }
    setStatus(`Đã copy ${list.length} link.`);
    alert("Đã sao chép link. Nhấn OK để mở YTSave.");
    window.open("https://ytsave.to/en2", "_blank", "noopener,noreferrer");
  }

  function saveTemplate() {
    localStorage.setItem(LS_TEMPLATE, template);
    setShowTemplate(false);
    setStatus("Đã lưu mẫu lệnh TXT.");
  }

  return (
    <div className={`${ui.card} ${ui.cardPad} space-y-4 text-sm`}>
      <p className={ui.hint}>
        Bấm tên video: sao chép lệnh kèm link · Nhấp đúp: mở YouTube · Tìm kiếm lọc
        video <strong>≥</strong> mức chọn (15 / 30 / 60 / 100 / 180 phút). Danh sách
        lưu theo tài khoản trên server.
      </p>
      {!listReady && (
        <p className="text-xs text-gray-500">Đang tải danh sách từ server…</p>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className={`${ui.input} flex-1 min-w-[200px]`}
          placeholder="Nhập từ khóa tìm kiếm YouTube..."
        />
        <select
          value={minDur}
          onChange={(e) => setMinDur(e.target.value)}
          className={ui.select}
          title="Chỉ giữ video dài từ mức này trở lên"
          aria-label="Thời lượng tối thiểu"
        >
          <option value="15:00">≥ 15 phút</option>
          <option value="30:00">≥ 30 phút</option>
          <option value="60:00">≥ 60 phút</option>
          <option value="100:00">≥ 100 phút</option>
          <option value="180:00">≥ 180 phút</option>
        </select>
        <button
          type="button"
          className={ui.btnPrimary}
          disabled={busy}
          onClick={handleSearch}
        >
          {busy ? "..." : "Tìm kiếm"}
        </button>
      </div>

      <div className="flex gap-2 items-start">
        <textarea
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void addUrlsFromInput();
            }
          }}
          rows={3}
          className={`${ui.textarea} flex-1 min-h-[4.5rem]`}
          placeholder="Dán một hoặc nhiều link YouTube (mỗi dòng một link, hoặc cách bằng dấu phẩy)…"
        />
        <button
          type="button"
          className={ui.btnSecondary}
          disabled={addingUrl}
          onClick={() => void addUrlsFromInput()}
        >
          {addingUrl ? "..." : "Thêm URL"}
        </button>
      </div>
      <p className="text-xs text-gray-500">
        Ctrl+Enter (⌘+Enter trên Mac) để thêm hàng loạt.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span>Từ khóa đã lưu:</span>
        <select
          value={savedKeyword}
          onChange={(e) => {
            setSavedKeyword(e.target.value);
            setQuery(e.target.value);
          }}
          className={`${ui.select} min-w-48`}
        >
          <option value="">—</option>
          {keywords.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <button type="button" className={ui.btnSm} onClick={removeKeyword}>
          Xóa từ khóa
        </button>
        <button
          type="button"
          className={ui.btnSm}
          onClick={() => {
            setSeenFilter("all");
            setStatus(`Đang hiện tất cả ${results.length} video đã tìm.`);
          }}
        >
          Tất cả video đã tìm
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={seenFilter === "all"}
              onChange={() => setSeenFilter("all")}
            />
            Tất cả
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={seenFilter === "unseen"}
              onChange={() => setSeenFilter("unseen")}
            />
            Chưa xem
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={seenFilter === "seen"}
              onChange={() => setSeenFilter("seen")}
            />
            Đã xem
          </label>
        </div>
        <button type="button" className={ui.btnSm} onClick={() => setShowHistory((v) => !v)}>
          Lịch sử đã xem
        </button>
      </div>

      <div className={ui.tableShell}>
        <table className="w-full text-left border-collapse">
          <thead className={ui.tableHead}>
            <tr>
              <th className={`${ui.th} w-14`}>Chọn</th>
              <th className={`${ui.th} w-20`}>Đã xem</th>
              <th className={ui.th}>Tên video</th>
              <th className={`${ui.th} w-24`}>Thời lượng</th>
              <th className={`${ui.th} w-48`}>Kênh</th>
              <th className={`${ui.th} w-12 text-center`}>Xóa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className={`${ui.td} text-gray-500 text-center`}>
                  Chưa có kết quả. Nhập từ khóa hoặc dán link YouTube.
                </td>
              </tr>
            ) : (
              visiblePageItems.map((v) => (
                <tr
                  key={v.id}
                  className="hover:bg-gray-50/80"
                  onDoubleClick={() =>
                    window.open(v.url, "_blank", "noopener,noreferrer")
                  }
                >
                  <td className="p-1 text-center">
                    <input
                      type="checkbox"
                      checked={selected.has(v.id)}
                      onChange={() => toggleSelect(v.id)}
                    />
                  </td>
                  <td className="p-1 text-center">
                    <input
                      type="checkbox"
                      checked={watched.has(v.id)}
                      onChange={() => toggleWatched(v.id)}
                      title="Đánh dấu đã xem (lưu DB)"
                    />
                  </td>
                  <td className="p-1">
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-left text-blue-700 hover:underline"
                    >
                      {v.title}
                    </a>
                  </td>
                  <td className="p-1 whitespace-nowrap">{formatDuration(v.durationSec)}</td>
                  <td className="p-1 truncate">{v.channel}</td>
                  <td className="p-1 text-center">
                    <button
                      type="button"
                      className="text-red-600 hover:underline text-xs px-1"
                      title="Xóa khỏi danh sách (không xóa file đã tải)"
                      onClick={() => removeOneFromList(v.id)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <ListPagination
          label="Danh sách video"
          page={listPage}
          setPage={setListPage}
          total={visible.length}
          pageSize={LIST_PAGE_SIZE}
        />
      </div>

      {failedLinks.length > 0 && (
        <div className={`${ui.card} ${ui.cardPadSm} space-y-2`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium text-sm text-red-800">
              Link lỗi ({failedLinks.length})
            </h3>
            <button
              type="button"
              className={ui.btnSm}
              onClick={() => {
                setFailedLinks([]);
                setFailedPage(1);
              }}
            >
              Xóa danh sách lỗi
            </button>
          </div>
          <div className={ui.tableShell}>
            <table className="w-full text-left border-collapse text-xs">
              <thead className={ui.tableHead}>
                <tr>
                  <th className={ui.th}>Link</th>
                  <th className={`${ui.th} w-48`}>Lý do</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {failedPageItems.map((row, idx) => (
                  <tr key={`${failedPage}-${idx}-${row.url}`}>
                    <td className={`${ui.td} break-all font-mono`}>{row.url}</td>
                    <td className={`${ui.td} text-red-700`}>{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ListPagination
              label="Link lỗi"
              page={failedPage}
              setPage={setFailedPage}
              total={failedLinks.length}
              pageSize={LIST_PAGE_SIZE}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={ui.btnPrimary}
          disabled={busy}
          onClick={() => void createAutoFromSelected()}
        >
          Tạo AUTO đã chọn
        </button>
        <button type="button" className={ui.btnSm} onClick={copyCommands}>
          Sao chép bộ lệnh
        </button>
        <button
          type="button"
          className={ui.btnSm}
          onClick={() => {
            if (selectedVideos().length === 0) {
              setError("Chọn ít nhất 1 video.");
              return;
            }
            setError("");
            setCmdCopied(false);
            setShowCmdPreview(true);
          }}
        >
          Xem lệnh + link
        </button>
        <button type="button" className={ui.btnSm} onClick={() => setShowTemplate((v) => !v)}>
          Đổi mẫu lệnh TXT
        </button>
        <button
          type="button"
          className={ui.btnSm}
          onClick={() => {
            setError("");
            setShowSplit(true);
          }}
        >
          Tách / Lưu 4 caption
        </button>
        <button
          type="button"
          className={ui.btnSuccess}
          onClick={() => void copySelectedLinksAndOpenYtsave()}
        >
          Tải video đã chọn
        </button>
        <button type="button" className={ui.btnSm} onClick={removeSelectedFromList}>
          Xóa đã chọn khỏi list
        </button>
      </div>
      <p className="text-xs text-gray-500">
        «Tạo AUTO đã chọn»: tick «Đã xem» cho mọi dòng đang chọn, tạo plan AUTO từ{" "}
        <strong>video đầu tiên</strong> trong số đó → mở wizard /auto. «Tải video đã chọn»:
        copy link → YTSave. Xóa list chỉ gỡ khỏi bảng.
      </p>

      {error && <div className={ui.alertError}>{error}</div>}
      {status && <div className="text-gray-700 text-sm">{status}</div>}
      {downloadLinks.length > 0 && (
        <ul className="text-xs space-y-1">
          {downloadLinks.map((f) => (
            <li key={f.url}>
              <a
                href={f.url}
                target="_blank"
                rel="noreferrer"
                download={f.fileName}
                className="text-blue-700 underline break-all"
              >
                {f.title}
              </a>
              <span className="text-gray-500 text-[10px] block break-all">{f.url}</span>
            </li>
          ))}
        </ul>
      )}

      {showHistory && (
        <div className={`${ui.card} ${ui.cardPadSm}`}>
          <p className="font-medium mb-1">Lịch sử đã xem ({watched.size})</p>
          {[...watched].length === 0 ? (
            <p className="text-gray-500">Chưa đánh dấu video nào.</p>
          ) : (
            <ul className="list-disc pl-5">
              {results
                .filter((v) => watched.has(v.id))
                .map((v) => (
                  <li key={v.id}>
                    <a href={v.url} target="_blank" rel="noreferrer" className="underline">
                      {v.title}
                    </a>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {showCmdPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowCmdPreview(false)}
        >
          <div
            className={`${ui.card} w-full max-w-3xl max-h-[85vh] flex flex-col shadow-lg`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-sm">Lệnh + link</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={ui.btnSmPrimary}
                  onClick={async () => {
                    const text = selectedVideos()
                      .map((v) => commandFor(v, template))
                      .join("\n\n");
                    const ok = await copyText(text);
                    if (!ok) {
                      setError(
                        "Không copy tự động — bôi đen nội dung modal rồi Ctrl+C."
                      );
                      return;
                    }
                    setCmdCopied(true);
                    setTimeout(() => setCmdCopied(false), 2000);
                  }}
                >
                  {cmdCopied ? "Đã copy" : "Copy"}
                </button>
                <button
                  type="button"
                  className="text-sm text-gray-600 px-2"
                  onClick={() => setShowCmdPreview(false)}
                >
                  Đóng
                </button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-xs whitespace-pre-wrap font-mono leading-relaxed">
              {selectedVideos()
                .map((v) => commandFor(v, template))
                .join("\n\n")}
            </pre>
          </div>
        </div>
      )}

      {showSplit && (
        <SplitContentModal
          defaultName={splitNameHint()}
          onClose={() => setShowSplit(false)}
        />
      )}

      {showTemplate && (
        <div className="border border-gray-400 bg-white p-2 space-y-2">
          <p className="text-xs text-gray-600">
            Placeholder: {"{title}"} {"{url}"} {"{duration}"} {"{channel}"} {"{id}"}
          </p>
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={5}
            className="w-full border border-gray-300 p-2 font-mono text-xs"
          />
          <button type="button" className={ui.btnPrimary} onClick={saveTemplate}>
            Lưu mẫu
          </button>
        </div>
      )}
    </div>
  );
}
