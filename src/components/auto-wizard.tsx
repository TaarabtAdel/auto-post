"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ui } from "@/lib/dashboard-ui";
import { splitGeminiContent } from "@/lib/split-gemini-content";
import {
  DEFAULT_YOUTUBE_GEMINI_TEMPLATE,
  buildYouTubeGeminiPrompt,
} from "@/lib/youtube-gemini-template";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { normalizeYouTubeUrl } from "@/lib/youtube-url";
import { parseCutRanges } from "@/lib/reel/cuts";
import {
  autoCampaignRunModeLabel,
  autoCampaignStatusLabel,
  type AutoCampaignDto,
  type AutoCampaignRunMode,
} from "@/lib/auto-campaign-api";
import { DEFAULT_SCHEDULE_HOURS } from "@/lib/auto-campaign-json";
import {
  scheduledAtToDatetimeLocal,
  scheduledAtToIso,
  nextAppTzDatetimeLocal,
} from "@/lib/scheduled-at";
import {
  VIDEO_ACCEPT,
  uploadMediaFile,
} from "@/lib/upload-client";
import { FileDropZone, FileDropHint } from "@/components/file-drop-zone";
import { BackgroundLibrary } from "@/components/background-library";
import {
  FanpageAppPicker,
  type AppOption,
  type PageOption,
} from "@/components/fanpage-app-picker";

const LS_TEMPLATE = "ytloc_cmd_template_v2";
const STEPS = [
  "1. Video & prompt",
  "2. Dán Gemini",
  "3. Xem trước bài",
  "4. Video & render",
  "5. Fanpage",
  "6. Plan & chạy AUTO",
] as const;

async function copyText(text: string): Promise<boolean> {
  return copyToClipboard(text);
}

function planLocked(c: AutoCampaignDto | null): boolean {
  if (!c) return false;
  return c.status === "planned" || c.status === "running" || c.status === "completed";
}

type AutoWizardProps = { initialCampaignId?: string | null };

export function AutoWizard({ initialCampaignId = null }: AutoWizardProps) {
  const router = useRouter();
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [step, setStep] = useState(0);
  const [campaign, setCampaign] = useState<AutoCampaignDto | null>(null);
  const [booting, setBooting] = useState(!!initialCampaignId);
  const [template, setTemplate] = useState(DEFAULT_YOUTUBE_GEMINI_TEMPLATE);

  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [youtubeVideoId, setYoutubeVideoId] = useState("");
  const [name, setName] = useState("");

  const [rawGemini, setRawGemini] = useState("");
  const [firstComment, setFirstComment] = useState("");
  const [times, setTimes] = useState("");
  const [caption1, setCaption1] = useState("");
  const [caption2, setCaption2] = useState("");
  const [caption3, setCaption3] = useState("");

  const [backgroundPath, setBackgroundPath] = useState<string | null>(null);
  const [backgroundName, setBackgroundName] = useState("");
  const [sourceVideoPath, setSourceVideoPath] = useState<string | null>(null);
  const [sourceVideoName, setSourceVideoName] = useState("");
  const [autoDownloadVideo, setAutoDownloadVideo] = useState(false);
  const [downloadingYt, setDownloadingYt] = useState(false);

  const [apps, setApps] = useState<AppOption[]>([]);
  const [allPages, setAllPages] = useState<PageOption[]>([]);
  const [workspaceAppId, setWorkspaceAppId] = useState("");
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [scheduleHours, setScheduleHours] = useState<number[]>([...DEFAULT_SCHEDULE_HOURS]);
  const [executeAtLocal, setExecuteAtLocal] = useState(() => nextAppTzDatetimeLocal(8));
  const [runMode, setRunMode] = useState<AutoCampaignRunMode>("live");

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const locked = planLocked(campaign);

  const loadCampaignIntoForm = useCallback((c: AutoCampaignDto) => {
    setCampaign(c);
    setName(c.name);
    setYoutubeUrl(c.youtubeUrl ?? "");
    setYoutubeTitle(c.youtubeTitle ?? "");
    setYoutubeVideoId(c.youtubeVideoId ?? "");
    setRawGemini(c.rawGemini ?? "");
    setFirstComment(c.firstComment ?? "");
    setTimes(c.times);
    setCaption1(c.caption1);
    setCaption2(c.caption2);
    setCaption3(c.caption3);
    setBackgroundPath(c.backgroundPath);
    setSourceVideoPath(c.sourceVideoPath);
    setAutoDownloadVideo(Boolean(c.autoDownloadVideo));
    setBackgroundName(c.backgroundPath?.split("/").pop() ?? "");
    setSourceVideoName(c.sourceVideoPath?.split("/").pop() ?? "");
    if (c.workspaceAppId) setWorkspaceAppId(c.workspaceAppId);
    if (c.facebookPageIds.length) setSelectedPageIds(new Set(c.facebookPageIds));
    if (c.scheduleHours.length === 3) setScheduleHours(c.scheduleHours);
    if (c.executeAt) {
      setExecuteAtLocal(scheduledAtToDatetimeLocal(scheduledAtToIso(c.executeAt)));
    }
    setRunMode(c.runMode);
    setStep(Math.min(c.wizardStep, STEPS.length - 1));
  }, []);

  const resetNewForm = useCallback(() => {
    setCampaign(null);
    setStep(0);
    setYoutubeUrl("");
    setYoutubeTitle("");
    setYoutubeVideoId("");
    setName("");
    setRawGemini("");
    setFirstComment("");
    setTimes("");
    setCaption1("");
    setCaption2("");
    setCaption3("");
    setSourceVideoPath(null);
    setSourceVideoName("");
    setAutoDownloadVideo(false);
    setBackgroundPath(null);
    setBackgroundName("");
    setExecuteAtLocal(nextAppTzDatetimeLocal(8));
    setRunMode("live");
    setNote("Plan mới — lưu từng bước, chưa tạo bài trên Facebook.");
    setError("");
  }, []);

  useEffect(() => {
    try {
      const t = localStorage.getItem(LS_TEMPLATE);
      if (t) setTemplate(t);
    } catch {
      // ignore
    }

    if (initialCampaignId) {
      setBooting(true);
      fetch(`/api/auto/campaigns/${initialCampaignId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.campaign) loadCampaignIntoForm(data.campaign as AutoCampaignDto);
          else setError(data.error || "Không tìm thấy plan.");
        })
        .catch(() => setError("Không tải được plan."))
        .finally(() => setBooting(false));
    } else {
      resetNewForm();
    }

    Promise.all([
      fetch("/api/workspace-apps").then((r) => r.json()),
      fetch("/api/facebook-pages").then((r) => r.json()),
    ])
      .then(([appsData, pagesData]) => {
        if (appsData.apps?.length) {
          setApps(appsData.apps);
          setWorkspaceAppId((cur) => cur || appsData.apps[0].id);
        }
        if (pagesData.pages) setAllPages(pagesData.pages);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCampaignId]);

  const promptText = useMemo(() => {
    const url = youtubeUrl.trim();
    if (!url) return "";
    try {
      const normalized = normalizeYouTubeUrl(url);
      return buildYouTubeGeminiPrompt(template, {
        url: normalized,
        title: youtubeTitle,
        id: youtubeVideoId,
      });
    } catch {
      return buildYouTubeGeminiPrompt(template, { url });
    }
  }, [youtubeUrl, youtubeTitle, youtubeVideoId, template]);

  function payloadFromForm(wizardStep: number) {
    return {
      name: name.trim() || youtubeTitle.trim() || "Campaign AUTO",
      wizardStep,
      youtubeUrl: youtubeUrl.trim() || null,
      youtubeVideoId: youtubeVideoId.trim() || null,
      youtubeTitle: youtubeTitle.trim() || null,
      rawGemini: rawGemini.trim() || null,
      firstComment: firstComment.trim() || null,
      times: times.trim(),
      caption1: caption1.trim(),
      caption2: caption2.trim(),
      caption3: caption3.trim(),
      sourceVideoPath,
      autoDownloadVideo,
      backgroundPath,
      workspaceAppId: workspaceAppId || null,
      facebookPageIds: [...selectedPageIds],
      scheduleHours,
      runMode,
    };
  }

  async function saveToDb(
    wizardStep: number,
    extra?: Record<string, unknown>
  ): Promise<AutoCampaignDto> {
    const body = { ...payloadFromForm(wizardStep), ...extra };
    if (campaign?.id) {
      const res = await fetch(`/api/auto/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không lưu được.");
      setCampaign(data.campaign);
      return data.campaign as AutoCampaignDto;
    }
    const res = await fetch("/api/auto/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Không tạo được bản AUTO.");
    setCampaign(data.campaign);
    const created = data.campaign as AutoCampaignDto;
    router.replace(`/auto?id=${created.id}`);
    return created;
  }

  async function goNext(
    nextStep: number,
    validate?: () => string | null | Promise<string | null>,
    beforeSave?: () => Promise<Record<string, unknown> | null>
  ) {
    setError("");
    if (validate) {
      const msg = await validate();
      if (msg) {
        setError(msg);
        return;
      }
    }
    if (locked) {
      setStep(nextStep);
      return;
    }
    setBusy(true);
    try {
      const patch = beforeSave ? await beforeSave() : null;
      await saveToDb(nextStep, patch ?? undefined);
      setStep(nextStep);
      setNote("Đã lưu vào hệ thống.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lưu thất bại.");
    } finally {
      setBusy(false);
    }
  }

  async function fetchVideoInfo() {
    setError("");
    if (!youtubeUrl.trim()) {
      setError("Dán link YouTube trước.");
      return;
    }
    setBusy(true);
    try {
      const url = normalizeYouTubeUrl(youtubeUrl.trim());
      setYoutubeUrl(url);
      const res = await fetch("/api/import/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, action: "info" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không lấy được thông tin video.");
      const info = data.info as { id?: string; title?: string };
      if (info.title) setYoutubeTitle(info.title);
      if (info.id) setYoutubeVideoId(info.id);
      if (!name.trim() && info.title) setName(info.title);
      setNote("Đã lấy tiêu đề video.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Link không hợp lệ.");
    } finally {
      setBusy(false);
    }
  }

  function handleSplit() {
    setError("");
    if (!rawGemini.trim()) {
      setError("Dán kết quả Gemini trước.");
      return;
    }
    const next = splitGeminiContent(rawGemini);
    if (!next.times && !next.caption1) {
      setError("Không tách được. Kiểm tra lại nội dung dán.");
      return;
    }
    setTimes(next.times);
    setCaption1(next.caption1);
    setCaption2(next.caption2);
    setCaption3(next.caption3);
    setNote(`Đã tách — ${parseCutRanges(next.times).length} khung cắt. Bấm "Lưu & tiếp".`);
  }

  async function openYtsaveForPlanVideo() {
    setError("");
    const raw = youtubeUrl.trim();
    if (!raw) {
      setError("Plan chưa có link YouTube — quay lại bước 1.");
      return;
    }
    let url = raw;
    try {
      url = normalizeYouTubeUrl(raw);
    } catch {
      // giữ link gốc nếu không chuẩn hóa được
    }
    const copied = await copyText(url);
    if (!copied) {
      setError("Không copy được — chọn link trong ô prompt / copy thủ công.");
      return;
    }
    setNote("Đã copy link video của plan.");
    alert("Đã sao chép link. Nhấn OK để mở YTSave.");
    window.open("https://ytsave.to/en2/", "_blank", "noopener,noreferrer");
  }

  async function downloadPlanVideoYtdlp(): Promise<string> {
    const url = youtubeUrl.trim();
    if (!url) {
      throw new Error("Plan chưa có link YouTube (bước 1).");
    }
    setDownloadingYt(true);
    setError("");
    try {
      const res = await fetch("/api/import/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, action: "download", quality: "best" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "yt-dlp không tải được video.");
      const filePath = data.filePath as string;
      setSourceVideoPath(filePath);
      setSourceVideoName(data.fileName || data.title || "video.mp4");
      if (data.title && !youtubeTitle.trim()) setYoutubeTitle(data.title);
      setNote("Đã tải video bằng yt-dlp (Python/.venv hoặc binary hệ thống).");
      return filePath;
    } finally {
      setDownloadingYt(false);
    }
  }

  async function uploadSourceVideo(file: File) {
    setUploading(true);
    setError("");
    try {
      const data = await uploadMediaFile(file, { bucket: "video" });
      setSourceVideoPath(data.filePath);
      setSourceVideoName(data.fileName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload video thất bại.");
    } finally {
      setUploading(false);
    }
  }

  async function runNow() {
    if (!campaign?.id) return;
    if (campaign.status !== "planned") {
      setError("Chỉ chạy ngay được sau khi đã hẹn AUTO (trạng thái «Đã hẹn AUTO»).");
      return;
    }
    if (!window.confirm("Chạy pipeline ngay (tạo bài → render → hẹn đăng)? Có thể mất vài phút.")) {
      return;
    }
    setBusy(true);
    setError("");
    setNote("Đang chạy pipeline AUTO…");
    try {
      const res = await fetch(`/api/auto/campaigns/${campaign.id}/run-now`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.campaign) {
        loadCampaignIntoForm(data.campaign as AutoCampaignDto);
      }
      if (!res.ok) throw new Error(data.error || "Run now thất bại.");
      setNote(
        data.campaign?.status === "completed"
          ? `Pipeline xong (${autoCampaignRunModeLabel(data.campaign.runMode)}).`
          : "Đã gửi chạy pipeline."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run now thất bại.");
      setNote("");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPlan() {
    setError("");
    if (!campaign?.id) {
      setError("Lưu plan trước (đi hết các bước).");
      return;
    }
    setBusy(true);
    try {
      await saveToDb(6);
      const res = await fetch(`/api/auto/campaigns/${campaign.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ executeAt: executeAtLocal, runMode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không hẹn được AUTO.");
      setCampaign(data.campaign);
      setRunMode(data.campaign.runMode);
      const modeNote =
        data.campaign.runMode === "test"
          ? " Chế độ Test: tạo bài + render thật; đăng Fanpage chỉ ghi log pm2."
          : "";
      setNote(
        `Đã hẹn chạy AUTO (${autoCampaignRunModeLabel(data.campaign.runMode)}) lúc ${data.campaign.executeAtLabel}. Pipeline sẽ tự tạo bài → render → hẹn đăng.${modeNote}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xác nhận thất bại.");
    } finally {
      setBusy(false);
    }
  }

  async function saveAndRunManual() {
    setError("");
    if (
      !window.confirm(
        "Chạy ngay: tạo 3 bài → render reel → gắn Fanpage, lưu nháp trên /posts.\nKhông hẹn giờ, không vào queue. Có thể mất vài phút."
      )
    ) {
      return;
    }
    setBusy(true);
    setNote("Đang chạy pipeline thủ công…");
    try {
      const saved = await saveToDb(6, { runMode: "manual" });
      const res = await fetch(`/api/auto/campaigns/${saved.id}/run-manual`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.campaign) {
        loadCampaignIntoForm(data.campaign as AutoCampaignDto);
      }
      if (!res.ok) throw new Error(data.error || "Chạy thủ công thất bại.");
      setNote(
        data.campaign?.status === "completed"
          ? "Xong. Bài nháp đã gắn Fanpage — vào /posts → Đăng từng Page."
          : "Đã gửi chạy pipeline thủ công."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chạy thủ công thất bại.");
      setNote("");
    } finally {
      setBusy(false);
    }
  }

  if (booting) {
    return <p className="text-sm text-gray-500">Đang tải plan…</p>;
  }

  return (
    <div className="space-y-6">
      {campaign && (
        <div className={`${ui.card} ${ui.cardPadSm} flex flex-wrap items-center gap-2 text-sm`}>
          <span className="font-medium text-gray-800">{campaign.name || "Plan AUTO"}</span>
          <span className="text-xs text-gray-500">
            {autoCampaignStatusLabel(campaign.status)}
          </span>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              runMode === "test"
                ? "bg-violet-100 text-violet-800"
                : runMode === "manual"
                  ? "bg-amber-100 text-amber-900"
                  : "bg-emerald-100 text-emerald-800"
            }`}
          >
            {autoCampaignRunModeLabel(runMode)}
          </span>
        </div>
      )}

      {locked && campaign && (
        <div className={ui.alertSuccess}>
          {campaign.runMode === "manual" ? (
            <>
              Plan thủ công
              {campaign.status === "running"
                ? " — đang chạy pipeline…"
                : campaign.status === "completed"
                  ? " — đã tạo bài nháp."
                  : " đã khóa."}{" "}
            </>
          ) : (
            <>
              Plan đã khóa. Hệ thống sẽ chạy AUTO lúc{" "}
              <strong>{campaign.executeAtLabel ?? "—"}</strong>
            </>
          )}
          {campaign.status === "planned" && campaign.runMode !== "manual" && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={ui.btnPrimary}
                disabled={busy}
                onClick={() => void runNow()}
              >
                {busy ? "Đang chạy…" : "Run now"}
              </button>
              <span className="text-xs text-green-900/80">
                Chạy ngay, không cần chờ đến giờ hẹn ({autoCampaignRunModeLabel(campaign.runMode)}).
              </span>
            </div>
          )}
          {campaign.status === "running" && (
            <p className="text-sm mt-2">Pipeline đang chạy…</p>
          )}
          {campaign.status === "completed" && (
            <>
              {" "}
              — hoàn tất.{" "}
              <Link href="/posts" className="underline">
                Xem /posts
              </Link>
            </>
          )}
          {campaign.status === "failed" && (
            <span className="block text-red-700 mt-1">{campaign.errorMessage}</span>
          )}
        </div>
      )}

      {!locked && (
        <p className={`text-sm ${ui.hint}`}>
          Các bước 1–5 chỉ <strong>lưu kế hoạch</strong> vào CSDL. Ở bước 6 bạn hẹn{" "}
          <strong>giờ chạy AUTO</strong> — đến giờ cron sẽ tự: tạo 3 bài → render reel → hẹn
          đăng queue (không làm tay nữa).
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(i)}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              step === i
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className={ui.alertError}>{error}</div>}
      {note && !error && <div className={ui.hint}>{note}</div>}

      {step === 0 && (
        <div className={`${ui.card} ${ui.cardPad} space-y-4`}>
          <label className="block text-sm">
            <span className="font-medium">Link YouTube</span>
            <input
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              disabled={locked}
              className={`${ui.input} mt-1`}
              placeholder="https://www.youtube.com/watch?v=..."
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Tên bản AUTO</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={locked}
              className={`${ui.input} mt-1`}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={ui.btnSecondary}
              disabled={busy || locked}
              onClick={() => void fetchVideoInfo()}
            >
              Lấy tiêu đề video
            </button>
            <button
              type="button"
              className={ui.btnPrimary}
              disabled={!promptText || busy || locked}
              onClick={async () => {
                setError("");
                const copied = await copyText(promptText);
                if (copied) {
                  setNote("Đã copy prompt — dán vào Gemini.");
                  alert("Đã copy prompt Gemini.");
                } else {
                  setNote(
                    "Trình duyệt chặn copy tự động — bôi đen ô prompt bên dưới rồi Ctrl+C."
                  );
                  promptTextareaRef.current?.focus();
                  promptTextareaRef.current?.select();
                  alert(
                    "Không copy tự động được (thường do site HTTP).\n\nÔ prompt đã được chọn — nhấn Ctrl+C (Cmd+C trên Mac), rồi dán vào Gemini."
                  );
                }
                window.open(
                  "https://gemini.google.com/app",
                  "_blank",
                  "noopener,noreferrer"
                );
              }}
            >
              Copy prompt Gemini
            </button>
          </div>
          {promptText && (
            <textarea
              ref={promptTextareaRef}
              readOnly
              value={promptText}
              rows={6}
              className={`${ui.textarea} text-xs`}
              aria-label="Prompt Gemini"
            />
          )}
          <button
            type="button"
            className={ui.btnPrimary}
            disabled={busy || locked || !youtubeUrl.trim()}
            onClick={() =>
              void goNext(1, () => (!youtubeUrl.trim() ? "Nhập link YouTube." : null))
            }
          >
            Tiếp: Dán Gemini → (lưu bản AUTO)
          </button>
        </div>
      )}

      {step === 1 && (
        <div className={`${ui.card} ${ui.cardPad} space-y-4`}>
          <label className="block text-sm">
            Dán kết quả Gemini
            <textarea
              value={rawGemini}
              onChange={(e) => setRawGemini(e.target.value)}
              disabled={locked}
              rows={8}
              className={`${ui.textarea} mt-1`}
            />
          </label>
          <button
            type="button"
            className={ui.btnSecondary}
            disabled={locked}
            onClick={handleSplit}
          >
            Tách 4 nội dung
          </button>
          <label className="block text-sm">
            Bình luận đầu tiên (chung cho cả 3 bài)
            <textarea
              value={firstComment}
              onChange={(e) => setFirstComment(e.target.value)}
              disabled={locked}
              rows={3}
              className={`${ui.textarea} mt-1`}
              placeholder="Giống trường trên form sửa bài /posts/…/edit"
            />
          </label>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="block text-sm">
              Thời gian cắt clip
              <textarea
                value={times}
                onChange={(e) => setTimes(e.target.value)}
                disabled={locked}
                rows={2}
                className={`${ui.textarea} mt-1 font-mono text-xs`}
              />
            </label>
            {(
              [
                ["Caption 1", caption1, setCaption1],
                ["Caption 2", caption2, setCaption2],
                ["Caption 3", caption3, setCaption3],
              ] as const
            ).map(([label, val, setVal]) => (
              <label key={label} className="block text-sm">
                {label}
                <textarea
                  value={val}
                  onChange={(e) => setVal(e.target.value)}
                  disabled={locked}
                  rows={4}
                  className={`${ui.textarea} mt-1`}
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            className={ui.btnPrimary}
            disabled={busy || locked}
            onClick={() =>
              void goNext(2, () => {
                if (!caption1.trim() || !caption2.trim() || !caption3.trim()) {
                  return "Cần 3 caption (tách hoặc nhập tay).";
                }
                if (parseCutRanges(times).length !== 3) {
                  return "Cần đúng 3 khung thời gian cắt.";
                }
                return null;
              })
            }
          >
            Lưu & tiếp — Xem trước bài (chưa tạo bài)
          </button>
        </div>
      )}

      {step === 2 && (
        <div className={`${ui.card} ${ui.cardPad} space-y-4`}>
          <p className="text-sm text-gray-600">
            Xem trước nội dung sẽ tạo khi AUTO chạy — <strong>chưa có</strong> bài trên /posts.
          </p>
          {firstComment.trim() && (
            <div className={`${ui.cardPadSm} bg-slate-50 rounded-lg text-sm`}>
              <p className="font-medium text-gray-700">Bình luận đầu tiên (chung)</p>
              <p className="whitespace-pre-wrap mt-1">{firstComment}</p>
            </div>
          )}
          {[caption1, caption2, caption3].map((cap, i) => (
            <div key={i} className={`${ui.card} ${ui.cardPadSm}`}>
              <p className="text-xs font-semibold text-gray-500 mb-2">Bài đoạn {i + 1}</p>
              <p className="text-sm whitespace-pre-wrap line-clamp-[12]">{cap || "—"}</p>
              <p className="text-xs text-gray-500 mt-2">
                Giờ đăn dự kiến (sau AUTO): {String(scheduleHours[i] ?? 18).padStart(2, "0")}:00
              </p>
            </div>
          ))}
          <button
            type="button"
            className={ui.btnPrimary}
            disabled={busy || locked}
            onClick={() => void goNext(3)}
          >
            Tiếp: Upload video & nền →
          </button>
        </div>
      )}

      {step === 3 && (
        <div className={`${ui.card} ${ui.cardPad} space-y-4`}>
          <div className="grid lg:grid-cols-2 gap-6">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <p className="text-sm font-medium">Ảnh nền</p>
                <Link href="/backgrounds" className="text-xs text-blue-600 underline">
                  Quản lý ảnh nền
                </Link>
              </div>
              <BackgroundLibrary
                compact
                selectMode
                previewLabel="Ảnh nền AUTO"
                selectedPath={backgroundPath}
                onSelect={(item) => {
                  if (!item.filePath) {
                    setBackgroundPath(null);
                    setBackgroundName("");
                    return;
                  }
                  setBackgroundPath(item.filePath);
                  setBackgroundName(item.fileName);
                }}
              />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <p className="text-sm font-medium">Video full</p>
              </div>
              <label className="flex items-start gap-2 text-sm mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={autoDownloadVideo}
                  disabled={locked}
                  onChange={(e) => {
                    setAutoDownloadVideo(e.target.checked);
                    if (e.target.checked) {
                      setNote(
                        "Tự tải: dùng yt-dlp (npm run setup:python). Có thể tải ngay hoặc khi bấm Lưu & tiếp / lúc AUTO chạy."
                      );
                    }
                  }}
                />
                <span>
                  <strong>Tự tải</strong> — yt-dlp từ link YouTube của plan (bước 1), không
                  cần upload tay
                </span>
              </label>
              {autoDownloadVideo ? (
                <div className="space-y-2">
                  <p className="text-xs text-gray-600 break-all">
                    Link: {youtubeUrl.trim() || "— (quay bước 1 nhập YouTube)"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={ui.btnSmPrimary}
                      disabled={
                        locked || downloadingYt || busy || !youtubeUrl.trim()
                      }
                      onClick={() => void downloadPlanVideoYtdlp().catch((e) => setError(e instanceof Error ? e.message : "Tải thất bại."))}
                    >
                      {downloadingYt ? "Đang tải yt-dlp…" : "Tải ngay (yt-dlp)"}
                    </button>
                  </div>
                  <p className={`text-xs ${ui.hint}`}>
                    {sourceVideoPath
                      ? `Đã có file: ${sourceVideoName || sourceVideoPath}`
                      : "Chưa có file — bấm «Tải ngay» hoặc «Lưu & tiếp» sẽ tự tải."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <button
                      type="button"
                      className={ui.btnSm}
                      disabled={!youtubeUrl.trim()}
                      onClick={() => void openYtsaveForPlanVideo()}
                    >
                      YTSave (thủ công)
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    Hoặc kéo thả / chọn file MP4, MOV từ máy.
                  </p>
                  <FileDropZone
                    accept={VIDEO_ACCEPT}
                    disabled={uploading || locked}
                    compact
                    onFiles={(files) => {
                      const f = files[0];
                      if (f) void uploadSourceVideo(f);
                    }}
                  >
                    <FileDropHint
                      busy={uploading}
                      extra={sourceVideoName || sourceVideoPath || "MP4, MOV"}
                    />
                  </FileDropZone>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            className={ui.btnPrimary}
            disabled={busy || locked}
            onClick={() =>
              void goNext(
                4,
                async () => {
                  if (!backgroundPath) return "Chọn hoặc upload ảnh nền.";
                  if (autoDownloadVideo) {
                    if (!youtubeUrl.trim()) return "Cần link YouTube ở bước 1.";
                  } else if (!sourceVideoPath) {
                    return "Upload video full hoặc bật «Tự tải».";
                  }
                  return null;
                },
                async () => {
                  if (!autoDownloadVideo || sourceVideoPath) return null;
                  const filePath = await downloadPlanVideoYtdlp();
                  return { sourceVideoPath: filePath };
                }
              )
            }
          >
            Lưu & tiếp — Chọn Fanpage →
          </button>
        </div>
      )}

      {step === 4 && (
        <div className={`${ui.card} ${ui.cardPad} space-y-4`}>
          <FanpageAppPicker
            apps={apps}
            allPages={allPages}
            workspaceAppId={workspaceAppId}
            onWorkspaceAppIdChange={setWorkspaceAppId}
            selectedPageIds={selectedPageIds}
            onSelectedPageIdsChange={setSelectedPageIds}
            disabled={locked}
          />
          {runMode !== "manual" && (
            <div className="grid sm:grid-cols-3 gap-3 pt-2 border-t border-gray-100">
              {scheduleHours.map((h, i) => (
                <label key={i} className="text-sm block">
                  Giờ đăn đoạn {i + 1} (VN, sau khi AUTO chạy)
                  <select
                    value={h}
                    disabled={locked}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setScheduleHours((prev) => {
                        const next = [...prev];
                        next[i] = v;
                        return next;
                      });
                    }}
                    className={`${ui.select} w-full mt-1`}
                  >
                    {[4, 6, 9, 18, 20, 22].map((hour) => (
                      <option key={hour} value={hour}>
                        {String(hour).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
          <button
            type="button"
            className={ui.btnPrimary}
            disabled={busy || locked}
            onClick={() =>
              void goNext(5, () =>
                selectedPageIds.size === 0 ? "Chọn ít nhất một Fanpage." : null
              )
            }
          >
            Lưu & tiếp — Xem plan →
          </button>
        </div>
      )}

      {step === 5 && (
        <div className={`${ui.card} ${ui.cardPad} space-y-4`}>
          <h3 className="font-semibold text-gray-900">Tóm tắt plan</h3>
          <ul className="text-sm space-y-2 text-gray-800">
            <li>
              <span className="text-gray-500">Video:</span> {youtubeTitle || youtubeUrl || "—"}
            </li>
            <li>
              <span className="text-gray-500">Cắt clip:</span> {times || "—"}
            </li>
            <li>
              <span className="text-gray-500">Fanpage:</span> {selectedPageIds.size} page
            </li>
            {runMode !== "manual" && (
              <li>
                <span className="text-gray-500">Giờ đăn 3 đoạn:</span>{" "}
                {scheduleHours.map((h) => `${String(h).padStart(2, "0")}:00`).join(" · ")}
              </li>
            )}
            <li>
              <span className="text-gray-500">Khi chạy sẽ:</span>{" "}
              {runMode === "manual"
                ? "Tạo 3 bài → Render 3 reel → Gắn Fanpage → Lưu nháp (đăng tay trên /posts)"
                : "Tạo 3 bài → Render 3 reel → Gắn Fanpage → Hẹn queue"}
            </li>
          </ul>

          {!locked && (
            <>
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-900">Cách đăng</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (runMode === "manual") setRunMode("live");
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      runMode !== "manual"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    Queue
                  </button>
                  <button
                    type="button"
                    onClick={() => setRunMode("manual")}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      runMode === "manual"
                        ? "bg-amber-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    Thủ công
                  </button>
                </div>
              </div>

              {runMode === "manual" ? (
                <>
                  <p className="text-sm text-gray-600">
                    Lưu là chạy ngay: tạo bài + render + gắn Fanpage, lưu nháp. Không hẹn giờ, không
                    vào queue. Vào /posts → «Đăng» từng Page (không cần token active).
                  </p>
                  <button
                    type="button"
                    className={ui.btnSuccess}
                    disabled={busy}
                    onClick={() => void saveAndRunManual()}
                  >
                    {busy ? "Đang chạy…" : "Lưu & chạy ngay"}
                  </button>
                </>
              ) : (
                <>
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium text-gray-900">Chế độ queue</legend>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="runMode"
                          checked={runMode === "live"}
                          onChange={() => setRunMode("live")}
                        />
                        <span>
                          <strong>Live</strong> — đăng Fanpage thật qua queue
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="runMode"
                          checked={runMode === "test"}
                          onChange={() => setRunMode("test")}
                        />
                        <span>
                          <strong>Test</strong> — pipeline thật, đăng Fanpage giả (xem log pm2{" "}
                          <code className="text-xs">[cron] AUTO [TEST]</code>)
                        </span>
                      </label>
                    </div>
                  </fieldset>
                  <label className="block text-sm font-medium">
                    Thời điểm chạy AUTO (tạo bài + render + hẹn đăng)
                    <input
                      type="datetime-local"
                      value={executeAtLocal}
                      onChange={(e) => setExecuteAtLocal(e.target.value)}
                      className={`${ui.input} mt-1 max-w-xs`}
                    />
                  </label>
                  <button
                    type="button"
                    className={ui.btnSuccess}
                    disabled={busy || !executeAtLocal}
                    onClick={() => void confirmPlan()}
                  >
                    Xác nhận plan & hẹn chạy AUTO
                  </button>
                </>
              )}
            </>
          )}

          {campaign?.postIds.some(Boolean) && (
            <p className="text-sm">
              Bài đã tạo:{" "}
              <Link href="/posts" className="text-blue-600 underline">
                /posts
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
