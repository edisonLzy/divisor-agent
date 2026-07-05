import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("browser tool whitelist", () => {
  it("registers only approved read/navigation tools", () => {
    const source = readFileSync(join(import.meta.dirname, "../src/main.ts"), "utf8");
    const names = [...source.matchAll(/name: "(browser\/[^"]+)"/g)].map((match) => match[1]);
    expect(names).toEqual([
      "browser/open",
      "browser/navigate",
      "browser/tabs",
      "browser/page-info",
      "browser/snapshot",
      "browser/get",
      "browser/screenshot",
    ]);
    expect(names).not.toEqual(
      expect.arrayContaining(["browser/click", "browser/fill", "browser/type"]),
    );
  });
});
