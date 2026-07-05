// Tool names
export const DEEP_RESEARCH_TOOL_NAME = "deep-research/run";
export const WEB_SEARCH_TOOL_NAME = "web/search";
export const WEB_FETCH_TOOL_NAME = "web/fetch";

// Assistant block + artifact types
export const DEEP_RESEARCH_PROGRESS_BLOCK_TYPE = "deep-research.progress";
export const DEEP_RESEARCH_REPORT_ARTIFACT_TYPE = "deep-research.report";

// Concurrency / iteration limits
export const MAX_RESEARCH_UNITS = 4;
export const MAX_RESEARCH_ITERATIONS = 2;

/** High-level phase of the whole deep-research run. */
export type DeepResearchPhase =
  | "planning"
  | "researching"
  | "reflecting"
  | "synthesizing"
  | "completed"
  | "failed";

/** Status of a single sub-researcher unit. */
export type ResearchUnitStatus = "aborted" | "completed" | "failed" | "queued" | "running";

/** A planned research sub-task, produced by the planning step. */
export interface ResearchTask {
  id: string;
  title: string;
  question: string;
}

/** Live snapshot of a single sub-researcher. */
export interface ResearchUnitSnapshot {
  id: string;
  artifactId: string;
  title: string;
  question: string;
  status: ResearchUnitStatus;
  phase?: string;
  sourceCount: number;
  latestText?: string;
  finalOutput?: string;
  error?: string;
  model?: {
    modelId: string;
    providerId: string;
  };
}

/** A source discovered during research (for citation + provenance). */
export interface ResearchSource {
  id: number;
  title: string;
  url: string;
  snippet: string;
}

/** Progress snapshot pushed to the assistant block on every update. */
export interface DeepResearchProgressSnapshot {
  type: "deep-research.progress";
  parentSessionId: string;
  runId: string;
  phase: DeepResearchPhase;
  iteration: number;
  maxIterations: number;
  brief: string;
  reflection?: string;
  sourceCount: number;
  reportArtifactId?: string;
  units: ResearchUnitSnapshot[];
  assistantBlock: {
    type: typeof DEEP_RESEARCH_PROGRESS_BLOCK_TYPE;
    props: DeepResearchProgressBlockProps;
  };
}

/** Props consumed by the renderer progress block. */
export interface DeepResearchProgressBlockProps {
  parentSessionId: string;
  runId: string;
  phase: DeepResearchPhase;
  iteration: number;
  maxIterations: number;
  brief: string;
  reflection?: string;
  sourceCount: number;
  reportArtifactId?: string;
  units: Array<{
    id: string;
    artifactId: string;
    title: string;
    question: string;
    status: ResearchUnitStatus;
    phase?: string;
    sourceCount: number;
    model?: { modelId: string; providerId: string };
  }>;
}

/** Content stored in the final report artifact. */
export interface DeepResearchReportContent {
  title: string;
  brief: string;
  markdown: string;
  sources: ResearchSource[];
  iterations: number;
  generatedAt?: number;
}
