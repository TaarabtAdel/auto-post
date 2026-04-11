import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tài khoản",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md px-4">{children}</div>
    </div>
  );
}
