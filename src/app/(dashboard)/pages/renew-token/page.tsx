import type { Metadata } from "next";
import { TokenRenewForm } from "@/components/token-renew-form";

export const metadata: Metadata = {
  title: "Gia hạn Facebook Token",
};

export default function RenewTokenPage() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">
          Gia hạn User Access Token
        </h2>
        <p className="text-gray-600 mt-1">
          Dán token ngắn hạn từ Graph API Explorer — hệ thống đổi sang long-lived
          (~60 ngày) và liệt kê Page token nếu có quyền.
        </p>
      </div>
      <TokenRenewForm />
    </div>
  );
}
