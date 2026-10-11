import type { Metadata } from "next";
import { getAppSession } from "@/lib/app-session";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { post } from "@/db/schema/post";
import { facebookPage } from "@/db/schema/facebook-page";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { StatsCards } from "@/components/stats-cards";
import { PageHeader } from "@/components/page-header";
import { ui } from "@/lib/dashboard-ui";

export const metadata: Metadata = {
  title: "Dashboard",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "Nháp", color: "bg-gray-100 text-gray-700" },
  scheduled: { label: "Đã hẹn giờ", color: "bg-yellow-100 text-yellow-700" },
  posting: { label: "Đang đăng", color: "bg-blue-100 text-blue-700" },
  posted: { label: "Đã đăng", color: "bg-green-100 text-green-700" },
  failed: { label: "Thất bại", color: "bg-red-100 text-red-700" },
};

export default async function DashboardPage() {
  const session = await getAppSession({
    headers: await headers(),
  });

  const allPosts = await db
    .select({ id: post.id, status: post.status })
    .from(post)
    .where(eq(post.userId, session!.user.id));

  const pages = await db
    .select({ id: facebookPage.id, tokenStatus: facebookPage.tokenStatus })
    .from(facebookPage)
    .where(eq(facebookPage.userId, session!.user.id));

  const stats = {
    totalPosts: allPosts.length,
    scheduled: allPosts.filter((p) => p.status === "scheduled").length,
    posted: allPosts.filter((p) => p.status === "posted").length,
    failed: allPosts.filter((p) => p.status === "failed").length,
    activePages: pages.filter((p) => p.tokenStatus === "active").length,
  };

  const recentPosts = await db
    .select({
      id: post.id,
      content: post.content,
      status: post.status,
      createdAt: post.createdAt,
    })
    .from(post)
    .where(eq(post.userId, session!.user.id))
    .orderBy(desc(post.createdAt))
    .limit(5);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Xin chào, ${session!.user.name}`}
        description="Tổng quan hoạt động AutoPost"
      />

      <div>
        <StatsCards
          stats={[
            { label: "Tổng bài viết", value: stats.totalPosts, icon: "📝", color: "text-gray-900" },
            { label: "Đã hẹn giờ", value: stats.scheduled, icon: "🕐", color: "text-yellow-600" },
            { label: "Đã đăng", value: stats.posted, icon: "✅", color: "text-green-600" },
            { label: "Thất bại", value: stats.failed, icon: "❌", color: "text-red-600" },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/posts/new"
          className="bg-blue-600 text-white rounded-xl p-5 hover:bg-blue-700 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">✨</span>
            <div>
              <p className="font-semibold">Tạo bài viết mới</p>
              <p className="text-sm text-blue-100">Viết, AI generate, hẹn giờ đăng</p>
            </div>
          </div>
        </Link>
        <Link
          href="/pages"
          className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">📄</span>
            <div>
              <p className="font-semibold text-gray-900">Facebook Pages</p>
              <p className="text-sm text-gray-500">
                {stats.activePages} page{stats.activePages !== 1 ? "s" : ""} đang hoạt động
              </p>
            </div>
          </div>
        </Link>
      </div>

      <div className={ui.tableShell}>
        <div className="flex justify-between items-center p-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Bài viết gần đây</h3>
          <Link
            href="/posts"
            className="text-sm text-blue-600 hover:underline"
          >
            Xem tất cả →
          </Link>
        </div>

        {recentPosts.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {recentPosts.map((p) => {
              const statusInfo = STATUS_LABELS[p.status] || STATUS_LABELS.draft;
              return (
                <div
                  key={p.id}
                  className="flex justify-between items-center px-5 py-3.5 hover:bg-gray-50 transition-colors"
                >
                  <p className="text-sm text-gray-700 truncate flex-1 mr-4">
                    {p.content || "(Không có nội dung)"}
                  </p>
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusInfo.color} whitespace-nowrap`}
                  >
                    {statusInfo.label}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="text-gray-400 mb-3">Chưa có bài viết nào</p>
            <Link
              href="/posts/new"
              className={ui.btnPrimary}
            >
              ✨ Tạo bài viết đầu tiên
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
