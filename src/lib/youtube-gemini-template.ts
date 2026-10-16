export const DEFAULT_YOUTUBE_GEMINI_TEMPLATE = `VAI TRÒ:
Bạn đóng vai một Content Strategist chuyên "xẻ thịt" video dài thành các đoạn ngắn viral cho TikTok/Shorts/Reels — người đã từng phân tích hàng trăm video để tìm ra khoảnh khắc vàng (golden moment) khiến người xem dừng lướt.

DỮ LIỆU ĐẦU VÀO: {url}

Hãy phân tích nội dung của video và thực hiện theo quy trình 3 bước:

────────────────────────────
BƯỚC 1 — TÍNH TOÁN SỐ ĐOẠN CẦN CẮT
────────────────────────────
Căn cứ độ dài video gốc, áp số lượng đoạn cắt như sau:
- Dưới 3 phút → 2-3 đoạn
- 3-10 phút → 4-6 đoạn
- Trên 10 phút → 6-10 đoạn

Mỗi đoạn tối đa khoảng 30 giây

────────────────────────────
BƯỚC 2 — LẬP BẢNG ĐÁNH GIÁ TỪNG ĐOẠN
────────────────────────────
Trình bày bảng với đúng số đoạn đã tính ở Bước 1:

| # | Thời điểm (mm:ss - mm:ss) bắt | Điều gì xảy ra + Vì sao người xem không lướt qua | Điểm khả năng viral (/10) | Nhóm nội dung (chọn 1: Hài / Drama / Hữu ích / Cảm động / Âm thanh lạ / Tiếng cười lớn) |

────────────────────────────
BƯỚC 3 — CHỌN RA 4 ĐOẠN MẠNH NHẤT
────────────────────────────
Lấy 4 đoạn điểm cao nhất từ bảng ở Bước 2, trình bày riêng từng đoạn:

🔹 Đoạn #X
- Khung thời gian:
- 3 giây mở đầu nên nói/chèn chữ gì để giữ chân người xem:
- Tiêu đề/Caption bắt trend tiếng anh,5-7 hastag chuẩn SEO viết liền không cách bắt đầu bằng #:
- Đề xuất: Viết caption theo ĐÚNG cấu trúc sau, từng dòng riêng biệt:

😄 WATCH FULL VIDEO: [không chèn link, không ghi chú ở đây]
😄 + CÂU HOOK VIẾT HOA, mạnh mẽ, tối đa 8 từ, đánh thẳng vào cảm xúc hoặc sự tò mò của người xem ngay lập tức.
Viết Caption theo: Viết ~70 từ bằng tiếng anh theo flow sau:
→ Mô tả khoảnh khắc đỉnh điểm khiến khán giả cười không kiểm soát.
→ Diễn viên tự nhiên thoát vzai ra sao — khoảnh khắc thật 100%.
→ Xây dựng tension từng bước đến khi mọi thứ vỡ vụn hoàn toàn.
→ Chèn 1 câu trích dẫn ngắn từ diễn viên HOẶC phản ứng khán giả thật.
→ Khiến người đọc cảm thấy họ PHẢI xem đoạn clip ngay lập tức.
→ Sử dụng lối kể chuyện sống động, đậm chất điện ảnh và ngôn ngữ giàu cảm xúc.
→ Nhấn mạnh: những khoảnh khắc hài chân thực như này CỰC HIẾM ngày nay.

WATCH FULL BELOW LINK 👇👇👇
[không chèn BẤT KỲ link, không ghi chú gì ở đây]
Kèm thêm 5 đến 10 hagtag liên quan đến video lên xu hướng

────────────────────────────
TIÊU CHÍ LOẠI TRỪ (áp dụng xuyên suốt)
────────────────────────────
✗ Loại bỏ đoạn nào cần xem video gốc mới hiểu được
✓ Ưu tiên đoạn có: bất ngờ/twist, cảm xúc bộc phát rõ (sốc, xúc động, bật cười), âm thanh tự nhiên đặc biệt, hoặc câu nói gây tranh luận/đồng cảm mạnh
✗ Không tự bịa thêm chi tiết ngoài transcript được cung cấp. Tổng hợp lại thời gian viral 4 đoạn hay nhất theo cú pháp : mm:ss-mm:ss,mm:ss-mm:ss,mm:ss-mm:ss,mm:ss-mm:ss`;

export function buildYouTubeGeminiPrompt(
  template: string,
  vars: {
    url: string;
    title?: string;
    duration?: string;
    channel?: string;
    id?: string;
  }
): string {
  return template
    .replaceAll("{title}", vars.title ?? "")
    .replaceAll("{url}", vars.url)
    .replaceAll("{duration}", vars.duration ?? "")
    .replaceAll("{channel}", vars.channel ?? "")
    .replaceAll("{id}", vars.id ?? "");
}
