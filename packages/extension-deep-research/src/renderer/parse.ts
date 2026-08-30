import type {
  DeepResearchPhase,
  DeepResearchProgressBlockProps,
  ResearchUnitStatus,
} from "../common/types";

export function parseProgressProps(
  value: Record<string, unknown>,
): DeepResearchProgressBlockProps | null {
  if (typeof value.parentSessionId !== "string" || !Array.isArray(value.units)) return null;
  return {
    parentSessionId: value.parentSessionId,
    runId: typeof value.runId === "string" ? value.runId : "",
    phase: isPhase(value.phase) ? value.phase : "researching",
    iteration: typeof value.iteration === "number" ? value.iteration : 1,
    maxIterations: typeof value.maxIterations === "number" ? value.maxIterations : 2,
    brief: typeof value.brief === "string" ? value.brief : "",
    reflection: typeof value.reflection === "string" ? value.reflection : undefined,
    sourceCount: typeof value.sourceCount === "number" ? value.sourceCount : 0,
    reportArtifactId:
      typeof value.reportArtifactId === "string" ? value.reportArtifactId : undefined,
    units: value.units.filter(isRecord).flatMap((item) => {
      if (
        typeof item.id !== "string" ||
        typeof item.artifactId !== "string" ||
        typeof item.title !== "string" ||
        typeof item.question !== "string" ||
        !isUnitStatus(item.status)
      ) {
        return [];
      }
      return [
        {
          id: item.id,
          artifactId: item.artifactId,
          title: item.title,
          question: item.question,
          status: item.status,
          phase: typeof item.phase === "string" ? item.phase : undefined,
          sourceCount: typeof item.sourceCount === "number" ? item.sourceCount : 0,
          model: parseModel(item.model),
        },
      ];
    }),
  };
}

function parseModel(value: unknown) {
  if (!isRecord(value)) return undefined;
  if (typeof value.modelId !== "string" || typeof value.providerId !== "string") return undefined;
  return { modelId: value.modelId, providerId: value.providerId };
}

export function getStatusLabel(status: ResearchUnitStatus) {
  switch (status) {
    case "aborted":
      return "已取消";
    case "completed":
      return "完成";
    case "failed":
      return "失败";
    case "running":
      return "研究中";
    case "queued":
      return "排队";
  }
}

export function phaseLabel(phase: DeepResearchPhase) {
  switch (phase) {
    case "planning":
      return "规划中";
    case "researching":
      return "并行研究";
    case "reflecting":
      return "反思中";
    case "synthesizing":
      return "合成报告";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
  }
}

function isPhase(value: unknown): value is DeepResearchPhase {
  return (
    value === "planning" ||
    value === "researching" ||
    value === "reflecting" ||
    value === "synthesizing" ||
    value === "completed" ||
    value === "failed"
  );
}

function isUnitStatus(value: unknown): value is ResearchUnitStatus {
  return (
    value === "aborted" ||
    value === "completed" ||
    value === "failed" ||
    value === "queued" ||
    value === "running"
  );
}

export function cn(...values: Array<false | null | string | undefined>) {
  return values.filter(Boolean).join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
