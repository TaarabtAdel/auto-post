import { appTzNowLabel } from "@/lib/scheduled-at";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log(
      "[cron]",
      appTzNowLabel(),
      "instrumentation.register() — NEXT_RUNTIME=nodejs"
    );

    const { migrateLegacyWorkspaceApps } = await import(
      "@/lib/migrate-workspace-apps"
    );
    await migrateLegacyWorkspaceApps();

    const { migratePostPagesSchema, migrateLegacyPostPageLinks } = await import(
      "@/lib/post-pages"
    );
    migratePostPagesSchema();
    await migrateLegacyPostPageLinks();

    const { migratePageCategoriesSchema } = await import("@/lib/page-categories");
    migratePageCategoriesSchema();

    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  } else {
    console.log(
      "[cron]",
      appTzNowLabel(),
      "instrumentation bỏ qua scheduler — runtime:",
      process.env.NEXT_RUNTIME
    );
  }
}
