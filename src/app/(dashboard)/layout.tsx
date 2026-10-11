import { getAppSession } from "@/lib/app-session";
import { Sidebar } from "@/components/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAppSession();

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar userName={session.user.name || session.user.email} />

      {/* Main content — offset by sidebar width on desktop */}
      <main className="lg:ml-64 pt-14 lg:pt-0">
        <div className="max-w-6xl mx-auto p-0">
          {children}
        </div>
      </main>
    </div>
  );
}
