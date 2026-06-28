import {
  defineRendererExtension,
  useExtensionsContextAPI,
} from "@divisor-agent/extension-core/renderer";
import {
  CheckCircleIcon,
  CircleIcon,
  LoaderCircleIcon,
  OctagonXIcon,
  XCircleIcon,
} from "lucide-react";

import { SUBAGENTS_EXTENSION } from "./extension";
import {
  SUBAGENTS_LIST_BLOCK_TYPE,
  type SubagentsListBlockProps,
  type SubagentStatus,
} from "./types";

function SubagentsListBlock({ props }: { props: Record<string, unknown> }) {
  const api = useExtensionsContextAPI();
  const block = parseListBlockProps(props);

  if (!block) {
    return null;
  }

  return (
    <div className="not-prose rounded-md border border-border/70 bg-card/70 p-2 text-sm text-card-foreground">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <span className="font-medium">Subagents</span>
        <span className="inline-flex shrink-0 items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {block.subagents.length}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {block.subagents.map((subagent) => {
          const status = subagent.status;
          const StatusIcon = getStatusIcon(status);
          return (
            <button
              key={subagent.id}
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                api.upsertArtifact(block.parentSessionId, {
                  id: subagent.artifactId,
                  type: "side-chat",
                  content: {},
                  name: subagent.name,
                });
                api.appendSideChatMeta(subagent.artifactId, {
                  context: {
                    runId: block.runId,
                    subagentId: subagent.id,
                    task: subagent.task,
                  },
                  inputDisabled: true,
                  mainSessionId: block.parentSessionId,
                  model: subagent.model,
                  pendingPrompt: subagent.task,
                });
                api.insertSideChatUserMessageEntry(subagent.artifactId, { text: subagent.task }, 0);
                api.openArtifact(block.parentSessionId, subagent.artifactId);
              }}
            >
              <StatusIcon
                className={cn(
                  "size-4 shrink-0 text-muted-foreground",
                  status === "running" && "animate-spin",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{subagent.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {getStatusLabel(status)}
                  </span>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {subagent.phase || subagent.task}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default defineRendererExtension({
  ...SUBAGENTS_EXTENSION,
  setup(ctx) {
    ctx.slashCommands.register({
      id: "subagents.run",
      group: "Skills",
      name: "subagent",
      description: "Use subagents to run focused tasks in parallel",
      extra: "Parallel agents",
      run({ editor, range }) {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent(
            "Use subagents to run this in parallel. Split the work into focused subagents, call subagents/run, then merge their findings into one final answer.\n\nTask: ",
          )
          .run();
      },
    });

    ctx.assistantBlocks.register({
      type: SUBAGENTS_LIST_BLOCK_TYPE,
      render: SubagentsListBlock,
    });
  },
});

function parseListBlockProps(value: Record<string, unknown>): SubagentsListBlockProps | null {
  if (typeof value.parentSessionId !== "string" || !Array.isArray(value.subagents)) {
    return null;
  }

  return {
    parentSessionId: value.parentSessionId,
    runId: typeof value.runId === "string" ? value.runId : "",
    subagents: value.subagents.filter(isRecord).flatMap((item) => {
      if (
        typeof item.id !== "string" ||
        typeof item.artifactId !== "string" ||
        typeof item.name !== "string" ||
        typeof item.task !== "string" ||
        !isSubagentStatus(item.status)
      ) {
        return [];
      }

      return [
        {
          artifactId: item.artifactId,
          id: item.id,
          model: parseModel(item.model),
          name: item.name,
          phase: typeof item.phase === "string" ? item.phase : undefined,
          status: item.status,
          task: item.task,
        },
      ];
    }),
  };
}

function parseModel(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  if (typeof value.modelId !== "string" || typeof value.providerId !== "string") {
    return undefined;
  }

  return {
    modelId: value.modelId,
    providerId: value.providerId,
  };
}

function getStatusIcon(status: SubagentStatus) {
  switch (status) {
    case "aborted":
      return OctagonXIcon;
    case "completed":
      return CheckCircleIcon;
    case "failed":
      return XCircleIcon;
    case "running":
      return LoaderCircleIcon;
    case "queued":
      return CircleIcon;
  }
}

function getStatusLabel(status: SubagentStatus) {
  switch (status) {
    case "aborted":
      return "Aborted";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "running":
      return "Running";
    case "queued":
      return "Queued";
  }
}

function isSubagentStatus(value: unknown): value is SubagentStatus {
  return (
    value === "aborted" ||
    value === "completed" ||
    value === "failed" ||
    value === "queued" ||
    value === "running"
  );
}

function cn(...values: Array<false | null | string | undefined>) {
  return values.filter(Boolean).join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
