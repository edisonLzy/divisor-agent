export const SUBAGENTS_TOOL_NAME = "subagents/run";
export const SUBAGENTS_LIST_BLOCK_TYPE = "subagents.list";
export const SUBAGENTS_RUNTIME_ARTIFACT_TYPE = "subagents.runtime";

export type SubagentStatus = "completed" | "failed" | "queued" | "running";
export type SubagentToolStatus = "done" | "error" | "running";

export interface SubagentTaskInput {
  name: string;
  task: string;
}

export interface SubagentToolEvent {
  argsPreview: string;
  completedAt?: number;
  id: string;
  name: string;
  outputPreview?: string;
  startedAt: number;
  status: SubagentToolStatus;
}

export interface SubagentSnapshot {
  artifactId: string;
  completedAt?: number;
  error?: string;
  finalOutput?: string;
  id: string;
  latestText?: string;
  model?: {
    modelId: string;
    providerId: string;
  };
  name: string;
  phase?: string;
  startedAt?: number;
  status: SubagentStatus;
  task: string;
  toolEvents: SubagentToolEvent[];
}

export interface SubagentRuntimeArtifactContent extends SubagentRuntimeSnapshot {
  activeSubagentId: string;
}

export interface SubagentRuntimeSnapshot {
  assistantBlock: {
    props: SubagentsListBlockProps;
    type: typeof SUBAGENTS_LIST_BLOCK_TYPE;
  };
  artifacts: Array<{
    content: SubagentRuntimeArtifactContent;
    id: string;
    name: string;
    type: typeof SUBAGENTS_RUNTIME_ARTIFACT_TYPE;
  }>;
  parentSessionId: string;
  runId: string;
  subagents: SubagentSnapshot[];
  type: typeof SUBAGENTS_RUNTIME_ARTIFACT_TYPE;
}

export interface SubagentsListBlockProps {
  parentSessionId: string;
  runId: string;
  subagents: Array<{
    artifactId: string;
    id: string;
    name: string;
    phase?: string;
    status: SubagentStatus;
    task: string;
  }>;
}
