import type { CDPClient } from "./cdp-client.js";

export async function captureJpegScreenshot(cdp: CDPClient, quality = 70): Promise<string> {
  const { data } = await cdp.captureScreenshot({ format: "jpeg", quality });
  return `data:image/jpeg;base64,${data}`;
}