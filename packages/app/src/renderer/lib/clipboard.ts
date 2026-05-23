export async function copyTextToClipboard(text: string) {
  if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
    throw new Error("Clipboard API not available");
  }

  await navigator.clipboard.writeText(text);
}
