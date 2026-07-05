import type { AssistantMessage, Usage } from "@earendil-works/pi-ai";

export interface AppAssistantMessage extends AssistantMessage {
  turnUsage?: Usage;
}

export interface ContextUsageBreakdown {
  conversation: number;
  systemPrompt: number;
  toolDefinitions: number;
  toolResults: number;
}

export interface ContextUsageSnapshot {
  breakdown: ContextUsageBreakdown;
  contextWindow: number;
  estimated: boolean;
  usedTokens: number;
}

export function createEmptyUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

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
