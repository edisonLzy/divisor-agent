import type { Usage } from "@earendil-works/pi-ai";

export function addUsage(left: Usage, right: Usage): Usage {
  return {
    input: left.input + right.input,
    output: left.output + right.output,
    cacheRead: left.cacheRead + right.cacheRead,
    cacheWrite: left.cacheWrite + right.cacheWrite,
    totalTokens: left.totalTokens + right.totalTokens,
    cost: {
      input: left.cost.input + right.cost.input,
      output: left.cost.output + right.cost.output,
      cacheRead: left.cost.cacheRead + right.cost.cacheRead,
      cacheWrite: left.cost.cacheWrite + right.cost.cacheWrite,
      total: left.cost.total + right.cost.total,
    },
  };
}

export function getPromptTokens(usage: Usage): number {
  return usage.input + usage.cacheRead + usage.cacheWrite;
}

export function getCacheHitRate(usage: Usage): number | null {
  const promptTokens = getPromptTokens(usage);
  if (promptTokens === 0) return null;
  return usage.cacheRead / promptTokens;
}

export function formatTokenCount(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) {
    return `${stripTrailingZero((value / 1000).toFixed(1))}k`;
  }
  return `${stripTrailingZero((value / 1_000_000).toFixed(1))}m`;
}

export function formatPercentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function stripTrailingZero(value: string): string {
  return value.endsWith(".0") ? value.slice(0, -2) : value;
}
