export async function copyTextToClipboard(text: string) {
  if (typeof window === "undefined") throw new Error("Clipboard API not available");

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Electron windows can reject the async Clipboard API when the document
      // is not considered focused. Fall through to the synchronous fallback.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard API not available");
}
