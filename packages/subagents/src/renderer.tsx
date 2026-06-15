import { useExtensionsContextAPI } from "@divisor-agent/extension-core/renderer";
import { defineRendererExtension } from "@divisor-agent/extension-core/renderer";
import { Badge } from "@renderer/components/ui/badge";
import { ScrollArea } from "@renderer/components/ui/scroll-area";
import { cn } from "@renderer/lib/utils";
import { CheckCircleIcon, CircleIcon, LoaderCircleIcon, XCircleIcon } from "lucide-react";

import {
  SUBAGENTS_LIST_BLOCK_TYPE,
  SUBAGENTS_RUNTIME_ARTIFACT_TYPE,
  type SubagentRuntimeArtifactContent,
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
        <Badge variant="secondary">{block.subagents.length}</Badge>
      </div>
      <div className="flex flex-col gap-1">
        {block.subagents.map((subagent) => {
          const StatusIcon = getStatusIcon(subagent.status);
          return (
            <button
              key={subagent.id}
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => api.openArtifact(block.parentSessionId, subagent.artifactId)}
            >
              <StatusIcon
                className={cn(
                  "size-4 shrink-0 text-muted-foreground",
                  subagent.status === "running" && "animate-spin",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{subagent.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {getStatusLabel(subagent.status)}
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

function SubagentRuntimeArtifact({
  content,
}: {
  artifactId: string;
  content: Record<string, unknown>;
}) {
  const snapshot = parseArtifactContent(content);
  const subagent = snapshot?.subagents.find((item) => item.id === snapshot.activeSubagentId);

  if (!snapshot || !subagent) {
    return (
      <div className="rounded-md border border-border/70 bg-card/70 p-3 text-sm text-muted-foreground">
        No subagent runtime data.
      </div>
    );
  }

  const elapsed =
    subagent.startedAt && (subagent.completedAt || subagent.status === "running")
      ? Math.max(0, Math.floor(((subagent.completedAt ?? Date.now()) - subagent.startedAt) / 1000))
      : null;

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-1">
        <section className="rounded-md border border-border/70 bg-card/70 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate font-semibold text-base">{subagent.name}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{subagent.task}</p>
            </div>
            <Badge variant="secondary">{getStatusLabel(subagent.status)}</Badge>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div>
              <dt className="font-medium text-foreground">Phase</dt>
              <dd>{subagent.phase ?? "-"}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Elapsed</dt>
              <dd>{elapsed === null ? "-" : `${elapsed}s`}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Provider</dt>
              <dd>{subagent.model?.providerId ?? "-"}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Model</dt>
              <dd className="truncate">{subagent.model?.modelId ?? "-"}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-md border border-border/70 bg-card/70 p-3">
          <h3 className="mb-2 font-medium text-sm">Latest Output</h3>
          <pre className="whitespace-pre-wrap wrap-break-word text-sm leading-6 text-muted-foreground">
            {subagent.finalOutput || subagent.latestText || "Waiting for output..."}
          </pre>
        </section>

        {subagent.error ? (
          <section className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {subagent.error}
          </section>
        ) : null}

        <section className="rounded-md border border-border/70 bg-card/70 p-3">
          <h3 className="mb-2 font-medium text-sm">Tool Activity</h3>
          {subagent.toolEvents.length > 0 ? (
            <div className="flex flex-col gap-2">
              {subagent.toolEvents.map((tool) => (
                <div key={tool.id} className="rounded-md bg-muted/50 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{tool.name}</span>
                    <Badge variant="secondary">{tool.status}</Badge>
                  </div>
                  <pre className="mt-2 whitespace-pre-wrap wrap-break-word text-xs leading-5 text-muted-foreground">
                    {tool.outputPreview || tool.argsPreview}
                  </pre>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No tool activity yet.</p>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}

export default defineRendererExtension((ctx) => {
  ctx.slashCommands.register({
    id: "subagents.run",
    group: "Subagents",
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

  ctx.artifacts.register({
    type: SUBAGENTS_RUNTIME_ARTIFACT_TYPE,
    render: SubagentRuntimeArtifact,
  });
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
          name: item.name,
          phase: typeof item.phase === "string" ? item.phase : undefined,
          status: item.status,
          task: item.task,
        },
      ];
    }),
  };
}

function parseArtifactContent(
  value: Record<string, unknown>,
): SubagentRuntimeArtifactContent | null {
  if (
    typeof value.activeSubagentId !== "string" ||
    typeof value.parentSessionId !== "string" ||
    typeof value.runId !== "string" ||
    value.type !== SUBAGENTS_RUNTIME_ARTIFACT_TYPE ||
    !Array.isArray(value.subagents)
  ) {
    return null;
  }

  return value as unknown as SubagentRuntimeArtifactContent;
}

function getStatusIcon(status: SubagentStatus) {
  switch (status) {
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
  return value === "completed" || value === "failed" || value === "queued" || value === "running";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
