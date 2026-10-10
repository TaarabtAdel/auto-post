export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log(
      "[cron]",
      new Date().toISOString(),
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

    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  } else {
    console.log(
      "[cron]",
      new Date().toISOString(),
      "instrumentation bỏ qua scheduler — runtime:",
      process.env.NEXT_RUNTIME
    );
  }
}
