import type { Usage } from "@earendil-works/pi-ai";
import {
  calculateEntryTokenUsage,
  getCurrentContextTokens,
} from "@renderer/pages/workspace/use-agent-token-usage";
import { describe, expect, it } from "vitest";

function usage(input: number, output: number, cacheRead = 0, cacheWrite = 0): Usage {
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens: input + output + cacheRead + cacheWrite,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

describe("agent token usage", () => {
  it("accumulates completed calls while retaining the latest call", () => {
    const first = usage(100, 20, 80, 0);
    const second = usage(30, 10, 190, 5);

    const initial = calculateEntryTokenUsage(undefined, first);
    const result = calculateEntryTokenUsage(initial, second);

    expect(result.turn).toMatchObject({
      input: 130,
      output: 30,
      cacheRead: 270,
      cacheWrite: 5,
    });
    expect(result.latestCall).toBe(second);
  });

  it("calculates context from only the latest call including cache and output", () => {
    const first = calculateEntryTokenUsage(undefined, usage(500, 40));
    const result = calculateEntryTokenUsage(first, usage(50, 25, 900, 10));

    expect(getCurrentContextTokens(result)).toBe(985);
  });
});
