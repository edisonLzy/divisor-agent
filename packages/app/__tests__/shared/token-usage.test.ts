import type { Usage } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";

import {
  estimateDraftTokens,
  formatPercentage,
  formatTokenCount,
  summarizeUsage,
  withTurnUsage,
} from "../../src/renderer/lib/token-usage";
import {
  addUsage,
  createEmptyUsage,
  getCacheHitRate,
  getPromptTokens,
} from "../../src/shared/token-usage";

function createUsage(overrides: Partial<Usage> = {}): Usage {
  return {
    ...createEmptyUsage(),
    ...overrides,
    cost: {
      ...createEmptyUsage().cost,
      ...overrides.cost,
    },
  };
}

describe("token usage", () => {
  it("adds request and cost usage without mutating either input", () => {
    const first = createUsage({
      input: 100,
      output: 20,
      cacheRead: 50,
      totalTokens: 170,
      cost: { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 0, total: 3.5 },
    });
    const second = createUsage({
      input: 30,
      output: 10,
      cacheWrite: 5,
      totalTokens: 45,
      cost: { input: 0.3, output: 1, cacheRead: 0, cacheWrite: 0.2, total: 1.5 },
    });

    expect(addUsage(first, second)).toEqual({
      input: 130,
      output: 30,
      cacheRead: 50,
      cacheWrite: 5,
      totalTokens: 215,
      cost: { input: 1.3, output: 3, cacheRead: 0.5, cacheWrite: 0.2, total: 5 },
    });
    expect(first.totalTokens).toBe(170);
  });

  it("calculates prompt tokens and cache hit rate", () => {
    const usage = createUsage({ input: 30, cacheRead: 60, cacheWrite: 10 });

    expect(getPromptTokens(usage)).toBe(100);
    expect(getCacheHitRate(usage)).toBe(0.6);
    expect(getCacheHitRate(createEmptyUsage())).toBeNull();
  });

  it("keeps latest request usage while aggregating a visible assistant turn", () => {
    const first = createUsage({ input: 100, output: 20, totalTokens: 120 });
    const second = createUsage({ input: 150, output: 30, totalTokens: 180 });
    const firstMessage = withTurnUsage(
      {
        role: "assistant",
        content: [],
        api: "anthropic-messages",
        provider: "anthropic",
        model: "model-a",
        usage: first,
        stopReason: "toolUse",
        timestamp: 1,
      },
      createEmptyUsage(),
    );
    const secondMessage = withTurnUsage(
      {
        ...firstMessage,
        usage: second,
        stopReason: "stop",
        timestamp: 2,
      },
      firstMessage.turnUsage!,
    );

    const summary = summarizeUsage([secondMessage]);
    expect(summary.latestRequestUsage).toBe(second);
    expect(summary.sessionUsage.totalTokens).toBe(300);
  });

  it("formats compact values and estimates mixed-language drafts", () => {
    expect(formatTokenCount(999)).toBe("999");
    expect(formatTokenCount(1200)).toBe("1.2k");
    expect(formatTokenCount(12_000)).toBe("12k");
    expect(formatPercentage(0.678)).toBe("68%");
    expect(estimateDraftTokens("你好abcd")).toBe(3);
  });
});
