"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ui } from "@/lib/dashboard-ui";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

type SettingsForm = {
  proxySourceUrl: string;
  proxyText: string;
  articleText: string;
  waitMinSec: number | string;
  waitMaxSec: number | string;
  proxyTimeoutSec: number | string;
  articleLoadTimeoutSec: number | string;
  scrollEnabled: boolean;
  scrollSpeed: string;
  scrollDepthPercent: number | string;
  loop: boolean;
};

type ProxyRow = {
  line: string;
  host: string;
  port: number;
  protocol: string;
  auth: boolean;
  status: string;
  kind: "live" | "dead" | "busy" | "untried" | "unsupported";
  title: string;
};

type Machine = {
  machine: string;
  ip: string;
  online: boolean;
  lastSeen: number;
  tabs: number;
  running: number;
  allowShutdown: boolean;
  proxies: number;
  command: { kind: string; status: string; note: string; createdAt: number; updatedAt: number } | null;
};

const COMMAND_LABEL: Record<string, string> = {
  pending: "Đã gửi lệnh tắt, chờ máy nhận",
  delivered: "Máy đã nhận, đang đếm 60 giây",
  done: "Máy đã tắt",
  canceled: "Người dùng trên máy đã huỷ",
  rejected: "Máy từ chối (chưa cho phép tắt từ xa)",
  failed: "Tắt máy lỗi",
  expired: "Lệnh hết hạn (máy không nhận trong 10 phút)",
};

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} giây trước`;
  if (s < 3600) return `${Math.round(s / 60)} phút trước`;
  return `${Math.round(s / 3600)} giờ trước`;
}

type Overview = {
  form: SettingsForm;
  machines: Machine[];
  done: { total: number; ok: number; bad: number; unknown: number; reasons: { note: string; count: number }[] };
  serverTime: number;
  userId: string;
  syncKey: string;
  syncKeyCreatedAt: number | null;
};

type Table = { rows: ProxyRow[]; skipped: number; total: number; counts: Record<string, number> };

const FILTERS = ["", "Chưa thử", "Không", "Đang dùng", "Live", "Không hỗ trợ"];
const MAX_ROWS = 1000;

const BADGE: Record<ProxyRow["kind"], string> = {
  live: "bg-green-100 text-green-800",
  dead: "bg-red-100 text-red-800",
  busy: "bg-blue-100 text-blue-800",
  untried: "bg-gray-100 text-gray-700",
  unsupported: "bg-violet-100 text-violet-800",
};

async function api<T>(body?: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/geo-sync/admin", body
    ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
    : { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

function articleHint(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const bad = lines.filter((l) => {
    try {
      return !/^https?:$/.test(new URL(l).protocol);
    } catch {
      return true;
    }
  });
  if (bad.length) return `${bad.length} dòng không phải URL http/https hợp lệ.`;
  return lines.length ? `${lines.length} URL hợp lệ.` : "Chưa có bài viết.";
}

export function GeoSettingsPanel() {
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<{ text: string; error?: boolean }>({ text: "" });
  const [busy, setBusy] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const dirty = useRef(false);
  const formRef = useRef<SettingsForm | null>(null);
  formRef.current = form;

  const inspect = useCallback(async (proxyText: string) => {
    try {
      setTable(await api<Table>({ action: "inspect", proxyText }));
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const o = await api<Overview>();
      setOverview(o);
      if (!dirty.current) setForm(o.form);
      await inspect(dirty.current && formRef.current ? formRef.current.proxyText : o.form.proxyText);
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  }, [inspect]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 8000);
    return () => clearInterval(t);
  }, [refresh]);

  const inspectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function edit<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) {
    dirty.current = true;
    setForm((f) => (f ? { ...f, [key]: value } : f));
    if (key === "proxyText") {
      if (inspectTimer.current) clearTimeout(inspectTimer.current);
      inspectTimer.current = setTimeout(() => void inspect(String(value)), 400);
    }
  }

  async function save(next?: SettingsForm) {
    const f = next ?? form;
    if (!f) return;
    setBusy(true);
    try {
      const r = await api<Overview & { message: string }>({ action: "save", form: f });
      dirty.current = false;
      setOverview(r);
      setForm(r.form);
      await inspect(r.form.proxyText);
      setStatus({ text: `Đã lưu lúc ${new Date().toLocaleTimeString("vi-VN", { hour12: false })} · ${r.message}` });
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function fetchProxies() {
    if (!form) return;
    setBusy(true);
    setStatus({ text: "Đang tải danh sách proxy..." });
    try {
      const r = await api<{ sourceText: string; proxyText: string; count: number; notes: string[]; errors: string[] }>({
        action: "fetchProxies",
        sourceText: form.proxySourceUrl,
      });
      const next = { ...form, proxySourceUrl: r.sourceText, proxyText: r.proxyText };
      setForm(next);
      await save(next);
      const extra = r.errors.length ? ` Nguồn lỗi: ${r.errors.join(" · ")}.` : "";
      setStatus({ text: `Đã gộp ${r.count} proxy (${r.notes.join(", ")}) và lưu.${extra}` });
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function clear(what: "health" | "done" | "proxies", question: string) {
    if (!window.confirm(question)) return;
    setBusy(true);
    try {
      const r = await api<Overview>({ action: "clear", what });
      setOverview(r);
      if (what === "proxies") { dirty.current = false; setForm(r.form); }
      await inspect(what === "proxies" ? r.form.proxyText : form?.proxyText || "");
      setStatus({ text: "Đã xoá." });
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function rotateKey() {
    const has = Boolean(overview?.syncKey);
    if (has && !window.confirm("Tạo khoá mới? Các máy đang dùng khoá cũ sẽ mất kết nối cho tới khi nhập khoá mới.")) return;
    try {
      const r = await api<Pick<Overview, "userId" | "syncKey" | "syncKeyCreatedAt">>({ action: "rotateKey" });
      setOverview((o) => (o ? { ...o, ...r } : o));
      setShowKey(true);
      setStatus({ text: "Đã tạo khoá đồng bộ. Nhập ID user và khoá này vào app (Cài đặt → Host)." });
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  }

  async function copyText(text: string, label: string) {
    const ok = await copyToClipboard(text);
    setStatus(ok ? { text: `Đã copy ${label}.` } : { text: "Không copy được.", error: true });
  }

  async function shutdownMachine(machine: string) {
    if (!window.confirm(`Tắt máy ${machine}?\n\nMáy sẽ hiện thông báo đếm 60 giây (có nút Huỷ), dừng các tab, trả proxy rồi tắt máy.`)) return;
    try {
      const r = await api<Overview>({ action: "shutdown", machine });
      setOverview(r);
      setStatus({ text: `Đã gửi lệnh tắt máy ${machine}. Máy nhận trong khoảng 5 giây.` });
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  }

  async function releaseMachine(machine: string) {
    if (!window.confirm(`Trả mọi proxy máy ${machine} đang giữ? Chỉ nên làm khi máy đó đã tắt hẳn.`)) return;
    try {
      await api({ action: "releaseMachine", machine });
      await refresh();
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  }

  function removeRow(index: number) {
    if (!table || !form) return;
    const proxyText = table.rows.filter((_, i) => i !== index).map((r) => r.line).join("\n");
    edit("proxyText", proxyText);
    setStatus({ text: "Đã xoá khỏi danh sách. Bấm Lưu cấu hình để áp dụng." });
  }

  const shown = useMemo(() => {
    if (!table) return [];
    const out: { row: ProxyRow; index: number }[] = [];
    table.rows.forEach((row, index) => {
      if (!filter || row.status === filter) out.push({ row, index });
    });
    return out;
  }, [table, filter]);

  async function copyShown() {
    const ok = await copyToClipboard(shown.map((s) => s.row.line).join("\n"));
    setStatus(ok ? { text: `Đã copy ${shown.length} proxy (${filter || "Tất cả"}).` } : { text: "Không copy được.", error: true });
  }

  if (!form || !overview) {
    return <div className={`${ui.card} ${ui.cardPad} text-sm text-gray-600`}>{status.text || "Đang tải…"}</div>;
  }

  const d = overview.done;
  const now = overview.serverTime;

  return (
    <div className="space-y-6 pb-24">
      <section className={`${ui.card} ${ui.cardPad} space-y-3`}>
        <h3 className="font-semibold text-gray-900">Kết nối app (chế độ Host)</h3>
        <p className="text-sm text-gray-600">
          Trong app: Cài đặt → Chế độ đọc dữ liệu → Host, nhập địa chỉ máy chủ, ID user và khoá đồng bộ bên dưới.
          Dữ liệu ở đây chỉ thuộc tài khoản này; user khác có dữ liệu riêng.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1">ID user</div>
            <div className="flex gap-2">
              <input readOnly className={`${ui.input} font-mono text-xs`} value={overview.userId} />
              <button type="button" className={ui.btnSm} onClick={() => void copyText(overview.userId, "ID user")}>
                Copy
              </button>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1">Khoá đồng bộ</div>
            {overview.syncKey ? (
              <div className="flex gap-2">
                <input
                  readOnly
                  type={showKey ? "text" : "password"}
                  className={`${ui.input} font-mono text-xs`}
                  value={overview.syncKey}
                />
                <button type="button" className={ui.btnSm} onClick={() => setShowKey((v) => !v)}>
                  {showKey ? "Ẩn" : "Hiện"}
                </button>
                <button type="button" className={ui.btnSm} onClick={() => void copyText(overview.syncKey, "khoá đồng bộ")}>
                  Copy
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-600">Chưa có khoá.</p>
            )}
          </div>
        </div>
        <button type="button" className={overview.syncKey ? ui.btnSm : ui.btnSmPrimary} onClick={() => void rotateKey()}>
          {overview.syncKey ? "Tạo khoá mới" : "Tạo khoá đồng bộ"}
        </button>
      </section>

      <section className={`${ui.card} ${ui.cardPad} space-y-3`}>
        <h3 className="font-semibold text-gray-900">Máy chạy app (chế độ Host)</h3>
        {overview.machines.length === 0 ? (
          <p className="text-sm text-gray-600">Chưa có máy nào kết nối trong 24 giờ qua.</p>
        ) : (
          <div className={`${ui.tableShell} overflow-x-auto`}>
            <table className="w-full">
              <thead className={ui.tableHead}>
                <tr>
                  <th className={ui.th}>Máy (IP lúc mở app)</th>
                  <th className={ui.th}>Trạng thái</th>
                  <th className={ui.th}>Tab chạy</th>
                  <th className={ui.th}>Proxy đang giữ</th>
                  <th className={ui.th}>Lệnh tắt máy</th>
                  <th className={ui.th}></th>
                </tr>
              </thead>
              <tbody>
                {overview.machines.map((m) => (
                  <tr key={m.machine} className="border-t border-gray-100">
                    <td className={`${ui.td} font-medium`}>{m.machine}</td>
                    <td className={ui.td}>
                      <span className={m.online ? "text-green-700" : "text-gray-500"}>
                        {m.online ? "Online" : "Offline"}
                      </span>
                      {m.lastSeen ? <span className="text-xs text-gray-500"> · {ago(now - m.lastSeen)}</span> : null}
                    </td>
                    <td className={ui.td}>{m.running}/{m.tabs}</td>
                    <td className={ui.td}>{m.proxies}</td>
                    <td className={`${ui.td} text-xs`}>
                      {m.command && m.command.status !== "replaced" ? (
                        <span title={m.command.note}>
                          {COMMAND_LABEL[m.command.status] || m.command.status}
                          {m.command.note ? `: ${m.command.note}` : ""}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className={`${ui.td} text-right whitespace-nowrap space-x-2`}>
                      <button
                        type="button"
                        className={ui.btnSm}
                        disabled={!m.online || !m.allowShutdown}
                        title={
                          !m.allowShutdown
                            ? "Máy chưa bật “Cho phép tắt máy này từ /geo” trong Cài đặt app"
                            : !m.online
                              ? "Máy đang offline"
                              : "Tắt máy (máy đếm 60 giây, có nút Huỷ)"
                        }
                        onClick={() => void shutdownMachine(m.machine)}
                      >
                        Tắt máy
                      </button>
                      {m.proxies > 0 && (
                        <button type="button" className={ui.btnSm} onClick={() => void releaseMachine(m.machine)}>
                          Trả proxy
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-500">
          Máy báo online mỗi lần đồng bộ (khoảng 5 giây). Nút Tắt máy chỉ bấm được khi máy đó đã bật “Cho phép tắt máy này từ
          /geo” trong Cài đặt app. Lệnh tắt chỉ có hiệu lực 10 phút. Máy tắt đột ngột thì proxy tự được trả sau 3 phút.
        </p>
      </section>

      <section className={`${ui.card} ${ui.cardPad} space-y-3`}>
        <h3 className="font-semibold text-gray-900">Danh sách proxy</h3>
        <label className="block text-sm font-medium text-gray-800">URL nguồn proxy USA (mỗi dòng một nguồn)</label>
        <div className="flex flex-col md:flex-row gap-2 items-start">
          <textarea
            className={`${ui.textarea} font-mono text-xs whitespace-pre overflow-x-auto`}
            rows={6}
            spellCheck={false}
            value={form.proxySourceUrl}
            onChange={(e) => edit("proxySourceUrl", e.target.value)}
          />
          <button type="button" className={ui.btnPrimary} disabled={busy} onClick={() => void fetchProxies()}>
            Lấy proxy USA miễn phí
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Gộp mọi URL rồi thay ô proxy bên dưới và lưu luôn. <code>LINK|socks4</code> / <code>LINK|socks5</code> để ép giao thức.
        </p>

        <label className="block text-sm font-medium text-gray-800">Thêm, sửa hoặc xoá proxy thủ công</label>
        <textarea
          className={`${ui.textarea} font-mono text-xs`}
          rows={8}
          spellCheck={false}
          placeholder={"1.2.3.4:8080\nsocks5://5.6.7.8:1080\n9.9.9.9:3128:user:pass"}
          value={form.proxyText}
          onChange={(e) => edit("proxyText", e.target.value)}
        />
        {table?.skipped ? <p className="text-xs text-gray-500">Bỏ qua {table.skipped} dòng không đúng định dạng.</p> : null}

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f || "all"}
              type="button"
              className={`text-xs px-3 py-1.5 rounded-lg border ${
                filter === f ? "bg-blue-600 text-white border-blue-600" : "bg-white border-gray-300 hover:bg-gray-50"
              }`}
              onClick={() => setFilter(f)}
            >
              {f || "Tất cả"} {f ? table?.counts[f] || 0 : table?.total || 0}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-sm">
            {filter ? `${shown.length} / ${table?.total || 0} proxy` : `${table?.total || 0} proxy hợp lệ`}
          </strong>
          <span className="flex flex-wrap gap-2">
            <button type="button" className={ui.btnSm} disabled={!shown.length} onClick={() => void copyShown()}>
              Copy danh sách
            </button>
            <button
              type="button"
              className={ui.btnSm}
              disabled={busy}
              onClick={() => void clear("health", "Xoá trạng thái Live / Không của mọi proxy (mọi máy)?")}
            >
              Xoá trạng thái
            </button>
            <button
              type="button"
              className={ui.btnSm}
              disabled={busy}
              onClick={() => void clear("proxies", "Xoá toàn bộ danh sách proxy và trạng thái của chúng (mọi máy)?")}
            >
              Xoá tất cả
            </button>
          </span>
        </div>
        <div className="max-h-96 overflow-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className={`${ui.tableHead} sticky top-0`}>
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Host</th>
                <th className="px-3 py-2">Cổng</th>
                <th className="px-3 py-2">Giao thức</th>
                <th className="px-3 py-2">Xác thực</th>
                <th className="px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, MAX_ROWS).map(({ row, index }) => (
                <tr key={row.line} className="border-t border-gray-100">
                  <td className="px-3 py-1.5 text-gray-500">{index + 1}</td>
                  <td className="px-3 py-1.5">{row.host}</td>
                  <td className="px-3 py-1.5">{row.port}</td>
                  <td className="px-3 py-1.5">{row.protocol}</td>
                  <td className="px-3 py-1.5">{row.auth ? "Có" : "Không"}</td>
                  <td className="px-3 py-1.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${BADGE[row.kind]}`} title={row.title}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button type="button" className={ui.btnSm} onClick={() => removeRow(index)}>
                      Xoá
                    </button>
                  </td>
                </tr>
              ))}
              {!shown.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-3 text-gray-500">
                    {table?.total ? "Không có proxy ở trạng thái này." : "Chưa có proxy hợp lệ."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {shown.length > MAX_ROWS && (
          <p className="text-xs text-gray-500">Hiện {MAX_ROWS} dòng đầu. Dùng bộ lọc để xem phần còn lại.</p>
        )}
      </section>

      <section className={`${ui.card} ${ui.cardPad} space-y-3`}>
        <h3 className="font-semibold text-gray-900">Danh sách bài viết</h3>
        <label className="block text-sm font-medium text-gray-800">Mỗi dòng một URL http hoặc https</label>
        <textarea
          className={`${ui.textarea} font-mono text-xs whitespace-pre overflow-x-auto`}
          rows={7}
          spellCheck={false}
          value={form.articleText}
          onChange={(e) => edit("articleText", e.target.value)}
        />
        <p className="text-xs text-gray-500">{articleHint(form.articleText)}</p>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-xs text-gray-600 whitespace-pre-line">
            {d.total
              ? [
                  `Đã lưu ${d.total} cặp proxy–bài. Lần chạy sau sẽ bỏ qua.`,
                  `Chạy được ${d.ok} · Không được ${d.bad}` + (d.unknown ? ` · Chưa rõ ${d.unknown}` : ""),
                  d.reasons.length ? "Lỗi hay gặp: " + d.reasons.map((r) => `${r.note} (${r.count})`).join(", ") + "." : "",
                ].filter(Boolean).join("\n")
              : "Chưa có cặp proxy–bài đã chạy."}
          </p>
          <button
            type="button"
            className={ui.btnSm}
            disabled={busy}
            onClick={() => void clear("done", "Xoá lịch sử proxy đã chạy cho từng bài (mọi máy)? Lần sau sẽ chạy lại những cặp này.")}
          >
            Xoá lịch sử đã chạy
          </button>
        </div>
      </section>

      <section className={`${ui.card} ${ui.cardPad} space-y-3`}>
        <h3 className="font-semibold text-gray-900">Nhịp chạy</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(
            [
              ["waitMinSec", "Chờ tối thiểu (giây)", 1, 3600],
              ["waitMaxSec", "Chờ tối đa (giây)", 1, 3600],
              ["proxyTimeoutSec", "Timeout kết nối proxy (giây)", 5, 180],
              ["articleLoadTimeoutSec", "Timeout tải bài viết (giây)", 15, 300],
            ] as const
          ).map(([key, label, min, max]) => (
            <label key={key} className="block text-sm font-medium text-gray-800">
              {label}
              <input
                type="number"
                min={min}
                max={max}
                className={`${ui.input} mt-1`}
                value={form[key]}
                onChange={(e) => edit(key, e.target.value)}
              />
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-800">
          <input type="checkbox" checked={form.scrollEnabled} onChange={(e) => edit("scrollEnabled", e.target.checked)} />
          Cuộn trang tự động khi xem bài (giống người đọc, kích hoạt quảng cáo lazy-load)
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block text-sm font-medium text-gray-800">
            Tốc độ cuộn
            <select className={`${ui.select} w-full mt-1`} value={form.scrollSpeed} onChange={(e) => edit("scrollSpeed", e.target.value)}>
              <option value="slow">Chậm</option>
              <option value="normal">Vừa</option>
              <option value="fast">Nhanh</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-gray-800">
            Độ sâu cuộn (% chiều cao trang)
            <input
              type="number"
              min={50}
              max={100}
              className={`${ui.input} mt-1`}
              value={form.scrollDepthPercent}
              onChange={(e) => edit("scrollDepthPercent", e.target.value)}
            />
          </label>
        </div>
      </section>

      <div className="fixed bottom-4 left-4 right-4 lg:left-72 z-10">
        <div className={`${ui.card} ${ui.cardPadSm} max-w-6xl mx-auto flex flex-wrap items-center gap-3 shadow-lg`}>
          <button type="button" className={ui.btnPrimary} disabled={busy} onClick={() => void save()}>
            Lưu cấu hình
          </button>
          <p className={`text-sm ${status.error ? "text-red-700" : "text-green-800"}`}>{status.text}</p>
        </div>
      </div>
    </div>
  );
}
