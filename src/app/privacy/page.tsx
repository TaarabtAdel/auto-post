import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chính sách quyền riêng tư — AutoPost",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 py-16 px-4">
      <article className="max-w-2xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold text-white">
          Chính sách quyền riêng tư
        </h1>
        <p className="text-gray-400 text-sm">Cập nhật lần cuối: 12/04/2026</p>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">
            1. Thông tin chúng tôi thu thập
          </h2>
          <ul className="list-disc list-inside space-y-1 text-gray-300">
            <li>
              <strong>Thông tin tài khoản:</strong> Email và mật khẩu khi bạn
              đăng ký.
            </li>
            <li>
              <strong>Dữ liệu Facebook:</strong> Khi bạn kết nối Facebook, chúng
              tôi nhận tên Page, ảnh đại diện Page, và Page Access Token để đăng
              bài thay bạn.
            </li>
            <li>
              <strong>Nội dung bài viết:</strong> Văn bản, hình ảnh bạn tạo hoặc
              upload trong ứng dụng.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">
            2. Cách chúng tôi sử dụng thông tin
          </h2>
          <ul className="list-disc list-inside space-y-1 text-gray-300">
            <li>Xác thực danh tính và quản lý phiên đăng nhập.</li>
            <li>Đăng bài viết lên Facebook Page theo lịch bạn đặt.</li>
            <li>Lưu trữ nội dung bài viết và media bạn tạo.</li>
          </ul>
          <p className="text-gray-300">
            Chúng tôi <strong>không</strong> bán, chia sẻ, hoặc sử dụng dữ liệu
            của bạn cho quảng cáo hay bất kỳ mục đích nào khác ngoài vận hành
            ứng dụng.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">
            3. Bảo mật dữ liệu
          </h2>
          <p className="text-gray-300">
            Facebook Access Token được mã hóa AES-256-GCM trước khi lưu trữ.
            Mật khẩu được hash an toàn. Kết nối sử dụng HTTPS. Chúng tôi áp dụng
            các biện pháp bảo mật hợp lý để bảo vệ dữ liệu của bạn.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">
            4. Quyền truy cập Facebook
          </h2>
          <p className="text-gray-300">
            Ứng dụng yêu cầu các quyền sau từ Facebook:
          </p>
          <ul className="list-disc list-inside space-y-1 text-gray-300">
            <li>
              <code className="bg-gray-800 px-1 rounded text-sm">
                pages_manage_posts
              </code>{" "}
              — để đăng bài lên Page của bạn.
            </li>
            <li>
              <code className="bg-gray-800 px-1 rounded text-sm">
                pages_read_engagement
              </code>{" "}
              — để đọc thông tin Page.
            </li>
          </ul>
          <p className="text-gray-300">
            Bạn có thể thu hồi quyền bất kỳ lúc nào trong{" "}
            <a
              href="https://www.facebook.com/settings?tab=business_tools"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 underline"
            >
              Cài đặt Facebook → Tích hợp doanh nghiệp
            </a>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">
            5. Xóa dữ liệu
          </h2>
          <p className="text-gray-300">
            Bạn có thể ngắt kết nối Facebook Page hoặc xóa tài khoản bất kỳ lúc
            nào. Khi ngắt kết nối, token được xóa khỏi hệ thống. Khi xóa tài
            khoản, toàn bộ dữ liệu liên quan (bài viết, media, kết nối Page)
            sẽ bị xóa vĩnh viễn.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">6. Liên hệ</h2>
          <p className="text-gray-300">
            Nếu bạn có câu hỏi về chính sách này, vui lòng liên hệ qua email:{" "}
            <a
              href="mailto:dangtoai3@gmail.com"
              className="text-blue-400 underline"
            >
              dangtoai3@gmail.com
            </a>
          </p>
        </section>
      </article>
    </div>
  );
}
