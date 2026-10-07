import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { TokenRenewForm } from "@/components/token-renew-form";
import { listWorkspaceApps } from "@/lib/workspace-app";

export const metadata: Metadata = {
  title: "Gia hạn Facebook Token",
};

export default async function RenewTokenPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const apps = await listWorkspaceApps(session!.user.id);

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">
          Gia hạn User Access Token
        </h2>
        <p className="text-gray-600 mt-1">
          Trên <strong>/pages</strong>, nút <strong>Gia hạn</strong> tự dùng Page token đã
          lưu — không cần dán token. Trang này dành cho trường hợp đặc biệt: dán{" "}
          <strong>User token</strong> từ Graph API Explorer để lấy lại Page token khi token
          Page đã chết hẳn.
        </p>
      </div>
      <TokenRenewForm apps={apps} />
    </div>
  );
}
