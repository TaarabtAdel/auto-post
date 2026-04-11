import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { facebookPage } from "@/db/schema/facebook-page";
import { eq } from "drizzle-orm";
import { AddPageForm } from "@/components/add-page-form";
import { PageCard } from "@/components/page-card";
import { OAuthMessage } from "@/components/oauth-message";

export default async function PagesPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const pages = await db
    .select({
      id: facebookPage.id,
      pageId: facebookPage.pageId,
      pageName: facebookPage.pageName,
      pageAvatar: facebookPage.pageAvatar,
      tokenStatus: facebookPage.tokenStatus,
    })
    .from(facebookPage)
    .where(eq(facebookPage.userId, session!.user.id));

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Facebook Pages</h2>
        <p className="text-gray-600 mt-1">
          Quản lý các Facebook Pages đã kết nối.
        </p>
      </div>

      <OAuthMessage />

      <div className="space-y-6">
        <AddPageForm />

        {pages.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-lg font-medium text-gray-900">
              Pages đã kết nối ({pages.length})
            </h3>
            {pages.map((page) => (
              <PageCard
                key={page.id}
                id={page.id}
                pageId={page.pageId}
                pageName={page.pageName}
                pageAvatar={page.pageAvatar}
                tokenStatus={page.tokenStatus}
              />
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-8 text-center">
            <p className="text-gray-500">
              Chưa có Page nào được kết nối. Click &quot;Kết nối bằng Facebook&quot; ở trên để bắt đầu.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
