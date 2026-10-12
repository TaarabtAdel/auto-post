/** Chỉ dev local: bỏ qua đăng nhập, dùng user ADMIN (local@autopost.local). */
export function isAuthBypassEnabled(): boolean {
  return process.env.AUTH_BYPASS === "1";
}
