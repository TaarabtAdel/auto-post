"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/login");
        },
      },
    });
  }

  return (
    <button
      onClick={handleSignOut}
      className="w-full text-left text-sm text-gray-400 hover:text-white transition-colors cursor-pointer px-3 py-2 rounded-lg hover:bg-gray-800"
    >
      🚪 Đăng xuất
    </button>
  );
}
