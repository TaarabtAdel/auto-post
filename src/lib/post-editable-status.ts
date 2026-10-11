/** Trạng thái bài cho phép sửa nội dung / media / hẹn giờ (kể cả bài từ luồng AUTO Test). */
export const EDITABLE_POST_STATUSES = [
  "draft",
  "queued",
  "scheduled",
  "test_scheduled",
  "failed",
] as const;

export function isPostEditable(status: string): boolean {
  return (EDITABLE_POST_STATUSES as readonly string[]).includes(status);
}

/** Cập nhật queue đăng Fanpage thật khi lưu (không áp dụng cho test_scheduled). */
export function shouldEnqueuePublishOnSave(status: string): boolean {
  return status === "queued" || status === "scheduled";
}
