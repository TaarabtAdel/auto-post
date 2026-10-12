/** Mô tả xóa bài — dùng được cả client (confirm) và server. Xóa luôn được, không chặn theo trạng thái. */

export function describeDeleteImpact(status: string): {
  title: string;
  detail: string;
  allow: boolean;
} {
  if (status === "posting") {
    return {
      allow: true,
      title: "Xóa bài đang đăng?",
      detail:
        "Bài có thể đang gửi lên Facebook. Chỉ xóa bản ghi trong AutoPost; bài trên Facebook (nếu đã lên) không bị gỡ.",
    };
  }
  if (status === "posted") {
    return {
      allow: true,
      title: "Xóa khỏi AutoPost?",
      detail:
        "Bài trên Facebook KHÔNG bị gỡ — chỉ xóa bản ghi trong hệ thống. Các Fanpage khác trong cùng đợt đăng không bị ảnh hưởng.",
    };
  }
  if (["queued", "scheduled", "test_scheduled", "draft", "failed"].includes(status)) {
    return {
      allow: true,
      title: "Xóa bài này?",
      detail:
        "Hủy hàng đợi (nếu có) và xóa bản ghi cho Fanpage này. Bài đã đăng trên Fanpage khác (cùng batch) vẫn giữ nguyên.",
    };
  }
  return {
    allow: true,
    title: "Xóa bài?",
    detail: "Chỉ xóa bản ghi này trong AutoPost.",
  };
}
