import { defineRendererExtension } from "@divisor-agent/extension-core/renderer";

import { DEEP_RESEARCH_EXTENSION } from "./common/extension";
import {
  DEEP_RESEARCH_PROGRESS_BLOCK_TYPE,
  DEEP_RESEARCH_REPORT_ARTIFACT_TYPE,
  DEEP_RESEARCH_TOOL_NAME,
  type DeepResearchReportContent,
} from "./common/types";
import { DeepResearchProgressBlock } from "./renderer/progress-block";
import { DeepResearchReportArtifact } from "./renderer/report-artifact";

export default defineRendererExtension({
  ...DEEP_RESEARCH_EXTENSION,
  setup(ctx) {
    ctx.slashCommands.register({
      id: "deep-research.run",
      group: "Extensions",
      name: "deep-research",
      description: "拆解主题并并行深度研究，生成带引用的报告",
      extra: "Deep Research",
      run({ editor, range }) {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent(`请对以下主题做深度研究（调用 ${DEEP_RESEARCH_TOOL_NAME}）：\n\n主题：`)
          .run();
      },
    });

    ctx.assistantBlocks.register({
      type: DEEP_RESEARCH_PROGRESS_BLOCK_TYPE,
      render: DeepResearchProgressBlock,
    });

    ctx.artifacts.register<DeepResearchReportContent>({
      type: DEEP_RESEARCH_REPORT_ARTIFACT_TYPE,
      render: DeepResearchReportArtifact,
    });
  },
});
