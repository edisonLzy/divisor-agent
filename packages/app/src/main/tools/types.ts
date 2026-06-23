import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { TSchema } from "@earendil-works/pi-ai";

export type ToolRiskLevel = "safe" | "medium" | "high";

export type AppTool<TParams extends TSchema = TSchema> = AgentTool<TParams> & {
  riskLevel?: ToolRiskLevel;
};
