import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { TSchema } from "@sinclair/typebox";

export type ToolRiskLevel = "safe" | "medium" | "high";

export type AppTool<TParams extends TSchema = TSchema> = AgentTool<TParams> & {
  riskLevel?: ToolRiskLevel;
};
