import { describe, expect, it } from "vitest";

import { basename, parseFileHref } from "../file-href";

describe("parseFileHref", () => {
  it("parses a file:// link without line numbers", () => {
    expect(parseFileHref("file://src/foo.ts")).toEqual({
      endLine: undefined,
      line: undefined,
      path: "src/foo.ts",
    });
  });

  it("parses a file:// link with a single line", () => {
    expect(parseFileHref("file://src/foo.ts:42")).toEqual({
      endLine: undefined,
      line: 42,
      path: "src/foo.ts",
    });
  });

  it("parses a file:// link with a line range", () => {
    expect(parseFileHref("file://src/foo.ts:42-50")).toEqual({
      endLine: 50,
      line: 42,
      path: "src/foo.ts",
    });
  });

  it("parses an absolute path", () => {
    expect(parseFileHref("file:///abs/path/foo.ts:1")).toEqual({
      endLine: undefined,
      line: 1,
      path: "/abs/path/foo.ts",
    });
  });

  it("decodes URL-encoded characters in the path", () => {
    expect(parseFileHref("file://src/%E4%B8%AD%E6%96%87/foo.ts:1")).toEqual({
      endLine: undefined,
      line: 1,
      path: "src/中文/foo.ts",
    });
  });

  it("returns null for empty path", () => {
    expect(parseFileHref("file://")).toBeNull();
  });

  it("returns null for wrong scheme", () => {
    expect(parseFileHref("https://example.com/foo.ts:1")).toBeNull();
    expect(parseFileHref("file:/missing-slash/foo.ts:1")).toBeNull();
  });

  it("returns null for non-matching input", () => {
    expect(parseFileHref("")).toBeNull();
    expect(parseFileHref("file://:42")).toBeNull();
  });
});

describe("basename", () => {
  it("returns the last segment of a forward-slash path", () => {
    expect(basename("packages/app/src/foo.ts")).toBe("foo.ts");
  });

  it("returns the input if there is no slash", () => {
    expect(basename("foo.ts")).toBe("foo.ts");
  });

  it("handles absolute paths", () => {
    expect(basename("/abs/path/foo.ts")).toBe("foo.ts");
  });
});
