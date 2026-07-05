import type { ResearchTask } from "../common/types";

/**
 * Break a research brief into parallel sub-questions.
 *
 * This is a deterministic decomposition scaffold. A production build can
 * replace it with a `submit_research_plan` tool-call so the model owns the
 * decomposition (pi-ai has no native structured output).
 */
export function planTasks(brief: string): ResearchTask[] {
  const base = brief.replace(/（.*?）/g, "").trim();
  const dims: Array<[string, string]> = [
    ["背景与现状", `${base} 的背景、核心概念与当前整体现状是什么？`],
    ["关键进展", `${base} 近期有哪些关键进展、突破或重要事件？`],
    ["主要参与者", `${base} 领域的主要参与者/方案/产品有哪些，各自定位如何？`],
    ["趋势与影响", `${base} 的发展趋势、挑战与潜在影响是什么？`],
  ];
  return dims.map(([title, question], i) => ({
    id: `task-${i + 1}`,
    title,
    question,
  }));
}
