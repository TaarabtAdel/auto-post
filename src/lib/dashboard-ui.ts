/** Class Tailwind dùng chung cho các màn dashboard (giữ bố cục, đồng bộ cảm giác). */
export const ui = {
  pageHeader: "mb-6",
  pageTitle: "text-2xl font-bold text-gray-900 tracking-tight",
  pageDesc: "text-sm text-gray-600 mt-1 max-w-3xl",

  card: "bg-white border border-gray-200 rounded-xl",
  cardPad: "p-6",
  cardPadSm: "p-4",

  input:
    "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500",
  select:
    "px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500",
  textarea:
    "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 resize-y placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500",

  btnPrimary:
    "inline-flex items-center justify-center bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors",
  btnSecondary:
    "inline-flex items-center justify-center border border-gray-300 bg-white text-gray-800 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors",
  btnSuccess:
    "inline-flex items-center justify-center bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors",
  btnSm:
    "inline-flex items-center justify-center text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-50 transition-colors",
  btnSmPrimary:
    "inline-flex items-center justify-center text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors",

  alertError: "bg-red-50 text-red-700 border border-red-100 px-4 py-3 rounded-lg text-sm",
  alertSuccess:
    "bg-green-50 text-green-800 border border-green-100 px-4 py-3 rounded-lg text-sm",
  hint: "text-xs text-gray-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2",

  tableShell: "bg-white border border-gray-200 rounded-xl overflow-hidden",
  tableHead: "bg-gray-50 text-gray-600 text-left text-sm border-b border-gray-200",
  th: "px-4 py-3 font-medium",
  td: "px-4 py-3 text-sm text-gray-900",
} as const;
