import { describe, expect, it } from "vitest";

import { computeEditorPosition } from "../src/renderer/annotation-editor-position";

describe("computeEditorPosition", () => {
  it("places the editor below the marker when there is room", () => {
    const pos = computeEditorPosition({
      anchorX: 200,
      anchorY: 100,
      cardHeight: 220,
      viewportHeight: 800,
      viewportWidth: 1200,
    });
    // Centered on the anchor (anchor + 12 - width/2), top = anchor + gap.
    expect(pos.top).toBe(108);
    expect(pos.left).toBeGreaterThan(0);
  });

  it("flips above the marker when below would overflow the viewport", () => {
    const pos = computeEditorPosition({
      anchorX: 200,
      anchorY: 700,
      cardHeight: 220,
      viewportHeight: 800,
      viewportWidth: 1200,
    });
    // 700 + 8 + 220 = 928 > 800 - 8, so flip: top = 700 - 220 - 8 = 472.
    expect(pos.top).toBe(472);
  });

  it("clamps left into the viewport when the anchor is near the right edge", () => {
    const pos = computeEditorPosition({
      anchorX: 1190,
      anchorY: 100,
      cardHeight: 220,
      viewportHeight: 800,
      viewportWidth: 1200,
    });
    // Width 352: right edge would exceed 1192, so clamp to 1200 - 352 - 8 = 840.
    expect(pos.left).toBe(840);
  });

  it("clamps left to the margin when the anchor is near the left edge", () => {
    const pos = computeEditorPosition({
      anchorX: 0,
      anchorY: 100,
      cardHeight: 220,
      viewportHeight: 800,
      viewportWidth: 1200,
    });
    expect(pos.left).toBe(8);
  });

  it("keeps top at the margin when both below and above would overflow", () => {
    const pos = computeEditorPosition({
      anchorX: 200,
      anchorY: 50,
      cardHeight: 600,
      viewportHeight: 400,
      viewportWidth: 1200,
    });
    // Below: 50 + 8 + 600 = 658 > 392 -> flip. Above: 50 - 600 - 8 = -558 -> clamp to 8.
    expect(pos.top).toBe(8);
  });
});
