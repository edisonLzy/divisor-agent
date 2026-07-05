import type { ExtensionAgentEvent } from "@divisor-agent/extension-core/main";

import {
  WEB_FETCH_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  type ResearchSource,
  type ResearchTask,
  type ResearchUnitSnapshot,
} from "../common/types";

/** Build a queued sub-researcher snapshot from a planned task. */
export function createQueuedUnit(runId: string, task: ResearchTask): ResearchUnitSnapshot {
  const id = `${runId}-${task.id}`;
  return {
    id,
    artifactId: id,
    title: task.title,
    question: task.question,
    status: "queued",
    phase: "排队中",
    sourceCount: 0,
  };
}

/** Apply a sub-researcher agent event to its live snapshot. */
export function applyUnitEvent(unit: ResearchUnitSnapshot, event: ExtensionAgentEvent) {
  switch (event.type) {
    case "agent_start":
      unit.status = "running";
      unit.phase = "启动中";
      break;
    case "message_update": {
      const text = extractAssistantText(event.message);
      if (text) {
        unit.latestText = text;
        unit.phase = "分析中";
      }
      break;
    }
    case "tool_execution_start":
      unit.phase = `调用 ${event.toolName}`;
      if (event.toolName === WEB_SEARCH_TOOL_NAME || event.toolName === WEB_FETCH_TOOL_NAME) {
        unit.sourceCount += 1;
      }
      break;
    case "agent_end": {
      const stopReason = event.messages.reduce<string | undefined>((reason, message) => {
        if (!isRecord(message) || message.role !== "assistant") return reason;
        return typeof message.stopReason === "string" ? message.stopReason : reason;
      }, undefined);
      unit.status =
        stopReason === "aborted" ? "aborted" : stopReason === "error" ? "failed" : "completed";
      unit.phase =
        unit.status === "aborted" ? "已取消" : unit.status === "failed" ? "失败" : "完成";
      unit.finalOutput = extractFinalOutput(event.messages);
      break;
    }
  }
}

/** Parse "TITLE — URL" lines out of a unit's final output into global sources. */
export function harvestSources(unit: ResearchUnitSnapshot, sources: ResearchSource[]) {
  const text = unit.finalOutput ?? "";
  const urlRegex = /(https?:\/\/[^\s)]+)/g;
  const seen = new Set(sources.map((s) => s.url));
  for (const line of text.split("\n")) {
    const match = line.match(urlRegex);
    if (!match) continue;
    const url = match[0].replace(/[.,;]+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    const title =
      line
        .replace(url, "")
        .replace(/[—\-:•\d.[\]]/g, "")
        .trim() || url;
    sources.push({ id: sources.length + 1, title: title.slice(0, 120), url, snippet: "" });
  }
}

export function extractAssistantText(message: unknown): string {
  if (!isRecord(message) || message.role !== "assistant" || !Array.isArray(message.content)) {
    return "";
  }
  return message.content
    .filter(isRecord)
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => String(block.text))
    .join("\n");
}

export function extractFinalOutput(messages: unknown[]): string {
  const assistantMessages = messages.filter(
    (message) => isRecord(message) && message.role === "assistant",
  );
  const last = assistantMessages[assistantMessages.length - 1];
  return extractAssistantText(last);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
