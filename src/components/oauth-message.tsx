"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function OAuthMessageInner() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const success = searchParams.get("success");

  if (!error && !success) return null;

  return (
    <div className="mb-6">
      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-md text-sm">
          ⚠ {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 text-green-600 px-4 py-3 rounded-md text-sm">
          ✅ {success}
        </div>
      )}
    </div>
  );
}

export function OAuthMessage() {
  return (
    <Suspense fallback={null}>
      <OAuthMessageInner />
    </Suspense>
  );
}
