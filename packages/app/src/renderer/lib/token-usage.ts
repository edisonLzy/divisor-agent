import type { AssistantMessage, Usage } from "@earendil-works/pi-ai";
import { addUsage, createEmptyUsage } from "@shared/token-usage";
import type { AppAssistantMessage } from "@shared/token-usage";

export interface SessionUsageSummary {
  latestRequestUsage?: Usage;
  sessionUsage: Usage;
}

export function withTurnUsage(message: AssistantMessage, baseUsage: Usage): AppAssistantMessage {
  return {
    ...message,
    turnUsage: addUsage(baseUsage, message.usage),
  };
}

export function summarizeUsage(messages: AppAssistantMessage[]): SessionUsageSummary {
  let latestRequestUsage: Usage | undefined;
  let sessionUsage = createEmptyUsage();

  for (const message of messages) {
    latestRequestUsage = message.usage;
    sessionUsage = addUsage(sessionUsage, message.turnUsage ?? message.usage);
  }

  return { latestRequestUsage, sessionUsage };
}

export function estimateDraftTokens(text: string): number {
  if (!text) return 0;

  let cjkCharacters = 0;
  for (const character of text) {
    if (
      /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(character)
    ) {
      cjkCharacters += 1;
    }
  }

  const nonCjkCharacters = Math.max(0, text.length - cjkCharacters);
  return Math.ceil(cjkCharacters + nonCjkCharacters / 4);
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
