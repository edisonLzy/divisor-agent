import { describe, expect, it } from "vitest";

import { BrowserOperationError, normalizeBrowserUrl } from "../src/main/url";

describe("normalizeBrowserUrl", () => {
  it("adds https to host-like input", () => {
    expect(normalizeBrowserUrl("example.com/path")).toBe("https://example.com/path");
  });

  it.each(["file:///etc/passwd", "javascript:alert(1)", "data:text/html,nope"])(
    "rejects privileged URL %s",
    (url) => {
      expect(() => normalizeBrowserUrl(url)).toThrowError(BrowserOperationError);
      try {
        normalizeBrowserUrl(url);
      } catch (error) {
        expect((error as BrowserOperationError).code).toBe("browser_invalid_url");
      }
    },
  );
});
