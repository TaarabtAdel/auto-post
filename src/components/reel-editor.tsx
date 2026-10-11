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
import { ui } from "@/lib/dashboard-ui";
import { FileDropHint, FileDropZone } from "@/components/file-drop-zone";
import {
  AUDIO_ACCEPT,
  IMAGE_ACCEPT,
  uploadMediaFile,
  VIDEO_ACCEPT,
} from "@/lib/upload-client";

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
    fileName: string;
    fileSize: number;
    durationSec: number;
  } | null>(null);
  const [results, setResults] = useState<
    {
      url: string;
      filePath: string;
      fileName: string;
      fileSize: number;
      durationSec: number;
      label: string;
    }[]
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

  function toUploadedMedia(
    data: Awaited<ReturnType<typeof uploadMediaFile>>,
    kind: "image" | "video" | "audio"
  ): UploadedMedia {
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

  async function uploadReelFile(file: File, kind: "image" | "video" | "audio") {
    const data = await uploadMediaFile(file);
    return toUploadedMedia(data, kind);
  }

  async function pickBackgroundFile(file: File) {
    setUploading(true);
    setError("");
    try {
      const uploaded = await uploadReelFile(file, "image");
      setBackground(uploaded);
      detectHoleFromUrl(uploaded.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload ảnh nền thất bại.");
    } finally {
      setUploading(false);
    }
  }

  async function pickSourceVideoFile(file: File) {
    setUploading(true);
    setError("");
    try {
      setSourceVideo(await uploadReelFile(file, "video"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload video thất bại.");
    } finally {
      setUploading(false);
    }
  }

  async function pickMusicFile(file: File) {
    setUploading(true);
    setError("");
    try {
      setMusic(await uploadReelFile(file, "audio"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload nhạc thất bại.");
    } finally {
      setUploading(false);
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
          fileName: string;
          fileSize: number;
          durationSec: number;
          label: string;
        }[];
        setResults(videos);
        if (videos[0]) {
          setResult({
            url: videos[0].url,
            filePath: videos[0].filePath,
            fileName: videos[0].fileName,
            fileSize: videos[0].fileSize ?? 0,
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
        fileName: data.fileName ?? "reel.mp4",
        fileSize: data.fileSize ?? 0,
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
        fileName: result.fileName,
        fileSize: result.fileSize,
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
  const aspectPill = (on: boolean) =>
    `flex-1 py-2 rounded-lg text-xs sm:text-sm font-medium border transition-colors ${
      on
        ? "bg-blue-600 text-white border-blue-600"
        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
    }`;

  return (
    <div className={`${ui.card} ${ui.cardPad} min-h-[480px] space-y-4 text-sm text-gray-900`}>
      {error && <div className={`mb-2 ${ui.alertError}`}>{error}</div>}

      <div className="grid lg:grid-cols-[minmax(280px,1fr)_minmax(420px,1.1fr)] gap-6 items-start">
        <div className="space-y-3 w-full max-w-[420px] mx-auto lg:mx-0">
          <div
            ref={previewRef}
            className="relative bg-black rounded-lg overflow-hidden w-full select-none border border-gray-200"
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
            <p className={`text-xs ${ui.hint}`}>
              Kéo video để chỉnh vào đúng khung đen của ảnh nền.
            </p>
          )}
        </div>

        <div className="space-y-5">
          <div className="flex flex-wrap gap-1 text-sm bg-gray-100 p-1 rounded-lg">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-3 py-2 rounded-md transition-colors whitespace-nowrap ${
                  tab === t.id
                    ? "bg-white text-gray-900 shadow-sm font-medium"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "media" && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Ảnh nền (khung)</p>
                <FileDropZone
                  accept={IMAGE_ACCEPT}
                  disabled={uploading}
                  compact
                  onFiles={(files) => {
                    const file = files[0];
                    if (file) void pickBackgroundFile(file);
                  }}
                >
                  <FileDropHint
                    busy={uploading}
                    extra={
                      background
                        ? `Đã chọn: ${background.fileName}`
                        : "JPG, PNG, GIF, WebP"
                    }
                  />
                </FileDropZone>
                {background && (
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline mt-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBackground(null);
                    }}
                  >
                    Xóa ảnh nền
                  </button>
                )}
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Video (kéo vào khung nền)</p>
                <FileDropZone
                  accept={VIDEO_ACCEPT}
                  disabled={uploading}
                  compact
                  onFiles={(files) => {
                    const file = files[0];
                    if (file) void pickSourceVideoFile(file);
                  }}
                >
                  <FileDropHint
                    busy={uploading}
                    extra={
                      sourceVideo
                        ? `Đã chọn: ${sourceVideo.fileName}`
                        : "MP4, MOV"
                    }
                  />
                </FileDropZone>
                {sourceVideo && (
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline mt-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSourceVideo(null);
                    }}
                  >
                    Xóa video
                  </button>
                )}
              </div>

              <label className="block text-sm">
                Cắt nhiều đoạn (mỗi đoạn xuất ra 1 video riêng)
                <textarea
                  value={cutsText}
                  onChange={(e) => setCutsText(e.target.value)}
                  rows={2}
                  className={`${ui.textarea} mt-1`}
                  placeholder="01:15-01:42,09:10-09:35,03:40-04:05"
                />
                {parseCutRanges(cutsText).length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Sẽ tạo {parseCutRanges(cutsText).length} video:{" "}
                    {parseCutRanges(cutsText).map((c) => c.label).join(", ")}
                  </p>
                )}
              </label>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Tỷ lệ khung hình</p>
                <div className="flex flex-col sm:flex-row gap-2">
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
                      className={aspectPill(aspectRatio === id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-start gap-2 text-sm text-gray-800">
                <input
                  type="checkbox"
                  checked={splitMode}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setSplitMode(on);
                    if (on) setClips((prev) => prev.slice(0, 2));
                  }}
                  className="mt-0.5 rounded border-gray-300"
                />
                <span>
                  <span className="block font-medium">Chia đôi màn hình (trên / dưới)</span>
                  <span className="text-gray-500 text-xs">
                    Bật để chia khung hình làm 2 vùng trên/dưới, mỗi vùng 1 ảnh hoặc video.
                  </span>
                </span>
              </label>

            </div>
          )}

          {tab === "title" && (
            <div className="space-y-3">
              {captions.map((cap, i) => (
                <div key={i} className={`${ui.card} ${ui.cardPadSm} space-y-2`}>
                  <textarea
                    value={cap.text}
                    onChange={(e) =>
                      setCaptions((prev) =>
                        prev.map((c, j) => (j === i ? { ...c, text: e.target.value } : c))
                      )
                    }
                    rows={2}
                    className={ui.textarea}
                    placeholder="Nội dung hiện trên video..."
                  />
                  <div className="grid sm:grid-cols-4 gap-2 text-xs text-gray-600">
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
                        className={`${ui.input} mt-0.5`}
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
                        className={`${ui.input} mt-0.5`}
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
                        className={`${ui.input} mt-0.5`}
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
                        className={`${ui.input} mt-0.5`}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => setCaptions((prev) => prev.filter((_, j) => j !== i))}
                  >
                    Xóa caption
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setCaptions((prev) => [...prev, newCaption()])}
                className="text-sm text-blue-600 hover:underline font-medium"
              >
                + Thêm caption
              </button>
            </div>
          )}

          {tab === "audio" && (
            <div className="space-y-4">
              <FileDropZone
                accept={AUDIO_ACCEPT}
                disabled={uploading}
                compact
                onFiles={(files) => {
                  const file = files[0];
                  if (file) void pickMusicFile(file);
                }}
              >
                <FileDropHint
                  busy={uploading}
                  extra={music ? `Đã chọn: ${music.fileName}` : "MP3, WAV, AAC, M4A"}
                />
              </FileDropZone>
              {music && (
                <button
                  type="button"
                  className="text-xs text-red-600 hover:underline"
                  onClick={() => setMusic(null)}
                >
                  Bỏ nhạc
                </button>
              )}
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
                    className={ui.input}
                    placeholder="Full video"
                  />
                  <input
                    value={endCta.icon}
                    onChange={(e) => setEndCta((c) => ({ ...c, icon: e.target.value }))}
                    className={ui.input}
                    placeholder="👇"
                  />
                  <label className="text-xs text-gray-600">
                    Hiện trong (s) cuối
                    <input
                      type="number"
                      min={1}
                      max={15}
                      value={endCta.durationSec}
                      onChange={(e) =>
                        setEndCta((c) => ({ ...c, durationSec: Number(e.target.value) }))
                      }
                      className={`${ui.input} mt-0.5`}
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
            className={`w-full ${ui.btnPrimary} py-3 text-base disabled:opacity-50`}
          >
            {rendering ? "Đang tạo..." : uploading ? "Đang tải file..." : "Tạo video"}
          </button>

          {results.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">Đã tạo {results.length} video</p>
              {results.map((v, i) => (
                <div
                  key={v.filePath}
                  className={`flex items-center justify-between gap-2 ${ui.card} ${ui.cardPadSm} text-sm`}
                >
                  <button
                    type="button"
                    className="text-left truncate"
                    onClick={() =>
                      setResult({
                        url: v.url,
                        filePath: v.filePath,
                        fileName: v.fileName,
                        fileSize: v.fileSize ?? 0,
                        durationSec: v.durationSec,
                      })
                    }
                  >
                    <span className="block truncate font-medium">{v.fileName}</span>
                    <span className="text-gray-500 text-xs">
                      STT {String(i + 1).padStart(2, "0")} · {v.label} · {v.durationSec.toFixed(1)}s
                    </span>
                  </button>
                  <a
                    href={v.url}
                    download={v.fileName}
                    className={`${ui.btnSmPrimary} whitespace-nowrap`}
                  >
                    Tải về
                  </a>
                </div>
              ))}
            </div>
          )}

          {result && results.length === 0 && (
            <div className={`space-y-2 text-sm ${ui.card} ${ui.cardPadSm}`}>
              <p className="text-gray-900 truncate font-medium" title={result.fileName}>
                {result.fileName}
              </p>
              <div className="flex flex-wrap gap-3 items-center">
                <span className="text-gray-500">Xong · {result.durationSec.toFixed(1)}s</span>
                <button type="button" onClick={useForPost} className="text-blue-600 hover:underline font-medium">
                  Dùng cho bài viết Facebook
                </button>
                <a href={result.url} download={result.fileName} className="text-gray-700 hover:underline">
                  Tải video
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
