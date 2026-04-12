import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Điều khoản sử dụng — AutoPost",
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 py-16 px-4">
      <article className="max-w-2xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold text-white">Điều khoản sử dụng</h1>
        <p className="text-gray-400 text-sm">Cập nhật lần cuối: 12/04/2026</p>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">
            1. Chấp nhận điều khoản
          </h2>
          <p className="text-gray-300">
            Bằng việc sử dụng AutoPost, bạn đồng ý với các điều khoản dưới đây.
            Nếu không đồng ý, vui lòng ngừng sử dụng ứng dụng.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">
            2. Mô tả dịch vụ
          </h2>
          <p className="text-gray-300">
            AutoPost cho phép bạn tạo, lên lịch, và tự động đăng bài viết lên
            Facebook Page mà bạn quản lý. Dịch vụ hoạt động thông qua Facebook
            Graph API.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">
            3. Trách nhiệm người dùng
          </h2>
          <ul className="list-disc list-inside space-y-1 text-gray-300">
            <li>Bạn chịu trách nhiệm về nội dung bài viết bạn đăng.</li>
            <li>
              Không sử dụng dịch vụ để spam, đăng nội dung vi phạm pháp luật,
              hoặc vi phạm chính sách Facebook.
            </li>
            <li>Bảo mật thông tin tài khoản của bạn.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">
            4. Giới hạn trách nhiệm
          </h2>
          <p className="text-gray-300">
            AutoPost được cung cấp &quot;nguyên trạng&quot;. Chúng tôi không
            chịu trách nhiệm cho việc bài viết không được đăng do lỗi Facebook
            API, token hết hạn, hoặc các sự cố kỹ thuật ngoài tầm kiểm soát.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">
            5. Chấm dứt dịch vụ
          </h2>
          <p className="text-gray-300">
            Chúng tôi có quyền tạm ngưng hoặc chấm dứt tài khoản nếu phát hiện
            vi phạm điều khoản. Bạn có thể ngừng sử dụng dịch vụ bất kỳ lúc
            nào bằng cách xóa tài khoản.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">6. Liên hệ</h2>
          <p className="text-gray-300">
            Mọi câu hỏi vui lòng gửi về:{" "}
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
