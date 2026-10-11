"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AspectRatioId,
  FrameHoleInput,
  ReelCaption,
  ReelEndCta,
  ReelMediaItem,
} from "@/lib/reel/types";
import { parseCutRanges } from "@/lib/reel/cuts";
import { detectFrameHoleFromImageData } from "@/lib/reel/frame-hole-core";

interface UploadedMedia {
  filePath: string;
  fileName: string;
  fileType: "image" | "video" | "audio";
  url: string;
  durationSec: number;
  trimStartSec: number;
  trimEndSec: number;
  focusX: number;
  focusY: number;
  zoom: number;
}

const DEFAULT_CTA: ReelEndCta = {
  enabled: false,
  text: "Full video",
  icon: "👇",
  durationSec: 4,
  xPercent: 68,
  yPercent: 82,
  scale: 1,
  backgroundColor: "rgba(10,10,12,0.78)",
  textColor: "#ffffff",
  blink: true,
};

function newCaption(): ReelCaption {
  return {
    text: "",
    startSec: 0,
    endSec: 5,
    xPercent: 50,
    yPercent: 12,
    widthPercent: 84,
    fontSize: 42,
    textColor: "#ffffff",
    backgroundColor: "rgba(10,10,12,0.78)",
  };
}

export function ReelEditor() {
  const router = useRouter();
  const [aspectRatio, setAspectRatio] = useState<AspectRatioId>("9:16");
  const [clips, setClips] = useState<UploadedMedia[]>([]);
  const [music, setMusic] = useState<UploadedMedia | null>(null);
  const [captions, setCaptions] = useState<ReelCaption[]>([newCaption()]);
  const [endCta, setEndCta] = useState<ReelEndCta>(DEFAULT_CTA);
  const [videoVolume, setVideoVolume] = useState(1);
  const [musicVolume, setMusicVolume] = useState(0.35);
  const [flipVideo, setFlipVideo] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
  const [splitRatio, setSplitRatio] = useState(50);
  const [splitDuration, setSplitDuration] = useState(8);
  const [uploading, setUploading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    url: string;
    filePath: string;
    durationSec: number;
  } | null>(null);
  const [results, setResults] = useState<
    { url: string; filePath: string; durationSec: number; label: string }[]
  >([]);
  const [background, setBackground] = useState<UploadedMedia | null>(null);
  const [sourceVideo, setSourceVideo] = useState<UploadedMedia | null>(null);
  const [cutsText, setCutsText] = useState("");
  const [hole, setHole] = useState<FrameHoleInput>({
    xPercent: 8,
    yPercent: 26,
    wPercent: 84,
    hPercent: 42,
  });
  const [tab, setTab] = useState<"media" | "title" | "audio" | "copyright" | "cta">(
    "media"
  );
  const bgInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const holeDrag = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("autopost_yt_clip");
      if (!raw) return;
      const clip = JSON.parse(raw) as Partial<UploadedMedia>;
      if (clip.filePath && clip.url) {
        const duration = Math.max(1, Number(clip.durationSec) || 8);
        const uploaded = {
          filePath: clip.filePath,
          fileName: clip.fileName || "youtube.mp4",
          fileType: "video" as const,
          url: clip.url,
          durationSec: duration,
          trimStartSec: 0,
          trimEndSec: Math.min(duration, 15),
          focusX: 50,
          focusY: 50,
          zoom: 1,
        };
        setSourceVideo(uploaded);
        setClips((prev) => {
          if (prev.some((c) => c.filePath === clip.filePath)) return prev;
          return [...prev, uploaded];
        });
      }
      sessionStorage.removeItem("autopost_yt_clip");
    } catch {
      // ignore
    }
  }, []);

  async function uploadFile(
    file: File,
    kind: "image" | "video" | "audio"
  ): Promise<UploadedMedia> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload thất bại.");
    return {
      filePath: data.filePath,
      fileName: data.fileName,
      fileType: kind,
      url: data.url,
      durationSec: kind === "image" ? 5 : 8,
      trimStartSec: 0,
      trimEndSec: 8,
      focusX: 50,
      focusY: 50,
      zoom: 1,
    };
  }

  async function handleMusic(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      setMusic(await uploadFile(file, "audio"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload nhạc thất bại.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function toMediaItem(clip: UploadedMedia): ReelMediaItem {
    return {
      filePath: clip.filePath,
      type: clip.fileType === "video" ? "video" : "image",
      durationSec: clip.fileType === "image" ? clip.durationSec : undefined,
      trimStartSec: clip.fileType === "video" ? clip.trimStartSec : undefined,
      trimEndSec: clip.fileType === "video" ? clip.trimEndSec : undefined,
      crop: { focusX: clip.focusX, focusY: clip.focusY, zoom: clip.zoom },
    };
  }

  function detectHoleFromUrl(url: string) {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 180;
      canvas.height = 320;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, 180, 320);
      const data = ctx.getImageData(0, 0, 180, 320);
      setHole(detectFrameHoleFromImageData(data.data, 180, 320));
    };
    img.src = url;
  }

  async function handlePickBackground(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const uploaded = await uploadFile(file, "image");
      setBackground(uploaded);
      detectHoleFromUrl(uploaded.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload ảnh nền thất bại.");
    } finally {
      setUploading(false);
    }
  }

  async function handlePickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      setSourceVideo(await uploadFile(file, "video"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload video thất bại.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRender() {
    setError("");
    setResult(null);
    setResults([]);
    const cuts = parseCutRanges(cutsText);

    if (background && sourceVideo) {
      if (cuts.length === 0) {
        setError("Nhập đoạn cắt, ví dụ 01:15-01:42,09:10-09:35,03:40-04:05");
        return;
      }
      setRendering(true);
      try {
        const res = await fetch("/api/reels/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            aspectRatio,
            backgroundPath: background.filePath,
            videoPath: sourceVideo.filePath,
            cuts,
            hole,
            flipVideo,
            videoVolume,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Render thất bại.");
          return;
        }
        const videos = (data.videos ?? []) as {
          url: string;
          filePath: string;
          durationSec: number;
          label: string;
        }[];
        setResults(videos);
        if (videos[0]) {
          setResult({
            url: videos[0].url,
            filePath: videos[0].filePath,
            durationSec: videos[0].durationSec,
          });
        }
      } catch {
        setError("Lỗi kết nối khi render.");
      } finally {
        setRendering(false);
      }
      return;
    }

    if (!splitMode && clips.length === 0) {
      setError("Chọn ảnh nền + video, hoặc thêm media.");
      return;
    }
    if (splitMode && clips.length === 0) {
      setError("Chia đôi màn hình cần 1–2 file (trên/dưới).");
      return;
    }

    setRendering(true);
    try {
      const payload = {
        aspectRatio,
        media: splitMode ? [] : clips.map(toMediaItem),
        captions: captions.filter((c) => c.text.trim()),
        musicPath: music?.filePath,
        videoVolume,
        musicVolume,
        flipVideo,
        endCta,
        split: splitMode
          ? {
              ratio: splitRatio,
              top: clips[0] ? toMediaItem(clips[0]) : null,
              bottom: clips[1] ? toMediaItem(clips[1]) : null,
              topVolume: 1,
              bottomVolume: 0,
              durationSec: splitDuration,
            }
          : undefined,
      };

      const res = await fetch("/api/reels/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Render thất bại.");
        return;
      }
      setResult({
        url: data.url,
        filePath: data.filePath,
        durationSec: data.durationSec,
      });
    } catch {
      setError("Lỗi kết nối khi render.");
    } finally {
      setRendering(false);
    }
  }

  function useForPost() {
    if (!result) return;
    sessionStorage.setItem(
      "autopost_reel",
      JSON.stringify({
        filePath: result.filePath,
        fileName: "reel.mp4",
        fileSize: 0,
        mimeType: "video/mp4",
        fileType: "video",
        url: result.url,
      })
    );
    router.push("/posts/new");
  }

  const previewRatio =
    aspectRatio === "9:16" ? "9 / 16" : aspectRatio === "1:1" ? "1 / 1" : "16 / 9";

  const tabs: { id: typeof tab; label: string }[] = [
    { id: "media", label: "Media" },
    { id: "title", label: "Tiêu đề" },
    { id: "audio", label: "Âm thanh" },
    { id: "copyright", label: "Lách bản quyền" },
    { id: "cta", label: "CTA cuối video" },
  ];

  const previewClip = result ? null : clips[0];
  const field =
    "w-full bg-[#111113] border border-white/15 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/40";
  const pill = (on: boolean) =>
    `flex-1 py-2.5 rounded-md text-sm border ${
      on ? "border-pink-500 text-white" : "border-white/15 text-white/70"
    }`;

  return (
    <div className="bg-[#0b0b0d] text-white border border-gray-800 rounded-xl p-4 sm:p-6 min-h-[480px]">
      {error && (
        <div className="mb-4 bg-red-500/15 text-red-300 px-4 py-2 rounded-lg text-sm border border-red-500/20">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(280px,1fr)_minmax(420px,1.1fr)] gap-6 items-start">
        <div className="space-y-3 w-full max-w-[420px] mx-auto lg:mx-0">
          <div
            ref={previewRef}
            className="relative bg-black rounded-sm overflow-hidden w-full select-none"
            style={{ aspectRatio: previewRatio }}
            onPointerMove={(e) => {
              if (!holeDrag.current || !previewRef.current) return;
              const box = previewRef.current.getBoundingClientRect();
              const x = ((e.clientX - box.left) / box.width) * 100 - holeDrag.current.dx;
              const y = ((e.clientY - box.top) / box.height) * 100 - holeDrag.current.dy;
              setHole((h) => ({
                ...h,
                xPercent: Math.min(100 - h.wPercent, Math.max(0, x)),
                yPercent: Math.min(100 - h.hPercent, Math.max(0, y)),
              }));
            }}
            onPointerUp={() => {
              holeDrag.current = null;
            }}
            onPointerLeave={() => {
              holeDrag.current = null;
            }}
          >
            {result && results.length > 0 ? (
              <video src={result.url} controls className="w-full h-full object-contain" />
            ) : background ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={background.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : result ? (
              <video src={result.url} controls className="w-full h-full object-contain" />
            ) : previewClip?.fileType === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewClip.url} alt="" className="w-full h-full object-cover" />
            ) : previewClip ? (
              <video src={previewClip.url} muted className="w-full h-full object-cover" />
            ) : null}
            {!(result && results.length > 0) && background && sourceVideo && (
              <video
                src={sourceVideo.url}
                muted
                autoPlay
                loop
                playsInline
                className="absolute object-cover cursor-move"
                style={{
                  left: `${hole.xPercent}%`,
                  top: `${hole.yPercent}%`,
                  width: `${hole.wPercent}%`,
                  height: `${hole.hPercent}%`,
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  const box = previewRef.current?.getBoundingClientRect();
                  if (!box) return;
                  holeDrag.current = {
                    dx: ((e.clientX - box.left) / box.width) * 100 - hole.xPercent,
                    dy: ((e.clientY - box.top) / box.height) * 100 - hole.yPercent,
                  };
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                }}
              />
            )}
          </div>
          {background && sourceVideo && (
            <p className="text-xs text-white/45">
              Kéo video để chỉnh vào đúng khung đen của ảnh nền.
            </p>
          )}
        </div>

        <div className="space-y-5">
          <div className="flex flex-wrap gap-4 text-sm border-b border-white/10">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`pb-2 ${
                  tab === t.id
                    ? "text-pink-400 border-b-2 border-pink-500"
                    : "text-white/60"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "media" && (
            <div className="space-y-5">
              <div>
                <p className="text-sm mb-2">Ảnh nền (khung)</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="border border-white/20 rounded-md py-2 px-3 text-sm"
                    disabled={uploading}
                    onClick={() => bgInputRef.current?.click()}
                  >
                    {background ? background.fileName : "Chọn ảnh nền"}
                  </button>
                  {background && (
                    <button type="button" className="text-xs text-red-400" onClick={() => setBackground(null)}>
                      Xóa
                    </button>
                  )}
                  <input
                    ref={bgInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={handlePickBackground}
                  />
                </div>
              </div>

              <div>
                <p className="text-sm mb-2">Video (kéo vào khung nền)</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="border border-white/20 rounded-md py-2 px-3 text-sm"
                    disabled={uploading}
                    onClick={() => videoInputRef.current?.click()}
                  >
                    {sourceVideo ? sourceVideo.fileName : "Chọn video"}
                  </button>
                  {sourceVideo && (
                    <button type="button" className="text-xs text-red-400" onClick={() => setSourceVideo(null)}>
                      Xóa
                    </button>
                  )}
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/mp4,video/quicktime"
                    className="hidden"
                    onChange={handlePickVideo}
                  />
                </div>
              </div>

              <label className="block text-sm">
                Cắt nhiều đoạn (mỗi đoạn xuất ra 1 video riêng)
                <textarea
                  value={cutsText}
                  onChange={(e) => setCutsText(e.target.value)}
                  rows={2}
                  className={`${field} mt-1`}
                  placeholder="01:15-01:42,09:10-09:35,03:40-04:05"
                />
                {parseCutRanges(cutsText).length > 0 && (
                  <p className="text-xs text-white/50 mt-1">
                    Sẽ tạo {parseCutRanges(cutsText).length} video:{" "}
                    {parseCutRanges(cutsText).map((c) => c.label).join(", ")}
                  </p>
                )}
              </label>

              <div>
                <p className="text-sm mb-2">Tỷ lệ khung hình</p>
                <div className="flex gap-2">
                  {(
                    [
                      ["9:16", "9:16 (Reels/Story)"],
                      ["1:1", "1:1 (Vuông)"],
                      ["16:9", "16:9 (Ngang)"],
                    ] as [AspectRatioId, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setAspectRatio(id)}
                      className={pill(aspectRatio === id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={splitMode}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setSplitMode(on);
                    if (on) setClips((prev) => prev.slice(0, 2));
                  }}
                  className="mt-0.5"
                />
                <span>
                  <span className="block">Chia đôi màn hình (trên / dưới)</span>
                  <span className="text-white/45 text-xs">
                    Bật để chia khung hình làm 2 vùng trên/dưới, mỗi vùng 1 ảnh hoặc video.
                  </span>
                </span>
              </label>

            </div>
          )}

          {tab === "title" && (
            <div className="space-y-3">
              {captions.map((cap, i) => (
                <div key={i} className="border border-white/10 rounded-md p-3 space-y-2">
                  <textarea
                    value={cap.text}
                    onChange={(e) =>
                      setCaptions((prev) =>
                        prev.map((c, j) => (j === i ? { ...c, text: e.target.value } : c))
                      )
                    }
                    rows={2}
                    className={field}
                    placeholder="Nội dung hiện trên video..."
                  />
                  <div className="grid sm:grid-cols-4 gap-2 text-xs text-white/70">
                    <label>
                      Bắt đầu (s)
                      <input
                        type="number"
                        min={0}
                        value={cap.startSec}
                        onChange={(e) =>
                          setCaptions((prev) =>
                            prev.map((c, j) =>
                              j === i ? { ...c, startSec: Number(e.target.value) } : c
                            )
                          )
                        }
                        className={`${field} mt-0.5`}
                      />
                    </label>
                    <label>
                      Kết thúc (s)
                      <input
                        type="number"
                        min={0.2}
                        value={cap.endSec}
                        onChange={(e) =>
                          setCaptions((prev) =>
                            prev.map((c, j) =>
                              j === i ? { ...c, endSec: Number(e.target.value) } : c
                            )
                          )
                        }
                        className={`${field} mt-0.5`}
                      />
                    </label>
                    <label>
                      Y (%)
                      <input
                        type="number"
                        value={cap.yPercent}
                        onChange={(e) =>
                          setCaptions((prev) =>
                            prev.map((c, j) =>
                              j === i ? { ...c, yPercent: Number(e.target.value) } : c
                            )
                          )
                        }
                        className={`${field} mt-0.5`}
                      />
                    </label>
                    <label>
                      Cỡ chữ
                      <input
                        type="number"
                        value={cap.fontSize}
                        onChange={(e) =>
                          setCaptions((prev) =>
                            prev.map((c, j) =>
                              j === i ? { ...c, fontSize: Number(e.target.value) } : c
                            )
                          )
                        }
                        className={`${field} mt-0.5`}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-red-400"
                    onClick={() => setCaptions((prev) => prev.filter((_, j) => j !== i))}
                  >
                    Xóa caption
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setCaptions((prev) => [...prev, newCaption()])}
                className="text-sm text-pink-400"
              >
                + Thêm caption
              </button>
            </div>
          )}

          {tab === "audio" && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 items-center">
                <label className="border border-white/20 text-sm px-3 py-1.5 rounded-md cursor-pointer">
                  {music ? music.fileName : "Chọn file nhạc"}
                  <input
                    type="file"
                    accept="audio/mpeg,audio/mp3,audio/wav,audio/aac,audio/mp4,video/mp4"
                    className="hidden"
                    onChange={handleMusic}
                  />
                </label>
                {music && (
                  <button type="button" className="text-xs text-red-400" onClick={() => setMusic(null)}>
                    Bỏ nhạc
                  </button>
                )}
              </div>
              <label className="block text-sm">
                Âm lượng video: {Math.round(videoVolume * 100)}%
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={videoVolume}
                  onChange={(e) => setVideoVolume(Number(e.target.value))}
                  className="w-full"
                />
              </label>
              <label className="block text-sm">
                Âm lượng nhạc: {Math.round(musicVolume * 100)}%
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={musicVolume}
                  onChange={(e) => setMusicVolume(Number(e.target.value))}
                  className="w-full"
                />
              </label>
            </div>
          )}

          {tab === "copyright" && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={flipVideo}
                onChange={(e) => setFlipVideo(e.target.checked)}
              />
              Lật ngang video
            </label>
          )}

          {tab === "cta" && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={endCta.enabled}
                  onChange={(e) => setEndCta((c) => ({ ...c, enabled: e.target.checked }))}
                />
                Bật CTA cuối video
              </label>
              {endCta.enabled && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <input
                    value={endCta.text}
                    onChange={(e) => setEndCta((c) => ({ ...c, text: e.target.value }))}
                    className={field}
                    placeholder="Full video"
                  />
                  <input
                    value={endCta.icon}
                    onChange={(e) => setEndCta((c) => ({ ...c, icon: e.target.value }))}
                    className={field}
                    placeholder="👇"
                  />
                  <label className="text-xs text-white/70">
                    Hiện trong (s) cuối
                    <input
                      type="number"
                      min={1}
                      max={15}
                      value={endCta.durationSec}
                      onChange={(e) =>
                        setEndCta((c) => ({ ...c, durationSec: Number(e.target.value) }))
                      }
                      className={`${field} mt-0.5`}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={endCta.blink}
                      onChange={(e) => setEndCta((c) => ({ ...c, blink: e.target.checked }))}
                    />
                    Nhấp nháy
                  </label>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleRender}
            disabled={rendering || uploading}
            className="w-full bg-pink-500 hover:bg-pink-400 text-white py-3 rounded-md text-sm font-medium disabled:opacity-50"
          >
            {rendering ? "Đang tạo..." : uploading ? "Đang tải file..." : "Tạo video"}
          </button>

          {results.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-white/70">Đã tạo {results.length} video</p>
              {results.map((v, i) => (
                <div
                  key={v.filePath}
                  className="flex items-center justify-between gap-2 border border-white/10 rounded-md px-3 py-2 text-sm"
                >
                  <button
                    type="button"
                    className="text-left truncate"
                    onClick={() =>
                      setResult({
                        url: v.url,
                        filePath: v.filePath,
                        durationSec: v.durationSec,
                      })
                    }
                  >
                    Đoạn {i + 1} · {v.label} · {v.durationSec.toFixed(1)}s
                  </button>
                  <a
                    href={v.url}
                    download={`reel-${v.label.replace(/[:]/g, "")}.mp4`}
                    className="bg-pink-500 hover:bg-pink-400 text-white px-3 py-1 rounded-md whitespace-nowrap"
                  >
                    Tải về
                  </a>
                </div>
              ))}
            </div>
          )}

          {result && results.length === 0 && (
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="text-white/50">Xong · {result.durationSec.toFixed(1)}s</span>
              <button type="button" onClick={useForPost} className="text-pink-400 underline">
                Dùng cho bài viết Facebook
              </button>
              <a href={result.url} download="reel.mp4" className="text-white/70 underline">
                Tải video
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
