import { defineMainExtension } from "@divisor-agent/extension-core/main";
import type { ExtensionAgentEvent } from "@divisor-agent/extension-core/main";
import { Type } from "@sinclair/typebox";

import {
  SUBAGENTS_LIST_BLOCK_TYPE,
  SUBAGENTS_TOOL_NAME,
  type SubagentRuntimeSnapshot,
  type SubagentSnapshot,
  type SubagentTaskInput,
} from "./types";

const MAX_SUBAGENTS = 4;

export default defineMainExtension((ctx) => {
  ctx.systemPrompt.register({
    id: "subagents.prompt",
    content: `When a task benefits from parallel focused investigation, call ${SUBAGENTS_TOOL_NAME}. Give each subagent a short descriptive name and a specific task. Do not call ${SUBAGENTS_TOOL_NAME} recursively from a subagent.`,
  });

  ctx.tools.register({
    name: SUBAGENTS_TOOL_NAME,
    label: "Run Subagents",
    description: "Run one or more focused subagents in parallel and return their findings.",
    executionMode: "sequential",
    parameters: Type.Object({
      tasks: Type.Array(
        Type.Object({
          name: Type.String({ description: "Short human-readable subagent name." }),
          task: Type.String({ description: "Specific task for this subagent." }),
        }),
        {
          maxItems: MAX_SUBAGENTS,
          minItems: 1,
        },
      ),
    }),
    async execute(toolCallId, args, signal, onUpdate) {
      const tasks = normalizeTasks(args.tasks);
      const currentContext = ctx.runtime.getCurrentAgentContext();
      const parentSessionId = currentContext?.sessionId ?? "unknown-session";
      const runId = `subagents-${toolCallId}`;
      const snapshots = tasks.map((task, index) => createQueuedSnapshot(runId, index, task));
      for (const subagent of snapshots) {
        subagent.model = currentContext?.model;
      }
      let snapshot = createRuntimeSnapshot(parentSessionId, runId, snapshots);

      const publish = () => {
        snapshot = createRuntimeSnapshot(parentSessionId, runId, snapshots);
        onUpdate?.({
          content: [{ type: "text", text: summarizeProgress(snapshots) }],
          details: snapshot,
        });
      };

      publish();

      await Promise.all(
        snapshots.map(async (subagent) => {
          const agent = await ctx.runtime.createAgent({
            id: subagent.id,
            label: subagent.name,
            mode: "inherit-model",
            scope: "side-chat",
            systemPrompt: buildSubagentSystemPrompt(subagent),
            tools: {
              excludeToolNames: [SUBAGENTS_TOOL_NAME, "fs/write_text_file", "terminal/create"],
              includeBuiltins: true,
              includeExtensions: true,
            },
          });

          const unsubscribe = ctx.runtime.subscribeAgentEvents(agent.id, (event) => {
            applyRuntimeEvent(subagent, event);
            publish();
          });
          const abort = () => void ctx.runtime.abortAgent(agent.id);

          signal?.addEventListener("abort", abort, { once: true });

          try {
            await ctx.runtime.promptAgent(agent.id, subagent.task);
          } catch (error) {
            subagent.status = "failed";
            subagent.completedAt = Date.now();
            subagent.error = error instanceof Error ? error.message : String(error);
            publish();
          } finally {
            signal?.removeEventListener("abort", abort);
            unsubscribe();
            await ctx.runtime.destroyAgent(agent.id);
          }
        }),
      );

      snapshot = createRuntimeSnapshot(parentSessionId, runId, snapshots);
      return {
        content: [{ type: "text", text: summarizeFinal(snapshots) }],
        details: snapshot,
      };
    },
  });
});

function normalizeTasks(value: unknown): SubagentTaskInput[] {
  const tasks = Array.isArray(value) ? value : [];
  const normalized = tasks.slice(0, MAX_SUBAGENTS).map((item, index) => {
    const record = isRecord(item) ? item : {};
    const name = String(record.name ?? `subagent-${index + 1}`).trim();
    const task = String(record.task ?? "").trim();

    return {
      name: name || `subagent-${index + 1}`,
      task,
    };
  });

  if (normalized.length === 0 || normalized.some((task) => task.task.length === 0)) {
    throw new Error("subagents/run requires 1-4 tasks, each with a non-empty task field");
  }

  return normalized;
}

function createQueuedSnapshot(
  runId: string,
  index: number,
  task: SubagentTaskInput,
): SubagentSnapshot {
  const id = `${runId}-${index}`;
  return {
    artifactId: id,
    id,
    name: task.name,
    phase: "Queued",
    status: "queued",
    task: task.task,
    toolEvents: [],
  };
}

function createRuntimeSnapshot(
  parentSessionId: string,
  runId: string,
  subagents: SubagentSnapshot[],
): SubagentRuntimeSnapshot {
  const listSubagents = subagents.map(({ artifactId, id, model, name, phase, status, task }) => ({
    artifactId,
    id,
    model,
    name,
    phase,
    status,
    task,
  }));

  return {
    assistantBlock: {
      props: {
        parentSessionId,
        runId,
        subagents: listSubagents,
      },
      type: SUBAGENTS_LIST_BLOCK_TYPE,
    },
    parentSessionId,
    runId,
    subagents: listSubagents,
    type: "subagents.runtime",
  };
}

function applyRuntimeEvent(subagent: SubagentSnapshot, event: ExtensionAgentEvent) {
  switch (event.type) {
    case "agent_start": {
      subagent.status = "running";
      subagent.phase = "Starting";
      subagent.startedAt = Date.now();
      break;
    }
    case "message_update": {
      const text = extractAssistantText(event.message);
      if (text) {
        subagent.latestText = text;
        subagent.phase = "Thinking";
      }
      break;
    }
    case "tool_execution_start": {
      subagent.phase = `Using ${event.toolName}`;
      subagent.toolEvents.push({
        argsPreview: preview(event.args),
        id: event.toolCallId,
        name: event.toolName,
        startedAt: Date.now(),
        status: "running",
      });
      break;
    }
    case "tool_execution_update": {
      const tool = subagent.toolEvents.find((item) => item.id === event.toolCallId);
      if (tool) {
        tool.outputPreview = preview(event.partialResult);
      }
      break;
    }
    case "tool_execution_end": {
      const tool = subagent.toolEvents.find((item) => item.id === event.toolCallId);
      if (tool) {
        tool.completedAt = Date.now();
        tool.outputPreview = preview(event.result);
        tool.status = event.isError ? "error" : "done";
      }
      break;
    }
    case "agent_end": {
      const stopReason = event.messages.reduce<string | undefined>((reason, message) => {
        if (!isRecord(message) || message.role !== "assistant") return reason;
        return typeof message.stopReason === "string" ? message.stopReason : reason;
      }, undefined);
      subagent.status =
        stopReason === "aborted" ? "aborted" : stopReason === "error" ? "failed" : "completed";
      subagent.phase =
        subagent.status === "aborted"
          ? "Aborted"
          : subagent.status === "failed"
            ? "Failed"
            : "Completed";
      subagent.completedAt = Date.now();
      subagent.finalOutput = extractFinalOutput(event.messages);
      break;
    }
  }
}

function buildSubagentSystemPrompt(subagent: SubagentSnapshot) {
  return `You are a focused subagent named "${subagent.name}".

Work only on this task:
${subagent.task}

Keep your work scoped. Use tools when useful. Finish with a concise result that the parent agent can merge with other subagent findings.`;
}

function summarizeProgress(subagents: SubagentSnapshot[]) {
  const completed = subagents.filter((item) => item.status === "completed").length;
  const failed = subagents.filter((item) => item.status === "failed").length;
  return `Subagents running: ${completed}/${subagents.length} completed${failed ? `, ${failed} failed` : ""}.`;
}

function summarizeFinal(subagents: SubagentSnapshot[]) {
  return subagents
    .map((subagent) => {
      const body = subagent.error ?? subagent.finalOutput ?? subagent.latestText ?? "No output.";
      return `## ${subagent.name}\nStatus: ${subagent.status}\n\n${body}`;
    })
    .join("\n\n");
}

function extractAssistantText(message: unknown) {
  if (!isRecord(message) || message.role !== "assistant" || !Array.isArray(message.content)) {
    return "";
  }

  return message.content
    .filter(isRecord)
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => String(block.text))
    .join("\n");
}

function extractFinalOutput(messages: unknown[]) {
  const assistantMessages = messages.filter(
    (message) => isRecord(message) && message.role === "assistant",
  );
  const last = assistantMessages[assistantMessages.length - 1];
  return extractAssistantText(last);
}

function preview(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > 600 ? `${text.slice(0, 600)}...` : text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
