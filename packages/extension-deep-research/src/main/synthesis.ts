import type { ResearchSource, ResearchUnitSnapshot } from "../common/types";

export interface SynthesizedReport {
  title: string;
  markdown: string;
  summary: string;
}

/** Combine sub-researcher findings into a single cited markdown report. */
export function synthesizeReport(
  brief: string,
  units: ResearchUnitSnapshot[],
  sources: ResearchSource[],
): SynthesizedReport {
  const title = `${brief.replace(/（.*?）/g, "").trim()} · 研究报告`;

  const sections = units
    .map((u, i) => {
      const body = u.error ?? u.finalOutput ?? u.latestText ?? "（本子任务未产出有效发现。）";
      return `## ${i + 1}. ${u.title}\n\n${body}`;
    })
    .join("\n\n");

  const sourceList = sources.length
    ? sources.map((s) => `[${s.id}] ${s.title} — ${s.url}`).join("\n")
    : "（本次运行未收集到结构化来源。）";

  const markdown = `# ${title}\n\n> 研究简报：${brief}\n> 子任务：${units.length} · 来源：${sources.length}\n\n${sections}\n\n## 参考来源\n\n${sourceList}\n`;

  const completed = units.filter((u) => u.status === "completed").length;
  const summary = `深度研究完成：${completed}/${units.length} 个子任务，共收集 ${sources.length} 个来源。完整报告已生成在报告面板。`;

  return { title, markdown, summary };
}
