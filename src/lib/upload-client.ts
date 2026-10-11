/** Khớp với `/api/uploads`. */
export const POST_MEDIA_ACCEPT =
  "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime";

export const IMAGE_ACCEPT = "image/jpeg,image/png,image/gif,image/webp";

export const VIDEO_ACCEPT = "video/mp4,video/quicktime";

export const AUDIO_ACCEPT =
  "audio/mpeg,audio/mp3,audio/wav,audio/aac,audio/mp4,audio/x-wav,audio/m4a";

export type UploadedMediaPayload = {
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileType: string;
  url: string;
};

export type UploadBucketHint =
  | "background"
  | "video"
  | "reel"
  | "audio"
  | "image";

export async function uploadMediaFile(
  file: File,
  opts?: { bucket?: UploadBucketHint }
): Promise<UploadedMediaPayload> {
  const formData = new FormData();
  formData.append("file", file);
  if (opts?.bucket) formData.append("bucket", opts.bucket);
  const res = await fetch("/api/uploads", { method: "POST", body: formData });
  const data = (await res.json()) as UploadedMediaPayload & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "Upload thất bại.");
  }
  return data;
}

export async function uploadMediaFiles(files: File[]): Promise<{
  uploaded: UploadedMediaPayload[];
  errors: string[];
}> {
  const uploaded: UploadedMediaPayload[] = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      uploaded.push(await uploadMediaFile(file));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Upload thất bại.");
    }
  }
  return { uploaded, errors };
}
