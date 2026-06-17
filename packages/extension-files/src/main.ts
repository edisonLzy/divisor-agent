import { defineMainExtension } from "@divisor-agent/extension-core/main";

export default defineMainExtension((ctx) => {
  ctx.systemPrompt.register({
    id: "files.prompt",
    content: `When you reference a specific file location in your answer, emit a standard markdown link of the form

[short label or "filename:line"](file://<absolute-or-workspace-relative-path>:<line>)

or, for a line range:

[short label](file://<path>:<startLine>-<endLine>)

Example:
逻辑在 [artifact-slice.ts:85](file://packages/app/src/renderer/store/main/artifact-slice.ts:85) 这里。

This lets the UI open the file in the right-hand artifact panel, switch to the file tab, and scroll to the line. Do not invent file paths; only link paths you have actually read or that exist in the workspace.`,
  });
});
