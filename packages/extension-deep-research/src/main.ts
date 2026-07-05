import { defineMainExtension } from "@divisor-agent/extension-core/main";

import { DEEP_RESEARCH_EXTENSION } from "./common/extension";
import { DEEP_RESEARCH_TOOL_NAME } from "./common/types";
import { registerDeepResearchTool } from "./main/orchestrator";
import { registerWebTools } from "./main/web-tools";

const SYSTEM_PROMPT = `When the user asks for in-depth research on a topic, call ${DEEP_RESEARCH_TOOL_NAME} with a clear research topic. It will clarify scope with the user, break the topic into parallel sub-questions, run focused sub-researchers with web search, reflect, and synthesize a cited report. Do not call ${DEEP_RESEARCH_TOOL_NAME} from within a sub-researcher.`;

export default defineMainExtension({
  ...DEEP_RESEARCH_EXTENSION,
  setup(ctx) {
    ctx.systemPrompt.register({ id: "deep-research.prompt", content: SYSTEM_PROMPT });
    registerWebTools(ctx);
    registerDeepResearchTool(ctx);
  },
});
