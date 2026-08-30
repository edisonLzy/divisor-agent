import type { MainExtensionContext } from "@divisor-agent/extension-core/main";
import { Type } from "@earendil-works/pi-ai";

import {
  DEEP_RESEARCH_PROGRESS_BLOCK_TYPE,
  DEEP_RESEARCH_REPORT_ARTIFACT_TYPE,
  DEEP_RESEARCH_TOOL_NAME,
  MAX_RESEARCH_ITERATIONS,
  MAX_RESEARCH_UNITS,
  WEB_FETCH_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  type DeepResearchPhase,
  type DeepResearchProgressSnapshot,
  type DeepResearchReportContent,
  type ResearchSource,
  type ResearchUnitSnapshot,
} from "../common/types";
import { planTasks } from "./planning";
import { synthesizeReport } from "./synthesis";
import { applyUnitEvent, createQueuedUnit, harvestSources } from "./unit-events";

const SUBAGENT_SEARCH_PROMPT = `You are a focused research sub-agent. Investigate ONLY your assigned question.

Use ${WEB_SEARCH_TOOL_NAME} to find relevant sources and ${WEB_FETCH_TOOL_NAME} to read the most promising ones. Base every claim on retrieved sources. When done, produce a concise findings summary (200-400 words) followed by a "Sources:" list of the URLs you actually used, one per line as "TITLE — URL".

Your question:
`;

/** Register the `deep-research/run` orchestration tool. */
export function registerDeepResearchTool(ctx: MainExtensionContext) {
  ctx.tools.register({
    name: DEEP_RESEARCH_TOOL_NAME,
    label: "Deep Research",
    description:
      "Run a multi-agent deep research: clarify scope, plan sub-questions, research them in parallel with web search, reflect, and synthesize a cited report.",
    executionMode: "sequential",
    parameters: Type.Object({
      topic: Type.String({ description: "The research topic or question." }),
      skipClarification: Type.Optional(
        Type.Boolean({ description: "Skip the clarification step (default false)." }),
      ),
    }),
    async execute(toolCallId, args, signal, onUpdate) {
      const topic = String((args as { topic?: unknown }).topic ?? "").trim();
      if (!topic) throw new Error("deep-research/run requires a non-empty topic.");
      const skipClarification = Boolean(
        (args as { skipClarification?: unknown }).skipClarification,
      );

      const currentContext = ctx.extensionRuntime.getCurrentAgentContext();
      const parentSessionId = currentContext?.sessionId ?? "unknown-session";
      const runId = `deep-research-${toolCallId}`;
      const reportArtifactId = `${runId}-report`;

      const state = {
        phase: "planning" as DeepResearchPhase,
        iteration: 1,
        brief: topic,
        reflection: undefined as string | undefined,
        units: [] as ResearchUnitSnapshot[],
        sources: [] as ResearchSource[],
      };

      const buildSnapshot = (): DeepResearchProgressSnapshot => {
        const units = state.units.map((u) => ({
          id: u.id,
          artifactId: u.artifactId,
          title: u.title,
          question: u.question,
          status: u.status,
          phase: u.phase,
          sourceCount: u.sourceCount,
          model: u.model,
        }));
        const reportId = state.phase === "completed" ? reportArtifactId : undefined;
        return {
          type: "deep-research.progress",
          parentSessionId,
          runId,
          phase: state.phase,
          iteration: state.iteration,
          maxIterations: MAX_RESEARCH_ITERATIONS,
          brief: state.brief,
          reflection: state.reflection,
          sourceCount: state.sources.length,
          reportArtifactId: reportId,
          units,
          assistantBlock: {
            type: DEEP_RESEARCH_PROGRESS_BLOCK_TYPE,
            props: {
              parentSessionId,
              runId,
              phase: state.phase,
              iteration: state.iteration,
              maxIterations: MAX_RESEARCH_ITERATIONS,
              brief: state.brief,
              reflection: state.reflection,
              sourceCount: state.sources.length,
              reportArtifactId: reportId,
              units,
            },
          },
        };
      };

      const publish = () => {
        onUpdate?.({
          content: [{ type: "text", text: summarizeProgress(state) }],
          details: buildSnapshot(),
        });
      };

      // ---------- 1. CLARIFY ----------
      if (!skipClarification) {
        try {
          const clarification = await ctx.extensionRuntime.askUserQuestion({
            questions: [
              {
                header: "范围",
                question: `研究「${topic}」时，希望聚焦哪个方向？`,
                options: [
                  { label: "最新进展", description: "聚焦最近 1-2 年的新动态与突破" },
                  { label: "全面综述", description: "覆盖背景、现状与趋势的系统梳理" },
                  { label: "对比分析", description: "对主要方案/玩家做横向对比" },
                ],
                multiSelect: false,
              },
            ],
          });
          const answer = clarification.answers[0];
          const focus = answer?.customAnswer || answer?.selectedOptions.join("、") || "";
          if (focus) state.brief = `${topic}（聚焦：${focus}）`;
          if (clarification.additionalNote)
            state.brief += `\n补充：${clarification.additionalNote}`;
        } catch {
          // user cancelled / not available — proceed with the raw topic
        }
      }

      publish();

      // ---------- 2. PLAN ----------
      const tasks = planTasks(state.brief);
      state.units = tasks.map((task) => createQueuedUnit(runId, task));
      for (const unit of state.units) unit.model = currentContext?.model;
      state.phase = "researching";
      publish();

      // ---------- 3. RESEARCH (parallel) ----------
      await runResearchRound(state.units);

      // ---------- 4. REFLECT (one extra round for weak units) ----------
      if (state.iteration < MAX_RESEARCH_ITERATIONS && !signal?.aborted) {
        const gaps = state.units.filter((u) => u.status === "failed" || u.sourceCount < 2);
        if (gaps.length > 0) {
          state.phase = "reflecting";
          state.reflection = `部分子任务证据不足（${gaps
            .map((g) => g.title)
            .join("、")}），追加一轮针对性搜索。`;
          publish();
          state.iteration += 1;
          state.phase = "researching";
          publish();
          for (const unit of gaps) {
            unit.status = "queued";
            unit.phase = "重新研究";
            unit.finalOutput = undefined;
            unit.error = undefined;
          }
          await runResearchRound(gaps);
        }
      }

      // ---------- 5. SYNTHESIZE ----------
      state.phase = "synthesizing";
      state.reflection = "证据已充分，正在合成最终报告。";
      publish();

      const report = synthesizeReport(state.brief, state.units, state.sources);
      state.phase = "completed";
      publish();

      const reportContent: DeepResearchReportContent = {
        title: report.title,
        brief: state.brief,
        markdown: report.markdown,
        sources: state.sources,
        iterations: state.iteration,
      };

      return {
        content: [{ type: "text", text: report.summary }],
        details: {
          ...buildSnapshot(),
          artifacts: [
            {
              id: reportArtifactId,
              type: DEEP_RESEARCH_REPORT_ARTIFACT_TYPE,
              name: report.title,
              content: reportContent,
            },
          ],
        },
      };

      // ---------- run-scoped helpers ----------
      async function runResearchRound(units: ResearchUnitSnapshot[]) {
        const active = units.slice(0, MAX_RESEARCH_UNITS);
        await Promise.all(active.map((unit) => runUnit(unit)));
      }

      async function runUnit(unit: ResearchUnitSnapshot) {
        if (signal?.aborted) {
          unit.status = "aborted";
          unit.phase = "已取消";
          publish();
          return;
        }
        const agent = await ctx.extensionRuntime.createAgent({
          id: `${unit.id}-${state.iteration}`,
          label: unit.title,
          mode: "inherit-model",
          scope: "side-chat",
          systemPrompt: SUBAGENT_SEARCH_PROMPT + unit.question,
          tools: {
            excludeToolNames: [DEEP_RESEARCH_TOOL_NAME, "fs/write_text_file", "terminal/create"],
            includeBuiltins: true,
            includeExtensions: true,
          },
        });

        const unsubscribe = ctx.extensionRuntime.subscribeAgentEvents(agent.id, (event) => {
          applyUnitEvent(unit, event);
          publish();
        });
        const abort = () => void ctx.extensionRuntime.abortAgent(agent.id);
        signal?.addEventListener("abort", abort, { once: true });

        try {
          await ctx.extensionRuntime.promptAgent(agent.id, {
            role: "user",
            content: unit.question,
            timestamp: 0,
            kind: "prompt",
            jsonContent: {
              type: "doc",
              content: [{ type: "paragraph", content: [{ type: "text", text: unit.question }] }],
            },
          });
        } catch (error) {
          unit.status = "failed";
          unit.error = error instanceof Error ? error.message : String(error);
          unit.phase = "失败";
          publish();
        } finally {
          signal?.removeEventListener("abort", abort);
          unsubscribe();
          await ctx.extensionRuntime.destroyAgent(agent.id);
          harvestSources(unit, state.sources);
          publish();
        }
      }
    },
  });
}

function summarizeProgress(state: {
  phase: DeepResearchPhase;
  units: ResearchUnitSnapshot[];
  sources: ResearchSource[];
}): string {
  const done = state.units.filter((u) => u.status === "completed").length;
  const phaseLabel: Record<DeepResearchPhase, string> = {
    planning: "规划中",
    researching: "并行研究中",
    reflecting: "反思中",
    synthesizing: "合成报告中",
    completed: "已完成",
    failed: "失败",
  };
  return `Deep Research [${phaseLabel[state.phase]}] · ${done}/${state.units.length} 子任务完成 · ${state.sources.length} 来源`;
}
