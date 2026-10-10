export type AspectRatioId = "9:16" | "1:1" | "16:9";

export interface MediaCrop {
  focusX: number;
  focusY: number;
  zoom: number;
}

export interface ReelCaption {
  text: string;
  startSec: number;
  endSec: number;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  fontSize: number;
  textColor: string;
  backgroundColor: string;
}

export interface ReelEndCta {
  enabled: boolean;
  text: string;
  icon: string;
  durationSec: number;
  xPercent: number;
  yPercent: number;
  scale: number;
  backgroundColor: string;
  textColor: string;
  blink: boolean;
}

export interface ReelMediaItem {
  filePath: string;
  type: "image" | "video";
  durationSec?: number;
  trimStartSec?: number;
  trimEndSec?: number;
  crop?: MediaCrop;
}

export interface ReelSplit {
  ratio: number;
  top: ReelMediaItem | null;
  bottom: ReelMediaItem | null;
  topVolume: number;
  bottomVolume: number;
  durationSec: number;
}

export interface FrameHoleInput {
  xPercent: number;
  yPercent: number;
  wPercent: number;
  hPercent: number;
}

export interface ReelCutRangeInput {
  startSec: number;
  endSec: number;
  label?: string;
}

export interface ReelRenderRequest {
  aspectRatio: AspectRatioId;
  media: ReelMediaItem[];
  captions: ReelCaption[];
  musicPath?: string;
  videoVolume: number;
  musicVolume: number;
  flipVideo: boolean;
  endCta: ReelEndCta;
  split?: ReelSplit;
  backgroundPath?: string;
  videoPath?: string;
  cuts?: ReelCutRangeInput[];
  hole?: FrameHoleInput;
}

export const FPS = 30;
export const TRANSITION_SEC = 0.5;
export const ASPECT_RATIOS: Record<AspectRatioId, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
};
