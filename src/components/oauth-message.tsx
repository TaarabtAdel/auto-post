"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ui } from "@/lib/dashboard-ui";

function OAuthMessageInner() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const success = searchParams.get("success");

  if (!error && !success) return null;

  return (
    <div className="mb-6">
      {error && (
        <div className={ui.alertError}>⚠ {error}</div>
      )}
      {success && (
        <div className={ui.alertSuccess}>
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
