/**
 * Copy text — hoạt động cả trên HTTP (VPS không HTTPS).
 * Clipboard API chỉ chạy trong secure context (HTTPS / localhost).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  if (
    typeof navigator !== "undefined" &&
    window.isSecureContext &&
    navigator.clipboard?.writeText
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fallback */
    }
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.width = "2em";
    ta.style.height = "2em";
    ta.style.padding = "0";
    ta.style.border = "none";
    ta.style.outline = "none";
    ta.style.boxShadow = "none";
    ta.style.background = "transparent";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
